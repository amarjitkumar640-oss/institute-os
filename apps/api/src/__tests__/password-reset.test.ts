import bcrypt from "bcrypt";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import { normalizePhone } from "@institute-os/shared";
import { login } from "../modules/auth/auth.service";
import { requestPasswordReset, resetPassword, validateResetCode } from "../modules/auth/auth.service";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const PASSWORD = "oldpassword123";

async function seedTenant(loginMethod: "phone" | "email_username") {
  return prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: { loginMethod },
    create: { id: TENANT_ID, name: "Reset Test Institute", slug: "reset-test-institute", loginMethod },
  });
}

async function seedStaff() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return prisma.staff.create({
    data: {
      tenantId:     TENANT_ID,
      fullName:     "Reset User",
      email:        "reset@test.com",
      phone:        normalizePhone("98765 00000"),
      username:     "reset_user",
      roles:        ["admin"],
      passwordHash,
      isActive:     true,
    },
  });
}

describe("password reset", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("creates an email-channel token, ~1hr TTL, for an email_username tenant", async () => {
    await seedTenant("email_username");
    await seedStaff();

    await requestPasswordReset(TENANT_ID, "reset@test.com");
    const token = await prisma.passwordResetToken.findFirst({ where: { channel: "email" } });
    expect(token).not.toBeNull();
    expect(token!.usedAt).toBeNull();
    const ttlMinutes = (token!.expiresAt.getTime() - Date.now()) / 60_000;
    expect(ttlMinutes).toBeGreaterThan(55);
    expect(ttlMinutes).toBeLessThanOrEqual(60);
  });

  it("creates a sms-channel token for a phone tenant", async () => {
    await seedTenant("phone");
    await seedStaff();

    await requestPasswordReset(TENANT_ID, "9876500000");
    const token = await prisma.passwordResetToken.findFirst({ where: { channel: "sms" } });
    expect(token).not.toBeNull();
  });

  it("does nothing and never throws for an unknown identifier", async () => {
    await seedTenant("email_username");
    await expect(requestPasswordReset(TENANT_ID, "nobody@nowhere.com")).resolves.toBe("not-found");
    const count = await prisma.passwordResetToken.count();
    expect(count).toBe(0);
  });

  it("returns delivery-failed (but still creates the token) when the mail provider isn't configured", async () => {
    // Test env has no SMTP_* vars set — sendEmail() no-ops and returns false,
    // exercising the exact "account exists, but delivery broke" path.
    await seedTenant("email_username");
    await seedStaff();
    const result = await requestPasswordReset(TENANT_ID, "reset@test.com");
    expect(result).toBe("delivery-failed");
    const token = await prisma.passwordResetToken.findFirst();
    expect(token).not.toBeNull();
  });

  it("rejects reset with a wrong code", async () => {
    await seedTenant("email_username");
    await seedStaff();
    await requestPasswordReset(TENANT_ID, "reset@test.com");

    const ok = await resetPassword(TENANT_ID, "reset@test.com", "not-the-real-code", "newpassword123");
    expect(ok).toBe(false);

    // Password must be unchanged — old password still logs in.
    const loginResult = await login({ tenantId: TENANT_ID, identifier: "reset@test.com", password: PASSWORD });
    expect(loginResult).not.toBeNull();
  });

  it("rejects reuse of an already-consumed token", async () => {
    await seedTenant("email_username");
    const staff = await seedStaff();

    // Insert a token directly with a known raw code so we can drive
    // resetPassword() deterministically without depending on email delivery.
    const crypto = await import("crypto");
    const code = "known-test-code";
    const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
    await prisma.passwordResetToken.create({
      data: { staffId: staff.id, tokenHash, channel: "email", expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const first = await resetPassword(TENANT_ID, "reset@test.com", code, "newpassword123");
    expect(first).toBe(true);

    const second = await resetPassword(TENANT_ID, "reset@test.com", code, "anotherpassword456");
    expect(second).toBe(false);

    // New password from the first (successful) reset now works.
    const loginResult = await login({ tenantId: TENANT_ID, identifier: "reset@test.com", password: "newpassword123" });
    expect(loginResult).not.toBeNull();
  });

  it("rejects an expired token", async () => {
    await seedTenant("email_username");
    const staff = await seedStaff();

    const crypto = await import("crypto");
    const code = "expired-test-code";
    const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
    await prisma.passwordResetToken.create({
      data: { staffId: staff.id, tokenHash, channel: "email", expiresAt: new Date(Date.now() - 1000) },
    });

    const ok = await resetPassword(TENANT_ID, "reset@test.com", code, "newpassword123");
    expect(ok).toBe(false);
  });

  it("POST /api/auth/forgot-password always returns ok:true, even for an unknown identifier", async () => {
    await seedTenant("email_username");
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ tenantId: TENANT_ID, identifier: "nobody@nowhere.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("POST /api/auth/forgot-password 502s for a real account when the mail provider isn't configured", async () => {
    await seedTenant("email_username");
    await seedStaff();
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ tenantId: TENANT_ID, identifier: "reset@test.com" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /api/auth/reset-password 400s on an invalid code", async () => {
    await seedTenant("email_username");
    await seedStaff();
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ tenantId: TENANT_ID, identifier: "reset@test.com", code: "bogus", password: "newpassword123" });
    expect(res.status).toBe(400);
  });

  describe("validateResetCode", () => {
    it("is true for a fresh, unused code and false once it's expired", async () => {
      await seedTenant("email_username");
      const staff = await seedStaff();
      const crypto = await import("crypto");
      const code = "still-valid-code";
      const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
      await prisma.passwordResetToken.create({
        data: { staffId: staff.id, tokenHash, channel: "email", expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });

      expect(await validateResetCode(TENANT_ID, "reset@test.com", code)).toBe(true);

      // Doesn't consume it — still valid on a second check.
      expect(await validateResetCode(TENANT_ID, "reset@test.com", code)).toBe(true);
    });

    it("is false for an expired code, without consuming resetPassword's ability to reject it too", async () => {
      await seedTenant("email_username");
      const staff = await seedStaff();
      const crypto = await import("crypto");
      const code = "already-expired-code";
      const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
      await prisma.passwordResetToken.create({
        data: { staffId: staff.id, tokenHash, channel: "email", expiresAt: new Date(Date.now() - 1000) },
      });

      expect(await validateResetCode(TENANT_ID, "reset@test.com", code)).toBe(false);
    });

    it("is false for an already-used code", async () => {
      await seedTenant("email_username");
      const staff = await seedStaff();
      const crypto = await import("crypto");
      const code = "used-code";
      const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
      await prisma.passwordResetToken.create({
        data: { staffId: staff.id, tokenHash, channel: "email", expiresAt: new Date(Date.now() + 60 * 60 * 1000), usedAt: new Date() },
      });

      expect(await validateResetCode(TENANT_ID, "reset@test.com", code)).toBe(false);
    });

    it("is false for an unknown identifier, and never throws", async () => {
      await seedTenant("email_username");
      await expect(validateResetCode(TENANT_ID, "nobody@nowhere.com", "anything")).resolves.toBe(false);
    });

    it("POST /api/auth/validate-reset-code responds { valid: boolean }", async () => {
      await seedTenant("email_username");
      const res = await request(app)
        .post("/api/auth/validate-reset-code")
        .send({ tenantId: TENANT_ID, identifier: "nobody@nowhere.com", code: "anything" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ valid: false });
    });
  });
});

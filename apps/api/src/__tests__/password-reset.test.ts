import bcrypt from "bcrypt";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import { normalizePhone } from "@institute-os/shared";
import { login } from "../modules/auth/auth.service";
import { requestPasswordReset, resetPassword, validateResetCode } from "../modules/auth/auth.service";
import { resolveWebAppUrl } from "../modules/auth/auth.routes";
import { env } from "../lib/env";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const PASSWORD = "oldpassword123";
// Passed explicitly everywhere below instead of relying on env.WEB_APP_URL's
// default (see auth.routes.ts's resolveWebAppUrl) — production once shipped
// with that default silently pointing at localhost because the real value
// was never configured; the fix derives it from the request's Origin header
// instead, so tests exercise that same explicit-argument shape.
const WEB_APP_URL = "https://app.test.example";

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

    await requestPasswordReset(TENANT_ID, "reset@test.com", WEB_APP_URL);
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

    await requestPasswordReset(TENANT_ID, "9876500000", WEB_APP_URL);
    const token = await prisma.passwordResetToken.findFirst({ where: { channel: "sms" } });
    expect(token).not.toBeNull();
  });

  it("does nothing and never throws for an unknown identifier", async () => {
    await seedTenant("email_username");
    await expect(requestPasswordReset(TENANT_ID, "nobody@nowhere.com", WEB_APP_URL)).resolves.toBe("not-found");
    const count = await prisma.passwordResetToken.count();
    expect(count).toBe(0);
  });

  it("returns delivery-failed (but still creates the token) when the mail provider isn't configured", async () => {
    // Test env has no SMTP_* vars set — sendEmail() no-ops and returns false,
    // exercising the exact "account exists, but delivery broke" path.
    await seedTenant("email_username");
    await seedStaff();
    const result = await requestPasswordReset(TENANT_ID, "reset@test.com", WEB_APP_URL);
    expect(result).toBe("delivery-failed");
    const token = await prisma.passwordResetToken.findFirst();
    expect(token).not.toBeNull();
  });

  it("rejects reset with a wrong code", async () => {
    await seedTenant("email_username");
    await seedStaff();
    await requestPasswordReset(TENANT_ID, "reset@test.com", WEB_APP_URL);

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

  // Regression coverage for the production incident this fixed: WEB_APP_URL's
  // default silently pointed at localhost because nobody had configured the
  // real value for that deploy. The reset link is now derived from the
  // request's own Referer/Origin instead, so it's automatically correct for
  // whichever environment actually sent the request — nothing to configure.
  // Tested directly against the pure helper rather than through the full
  // route + email pipeline, since @react-email/render is mocked to a fixed
  // string in tests (see __mocks__/@react-email/render.ts) and can't be used
  // to observe what URL was actually passed in.
  describe("resolveWebAppUrl", () => {
    function reqWith(headers: Record<string, string | undefined>) {
      return { headers } as unknown as import("express").Request;
    }

    it("prefers Referer over Origin, since Referer carries the path a shared-domain deployment needs", () => {
      const req = reqWith({ origin: "https://thesuccess.in", referer: "https://thesuccess.in/qa/login" });
      expect(resolveWebAppUrl(req)).toBe("https://thesuccess.in/qa");
    });

    it("strips a trailing /login off the Referer's path (prod: no prefix)", () => {
      const req = reqWith({ referer: "https://thesuccess.in/login" });
      expect(resolveWebAppUrl(req)).toBe("https://thesuccess.in");
    });

    it("strips a trailing /login off the Referer's path (QA: /qa prefix, same domain as prod)", () => {
      const req = reqWith({ referer: "https://thesuccess.in/qa/login" });
      expect(resolveWebAppUrl(req)).toBe("https://thesuccess.in/qa");
    });

    it("falls back to the Origin header when there's no Referer", () => {
      const req = reqWith({ origin: "https://the-real-production-domain.example" });
      expect(resolveWebAppUrl(req)).toBe("https://the-real-production-domain.example");
    });

    it("falls back to env.WEB_APP_URL when neither Referer nor Origin is present (e.g. a non-browser caller)", () => {
      const req = reqWith({});
      expect(resolveWebAppUrl(req)).toBe(env.WEB_APP_URL);
    });

    it("falls back to Origin when the Referer is malformed", () => {
      const req = reqWith({ referer: "not a url", origin: "https://thesuccess.in" });
      expect(resolveWebAppUrl(req)).toBe("https://thesuccess.in");
    });
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

import bcrypt from "bcrypt";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import { normalizePhone } from "@institute-os/shared";
import { login } from "../modules/auth/auth.service";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-2222-2222-222222222222";
const PASSWORD = "secret123";

async function seedTenant(id: string, overrides: Partial<{ isActive: boolean; loginMethod: "phone" | "email_username" }> = {}) {
  return prisma.tenant.upsert({
    where:  { id },
    update: { isActive: overrides.isActive ?? true, loginMethod: overrides.loginMethod ?? "email_username" },
    create: {
      id, name: "Test Institute", slug: `test-institute-${id.slice(0, 8)}`,
      isActive: overrides.isActive ?? true, loginMethod: overrides.loginMethod ?? "email_username",
    },
  });
}

async function seedActiveStaff(overrides: Partial<{ isActive: boolean; tenantActive: boolean; username: string | null }> = {}) {
  await seedTenant(TENANT_ID, { isActive: overrides.tenantActive ?? true });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return prisma.staff.create({
    data: {
      tenantId:     TENANT_ID,
      fullName:     "Admin User",
      email:        "Admin@Success.Test",           // mixed case, on purpose — login must be case-insensitive
      phone:        normalizePhone("98765 43210"),  // stored normalized, as the create route would store it
      username:     overrides.username ?? "admin_success",
      role:         "admin",
      passwordHash,
      isActive:     overrides.isActive ?? true,
    },
  });
}

describe("identifier-based auth (service level)", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("logs in by email, case-insensitively", async () => {
    await seedActiveStaff();
    const result = await login({ tenantId: TENANT_ID, identifier: "admin@success.test", password: PASSWORD });
    expect(result).not.toBeNull();
    expect(result!.staff.fullName).toBe("Admin User");
  });

  it("logs in by phone, tolerating loose formatting", async () => {
    await seedActiveStaff();
    const result = await login({ tenantId: TENANT_ID, identifier: "98765-43210", password: PASSWORD });
    expect(result).not.toBeNull();
    expect(result!.staff.fullName).toBe("Admin User");
  });

  it("logs in by username", async () => {
    await seedActiveStaff();
    const result = await login({ tenantId: TENANT_ID, identifier: "admin_success", password: PASSWORD });
    expect(result).not.toBeNull();
    expect(result!.staff.fullName).toBe("Admin User");
  });

  it("rejects a wrong password", async () => {
    await seedActiveStaff();
    const result = await login({ tenantId: TENANT_ID, identifier: "admin@success.test", password: "wrong" });
    expect(result).toBeNull();
  });

  it("returns null for an unknown identifier", async () => {
    await seedActiveStaff();
    const result = await login({ tenantId: TENANT_ID, identifier: "nobody@nowhere.test", password: PASSWORD });
    expect(result).toBeNull();
  });

  it("returns null for an inactive staff member", async () => {
    await seedActiveStaff({ isActive: false });
    const result = await login({ tenantId: TENANT_ID, identifier: "admin@success.test", password: PASSWORD });
    expect(result).toBeNull();
  });

  it("returns null for an inactive tenant", async () => {
    await seedActiveStaff({ tenantActive: false });
    const result = await login({ tenantId: TENANT_ID, identifier: "admin@success.test", password: PASSWORD });
    expect(result).toBeNull();
  });

  it("never matches a staff member scoped to a different tenant", async () => {
    await seedActiveStaff();
    await seedTenant(OTHER_TENANT_ID);
    const result = await login({ tenantId: OTHER_TENANT_ID, identifier: "admin@success.test", password: PASSWORD });
    expect(result).toBeNull();
  });

  it("matches by any identifier column regardless of the org's configured loginMethod (loginMethod is a UI hint, not server-enforced)", async () => {
    await seedTenant(TENANT_ID, { loginMethod: "phone" });
    await seedActiveStaff();
    const result = await login({ tenantId: TENANT_ID, identifier: "admin@success.test", password: PASSWORD });
    expect(result).not.toBeNull();
  });
});

describe("identifier-based auth (HTTP)", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("GET /api/tenants/:tenantId/public returns name, branding, and loginMethod with no auth", async () => {
    await seedActiveStaff();
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/public`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Test Institute");
    expect(res.body.loginMethod).toBe("email_username");
    expect(res.body.branding).toBeDefined();
  });

  it("GET /api/tenants/:tenantId/public 404s for an unknown tenant", async () => {
    const res = await request(app).get("/api/tenants/00000000-0000-0000-0000-000000000099/public");
    expect(res.status).toBe(404);
  });

  it("POST /api/auth/login succeeds by phone", async () => {
    await seedActiveStaff();
    const res = await request(app).post("/api/auth/login").send({ tenantId: TENANT_ID, identifier: "9876543210", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("POST /api/auth/login succeeds by username", async () => {
    await seedActiveStaff();
    const res = await request(app).post("/api/auth/login").send({ tenantId: TENANT_ID, identifier: "admin_success", password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it("POST /api/auth/login 401s on wrong password", async () => {
    await seedActiveStaff();
    const res = await request(app).post("/api/auth/login").send({ tenantId: TENANT_ID, identifier: "admin@success.test", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("POST /api/staff 409s on a duplicate phone number instead of a raw 500", async () => {
    const staff = await seedActiveStaff();
    const token = require("jsonwebtoken").sign(
      { staffId: staff.id, role: "admin", centerId: null, tenantId: TENANT_ID },
      require("../lib/env").env.JWT_ACCESS_SECRET,
      { expiresIn: "15m" }
    );

    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Dup", email: "dup@x.test", phone: "9876543210", role: "teacher", password: "secret123" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/phone/i);
  });

  it("POST /api/staff 409s on a duplicate username", async () => {
    const staff = await seedActiveStaff();
    const token = require("jsonwebtoken").sign(
      { staffId: staff.id, role: "admin", centerId: null, tenantId: TENANT_ID },
      require("../lib/env").env.JWT_ACCESS_SECRET,
      { expiresIn: "15m" }
    );

    const res = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Dup", email: "dup2@x.test", phone: "9000000001", username: "admin_success", role: "teacher", password: "secret123" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/username/i);
  });

  it("PATCH /api/tenants/me/settings lets an admin set the login method", async () => {
    const staff = await seedActiveStaff();
    const token = require("jsonwebtoken").sign(
      { staffId: staff.id, role: "admin", centerId: null, tenantId: TENANT_ID },
      require("../lib/env").env.JWT_ACCESS_SECRET,
      { expiresIn: "15m" }
    );

    const res = await request(app)
      .patch("/api/tenants/me/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ loginMethod: "phone" });

    expect(res.status).toBe(200);
    expect(res.body.loginMethod).toBe("phone");
  });
});

import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";

const TENANT_ID = "66666666-6666-6666-6666-666666666666";

async function seedTenant() {
  return prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: "Logo Test Institute", slug: "logo-test-institute" },
  });
}

function tokenFor(payload: AuthPayload) {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

describe("tenant logo", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("POST /api/tenants/me/logo rejects with no token", async () => {
    const res = await request(app).post("/api/tenants/me/logo");
    expect(res.status).toBe(401);
  });

  it("POST /api/tenants/me/logo rejects a non-admin staff member", async () => {
    await seedTenant();
    const token = tokenFor({ staffId: "s1", roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: TENANT_ID });
    const res = await request(app).post("/api/tenants/me/logo").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("POST /api/tenants/me/logo rejects a request with no file attached", async () => {
    await seedTenant();
    const token = tokenFor({ staffId: "s1", roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });
    const res = await request(app).post("/api/tenants/me/logo").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("DELETE /api/tenants/me/logo rejects with no token", async () => {
    const res = await request(app).delete("/api/tenants/me/logo");
    expect(res.status).toBe(401);
  });

  it("DELETE /api/tenants/me/logo rejects a non-admin staff member", async () => {
    await seedTenant();
    const token = tokenFor({ staffId: "s1", roles: ["frontdesk"], activeRole: "frontdesk", centerId: null, tenantId: TENANT_ID });
    const res = await request(app).delete("/api/tenants/me/logo").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("DELETE /api/tenants/me/logo succeeds as admin even with no logo set (no-op)", async () => {
    await seedTenant();
    const token = tokenFor({ staffId: "s1", roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });
    const res = await request(app).delete("/api/tenants/me/logo").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
    expect(tenant?.logoUrl).toBeNull();
  });

  it("DELETE /api/tenants/me/logo clears an externally-linked logoUrl without touching S3", async () => {
    await seedTenant();
    await prisma.tenant.update({ where: { id: TENANT_ID }, data: { logoUrl: "https://example.com/logo.png" } });
    const token = tokenFor({ staffId: "s1", roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });
    const res = await request(app).delete("/api/tenants/me/logo").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
    expect(tenant?.logoUrl).toBeNull();
  });
});

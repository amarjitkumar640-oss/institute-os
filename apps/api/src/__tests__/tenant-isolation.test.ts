import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";

// Two separate institutes. Nothing created under Tenant A should ever be
// visible to a request authenticated as Tenant B, and vice versa.
const TENANT_A = "22222222-2222-2222-2222-222222222222";
const TENANT_B = "33333333-3333-3333-3333-333333333333";

function tokenFor(payload: AuthPayload): string {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

async function seedTenant(tenantId: string, label: string) {
  await prisma.tenant.upsert({
    where:  { id: tenantId },
    update: {},
    create: { id: tenantId, name: `${label} Institute`, slug: `${label.toLowerCase()}-institute` },
  });

  const center = await prisma.center.create({
    data: { tenantId, name: `${label} Center` },
  });

  const staff = await prisma.staff.create({
    data: {
      tenantId,
      fullName:     `${label} Admin`,
      // Derived from tenantId (globally unique) so two tenants seeded in the
      // same test never collide — Staff.phone is now globally unique, just
      // like Staff.email already was.
      phone:        tenantId.replace(/\D/g, "").slice(0, 10),
      email:        `admin@${label.toLowerCase()}.test`,
      roles:        ["admin"],
      passwordHash: "unused-in-this-test",
    },
  });

  const student = await prisma.student.create({
    data: {
      tenantId,
      centerId:    center.id,
      studentCode: `${label}-0001`,
      fullName:    `${label} Student`,
      phone:       "9111111111",
    },
  });

  const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId });

  return { center, staff, student, token };
}

describe("cross-tenant isolation", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("never lets tenant B see tenant A's students", async () => {
    const a = await seedTenant(TENANT_A, "AlphaTenant");
    const b = await seedTenant(TENANT_B, "BetaTenant");

    const listAsB = await request(app)
      .get("/api/students")
      .set("Authorization", `Bearer ${b.token}`);
    expect(listAsB.status).toBe(200);
    expect(listAsB.body.map((s: any) => s.id)).not.toContain(a.student.id);

    const detailAsB = await request(app)
      .get(`/api/students/${a.student.id}`)
      .set("Authorization", `Bearer ${b.token}`);
    expect(detailAsB.status).toBe(404);

    const detailAsA = await request(app)
      .get(`/api/students/${a.student.id}`)
      .set("Authorization", `Bearer ${a.token}`);
    expect(detailAsA.status).toBe(200);
  });

  it("never lets tenant B pick tenant A's center via /centers/assignable", async () => {
    const a = await seedTenant(TENANT_A, "AlphaTenant");
    const b = await seedTenant(TENANT_B, "BetaTenant");

    const res = await request(app)
      .get("/api/centers/assignable")
      .set("Authorization", `Bearer ${b.token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((c: any) => c.id)).not.toContain(a.center.id);
  });

  it("never lists tenant A's staff to tenant B", async () => {
    const a = await seedTenant(TENANT_A, "AlphaTenant");
    const b = await seedTenant(TENANT_B, "BetaTenant");

    const res = await request(app)
      .get("/api/staff")
      .set("Authorization", `Bearer ${b.token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.id)).not.toContain(a.staff.id);
  });
});

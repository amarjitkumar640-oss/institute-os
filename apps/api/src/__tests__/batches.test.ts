import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";
import { computeInitialBatchStatus } from "../modules/batches/batchStatus.sweep";

const TENANT_ID = "77777777-7777-7777-7777-777777777777";
const CENTER_ID = "88888888-8888-8888-8888-888888888888";

async function makeTenantCenter() {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID }, update: {},
    create: { id: TENANT_ID, name: "Batch Status Test Institute", slug: "batch-status-test" },
  });
  await prisma.center.upsert({
    where: { id: CENTER_ID }, update: {},
    create: { id: CENTER_ID, tenantId: TENANT_ID, name: "Main Center", address: "Somewhere" },
  });
}

async function makeCourse() {
  return prisma.course.create({
    data: { tenantId: TENANT_ID, name: `Status Course ${Date.now()}-${Math.random()}`, durationMonths: 6, defaultFee: 10000 },
  });
}

async function makeAdmin() {
  const passwordHash = await bcrypt.hash("secret123", 10);
  return prisma.staff.create({
    data: {
      tenantId: TENANT_ID, fullName: "Admin User", phone: `9${Math.floor(Math.random() * 1_000_000_000)}`,
      email: `batch-status-admin-${Date.now()}@x.test`, roles: ["admin"], passwordHash,
    },
  });
}

function tokenFor(payload: AuthPayload) {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

describe("computeInitialBatchStatus", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("is 'upcoming' when startDate is in the future", () => {
    expect(computeInitialBatchStatus(new Date("2026-07-01"), new Date("2026-12-31"), now)).toBe("upcoming");
  });

  it("is 'running' when startDate has already passed and endDate hasn't", () => {
    expect(computeInitialBatchStatus(new Date("2026-01-01"), new Date("2026-12-31"), now)).toBe("running");
  });

  it("is 'completed' when endDate has already passed, even if startDate is also in the future somehow", () => {
    expect(computeInitialBatchStatus(new Date("2026-01-01"), new Date("2026-02-01"), now)).toBe("completed");
  });

  it("treats startDate exactly equal to now as already started ('running')", () => {
    expect(computeInitialBatchStatus(now, new Date("2026-12-31"), now)).toBe("running");
  });
});

describe("POST /api/batches — initial status reflects dates, not just the schema default", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("creates a batch as 'running' when startDate is already in the past", async () => {
    await makeTenantCenter();
    const course = await makeCourse();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/batches")
      .set("Authorization", `Bearer ${token}`)
      .send({
        courseId: course.id,
        name: "Backfilled Batch",
        capacity: 40,
        startDate: "2020-01-01",
        endDate: "2030-01-01",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("running");
  });

  it("creates a batch as 'completed' when endDate is already in the past", async () => {
    await makeTenantCenter();
    const course = await makeCourse();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/batches")
      .set("Authorization", `Bearer ${token}`)
      .send({
        courseId: course.id,
        name: "Historical Batch",
        capacity: 40,
        startDate: "2015-01-01",
        endDate: "2015-06-01",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("completed");
  });

  it("still creates a batch as 'upcoming' when startDate is genuinely in the future", async () => {
    await makeTenantCenter();
    const course = await makeCourse();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/batches")
      .set("Authorization", `Bearer ${token}`)
      .send({
        courseId: course.id,
        name: "Future Batch",
        capacity: 40,
        startDate: "2099-01-01",
        endDate: "2099-12-31",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("upcoming");
  });
});

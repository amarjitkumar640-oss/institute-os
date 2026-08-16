import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";
import { runJob } from "../modules/jobs/runner";
import type { JobDefinition } from "../modules/jobs/registry";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

async function ensureTestTenant() {
  return prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: "Test Institute", slug: "test-institute" },
  });
}

async function makeStaff(role: "admin" | "teacher" | "frontdesk", label: string) {
  await ensureTestTenant();
  const passwordHash = await bcrypt.hash("secret123", 10);
  return prisma.staff.create({
    data: {
      tenantId: TENANT_ID, fullName: `${label} User`, phone: `9${label.charCodeAt(0)}0000000`,
      email: `${label.toLowerCase()}@x.test`, roles: [role], passwordHash,
    },
  });
}

function tokenFor(payload: AuthPayload) {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

function fakeJob(overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    key: "test-job",
    label: "Test Job",
    description: "A fake job for runner tests",
    defaultIntervalMinutes: 5,
    run: async () => ({ ok: 1 }),
    ...overrides,
  };
}

describe("jobs runner", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("records a success run with the returned result summary", async () => {
    const def = fakeJob({ run: async () => ({ notifiedCount: 3 }) });
    const outcome = await runJob(prisma, def, "manual");

    expect(outcome.skipped).toBe(false);
    if (outcome.skipped) throw new Error("unexpected skip");
    expect(outcome.result).toEqual({ notifiedCount: 3 });

    const row = await prisma.jobRun.findUnique({ where: { id: outcome.run.id } });
    expect(row?.status).toBe("success");
    expect(row?.resultSummary).toEqual({ notifiedCount: 3 });
    expect(row?.finishedAt).not.toBeNull();
  });

  it("records a failure run with the error message, and still re-throws", async () => {
    const def = fakeJob({ run: async () => { throw new Error("boom"); } });

    await expect(runJob(prisma, def, "scheduler")).rejects.toThrow("boom");

    const row = await prisma.jobRun.findFirst({ where: { jobKey: def.key } });
    expect(row?.status).toBe("failure");
    expect(row?.errorMessage).toBe("boom");
  });

  it("skips a job already in flight instead of starting a second run", async () => {
    let resolveFirst!: () => void;
    const gate = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const def = fakeJob({ run: async () => { await gate; return { ok: 1 }; } });

    const firstRun = runJob(prisma, def, "scheduler");
    // Give the first call a tick to register itself as "running" before the second call checks.
    await new Promise((r) => setTimeout(r, 10));

    const second = await runJob(prisma, def, "manual");
    expect(second.skipped).toBe(true);

    resolveFirst();
    await firstRun;

    const runs = await prisma.jobRun.findMany({ where: { jobKey: def.key } });
    expect(runs).toHaveLength(1);
  });
});

describe("jobs API", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("lists the 3 registered jobs for an admin", async () => {
    const staff = await makeStaff("admin", "A");
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app).get("/api/jobs").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const keys = res.body.map((j: { key: string }) => j.key).sort();
    expect(keys).toEqual(["batch-status-sweep", "class-reminder-sweep", "overdue-installment-sweep"]);
  });

  it("403s for a non-admin role", async () => {
    const staff = await makeStaff("teacher", "T");
    const token = tokenFor({ staffId: staff.id, roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: TENANT_ID });

    const res = await request(app).get("/api/jobs").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("updates a job's interval via PATCH", async () => {
    const staff = await makeStaff("admin", "A");
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch("/api/jobs/batch-status-sweep")
      .set("Authorization", `Bearer ${token}`)
      .send({ intervalMinutes: 15 });

    expect(res.status).toBe(200);
    expect(res.body.intervalMinutes).toBe(15);

    const row = await prisma.jobConfig.findUnique({ where: { key: "batch-status-sweep" } });
    expect(row?.intervalMinutes).toBe(15);
  });

  it("404s for an unknown job key", async () => {
    const staff = await makeStaff("admin", "A");
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/jobs/not-a-real-job/run")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

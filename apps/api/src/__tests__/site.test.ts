import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";

// Must match whatever SITE_TENANT_SLUG is actually set to in the running
// environment (.env.test locally, QA_ENV_FILE/PROD_ENV_FILE in CI) — the
// site module resolves the tenant purely from that env var, so the seeded
// fixture has to have the exact same slug or getSiteTenant() finds nothing,
// regardless of what test data actually exists. Falls back to a fixed value
// only for the case where the env var is entirely unset (e.g. a stray local
// run without .env.test loaded).
const TENANT_SLUG = env.SITE_TENANT_SLUG || "site-test-tenant";
const OTHER_TENANT_ID = "55555555-5555-5555-5555-555555555555";

// Upsert keyed on slug, not a hardcoded id — resetDb() deliberately never
// truncates Tenant (see setup.ts), so this row is a single shared fixture
// across every test file that needs "the SITE_TENANT_SLUG tenant"
// (gov-exams.test.ts seeds the same slug independently, same pattern).
// Keying on id instead creates a second tenant row with a conflicting slug
// the moment both files run in the same suite, in whichever order Jest
// picks that run — this was a real CI failure (a fresh CI run orders test
// files differently than a machine with cached run-timing data), not a
// theoretical race. Callers read the returned tenant's actual `.id` rather
// than assuming a fixed value, since the row may already exist (created by
// the other file) under an id neither file controls.
async function seedTenant() {
  return prisma.tenant.upsert({
    where:  { slug: TENANT_SLUG },
    update: {},
    create: { name: "Site Test Institute", slug: TENANT_SLUG },
  });
}

async function seedOtherTenant() {
  return prisma.tenant.upsert({
    where:  { id: OTHER_TENANT_ID },
    update: { slug: "site-test-other-tenant" },
    create: { id: OTHER_TENANT_ID, name: "Other Institute", slug: "site-test-other-tenant" },
  });
}

// SITE_TENANT_SLUG is set in .env.test locally (loaded by jest.setup-env.js
// before any test file imports run) and in CI via QA_ENV_FILE/PROD_ENV_FILE
// — env.ts reads it at module-import time, too early for a plain
// process.env assignment here to take effect, which is also why TENANT_SLUG
// above reads it back out rather than hardcoding an assumed value.

function tokenFor(payload: AuthPayload) {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

describe("public marketing site", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("GET /api/site/highlights only returns active items, newest first", async () => {
    const tenant = await seedTenant();
    await prisma.siteHighlight.createMany({
      data: [
        { tenantId: tenant.id, type: "announcement", title: "Old",     isActive: true,  publishedAt: new Date("2026-01-01") },
        { tenantId: tenant.id, type: "announcement", title: "New",     isActive: true,  publishedAt: new Date("2026-02-01") },
        { tenantId: tenant.id, type: "announcement", title: "Hidden",  isActive: false, publishedAt: new Date("2026-03-01") },
      ],
    });

    const res = await request(app).get("/api/site/highlights");
    expect(res.status).toBe(200);
    expect(res.body.map((h: { title: string }) => h.title)).toEqual(["New", "Old"]);
  });

  it("GET /api/site/highlights?type= filters to just that type", async () => {
    const tenant = await seedTenant();
    await prisma.siteHighlight.createMany({
      data: [
        { tenantId: tenant.id, type: "announcement", title: "A batch is starting" },
        { tenantId: tenant.id, type: "result",       title: "Topper 2026" },
      ],
    });

    const res = await request(app).get("/api/site/highlights?type=result");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe("result");
  });

  it("rejects an invalid type", async () => {
    await seedTenant();
    const res = await request(app).get("/api/site/highlights?type=not-a-real-type");
    expect(res.status).toBe(400);
  });
});

describe("site admin", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("rejects requests with no token", async () => {
    const res = await request(app).get("/api/site/admin/highlights");
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token", async () => {
    const res = await request(app).get("/api/site/admin/highlights").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin staff member (e.g. a teacher)", async () => {
    const tenant = await seedTenant();
    const token = tokenFor({ staffId: "s1", roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: tenant.id });
    const res = await request(app).get("/api/site/admin/highlights").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("rejects an admin who belongs to a different tenant", async () => {
    await seedTenant();
    await seedOtherTenant();
    const token = tokenFor({ staffId: "s1", roles: ["admin"], activeRole: "admin", centerId: null, tenantId: OTHER_TENANT_ID });
    const res = await request(app).get("/api/site/admin/highlights").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("lets an admin of the site tenant in, empty list to start", async () => {
    const tenant = await seedTenant();
    const token = tokenFor({ staffId: "s1", roles: ["admin"], activeRole: "admin", centerId: null, tenantId: tenant.id });
    const res = await request(app).get("/api/site/admin/highlights").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("full create → list (includes inactive) → update → delete cycle", async () => {
    const tenant = await seedTenant();
    const token = tokenFor({ staffId: "s1", roles: ["admin"], activeRole: "admin", centerId: null, tenantId: tenant.id });

    const create = await request(app)
      .post("/api/site/admin/highlights")
      .set("Authorization", `Bearer ${token}`)
      .field("type", "announcement")
      .field("title", "New batch starting Monday")
      .field("isActive", "false");
    expect(create.status).toBe(201);
    expect(create.body.isActive).toBe(false);
    const id = create.body.id;

    // Admin list includes inactive items — unlike the public feed.
    const list = await request(app)
      .get("/api/site/admin/highlights")
      .set("Authorization", `Bearer ${token}`);
    expect(list.body).toHaveLength(1);

    const update = await request(app)
      .patch(`/api/site/admin/highlights/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("isActive", "true");
    expect(update.status).toBe(200);
    expect(update.body.isActive).toBe(true);

    // Now it shows up on the public feed too.
    const publicFeed = await request(app).get("/api/site/highlights");
    expect(publicFeed.body).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/site/admin/highlights/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(200);

    const afterDelete = await request(app).get("/api/site/highlights");
    expect(afterDelete.body).toHaveLength(0);
  });
});

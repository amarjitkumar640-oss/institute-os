import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";

// Same reasoning as site.test.ts: the site tenant is resolved purely from
// SITE_TENANT_SLUG, so the seeded fixture must match whatever that env var
// actually is in the running environment.
const TENANT_SLUG = env.SITE_TENANT_SLUG || "site-test-tenant";
const OTHER_TENANT_ID = "88888888-8888-8888-8888-888888888888";

// Upsert keyed on slug, not a hardcoded id — resetDb() deliberately never
// truncates Tenant (see setup.ts), so this row is a single shared fixture
// across every test file that needs "the SITE_TENANT_SLUG tenant"
// (site.test.ts seeds the same slug independently). Keying on id instead
// would create a second tenant row with a conflicting slug the moment both
// files run in the same suite — confirmed the hard way.
async function seedSiteTenant() {
  return prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: { name: "Gov Exams Test Institute", slug: TENANT_SLUG },
  });
}

async function seedOtherTenant() {
  return prisma.tenant.upsert({
    where: { id: OTHER_TENANT_ID },
    update: { slug: "gov-exams-test-other-tenant" },
    create: { id: OTHER_TENANT_ID, name: "Other Institute", slug: "gov-exams-test-other-tenant" },
  });
}

function tokenFor(payload: AuthPayload) {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

function adminToken(tenantId: string) {
  return tokenFor({ staffId: "s1", roles: ["admin"], activeRole: "admin", centerId: null, tenantId });
}

async function seedOrganization() {
  return prisma.govOrganization.create({
    data: { name: "Staff Selection Commission", shortName: "SSC", type: "ssc" },
  });
}

describe("public gov-exams", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("GET /api/gov-exams/recruitments only returns published recruitments", async () => {
    const org = await seedOrganization();
    await prisma.govRecruitment.createMany({
      data: [
        { organizationId: org.id, title: "SSC CGL 2026", slug: "ssc-cgl-2026", status: "published" },
        { organizationId: org.id, title: "SSC CHSL 2026", slug: "ssc-chsl-2026", status: "draft" },
      ],
    });

    const res = await request(app).get("/api/gov-exams/recruitments");
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { title: string }) => r.title)).toEqual(["SSC CGL 2026"]);
    expect(res.body.total).toBe(1);
  });

  it("GET /api/gov-exams/recruitments/:slug 404s for a draft recruitment", async () => {
    const org = await seedOrganization();
    await prisma.govRecruitment.create({
      data: { organizationId: org.id, title: "SSC CHSL 2026", slug: "ssc-chsl-2026", status: "draft" },
    });

    const res = await request(app).get("/api/gov-exams/recruitments/ssc-chsl-2026");
    expect(res.status).toBe(404);
  });

  it("GET /api/gov-exams/recruitments/:slug returns a published recruitment with its documents", async () => {
    const org = await seedOrganization();
    const recruitment = await prisma.govRecruitment.create({
      data: { organizationId: org.id, title: "SSC CGL 2026", slug: "ssc-cgl-2026", status: "published" },
    });
    await prisma.govDocument.create({
      data: { recruitmentId: recruitment.id, type: "notification", title: "Official Notification" },
    });

    const res = await request(app).get("/api/gov-exams/recruitments/ssc-cgl-2026");
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
  });

  it("GET /api/gov-exams/current-affairs?category= filters correctly", async () => {
    await prisma.govCurrentAffair.createMany({
      data: [
        { title: "RBI repo rate", slug: "rbi-repo-rate", category: "banking", whatHappened: "...", publishedDate: new Date(), status: "published" },
        { title: "ISRO launch", slug: "isro-launch", category: "science", whatHappened: "...", publishedDate: new Date(), status: "published" },
      ],
    });

    const res = await request(app).get("/api/gov-exams/current-affairs?category=banking");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe("banking");
  });

  describe("POST /api/gov-exams/eligibility-check", () => {
    it("matches a recruitment when age is in range", async () => {
      const org = await seedOrganization();
      await prisma.govRecruitment.create({
        data: { organizationId: org.id, title: "SSC CGL 2026", slug: "ssc-cgl-2026", status: "published", ageMin: 18, ageMax: 27 },
      });

      const res = await request(app).post("/api/gov-exams/eligibility-check").send({ age: 23 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("excludes a recruitment when age is out of range", async () => {
      const org = await seedOrganization();
      await prisma.govRecruitment.create({
        data: { organizationId: org.id, title: "SSC CGL 2026", slug: "ssc-cgl-2026", status: "published", ageMin: 18, ageMax: 27 },
      });

      const res = await request(app).post("/api/gov-exams/eligibility-check").send({ age: 30 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it("category relaxation extends the effective max age", async () => {
      const org = await seedOrganization();
      await prisma.govRecruitment.create({
        data: {
          organizationId: org.id,
          title: "SSC CGL 2026",
          slug: "ssc-cgl-2026",
          status: "published",
          ageMin: 18,
          ageMax: 27,
          categoryRelaxations: { obc: 3, sc_st: 5 },
        },
      });

      const withoutRelaxation = await request(app).post("/api/gov-exams/eligibility-check").send({ age: 30 });
      expect(withoutRelaxation.body).toHaveLength(0);

      const withRelaxation = await request(app)
        .post("/api/gov-exams/eligibility-check")
        .send({ age: 30, category: "sc_st" });
      expect(withRelaxation.body).toHaveLength(1);
    });
  });
});

describe("gov-exams admin", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("rejects requests with no token", async () => {
    const res = await request(app).get("/api/gov-exams/admin/organizations");
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin staff member", async () => {
    const tenant = await seedSiteTenant();
    const token = tokenFor({ staffId: "s1", roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: tenant.id });
    const res = await request(app).get("/api/gov-exams/admin/organizations").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("rejects an admin who belongs to a different tenant", async () => {
    await seedSiteTenant();
    await seedOtherTenant();
    const token = adminToken(OTHER_TENANT_ID);
    const res = await request(app).get("/api/gov-exams/admin/organizations").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("full organization -> recruitment -> document -> publish -> public-visibility cycle", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);

    const org = await request(app)
      .post("/api/gov-exams/admin/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Staff Selection Commission", shortName: "SSC", type: "ssc" });
    expect(org.status).toBe(201);

    const recruitment = await request(app)
      .post("/api/gov-exams/admin/recruitments")
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId: org.body.id, title: "SSC CGL 2026", slug: "ssc-cgl-2026", ageMin: 18, ageMax: 27 });
    expect(recruitment.status).toBe(201);
    expect(recruitment.body.status).toBe("draft");
    const recruitmentId = recruitment.body.id;

    // Not visible publicly yet — still draft.
    const beforePublish = await request(app).get("/api/gov-exams/recruitments/ssc-cgl-2026");
    expect(beforePublish.status).toBe(404);

    const doc = await request(app)
      .post("/api/gov-exams/admin/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ recruitmentId, type: "notification", title: "Official Notification" });
    expect(doc.status).toBe(201);

    const publish = await request(app)
      .patch(`/api/gov-exams/admin/recruitments/${recruitmentId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "published" });
    expect(publish.status).toBe(200);
    expect(publish.body.publishedAt).not.toBeNull();

    const afterPublish = await request(app).get("/api/gov-exams/recruitments/ssc-cgl-2026");
    expect(afterPublish.status).toBe(200);
    expect(afterPublish.body.documents).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/gov-exams/admin/recruitments/${recruitmentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const afterDelete = await request(app).get("/api/gov-exams/recruitments/ssc-cgl-2026");
    expect(afterDelete.status).toBe(404);
  });

  it("rejects deleting an organization that still has recruitments", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const org = await seedOrganization();
    await prisma.govRecruitment.create({
      data: { organizationId: org.id, title: "SSC CGL 2026", slug: "ssc-cgl-2026" },
    });

    const res = await request(app)
      .delete(`/api/gov-exams/admin/organizations/${org.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it("full create -> publish -> public-visibility cycle for current affairs", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);

    const create = await request(app)
      .post("/api/gov-exams/admin/current-affairs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "RBI keeps repo rate unchanged",
        slug: "rbi-repo-rate-unchanged",
        category: "banking",
        whatHappened: "The RBI's MPC kept the repo rate unchanged at its latest meeting.",
        publishedDate: "2026-08-01",
      });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("draft");

    const beforePublish = await request(app).get("/api/gov-exams/current-affairs/rbi-repo-rate-unchanged");
    expect(beforePublish.status).toBe(404);

    const publish = await request(app)
      .patch(`/api/gov-exams/admin/current-affairs/${create.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "published" });
    expect(publish.status).toBe(200);

    const afterPublish = await request(app).get("/api/gov-exams/current-affairs/rbi-repo-rate-unchanged");
    expect(afterPublish.status).toBe(200);
  });
});

describe("gov-sources admin", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("rejects requests with no token", async () => {
    const res = await request(app).get("/api/gov-exams/admin/sources");
    expect(res.status).toBe(401);
  });

  it("rejects an admin who belongs to a different tenant", async () => {
    await seedSiteTenant();
    await seedOtherTenant();
    const token = adminToken(OTHER_TENANT_ID);
    const res = await request(app).get("/api/gov-exams/admin/sources").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("404s creating a source with an organizationId that doesn't exist", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .post("/api/gov-exams/admin/sources")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "ssc", contentType: "recruitment",
        organizationId: "00000000-0000-0000-0000-000000000000",
        label: "SSC Notifications", url: "https://ssc.nic.in/notifications",
      });
    expect(res.status).toBe(404);
  });

  it("full create -> list -> update -> delete cycle", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const org = await seedOrganization();

    const create = await request(app)
      .post("/api/gov-exams/admin/sources")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "ssc", contentType: "recruitment", organizationId: org.id,
        label: "SSC Notifications", url: "https://ssc.nic.in/notifications",
      });
    expect(create.status).toBe(201);
    expect(create.body.enabled).toBe(true);
    expect(create.body.organization.shortName).toBe("SSC");
    const sourceId = create.body.id;

    const list = await request(app).get("/api/gov-exams/admin/sources").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const update = await request(app)
      .patch(`/api/gov-exams/admin/sources/${sourceId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: false });
    expect(update.status).toBe(200);
    expect(update.body.enabled).toBe(false);

    const del = await request(app).delete(`/api/gov-exams/admin/sources/${sourceId}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const afterDelete = await request(app).get("/api/gov-exams/admin/sources").set("Authorization", `Bearer ${token}`);
    expect(afterDelete.body).toHaveLength(0);
  });
});

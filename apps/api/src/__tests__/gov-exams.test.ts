import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";
import * as firecrawl from "../lib/firecrawl";
import * as aiGateway from "../lib/aiGateway";

// Only the new "Run Now" route tests below exercise real scraping/search —
// mocked module-wide since jest.mock is hoisted; no other test in this
// file makes it past validation/CRUD into the scrape/search code path.
jest.mock("../lib/firecrawl");
jest.mock("../lib/aiGateway");
const mockedScrapeUrlToMarkdown = firecrawl.scrapeUrlToMarkdown as jest.MockedFunction<typeof firecrawl.scrapeUrlToMarkdown>;
const mockedWebSearchExtract = aiGateway.webSearchExtract as jest.MockedFunction<typeof aiGateway.webSearchExtract>;

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

describe("public gov-exams", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("GET /api/gov-exams/recruitments only returns published recruitments", async () => {
    await prisma.govRecruitment.createMany({
      data: [
        { category: "ssc", organization: "Staff Selection Commission", title: "SSC CGL 2026", slug: "ssc-cgl-2026", status: "published" },
        { category: "ssc", organization: "Staff Selection Commission", title: "SSC CHSL 2026", slug: "ssc-chsl-2026", status: "draft" },
      ],
    });

    const res = await request(app).get("/api/gov-exams/recruitments");
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { title: string }) => r.title)).toEqual(["SSC CGL 2026"]);
    expect(res.body.total).toBe(1);
  });

  it("GET /api/gov-exams/recruitments/:slug 404s for a draft recruitment", async () => {
    await prisma.govRecruitment.create({
      data: { category: "ssc", title: "SSC CHSL 2026", slug: "ssc-chsl-2026", status: "draft" },
    });

    const res = await request(app).get("/api/gov-exams/recruitments/ssc-chsl-2026");
    expect(res.status).toBe(404);
  });

  it("GET /api/gov-exams/recruitments/:slug returns a published recruitment with its documents", async () => {
    const recruitment = await prisma.govRecruitment.create({
      data: { category: "ssc", title: "SSC CGL 2026", slug: "ssc-cgl-2026", status: "published" },
    });
    await prisma.govDocument.create({
      data: { recruitmentId: recruitment.id, type: "notification", title: "Official Notification" },
    });

    const res = await request(app).get("/api/gov-exams/recruitments/ssc-cgl-2026");
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
  });

  it("GET /api/gov-exams/current-affairs?category= filters correctly", async () => {
    const bankingCategory = await prisma.currentAffairCategory.findUniqueOrThrow({ where: { key: "banking-finance" } });
    const scienceCategory = await prisma.currentAffairCategory.findUniqueOrThrow({ where: { key: "science-technology" } });
    await prisma.govCurrentAffair.createMany({
      data: [
        { title: "RBI repo rate", slug: "rbi-repo-rate", categoryId: bankingCategory.id, whatHappened: "...", publishedDate: new Date(), status: "published" },
        { title: "ISRO launch", slug: "isro-launch", categoryId: scienceCategory.id, whatHappened: "...", publishedDate: new Date(), status: "published" },
      ],
    });

    const res = await request(app).get("/api/gov-exams/current-affairs?category=banking-finance");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category.key).toBe("banking-finance");
  });

  it("GET /api/gov-exams/current-affairs?date= scopes to that calendar day only", async () => {
    const bankingCategory = await prisma.currentAffairCategory.findUniqueOrThrow({ where: { key: "banking-finance" } });
    await prisma.govCurrentAffair.createMany({
      data: [
        { title: "Today's item", slug: "todays-item", categoryId: bankingCategory.id, whatHappened: "...", publishedDate: new Date("2026-08-28T09:00:00.000Z"), status: "published" },
        { title: "Yesterday's item", slug: "yesterdays-item", categoryId: bankingCategory.id, whatHappened: "...", publishedDate: new Date("2026-08-27T09:00:00.000Z"), status: "published" },
      ],
    });

    const res = await request(app).get("/api/gov-exams/current-affairs?date=2026-08-28");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Today's item");
  });

  it("GET /api/gov-exams/current-affairs/dates returns distinct published dates, most recent first, excluding drafts", async () => {
    const bankingCategory = await prisma.currentAffairCategory.findUniqueOrThrow({ where: { key: "banking-finance" } });
    await prisma.govCurrentAffair.createMany({
      data: [
        { title: "Aug 28 item A", slug: "aug-28-a", categoryId: bankingCategory.id, whatHappened: "...", publishedDate: new Date("2026-08-28T09:00:00.000Z"), status: "published" },
        { title: "Aug 28 item B", slug: "aug-28-b", categoryId: bankingCategory.id, whatHappened: "...", publishedDate: new Date("2026-08-28T15:00:00.000Z"), status: "published" },
        { title: "Aug 26 item", slug: "aug-26", categoryId: bankingCategory.id, whatHappened: "...", publishedDate: new Date("2026-08-26T09:00:00.000Z"), status: "published" },
        { title: "Draft item", slug: "draft-item", categoryId: bankingCategory.id, whatHappened: "...", publishedDate: new Date("2026-08-27T09:00:00.000Z"), status: "draft" },
      ],
    });

    const res = await request(app).get("/api/gov-exams/current-affairs/dates");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(["2026-08-28", "2026-08-26"]);
  });

  describe("POST /api/gov-exams/eligibility-check", () => {
    it("matches a recruitment when age is in range", async () => {
      await prisma.govRecruitment.create({
        data: { category: "ssc", title: "SSC CGL 2026", slug: "ssc-cgl-2026", status: "published", ageMin: 18, ageMax: 27 },
      });

      const res = await request(app).post("/api/gov-exams/eligibility-check").send({ age: 23 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("excludes a recruitment when age is out of range", async () => {
      await prisma.govRecruitment.create({
        data: { category: "ssc", title: "SSC CGL 2026", slug: "ssc-cgl-2026", status: "published", ageMin: 18, ageMax: 27 },
      });

      const res = await request(app).post("/api/gov-exams/eligibility-check").send({ age: 30 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it("category relaxation extends the effective max age", async () => {
      await prisma.govRecruitment.create({
        data: {
          category: "ssc",
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
    const res = await request(app).get("/api/gov-exams/admin/recruitments");
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin staff member", async () => {
    const tenant = await seedSiteTenant();
    const token = tokenFor({ staffId: "s1", roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: tenant.id });
    const res = await request(app).get("/api/gov-exams/admin/recruitments").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("rejects an admin who belongs to a different tenant", async () => {
    await seedSiteTenant();
    await seedOtherTenant();
    const token = adminToken(OTHER_TENANT_ID);
    const res = await request(app).get("/api/gov-exams/admin/recruitments").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("full recruitment -> document -> publish -> public-visibility cycle", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);

    const recruitment = await request(app)
      .post("/api/gov-exams/admin/recruitments")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "ssc", organization: "Staff Selection Commission", title: "SSC CGL 2026", slug: "ssc-cgl-2026", ageMin: 18, ageMax: 27 });
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

  it("full create -> publish -> public-visibility cycle for current affairs", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const bankingCategory = await prisma.currentAffairCategory.findUniqueOrThrow({ where: { key: "banking-finance" } });

    const create = await request(app)
      .post("/api/gov-exams/admin/current-affairs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "RBI keeps repo rate unchanged",
        slug: "rbi-repo-rate-unchanged",
        categoryId: bankingCategory.id,
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

  it("400s creating a source with the deprecated search fetchMode", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .post("/api/gov-exams/admin/sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "banking", contentType: "current_affair", fetchMode: "search", label: "Bank job openings" });
    expect(res.status).toBe(400);
  });

  it("full create -> list -> update -> delete cycle", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);

    const create = await request(app)
      .post("/api/gov-exams/admin/sources")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "ssc", contentType: "recruitment", fetchMode: "url",
        label: "SSC Notifications", url: "https://ssc.nic.in/notifications",
      });
    expect(create.status).toBe(201);
    expect(create.body.enabled).toBe(true);
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

  it("rejects the deprecated search fetchMode — url is the only valid GovSource fetchMode now", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .post("/api/gov-exams/admin/sources")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "banking", contentType: "current_affair", fetchMode: "search", label: "Bank job openings", searchQuery: "current and upcoming bank job openings with dates" });
    expect(res.status).toBe(400);
  });

  it.each([
    ["daily", {}],
    ["weekly", { scheduleTimeOfDay: "09:00" }],
    ["monthly", { scheduleTimeOfDay: "09:00" }],
  ] as const)("400s creating a %s-scheduled source missing its required schedule field", async (scheduleFrequency, extra) => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .post("/api/gov-exams/admin/sources")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "ssc", contentType: "recruitment", fetchMode: "url",
        label: "SSC Notifications", url: "https://ssc.nic.in/notifications",
        scheduleFrequency, ...extra,
      });
    expect(res.status).toBe(400);
  });

  it("creates a weekly-scheduled source with all required schedule fields", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .post("/api/gov-exams/admin/sources")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "ssc", contentType: "recruitment", fetchMode: "url",
        label: "SSC Notifications", url: "https://ssc.nic.in/notifications",
        scheduleFrequency: "weekly", scheduleTimeOfDay: "09:00", scheduleDayOfWeek: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.scheduleFrequency).toBe("weekly");
    expect(res.body.scheduleDayOfWeek).toBe(1);
  });

  describe("POST /:id/run", () => {
    beforeEach(() => mockedScrapeUrlToMarkdown.mockReset());

    it("404s for an unknown source id", async () => {
      const tenant = await seedSiteTenant();
      const token = adminToken(tenant.id);
      const res = await request(app)
        .post("/api/gov-exams/admin/sources/00000000-0000-0000-0000-000000000000/run")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it("runs the source immediately and returns its result, regardless of its schedule", async () => {
      const tenant = await seedSiteTenant();
      const token = adminToken(tenant.id);
      const source = await prisma.govSource.create({
        data: { category: "ssc", contentType: "recruitment", fetchMode: "url", label: "SSC Notifications", url: "https://ssc.nic.in/notifications" },
      });
      mockedScrapeUrlToMarkdown.mockResolvedValue(null); // "could not fetch page content" — exercises the route without needing a real AI call

      const res = await request(app)
        .post(`/api/gov-exams/admin/sources/${source.id}/run`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("error");
      expect(res.body.error).toBe("Could not fetch page content");

      const updated = await prisma.govSource.findUniqueOrThrow({ where: { id: source.id } });
      expect(updated.lastScrapeStatus).toBe("error");
    });
  });
});

describe("gov-search-prompts admin", () => {
  it("404s a job-vacancy prompt template that hasn't been configured yet", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .get("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("upserts a job-vacancy prompt template by category, and lists all configured ones", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);

    const put = await request(app)
      .put("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc")
      .set("Authorization", `Bearer ${token}`)
      .send({ prompt: "Search for open SSC recruitment...", enabled: true });
    expect(put.status).toBe(200);
    expect(put.body.category).toBe("ssc");

    const second = await request(app)
      .put("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc")
      .set("Authorization", `Bearer ${token}`)
      .send({ prompt: "Updated SSC prompt", enabled: false });
    expect(second.status).toBe(200);
    expect(second.body.prompt).toBe("Updated SSC prompt");
    expect(second.body.enabled).toBe(false);

    const list = await request(app)
      .get("/api/gov-exams/admin/search-prompts/job-vacancy-prompts")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("rejects an invalid job-vacancy category", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .put("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/not-a-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ prompt: "x" });
    expect(res.status).toBe(400);
  });

  it("upserts the singleton current-affairs prompt template", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);

    const put = await request(app)
      .put("/api/gov-exams/admin/search-prompts/current-affairs-prompt")
      .set("Authorization", `Bearer ${token}`)
      .send({ prompt: "Search for current affairs..." });
    expect(put.status).toBe(200);
    expect(put.body.id).toBe("singleton");

    const get = await request(app)
      .get("/api/gov-exams/admin/search-prompts/current-affairs-prompt")
      .set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.prompt).toBe("Search for current affairs...");
  });

  it("deletes a job-vacancy prompt template, returning the category to unconfigured", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);

    await request(app)
      .put("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc")
      .set("Authorization", `Bearer ${token}`)
      .send({ prompt: "Search for SSC jobs..." });

    const del = await request(app)
      .delete("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc")
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const get = await request(app)
      .get("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc")
      .set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(404);
  });

  it("404s deleting a job-vacancy prompt template that was never configured", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .delete("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/railway")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("deletes the singleton current-affairs prompt template, returning it to unconfigured", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);

    await request(app)
      .put("/api/gov-exams/admin/search-prompts/current-affairs-prompt")
      .set("Authorization", `Bearer ${token}`)
      .send({ prompt: "Search for current affairs..." });

    const del = await request(app)
      .delete("/api/gov-exams/admin/search-prompts/current-affairs-prompt")
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const get = await request(app)
      .get("/api/gov-exams/admin/search-prompts/current-affairs-prompt")
      .set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(404);
  });

  it("blocks a non-admin from a different tenant", async () => {
    await seedSiteTenant();
    const token = adminToken(OTHER_TENANT_ID);
    const res = await request(app)
      .get("/api/gov-exams/admin/search-prompts/job-vacancy-prompts")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("400s saving a weekly job-vacancy prompt template with no day of week", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .put("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc")
      .set("Authorization", `Bearer ${token}`)
      .send({ prompt: "Search for SSC jobs...", scheduleFrequency: "weekly", scheduleTimeOfDay: "09:00" });
    expect(res.status).toBe(400);
  });

  it("400s saving a monthly current-affairs prompt template with no day of month", async () => {
    const tenant = await seedSiteTenant();
    const token = adminToken(tenant.id);
    const res = await request(app)
      .put("/api/gov-exams/admin/search-prompts/current-affairs-prompt")
      .set("Authorization", `Bearer ${token}`)
      .send({ prompt: "Search for current affairs...", scheduleFrequency: "monthly", scheduleTimeOfDay: "06:00" });
    expect(res.status).toBe(400);
  });

  describe("POST .../run", () => {
    beforeEach(() => mockedWebSearchExtract.mockReset());

    it("404s running an unconfigured job-vacancy prompt template", async () => {
      const tenant = await seedSiteTenant();
      const token = adminToken(tenant.id);
      const res = await request(app)
        .post("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc/run")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it("runs a configured job-vacancy prompt template immediately", async () => {
      const tenant = await seedSiteTenant();
      const token = adminToken(tenant.id);
      await request(app)
        .put("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc")
        .set("Authorization", `Bearer ${token}`)
        .send({ prompt: "Search for SSC jobs..." });
      mockedWebSearchExtract.mockResolvedValue({ ok: true, data: { vacancies: [] }, citations: [], search: { content: "test search content", citations: [] } });

      const res = await request(app)
        .post("/api/gov-exams/admin/search-prompts/job-vacancy-prompts/ssc/run")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");

      const updated = await prisma.govJobVacancyPromptTemplate.findUniqueOrThrow({ where: { category: "ssc" } });
      expect(updated.lastRunStatus).toBe("success");
    });

    it("404s running an unconfigured current-affairs prompt template", async () => {
      const tenant = await seedSiteTenant();
      const token = adminToken(tenant.id);
      const res = await request(app)
        .post("/api/gov-exams/admin/search-prompts/current-affairs-prompt/run")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it("runs the configured current-affairs prompt template immediately", async () => {
      const tenant = await seedSiteTenant();
      const token = adminToken(tenant.id);
      await request(app)
        .put("/api/gov-exams/admin/search-prompts/current-affairs-prompt")
        .set("Authorization", `Bearer ${token}`)
        .send({ prompt: "Search for current affairs..." });
      mockedWebSearchExtract.mockResolvedValue({ ok: true, data: { current_affairs: [] }, citations: [], search: { content: "test search content", citations: [] } });

      const res = await request(app)
        .post("/api/gov-exams/admin/search-prompts/current-affairs-prompt/run")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

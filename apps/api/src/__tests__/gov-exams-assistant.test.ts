import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";

// Mocks the local ./assistant-ai wrapper, not the third-party SDK directly —
// the actual plan/validate/execute/replan mechanics and cache hit/miss logic
// are already tested in universal-ai-platform's own orchestrator suite; this
// file only tests what's institute-os's responsibility: session ownership,
// tenant isolation, and correct persistence of whatever ai.run() returns.
const runMock = jest.fn();
jest.mock("../modules/gov-exams/assistant-ai", () => ({
  getAssistantAI: async () => ({ run: runMock }),
}));

const TENANT_SLUG = env.SITE_TENANT_SLUG || "site-test-tenant";
const OTHER_TENANT_ID = "77777777-7777-7777-7777-777777777777";

async function seedSiteTenant() {
  return prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: { name: "Gov Exams Assistant Test Institute", slug: TENANT_SLUG },
  });
}

async function makeStaff(tenantId: string, label: string) {
  const passwordHash = await bcrypt.hash("secret123", 10);
  return prisma.staff.create({
    data: {
      tenantId, fullName: `${label} Admin`, phone: `9${label.charCodeAt(0)}0000000`,
      email: `${label.toLowerCase()}-assistant@x.test`, roles: ["admin"], passwordHash,
    },
  });
}

function tokenFor(payload: AuthPayload) {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

function adminToken(tenantId: string, staffId: string) {
  return tokenFor({ staffId, roles: ["admin"], activeRole: "admin", centerId: null, tenantId });
}

function fakeRunResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "completed",
    completionReason: "plan_completed",
    finalResponse: "Here is the answer.",
    finalResponseBlocks: [{ type: "paragraph", text: "Here is the answer." }],
    steps: [{ stepNumber: 1, toolName: "searchRecruitments", result: { status: "success" } }],
    mechanism: "planned",
    cached: false,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCostUsd: 0 },
    ...overrides,
  };
}

describe("gov-exams AI assistant", () => {
  beforeEach(() => {
    runMock.mockReset();
    return resetDb();
  });
  afterAll(async () => prisma.$disconnect());

  it("a staff member only sees their own sessions, not another staff member's on the same tenant", async () => {
    const tenant = await seedSiteTenant();
    const alice = await makeStaff(tenant.id, "Alice");
    const bob = await makeStaff(tenant.id, "Bob");

    await request(app).post("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    await request(app).post("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, bob.id)}`);

    const aliceList = await request(app).get("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    expect(aliceList.body.sessions).toHaveLength(1);

    const bobList = await request(app).get("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, bob.id)}`);
    expect(bobList.body.sessions).toHaveLength(1);
    expect(bobList.body.sessions[0].id).not.toBe(aliceList.body.sessions[0].id);
  });

  it("404s getting or deleting a session that belongs to a different staff member", async () => {
    const tenant = await seedSiteTenant();
    const alice = await makeStaff(tenant.id, "Alice");
    const bob = await makeStaff(tenant.id, "Bob");

    const created = await request(app).post("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    const sessionId = created.body.id;

    const getAsBob = await request(app).get(`/api/gov-exams/admin/assistant/sessions/${sessionId}`).set("Authorization", `Bearer ${adminToken(tenant.id, bob.id)}`);
    expect(getAsBob.status).toBe(404);

    const deleteAsBob = await request(app).delete(`/api/gov-exams/admin/assistant/sessions/${sessionId}`).set("Authorization", `Bearer ${adminToken(tenant.id, bob.id)}`);
    expect(deleteAsBob.status).toBe(404);
  });

  it("rejects a staff member from a different tenant entirely", async () => {
    await seedSiteTenant();
    const otherTenant = await prisma.tenant.upsert({
      where: { id: OTHER_TENANT_ID },
      update: {},
      create: { id: OTHER_TENANT_ID, name: "Other Institute", slug: "gov-exams-assistant-other-tenant" },
    });
    const outsider = await makeStaff(otherTenant.id, "Outsider");

    const res = await request(app).get("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(otherTenant.id, outsider.id)}`);
    expect(res.status).toBe(403);
  });

  it("asking a question persists a user+assistant turn, updates the session title and lastMessageAt, and echoes cached/usage from the SDK", async () => {
    const tenant = await seedSiteTenant();
    const alice = await makeStaff(tenant.id, "Alice");
    runMock.mockResolvedValueOnce(fakeRunResult({ cached: true }));

    const created = await request(app).post("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    const sessionId = created.body.id;

    const ask = await request(app)
      .post(`/api/gov-exams/admin/assistant/sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`)
      .send({ question: "What SBI recruitments are currently listed?" });

    expect(ask.status).toBe(200);
    expect(ask.body).toMatchObject({
      answer: "Here is the answer.",
      blocks: [{ type: "paragraph", text: "Here is the answer." }],
      cached: true,
      mechanism: "planned",
    });
    expect(runMock).toHaveBeenCalledTimes(1);

    const detail = await request(app).get(`/api/gov-exams/admin/assistant/sessions/${sessionId}`).set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    expect(detail.body.title).toBe("What SBI recruitments are currently listed?");
    expect(detail.body.messages).toHaveLength(2);
    expect(detail.body.messages[0]).toMatchObject({ role: "user", content: "What SBI recruitments are currently listed?" });
    expect(detail.body.messages[1]).toMatchObject({
      role: "assistant",
      content: "Here is the answer.",
      contentBlocks: [{ type: "paragraph", text: "Here is the answer." }],
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      estimatedCostUsd: 0,
    });
    expect(detail.body.messages[1].aiRequestId).toEqual(expect.any(String));
    expect(detail.body.messages[0].aiRequestId).toBeNull(); // user rows never carry usage

    const listed = await request(app).get("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    expect(listed.body.sessions[0].lastMessageAt).not.toBeNull();
  });

  it("persists null cost columns when the run result has no usage (e.g. a real cache hit)", async () => {
    const tenant = await seedSiteTenant();
    const alice = await makeStaff(tenant.id, "Alice");
    runMock.mockResolvedValueOnce(fakeRunResult({ cached: true, usage: undefined }));

    const created = await request(app).post("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    const sessionId = created.body.id;

    await request(app)
      .post(`/api/gov-exams/admin/assistant/sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`)
      .send({ question: "cached question" });

    const detail = await request(app).get(`/api/gov-exams/admin/assistant/sessions/${sessionId}`).set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    expect(detail.body.messages[1]).toMatchObject({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
    });
    expect(detail.body.messages[1].aiRequestId).toEqual(expect.any(String)); // requestId is always set, even without usage
  });

  it("still persists a turn (with a fallback message) when the run result is an error, rather than dropping it silently", async () => {
    const tenant = await seedSiteTenant();
    const alice = await makeStaff(tenant.id, "Alice");
    runMock.mockResolvedValueOnce({ status: "error", completionReason: "planning_failed", message: "boom", steps: [], mechanism: "planned", cached: false });

    const created = await request(app).post("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    const sessionId = created.body.id;

    const ask = await request(app)
      .post(`/api/gov-exams/admin/assistant/sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`)
      .send({ question: "hi" });

    expect(ask.status).toBe(200);
    expect(ask.body.answer).toBe("Sorry, I couldn't process that question.");
    expect(ask.body.blocks).toEqual([{ type: "paragraph", text: "Sorry, I couldn't process that question." }]);

    const detail = await request(app).get(`/api/gov-exams/admin/assistant/sessions/${sessionId}`).set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    expect(detail.body.messages).toHaveLength(2);
    expect(detail.body.messages[1].contentBlocks).toEqual([{ type: "paragraph", text: "Sorry, I couldn't process that question." }]);
  });

  it("deleting a session cascades its messages", async () => {
    const tenant = await seedSiteTenant();
    const alice = await makeStaff(tenant.id, "Alice");
    runMock.mockResolvedValueOnce(fakeRunResult());

    const created = await request(app).post("/api/gov-exams/admin/assistant/sessions").set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    const sessionId = created.body.id;
    await request(app)
      .post(`/api/gov-exams/admin/assistant/sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`)
      .send({ question: "hi" });

    const del = await request(app).delete(`/api/gov-exams/admin/assistant/sessions/${sessionId}`).set("Authorization", `Bearer ${adminToken(tenant.id, alice.id)}`);
    expect(del.status).toBe(204);

    const remainingMessages = await prisma.aiAssistantMessage.count({ where: { sessionId } });
    expect(remainingMessages).toBe(0);
  });
});

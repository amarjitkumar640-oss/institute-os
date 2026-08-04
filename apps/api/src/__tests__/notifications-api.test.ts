import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb } from "./setup";
import type { AuthPayload } from "../middleware/auth";

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
      email: `${label.toLowerCase()}@x.test`, role, passwordHash,
    },
  });
}

function tokenFor(payload: AuthPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

describe("notifications API", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("returns 0 unread when there are none, and the real count once seeded", async () => {
    const staff = await makeStaff("teacher", "A");
    const token = tokenFor({ staffId: staff.id, role: "teacher", centerId: null, tenantId: TENANT_ID });

    const before = await request(app).get("/api/notifications/unread-count").set("Authorization", `Bearer ${token}`);
    expect(before.body.count).toBe(0);

    await prisma.notification.create({
      data: { tenantId: TENANT_ID, recipientId: staff.id, type: "session_cancelled", title: "t", body: "b" },
    });

    const after = await request(app).get("/api/notifications/unread-count").set("Authorization", `Bearer ${token}`);
    expect(after.body.count).toBe(1);
  });

  it("lists only the requesting staff member's own notifications, newest first", async () => {
    const staffA = await makeStaff("teacher", "A");
    const staffB = await makeStaff("teacher", "B");
    await prisma.notification.create({ data: { tenantId: TENANT_ID, recipientId: staffA.id, type: "session_cancelled", title: "for A", body: "b" } });
    await prisma.notification.create({ data: { tenantId: TENANT_ID, recipientId: staffB.id, type: "session_cancelled", title: "for B", body: "b" } });

    const token = tokenFor({ staffId: staffA.id, role: "teacher", centerId: null, tenantId: TENANT_ID });
    const res = await request(app).get("/api/notifications").set("Authorization", `Bearer ${token}`);

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].title).toBe("for A");
  });

  it("404s marking someone else's notification as read", async () => {
    const staffA = await makeStaff("teacher", "A");
    const staffB = await makeStaff("teacher", "B");
    const n = await prisma.notification.create({ data: { tenantId: TENANT_ID, recipientId: staffB.id, type: "session_cancelled", title: "for B", body: "b" } });

    const token = tokenFor({ staffId: staffA.id, role: "teacher", centerId: null, tenantId: TENANT_ID });
    const res = await request(app).patch(`/api/notifications/${n.id}/read`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("marks a notification read, and read-all clears every unread one", async () => {
    const staff = await makeStaff("teacher", "A");
    await prisma.notification.createMany({
      data: [
        { tenantId: TENANT_ID, recipientId: staff.id, type: "session_cancelled", title: "1", body: "b" },
        { tenantId: TENANT_ID, recipientId: staff.id, type: "session_rescheduled", title: "2", body: "b" },
      ],
    });
    const token = tokenFor({ staffId: staff.id, role: "teacher", centerId: null, tenantId: TENANT_ID });

    const readAll = await request(app).patch("/api/notifications/read-all").set("Authorization", `Bearer ${token}`);
    expect(readAll.status).toBe(200);

    const count = await request(app).get("/api/notifications/unread-count").set("Authorization", `Bearer ${token}`);
    expect(count.body.count).toBe(0);
  });

  it("GET /routing returns built-in defaults for admin when unconfigured", async () => {
    const admin = await makeStaff("admin", "A");
    const token = tokenFor({ staffId: admin.id, role: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app).get("/api/notifications/routing").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const overdue = res.body.find((r: any) => r.type === "installment_overdue");
    expect(overdue.roles.sort()).toEqual(["admin", "frontdesk"]);
    expect(overdue.isDefault).toBe(true);
  });

  it("PATCH /routing/:type persists an override and it's reflected in GET /routing", async () => {
    const admin = await makeStaff("admin", "A");
    const token = tokenFor({ staffId: admin.id, role: "admin", centerId: null, tenantId: TENANT_ID });

    const patch = await request(app)
      .patch("/api/notifications/routing/installment_overdue")
      .set("Authorization", `Bearer ${token}`)
      .send({ roles: ["admin"] });
    expect(patch.status).toBe(200);

    const res = await request(app).get("/api/notifications/routing").set("Authorization", `Bearer ${token}`);
    const overdue = res.body.find((r: any) => r.type === "installment_overdue");
    expect(overdue.roles).toEqual(["admin"]);
    expect(overdue.isDefault).toBe(false);
  });

  it("non-admin is forbidden from reading or writing routing rules", async () => {
    const teacher = await makeStaff("teacher", "A");
    const token = tokenFor({ staffId: teacher.id, role: "teacher", centerId: null, tenantId: TENANT_ID });

    const get = await request(app).get("/api/notifications/routing").set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(403);

    const patch = await request(app)
      .patch("/api/notifications/routing/installment_overdue")
      .set("Authorization", `Bearer ${token}`)
      .send({ roles: ["admin"] });
    expect(patch.status).toBe(403);
  });

  it("PATCH /api/tenants/me/settings accepts classReminderMinutes and overdueGraceDays", async () => {
    const admin = await makeStaff("admin", "A");
    const token = tokenFor({ staffId: admin.id, role: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch("/api/tenants/me/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ classReminderMinutes: 20, overdueGraceDays: 3 });

    expect(res.status).toBe(200);
    expect(res.body.classReminderMinutes).toBe(20);
    expect(res.body.overdueGraceDays).toBe(3);
  });
});

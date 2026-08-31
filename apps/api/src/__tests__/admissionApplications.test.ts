import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_SLUG = "test-institute";
const OTHER_TENANT_ID = "22222222-2222-2222-2222-222222222222";

async function ensureTestTenant() {
  return prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: "Test Institute", slug: TENANT_SLUG },
  });
}

async function ensureOtherTenant() {
  return prisma.tenant.upsert({
    where:  { id: OTHER_TENANT_ID },
    update: {},
    create: { id: OTHER_TENANT_ID, name: "Other Institute", slug: "other-institute" },
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

describe("public admission applications", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  const VALID_SUBMISSION = {
    fullName: "Prospective Student", phone: "9876543210", tcAccepted: true,
    dob: "2000-01-01", address: "123 Main St", gender: "male",
  };

  it("creates a pending application via the public unauthenticated endpoint", async () => {
    await ensureTestTenant();

    const res = await request(app)
      .post(`/api/public/${TENANT_SLUG}/admission-applications`)
      .send(VALID_SUBMISSION);

    expect(res.status).toBe(201);

    const application = await prisma.admissionApplication.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(application.status).toBe("pending");
    expect(application.tenantId).toBe(TENANT_ID);
    expect(application.fullName).toBe("Prospective Student");
    expect(application.tcAcceptedAt).not.toBeNull();
  });

  it("rejects a submission that hasn't accepted the terms", async () => {
    await ensureTestTenant();

    const res = await request(app)
      .post(`/api/public/${TENANT_SLUG}/admission-applications`)
      .send({ fullName: "Someone", phone: "9876543210", tcAccepted: false });

    expect(res.status).toBe(400);
    expect(await prisma.admissionApplication.count()).toBe(0);
  });

  it("rejects a submission carrying a filled-in honeypot field", async () => {
    await ensureTestTenant();

    const res = await request(app)
      .post(`/api/public/${TENANT_SLUG}/admission-applications`)
      .send({ ...VALID_SUBMISSION, fullName: "Bot", website: "http://spam.example" });

    expect(res.status).toBe(400);
    expect(await prisma.admissionApplication.count()).toBe(0);
  });

  it("404s for an unknown tenant slug", async () => {
    const res = await request(app)
      .post("/api/public/no-such-tenant/admission-applications")
      .send(VALID_SUBMISSION);

    expect(res.status).toBe(404);
  });

  it("strips office-use fields (batchId, amountPaid) that don't exist on the public schema", async () => {
    await ensureTestTenant();

    const res = await request(app)
      .post(`/api/public/${TENANT_SLUG}/admission-applications`)
      .send({ ...VALID_SUBMISSION, batchId: "not-a-real-field", amountPaid: 5000 });

    expect(res.status).toBe(201);
    const application = await prisma.admissionApplication.findUniqueOrThrow({ where: { id: res.body.id } });
    expect((application as any).batchId).toBeUndefined();
  });

  it("accepts a valid preferred centerId and stamps it on the application", async () => {
    await ensureTestTenant();
    const center = await prisma.center.create({ data: { tenantId: TENANT_ID, name: "Main Center" } });

    const res = await request(app)
      .post(`/api/public/${TENANT_SLUG}/admission-applications`)
      .send({ ...VALID_SUBMISSION, centerId: center.id });

    expect(res.status).toBe(201);
    const application = await prisma.admissionApplication.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(application.centerId).toBe(center.id);
  });

  it("400s a centerId that doesn't belong to the tenant", async () => {
    await ensureTestTenant();
    const other = await ensureOtherTenant();
    const foreignCenter = await prisma.center.create({ data: { tenantId: other.id, name: "Someone Else's Center" } });

    const res = await request(app)
      .post(`/api/public/${TENANT_SLUG}/admission-applications`)
      .send({ ...VALID_SUBMISSION, centerId: foreignCenter.id });

    expect(res.status).toBe(400);
    expect(await prisma.admissionApplication.count()).toBe(0);
  });

  describe("new_application notification routing", () => {
    async function makeCenterFrontdesk(centerId: string, label: string) {
      const passwordHash = await bcrypt.hash("secret123", 10);
      const staff = await prisma.staff.create({
        data: {
          tenantId: TENANT_ID, fullName: `${label} Frontdesk`, phone: `9${label.charCodeAt(0)}1000000`,
          email: `${label.toLowerCase()}-fd@x.test`, roles: ["frontdesk"], passwordHash,
        },
      });
      await prisma.centerStaff.create({ data: { centerId, staffId: staff.id, roles: ["frontdesk"] } });
      return staff;
    }

    async function makeTenantWideAdmin(label: string) {
      const passwordHash = await bcrypt.hash("secret123", 10);
      return prisma.staff.create({
        data: {
          tenantId: TENANT_ID, fullName: `${label} Admin`, phone: `9${label.charCodeAt(0)}2000000`,
          email: `${label.toLowerCase()}-admin@x.test`, roles: ["admin"], passwordHash,
        },
      });
    }

    it("notifies only the applicant's chosen center's frontdesk, plus every admin tenant-wide", async () => {
      await ensureTestTenant();
      const centerA = await prisma.center.create({ data: { tenantId: TENANT_ID, name: "Center A" } });
      const centerB = await prisma.center.create({ data: { tenantId: TENANT_ID, name: "Center B" } });
      const fdA = await makeCenterFrontdesk(centerA.id, "A");
      const fdB = await makeCenterFrontdesk(centerB.id, "B");
      const admin = await makeTenantWideAdmin("Global");

      await request(app)
        .post(`/api/public/${TENANT_SLUG}/admission-applications`)
        .send({ ...VALID_SUBMISSION, centerId: centerA.id });

      expect(await prisma.notification.count({ where: { recipientId: fdA.id, type: "new_application" } })).toBe(1);
      expect(await prisma.notification.count({ where: { recipientId: fdB.id, type: "new_application" } })).toBe(0);
      expect(await prisma.notification.count({ where: { recipientId: admin.id, type: "new_application" } })).toBe(1);
    });

    it("falls back to notifying every frontdesk tenant-wide when no center was chosen", async () => {
      await ensureTestTenant();
      const centerA = await prisma.center.create({ data: { tenantId: TENANT_ID, name: "Center A" } });
      const centerB = await prisma.center.create({ data: { tenantId: TENANT_ID, name: "Center B" } });
      const fdA = await makeCenterFrontdesk(centerA.id, "A");
      const fdB = await makeCenterFrontdesk(centerB.id, "B");

      await request(app)
        .post(`/api/public/${TENANT_SLUG}/admission-applications`)
        .send(VALID_SUBMISSION);

      expect(await prisma.notification.count({ where: { recipientId: fdA.id, type: "new_application" } })).toBe(1);
      expect(await prisma.notification.count({ where: { recipientId: fdB.id, type: "new_application" } })).toBe(1);
    });
  });
});

describe("staff admission applications review", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("lists applications scoped to the caller's tenant, filterable by status", async () => {
    await ensureTestTenant();
    const other = await ensureOtherTenant();
    await prisma.admissionApplication.create({ data: { tenantId: TENANT_ID, fullName: "A", phone: "1" } });
    await prisma.admissionApplication.create({ data: { tenantId: other.id, fullName: "B", phone: "2" } });

    const staff = await makeStaff("frontdesk", "A");
    const token = tokenFor({ staffId: staff.id, roles: ["frontdesk"], activeRole: "frontdesk", centerId: null, tenantId: TENANT_ID });

    const res = await request(app).get("/api/admission-applications").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].fullName).toBe("A");
  });

  it("only shows a center-assigned frontdesk applications for their own center (plus centerless ones), not other centers'", async () => {
    await ensureTestTenant();
    const centerA = await prisma.center.create({ data: { tenantId: TENANT_ID, name: "Center A" } });
    const centerB = await prisma.center.create({ data: { tenantId: TENANT_ID, name: "Center B" } });
    const appA = await prisma.admissionApplication.create({ data: { tenantId: TENANT_ID, fullName: "For A", phone: "1", centerId: centerA.id } });
    await prisma.admissionApplication.create({ data: { tenantId: TENANT_ID, fullName: "For B", phone: "2", centerId: centerB.id } });
    const appNoCenter = await prisma.admissionApplication.create({ data: { tenantId: TENANT_ID, fullName: "No preference", phone: "3" } });

    const staff = await makeStaff("frontdesk", "A");
    await prisma.centerStaff.create({ data: { centerId: centerA.id, staffId: staff.id, roles: ["frontdesk"] } });
    // Center-scoped via the CenterStaff assignment above, not the JWT — mirrors a
    // real "single center assigned, not in all-centers mode" frontdesk session.
    const token = tokenFor({ staffId: staff.id, roles: ["frontdesk"], activeRole: "frontdesk", centerId: null, tenantId: TENANT_ID });

    const res = await request(app).get("/api/admission-applications").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((a: { id: string }) => a.id);
    expect(ids).toEqual(expect.arrayContaining([appA.id, appNoCenter.id]));
    expect(ids).toHaveLength(2);

    // GET /:id and POST /:id/reject for the other center's application must
    // also 404 — not just be filtered out of the list.
    const detail = await request(app).get(`/api/admission-applications/${(await prisma.admissionApplication.findFirstOrThrow({ where: { fullName: "For B" } })).id}`).set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(404);
  });

  it("rejects a pending application with a reason, and can't reject it twice", async () => {
    await ensureTestTenant();
    const application = await prisma.admissionApplication.create({
      data: { tenantId: TENANT_ID, fullName: "A", phone: "1" },
    });
    const staff = await makeStaff("frontdesk", "A");
    const token = tokenFor({ staffId: staff.id, roles: ["frontdesk"], activeRole: "frontdesk", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .post(`/api/admission-applications/${application.id}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Duplicate submission" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.rejectionReason).toBe("Duplicate submission");

    const again = await request(app)
      .post(`/api/admission-applications/${application.id}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Duplicate submission" });
    expect(again.status).toBe(409);
  });

  it("does not create a Lead as part of rejecting or listing applications", async () => {
    await ensureTestTenant();
    await prisma.admissionApplication.create({ data: { tenantId: TENANT_ID, fullName: "A", phone: "1" } });
    expect(await prisma.lead.count()).toBe(0);
  });
});

describe("admitting a student from a self-service application", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  async function makeCenterScopedStaff() {
    await ensureTestTenant();
    const center = await prisma.center.create({ data: { tenantId: TENANT_ID, name: "Main Center" } });
    const staff = await makeStaff("frontdesk", "A");
    return { staff, centerId: center.id };
  }

  it("marks the application admitted and links studentId when admit succeeds", async () => {
    const { staff, centerId } = await makeCenterScopedStaff();
    const application = await prisma.admissionApplication.create({
      data: { tenantId: TENANT_ID, fullName: "Prospective Student", phone: "9876543210" },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["frontdesk"], activeRole: "frontdesk", centerId, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "Prospective Student",
        phone: "9876543210",
        dob: "2000-01-01",
        address: "123 Main St",
        aadhaar: "123456789012",
        gender: "male",
        tcAcknowledged: true,
        applicationId: application.id,
      });

    expect(res.status).toBe(201);

    const updated = await prisma.admissionApplication.findUniqueOrThrow({ where: { id: application.id } });
    expect(updated.status).toBe("admitted");
    expect(updated.studentId).toBe(res.body.student.id);
    expect(updated.reviewedById).toBe(staff.id);
  });

  it("409s admitting an already-rejected application", async () => {
    const { staff, centerId } = await makeCenterScopedStaff();
    const application = await prisma.admissionApplication.create({
      data: { tenantId: TENANT_ID, fullName: "Prospective Student", phone: "9876543210", status: "rejected", rejectionReason: "spam" },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["frontdesk"], activeRole: "frontdesk", centerId, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "Prospective Student", phone: "9876543210",
        dob: "2000-01-01", address: "123 Main St", aadhaar: "123456789012", gender: "male",
        tcAcknowledged: true, applicationId: application.id,
      });

    expect(res.status).toBe(409);
    expect(await prisma.student.count()).toBe(0);
  });

  it("404s admitting an application belonging to another tenant", async () => {
    const { staff, centerId } = await makeCenterScopedStaff();
    const other = await ensureOtherTenant();
    const application = await prisma.admissionApplication.create({
      data: { tenantId: other.id, fullName: "Prospective Student", phone: "9876543210" },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["frontdesk"], activeRole: "frontdesk", centerId, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "Prospective Student", phone: "9876543210",
        dob: "2000-01-01", address: "123 Main St", aadhaar: "123456789012", gender: "male",
        tcAcknowledged: true, applicationId: application.id,
      });

    expect(res.status).toBe(404);
  });
});

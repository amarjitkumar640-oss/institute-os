import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import { generateStudentCode } from "../modules/students/students.service";

// Covers the student-code format change: was a flat, tenant-agnostic
// "INS-<year>-<seq>", now "<tenant>-<center>-<year>-<seq>" so a code is
// readable at a glance (see students.service.ts's own comment for why the
// abbreviations are auto-derived rather than a separate admin-set field,
// and why the sequence resets per center rather than staying tenant-wide).

const TENANT_ID = "99999999-9999-9999-9999-999999999999";
const CENTER_A_ID = "99999999-9999-9999-9999-aaaaaaaaaaaa";
const CENTER_B_ID = "99999999-9999-9999-9999-bbbbbbbbbbbb";

async function makeFixtures() {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID }, update: {},
    create: { id: TENANT_ID, name: "The Success Tutorial Classes", slug: "success-tutorial" },
  });
  await prisma.center.upsert({
    where: { id: CENTER_A_ID }, update: {},
    create: { id: CENTER_A_ID, tenantId: TENANT_ID, name: "Ghatsila Main Center", address: "Somewhere" },
  });
  await prisma.center.upsert({
    where: { id: CENTER_B_ID }, update: {},
    create: { id: CENTER_B_ID, tenantId: TENANT_ID, name: "Kolkata Branch", address: "Elsewhere" },
  });
}

describe("generateStudentCode", () => {
  beforeEach(async () => {
    await resetDb();
    await makeFixtures();
  });
  afterAll(async () => prisma.$disconnect());

  it("derives the tenant/center abbreviation from the tenant's slug and the center's name", async () => {
    const year = new Date().getFullYear();
    const code = await generateStudentCode(prisma, TENANT_ID, CENTER_A_ID);
    expect(code).toBe(`SUC-GHA-${year}-0001`);
  });

  it("increments the sequence for a second student in the same center", async () => {
    await prisma.student.create({
      data: { tenantId: TENANT_ID, centerId: CENTER_A_ID, studentCode: await generateStudentCode(prisma, TENANT_ID, CENTER_A_ID), fullName: "First", phone: "9000000001" },
    });
    const year = new Date().getFullYear();
    const second = await generateStudentCode(prisma, TENANT_ID, CENTER_A_ID);
    expect(second).toBe(`SUC-GHA-${year}-0002`);
  });

  it("resets the sequence independently for a different center under the same tenant", async () => {
    await prisma.student.create({
      data: { tenantId: TENANT_ID, centerId: CENTER_A_ID, studentCode: await generateStudentCode(prisma, TENANT_ID, CENTER_A_ID), fullName: "Ghatsila Student", phone: "9000000002" },
    });
    const year = new Date().getFullYear();
    // A student going into Center B is the first *there*, regardless of
    // how many students Center A already has.
    const centerBCode = await generateStudentCode(prisma, TENANT_ID, CENTER_B_ID);
    expect(centerBCode).toBe(`SUC-KOL-${year}-0001`);
  });

  it("falls back to a generic 'GEN' segment when no center is given", async () => {
    const year = new Date().getFullYear();
    const code = await generateStudentCode(prisma, TENANT_ID, null);
    expect(code).toBe(`SUC-GEN-${year}-0001`);
  });

  it("pads a short tenant slug/center name up to 3 letters instead of leaving it shorter", async () => {
    const shortTenantId = "99999999-9999-9999-9999-cccccccccccc";
    const shortCenterId = "99999999-9999-9999-9999-dddddddddddd";
    await prisma.tenant.upsert({
      where: { id: shortTenantId }, update: {},
      create: { id: shortTenantId, name: "AB Institute", slug: "ab" },
    });
    await prisma.center.upsert({
      where: { id: shortCenterId }, update: {},
      create: { id: shortCenterId, tenantId: shortTenantId, name: "X", address: "Somewhere" },
    });
    const year = new Date().getFullYear();
    const code = await generateStudentCode(prisma, shortTenantId, shortCenterId);
    // tenant slug "ab" -> "ABX", center name "X" -> "XXX", both padded to 3 letters
    expect(code).toBe(`ABX-XXX-${year}-0001`);
  });
});

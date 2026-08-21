import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// The migration backfills every pre-existing row into this fixed tenant id —
// keep this in sync with prisma/migrations/*_add_tenant_multitenancy/migration.sql.
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

async function seedMainTenant() {
  let tenant = await prisma.tenant.findUnique({ where: { id: DEFAULT_TENANT_ID } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { id: DEFAULT_TENANT_ID, name: "Default Institute", slug: "default" },
    });
    console.log(`Created tenant: Default Institute (${tenant.id})`);
  }
  return tenant;
}

async function seedMainCenter(tenantId: string) {
  let center = await prisma.center.findFirst({ where: { tenantId, name: "Main Center" } });
  if (!center) {
    center = await prisma.center.create({ data: { tenantId, name: "Main Center" } });
    console.log(`Created center: Main Center (${center.id})`);
  }

  const [s, b, f, l] = await Promise.all([
    prisma.student.updateMany({ where: { centerId: null, tenantId }, data: { centerId: center.id } }),
    prisma.batch.updateMany({   where: { centerId: null, tenantId }, data: { centerId: center.id } }),
    prisma.faculty.updateMany({ where: { centerId: null, tenantId }, data: { centerId: center.id } }),
    prisma.lead.updateMany({    where: { centerId: null, tenantId }, data: { centerId: center.id } }),
  ]);
  if (s.count + b.count + f.count + l.count > 0) {
    console.log(`Backfilled: ${s.count} students, ${b.count} batches, ${f.count} faculty, ${l.count} leads → Main Center`);
  }

  const allStaff = await prisma.staff.findMany({ where: { tenantId } });
  for (const staff of allStaff) {
    await prisma.centerStaff.upsert({
      where:  { centerId_staffId: { centerId: center.id, staffId: staff.id } },
      update: {},
      create: { centerId: center.id, staffId: staff.id, roles: staff.roles },
    });
  }
  if (allStaff.length > 0) {
    console.log(`Ensured CenterStaff rows for ${allStaff.length} staff member(s)`);
  }

  return center;
}

async function seedSampleData(tenantId: string, centerId: string) {
  const examCategories = await prisma.examCategory.findMany({ where: { tenantId } });
  const examCategoryIdByKey = (key: string | null) =>
    key ? examCategories.find((ec) => ec.key === key)?.id ?? null : null;

  // ── Courses ──────────────────────────────────────────────────────────────────
  const courseData = [
    { name: "SSC CGL Foundation",          examCategory: "ssc"     as const, durationMonths: 6,  defaultFee: 18000 },
    { name: "SSC CHSL Crash Course",        examCategory: "ssc"     as const, durationMonths: 3,  defaultFee: 9000  },
    { name: "Banking PO Complete Prep",     examCategory: "banking" as const, durationMonths: 8,  defaultFee: 22000 },
    { name: "IBPS Clerk Express",           examCategory: "banking" as const, durationMonths: 4,  defaultFee: 12000 },
    { name: "Railway NTPC Comprehensive",   examCategory: "railway" as const, durationMonths: 6,  defaultFee: 15000 },
    { name: "Railway Group D Preparation",  examCategory: "railway" as const, durationMonths: 4,  defaultFee: 10000 },
  ];

  const courses: { id: string; name: string }[] = [];
  for (const c of courseData) {
    const existing = await prisma.course.findFirst({ where: { tenantId, name: c.name } });
    if (!existing) {
      const categoryId = examCategoryIdByKey(c.examCategory);
      const course = await prisma.course.create({
        data: {
          tenantId,
          name:           c.name,
          durationMonths: c.durationMonths,
          defaultFee:     c.defaultFee,
          examCategories: categoryId ? { create: [{ examCategoryId: categoryId }] } : undefined,
        },
      });
      courses.push(course);
    } else {
      courses.push(existing);
    }
  }
  console.log(`Ensured ${courses.length} courses`);

  // ── Faculty ───────────────────────────────────────────────────────────────────
  const facultyData = [
    { employeeCode: "FAC001", fullName: "Rajesh Kumar",   phone: "9801234501", email: "rajesh@institute.local",   qualification: "M.Sc Mathematics",    experienceYears: 8,  joiningDate: new Date("2020-06-01") },
    { employeeCode: "FAC002", fullName: "Priya Sharma",   phone: "9801234502", email: "priya@institute.local",    qualification: "M.A. English",         experienceYears: 5,  joiningDate: new Date("2021-01-15") },
    { employeeCode: "FAC003", fullName: "Amit Verma",     phone: "9801234503", email: "amit@institute.local",     qualification: "MBA Finance",          experienceYears: 10, joiningDate: new Date("2019-03-10") },
    { employeeCode: "FAC004", fullName: "Sunita Patel",   phone: "9801234504", email: "sunita@institute.local",   qualification: "B.Tech Computer Sci.", experienceYears: 6,  joiningDate: new Date("2020-09-01") },
    { employeeCode: "FAC005", fullName: "Deepak Singh",   phone: "9801234505", email: "deepak@institute.local",   qualification: "M.Sc Physics",         experienceYears: 7,  joiningDate: new Date("2019-11-20") },
  ];

  for (const f of facultyData) {
    await prisma.faculty.upsert({
      where:  { tenantId_employeeCode: { tenantId, employeeCode: f.employeeCode } },
      update: {},
      create: { ...f, tenantId, centerId },
    });
  }
  console.log(`Ensured ${facultyData.length} faculty members`);

  // ── Batches ───────────────────────────────────────────────────────────────────
  const now   = new Date();
  const past3 = new Date(now); past3.setMonth(now.getMonth() - 3);
  const past6 = new Date(now); past6.setMonth(now.getMonth() - 6);
  const fut2  = new Date(now); fut2.setMonth(now.getMonth() + 2);
  const fut4  = new Date(now); fut4.setMonth(now.getMonth() + 4);
  const fut1  = new Date(now); fut1.setDate(now.getDate() + 30);

  const batchData = [
    { name: "SSC CGL Morning Batch",    courseIdx: 0, capacity: 40, startDate: past3, endDate: fut4,  status: "running"   as const },
    { name: "SSC CGL Evening Batch",    courseIdx: 0, capacity: 35, startDate: fut1,  endDate: new Date(fut1.getTime() + 180*24*60*60*1000), status: "upcoming" as const },
    { name: "SSC CHSL Weekend Batch",   courseIdx: 1, capacity: 30, startDate: past3, endDate: fut2,  status: "running"   as const },
    { name: "Banking PO Batch A",       courseIdx: 2, capacity: 45, startDate: past6, endDate: now,   status: "completed" as const },
    { name: "Banking PO Batch B",       courseIdx: 2, capacity: 45, startDate: past3, endDate: fut4,  status: "running"   as const },
    { name: "IBPS Clerk Morning",       courseIdx: 3, capacity: 50, startDate: past3, endDate: fut2,  status: "running"   as const },
    { name: "Railway NTPC Batch 1",     courseIdx: 4, capacity: 60, startDate: past6, endDate: past3, status: "completed" as const },
    { name: "Railway NTPC Batch 2",     courseIdx: 4, capacity: 60, startDate: past3, endDate: fut4,  status: "running"   as const },
    { name: "Railway Group D Regular",  courseIdx: 5, capacity: 55, startDate: fut1,  endDate: new Date(fut1.getTime() + 120*24*60*60*1000), status: "upcoming" as const },
  ];

  const batches: { id: string }[] = [];
  for (const b of batchData) {
    const existing = await prisma.batch.findFirst({ where: { tenantId, name: b.name } });
    if (!existing) {
      const batch = await prisma.batch.create({
        data: {
          tenantId,
          name:      b.name,
          courseId:  courses[b.courseIdx].id,
          capacity:  b.capacity,
          startDate: b.startDate,
          endDate:   b.endDate,
          status:    b.status,
          centerId,
        },
      });
      batches.push(batch);
    } else {
      batches.push(existing);
    }
  }
  console.log(`Ensured ${batches.length} batches`);

  // ── Students ──────────────────────────────────────────────────────────────────
  const studentData = [
    { studentCode: "STU001", fullName: "Aarav Singh",      phone: "9711000001", email: "aarav@mail.com",    gender: "Male",   fatherName: "Vikram Singh",   amountPaid: 18000, coursePreference: "SSC CGL" },
    { studentCode: "STU002", fullName: "Priya Kumari",     phone: "9711000002", email: "priya.k@mail.com",  gender: "Female", fatherName: "Rajan Kumari",   amountPaid: 9000,  coursePreference: "SSC CHSL" },
    { studentCode: "STU003", fullName: "Rahul Gupta",      phone: "9711000003", email: "rahul@mail.com",    gender: "Male",   fatherName: "Suresh Gupta",   amountPaid: 22000, coursePreference: "Banking PO" },
    { studentCode: "STU004", fullName: "Anjali Mishra",    phone: "9711000004", email: "anjali@mail.com",   gender: "Female", fatherName: "Anil Mishra",    amountPaid: 12000, coursePreference: "IBPS Clerk" },
    { studentCode: "STU005", fullName: "Rohit Sharma",     phone: "9711000005", email: null,                gender: "Male",   fatherName: "Mahesh Sharma",  amountPaid: 15000, coursePreference: "Railway NTPC" },
    { studentCode: "STU006", fullName: "Kavya Nair",       phone: "9711000006", email: "kavya@mail.com",    gender: "Female", fatherName: "Sunil Nair",     amountPaid: 10000, coursePreference: "Railway Group D" },
    { studentCode: "STU007", fullName: "Akash Patel",      phone: "9711000007", email: "akash@mail.com",    gender: "Male",   fatherName: "Ramesh Patel",   amountPaid: 18000, coursePreference: "SSC CGL" },
    { studentCode: "STU008", fullName: "Sneha Joshi",      phone: "9711000008", email: "sneha@mail.com",    gender: "Female", fatherName: "Sanjay Joshi",   amountPaid: 22000, coursePreference: "Banking PO" },
    { studentCode: "STU009", fullName: "Manish Yadav",     phone: "9711000009", email: null,                gender: "Male",   fatherName: "Hari Yadav",     amountPaid: 9000,  coursePreference: "SSC CHSL" },
    { studentCode: "STU010", fullName: "Pooja Agarwal",    phone: "9711000010", email: "pooja@mail.com",    gender: "Female", fatherName: "Dinesh Agarwal", amountPaid: 15000, coursePreference: "Railway NTPC" },
    { studentCode: "STU011", fullName: "Karan Mehta",      phone: "9711000011", email: "karan@mail.com",    gender: "Male",   fatherName: "Vijay Mehta",    amountPaid: 12000, coursePreference: "IBPS Clerk" },
    { studentCode: "STU012", fullName: "Deepika Chauhan",  phone: "9711000012", email: "deepika@mail.com",  gender: "Female", fatherName: "Suresh Chauhan", amountPaid: 18000, coursePreference: "SSC CGL" },
  ];

  const students: { id: string }[] = [];
  for (const s of studentData) {
    const existing = await prisma.student.findUnique({ where: { tenantId_studentCode: { tenantId, studentCode: s.studentCode } } });
    if (!existing) {
      const student = await prisma.student.create({
        data: {
          tenantId,
          studentCode:      s.studentCode,
          fullName:         s.fullName,
          phone:            s.phone,
          email:            s.email,
          gender:           s.gender,
          fatherName:       s.fatherName,
          amountPaid:       s.amountPaid,
          coursePreference: s.coursePreference,
          centerId,
        },
      });
      students.push(student);
    } else {
      students.push(existing);
    }
  }
  console.log(`Ensured ${students.length} students`);

  // ── Enrollments (only in running/completed batches) ───────────────────────────
  const runningBatches = batches.slice(0, 6); // first 6 are running/completed
  const enrollPairs = [
    [0, 0], [1, 2], [2, 0], [3, 1], [4, 2],   // batch 0 (SSC Morning): students 0,2,4,6,8
    [0, 4], [1, 6], [2, 8], [3, 4], [4, 8],
    [0, 1], [1, 3], [2, 1], [3, 5], [4, 7],   // batch 2 (CHSL Weekend)
    [5, 9], [5, 10], [5, 11], [5, 3], [5, 7], // batch 5 (IBPS Morning)
  ] as [number, number][];

  let enrollCount = 0;
  for (const [bi, si] of enrollPairs) {
    if (!runningBatches[bi] || !students[si]) continue;
    const exists = await prisma.enrollment.findFirst({
      where: { batchId: runningBatches[bi].id, studentId: students[si].id },
    });
    if (!exists) {
      await prisma.enrollment.create({
        data: {
          batchId:    runningBatches[bi].id,
          studentId:  students[si].id,
          enrolledOn: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
        },
      });
      enrollCount++;
    }
  }
  console.log(`Created ${enrollCount} enrollments`);

  // ── Leads ─────────────────────────────────────────────────────────────────────
  const leadData = [
    { name: "Ravi Tiwari",      phone: "9811100001", targetExam: "ssc"     as const, source: "Walk-in",   status: "new"       as const },
    { name: "Simran Kaur",      phone: "9811100002", targetExam: "banking" as const, source: "Instagram", status: "contacted" as const },
    { name: "Arun Pal",         phone: "9811100003", targetExam: "railway" as const, source: "Referral",  status: "visited"   as const },
    { name: "Neha Srivastava",  phone: "9811100004", targetExam: "ssc"     as const, source: "Facebook",  status: "contacted" as const },
    { name: "Mohit Bind",       phone: "9811100005", targetExam: "railway" as const, source: "Walk-in",   status: "new"       as const },
    { name: "Tanvi Dubey",      phone: "9811100006", targetExam: "banking" as const, source: "YouTube",   status: "visited"   as const },
    { name: "Saurabh Rai",      phone: "9811100007", targetExam: "ssc"     as const, source: "Walk-in",   status: "new"       as const },
    { name: "Ankita Misra",     phone: "9811100008", targetExam: "banking" as const, source: "Referral",  status: "contacted" as const },
  ];

  let leadCount = 0;
  for (const l of leadData) {
    const existing = await prisma.lead.findFirst({ where: { tenantId, phone: l.phone } });
    if (!existing) {
      const targetExamId = examCategoryIdByKey(l.targetExam);
      if (!targetExamId) continue;
      await prisma.lead.create({
        data: {
          tenantId,
          centerId,
          name:   l.name,
          phone:  l.phone,
          source: l.source,
          status: l.status,
          targetExamId,
        },
      });
      leadCount++;
    }
  }
  console.log(`Created ${leadCount} leads`);
}

async function seedExamCategories(tenantId: string) {
  const EXAM_CATEGORIES = [
    { key: "ssc",        label: "SSC",        color: "#8B1E3F", sortOrder: 1 },
    { key: "banking",    label: "Banking",    color: "#2563A8", sortOrder: 2 },
    { key: "railway",    label: "Railway",    color: "#2CA6A4", sortOrder: 3 },
    { key: "foundation", label: "Foundation", color: "#5B2D8E", sortOrder: 4 },
  ];
  for (const ec of EXAM_CATEGORIES) {
    await prisma.examCategory.upsert({
      where:  { tenantId_key: { tenantId, key: ec.key } },
      update: { label: ec.label, color: ec.color, sortOrder: ec.sortOrder },
      create: { ...ec, tenantId },
    });
  }
  console.log(`Ensured ${EXAM_CATEGORIES.length} exam categories`);
}

async function main() {
  const tenant = await seedMainTenant();
  await seedExamCategories(tenant.id);

  const subjects: { name: string; examCategory: "ssc" | "banking" | "railway" | null }[] = [
    { name: "Quantitative Aptitude",                    examCategory: null },
    { name: "Reasoning / General Intelligence",         examCategory: null },
    { name: "English Language",                         examCategory: null },
    { name: "General Awareness & Current Affairs",      examCategory: null },
    { name: "History",                                  examCategory: "ssc" },
    { name: "Geography",                                examCategory: "ssc" },
    { name: "Indian Polity & Constitution",             examCategory: "ssc" },
    { name: "Indian Economy",                           examCategory: "ssc" },
    { name: "General Science (Physics, Chemistry, Biology)", examCategory: "ssc" },
    { name: "Banking Awareness",                        examCategory: "banking" },
    { name: "Computer Knowledge & Aptitude",            examCategory: "banking" },
    { name: "Data Interpretation",                      examCategory: "banking" },
    { name: "Financial & Economic Awareness",           examCategory: "banking" },
    { name: "General Science & Technology",             examCategory: "railway" },
    { name: "Technical Aptitude",                       examCategory: "railway" },
  ];

  const examCategories = await prisma.examCategory.findMany({ where: { tenantId: tenant.id } });
  const examCategoryIdByKey = (key: string | null) =>
    key ? examCategories.find((ec) => ec.key === key)?.id ?? null : null;

  for (const s of subjects) {
    const subject = await prisma.subject.upsert({
      where:  { tenantId_name: { tenantId: tenant.id, name: s.name } },
      update: {},
      create: { tenantId: tenant.id, name: s.name },
    });
    const categoryId = examCategoryIdByKey(s.examCategory);
    if (categoryId) {
      await prisma.subjectExamCategory.upsert({
        where:  { subjectId_examCategoryId: { subjectId: subject.id, examCategoryId: categoryId } },
        update: {},
        create: { subjectId: subject.id, examCategoryId: categoryId },
      });
    }
  }
  await prisma.subject.deleteMany({
    where: { tenantId: tenant.id, name: { in: ["Quant", "Reasoning", "English", "GA/GS"] } },
  });
  console.log(`Seeded ${subjects.length} subjects`);

  const adminEmail = "admin@institute-os.local";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "admin123";
  const existingAdmin = await prisma.staff.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.staff.create({
      data: {
        tenantId:     tenant.id,
        fullName:     "Admin",
        phone:        "9999999999",
        email:        adminEmail,
        roles:        ["admin"],
        passwordHash: await bcrypt.hash(adminPassword, 10),
      },
    });
    console.log(`Seeded admin: ${adminEmail} / ${adminPassword}`);
  }

  const center = await seedMainCenter(tenant.id);
  await seedSampleData(tenant.id, center.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

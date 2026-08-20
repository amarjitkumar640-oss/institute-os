import { apiClient } from "./client";

export interface DashboardStats {
  totalStudents: number;
  totalBatches: number;
  activeBatches: number;
  totalCourses: number;
  totalFaculty: number;
  totalSubjects: number;
  totalEnrollments: number;
  feesCollected: number;
  monthlyEnrollments: { label: string; count: number }[];
  recentActivity: { type: "enrollment" | "faculty"; title: string; sub: string; time: string }[];
  perCenter?: { id: string; name: string; students: number; batches: number; enrollments: number }[];

  // "Today at a glance" alert counters — deep-link to the corresponding
  // filtered list page.
  overdueFeesCount: number;
  staleLeadsCount: number;
  pendingApplicationsCount: number;

  // Trend context for the existing headline stat cards (lifetime totals
  // stay as-is; these are additional deltas, not replacements).
  enrollmentsThisMonth: number;
  newBatchesThisMonth: number;
  feesTrendPercent: number | null;
  feesTrendUpFromZero: boolean;

  // Admissions widgets.
  applicationStatusCounts: { pending: number; admitted: number; rejected: number };
  recentAdmissions: {
    id: string;
    fullName: string;
    courseName: string;
    status: "pending" | "admitted" | "rejected";
    createdAt: string;
  }[];

  // Today's classes.
  todaySessionsCount: number;
  todaySessions: {
    id: string;
    subjectName: string | null;
    facultyName: string | null;
    batchId: string;
    batchName: string;
    startTime: string;
    endTime: string;
  }[];

  // Pending fees widget — nearest-due overdue installments.
  topOverdueFees: {
    enrollmentId: string;
    studentName: string;
    outstanding: number;
    dueDate: string;
  }[];

  // Today's-summary banner. Null (not 0) means "no data marked yet today",
  // distinct from a real zero — see dashboard.routes.ts for why.
  studentAttendanceTodayPercent: number | null;
  facultyAttendanceToday: { present: number; marked: number; total: number } | null;
  admissionsToday: number;
  feesCollectedToday: number;
  studentsAbsentToday: number | null;
  facultyAbsentToday: number | null;
}

export interface TeacherDashboard {
  linked: true;
  classesToday: unknown[];
  myBatches: { id: string; name: string }[];
  totalBatches: number;
  totalStudents: number;
}

export type TeacherDashboardResponse = { linked: false } | TeacherDashboard;

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await apiClient.get<DashboardStats>("/api/dashboard");
  return data;
}

export async function getTeacherDashboard(): Promise<TeacherDashboardResponse> {
  const { data } = await apiClient.get<TeacherDashboardResponse>("/api/dashboard/teacher");
  return data;
}

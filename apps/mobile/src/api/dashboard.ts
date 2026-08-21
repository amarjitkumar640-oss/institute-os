import { apiClient } from "./client";

export interface MonthlyEnrollment {
  label: string; // e.g. "Jan"
  count: number;
}

export interface ActivityItem {
  type:  "enrollment" | "faculty" | "lead" | "payment";
  title: string;
  sub:   string;
  time:  string; // ISO
}

export interface CenterBreakdown {
  id:          string;
  name:        string;
  students:    number;
  batches:     number;
  enrollments: number;
}

export interface ApplicationStatusCounts {
  pending:  number;
  admitted: number;
  rejected: number;
}

export interface TodaySessionItem {
  id:          string;
  subjectName: string | null;
  facultyName: string | null;
  batchId:     string;
  batchName:   string;
  startTime:   string; // "HH:MM"
  endTime:     string; // "HH:MM"
}

export interface RecentAdmissionItem {
  id:         string;
  fullName:   string;
  courseName: string;
  status:     "pending" | "rejected" | "admitted";
  createdAt:  string; // ISO
}

export interface OverdueFeeItem {
  enrollmentId: string;
  studentName:  string;
  outstanding:  number;
  dueDate:      string; // ISO
}

export interface FacultyAttendanceTodaySummary {
  present: number;
  marked:  number;
  total:   number;
}

export interface DashboardStats {
  totalStudents:      number;
  totalBatches:       number;
  activeBatches:      number;
  totalCourses:       number;
  totalFaculty:       number;
  totalSubjects:      number;
  totalEnrollments:   number;
  feesCollected:      number;
  monthlyEnrollments: MonthlyEnrollment[];
  recentActivity:     ActivityItem[];
  overdueFeesCount:         number;
  staleLeadsCount:          number;
  pendingApplicationsCount: number;
  enrollmentsThisMonth:     number;
  newBatchesThisMonth:      number;
  feesTrendPercent:         number | null; // null when there's no prior-month collection to compare against
  feesTrendUpFromZero:      boolean; // true when last month was ₹0 but this month has collections — a real increase the percent can't express
  applicationStatusCounts:  ApplicationStatusCounts;
  todaySessionsCount:       number;
  todaySessions:            TodaySessionItem[];
  recentAdmissions:         RecentAdmissionItem[];
  topOverdueFees:           OverdueFeeItem[];
  // null means "nobody has taken attendance yet today" — distinct from a real 0%/0-present.
  studentAttendanceTodayPercent: number | null;
  facultyAttendanceToday:        FacultyAttendanceTodaySummary | null;
  admissionsToday:     number;
  feesCollectedToday:  number;
  studentsAbsentToday: number | null; // null until attendance is marked today
  facultyAbsentToday:  number | null; // null until attendance is marked today
  perCenter?:         CenterBreakdown[];  // only present in all-centers mode
}

// Short-lived cache so returning to the Home tab doesn't refetch identical data on every
// focus (previously a full network round-trip every time). Pull-to-refresh bypasses it
// via `force`.
let cache: { data: DashboardStats; ts: number } | null = null;
const CACHE_TTL_MS = 20_000;

export async function fetchDashboardStats(opts?: { force?: boolean }): Promise<DashboardStats> {
  if (!opts?.force && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }
  const { data } = await apiClient.get<DashboardStats>("/dashboard");
  cache = { data, ts: Date.now() };
  return data;
}

// Switching centers changes what "/dashboard" should return (a different
// center's counts), but this cache is keyed purely on time — it has no idea
// the center changed. Worse, DashboardScreen fully unmounts while the center
// picker is open (RootNavigator swaps to <CenterSelectScreen>), so a
// component-level "did the center change" check can't catch this: the screen
// remounts fresh afterward and just calls the normal (non-forced) load,
// which happily returns this still-live, now-stale cache. AuthContext calls
// this the moment a center switch actually completes.
export function invalidateDashboardCache() {
  cache = null;
}

// ── Teacher-scoped dashboard ────────────────────────────────────────────────

export interface TeacherClassSession {
  id: string;
  scheduledDate: string; // ISO date
  startTime: string;     // "HH:MM"
  endTime: string;       // "HH:MM"
  room: string | null;
  status: "scheduled" | "completed" | "cancelled";
  subject: { id: string; name: string } | null;
  batch: { id: string; name: string };
}

export interface TeacherBatchSummary {
  id: string;
  name: string;
  courseName: string;
  studentCount: number;
}

export type TeacherDashboardStats =
  | { linked: false }
  | {
      linked: true;
      classesToday: TeacherClassSession[];
      myBatches: TeacherBatchSummary[];
      totalBatches: number;
      totalStudents: number;
    };

export async function fetchTeacherDashboardStats(): Promise<TeacherDashboardStats> {
  // Send device local date so the server uses the correct calendar day (IST vs UTC).
  const localDate = new Date();
  const yyyy = localDate.getFullYear();
  const mm   = String(localDate.getMonth() + 1).padStart(2, "0");
  const dd   = String(localDate.getDate()).padStart(2, "0");
  const { data } = await apiClient.get<TeacherDashboardStats>(`/dashboard/teacher?date=${yyyy}-${mm}-${dd}`);
  return data;
}

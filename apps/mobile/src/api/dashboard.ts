import { apiClient } from "./client";

export interface MonthlyEnrollment {
  label: string; // e.g. "Jan"
  count: number;
}

export interface ActivityItem {
  type:  "enrollment" | "faculty";
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
  perCenter?:         CenterBreakdown[];  // only present in all-centers mode
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await apiClient.get<DashboardStats>("/dashboard");
  return data;
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

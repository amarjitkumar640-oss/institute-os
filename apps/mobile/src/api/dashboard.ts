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

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

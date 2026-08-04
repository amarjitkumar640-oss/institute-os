import { apiClient } from "./client";

export interface Enrollment {
  id: string;
  enrolledOn: string;
  status: "active" | "paused" | "completed" | "dropped";
  batch: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    capacity: number;
    enrolledCount: number;
    course: {
      id: string;
      name: string;
      examCategories: Array<{ id: string; key: string; label: string; color: string }>;
    };
  };
}

export async function getStudentEnrollments(studentId: string): Promise<Enrollment[]> {
  const { data } = await apiClient.get<Enrollment[]>("/api/enrollments", { params: { studentId } });
  return data;
}

export async function createEnrollment(studentId: string, batchId: string): Promise<Enrollment> {
  const { data } = await apiClient.post<Enrollment>("/api/enrollments", { studentId, batchId });
  return data;
}

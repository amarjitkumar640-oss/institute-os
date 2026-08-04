import { apiClient } from "./client";
import type { AdmitStudentInput, UpdateStudentInput } from "@institute-os/shared";

export interface Student {
  id: string;
  studentCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  dob: string | null;
  address: string | null;
  guardianPhone: string | null;
  aadhaar: string | null;
  gender: "male" | "female" | null;
  fatherName: string | null;
  motherName: string | null;
  guardianOccupation: string | null;
  guardianEmail: string | null;
  qualification: string | null;
  passYear: string | null;
  board: string | null;
  whatsapp: string | null;
  courseId: string | null;
  course?: { name: string } | null;
  coursePreference: string | null;
  durationPreference: string | null;
  preferredTiming: string | null;
  paymentMode: string | null;
  amountPaid: number | null;
  photoUrl: string | null;
  isActive: boolean;
  centerId: string;
  tenantId: string;
  createdAt: string;
  center?: { id: string; name: string } | null;
  activeEnrollment?: { batchId: string; batchName: string } | null;
  enrollments?: Array<{
    id: string;
    enrolledOn: string;
    status: string;
    batch: { id: string; name: string; startDate: string; endDate: string; status: string };
  }>;
}

export async function listStudents(params?: { batchId?: string }): Promise<Student[]> {
  const { data } = await apiClient.get<Student[]>("/api/students", { params });
  return data;
}

export async function getStudent(id: string): Promise<Student> {
  const { data } = await apiClient.get<Student>(`/api/students/${id}`);
  return data;
}

export async function admitStudent(payload: AdmitStudentInput): Promise<{ student: Student }> {
  const { data } = await apiClient.post<{ student: Student }>("/api/students/admit", payload);
  return data;
}

export async function updateStudent(id: string, payload: UpdateStudentInput): Promise<Student> {
  const { data } = await apiClient.patch<Student>(`/api/students/${id}`, payload);
  return data;
}

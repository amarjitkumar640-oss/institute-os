import { apiClient } from "./client";

export interface AdmissionApplication {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  dob: string | null;
  gender: string | null;
  address: string | null;
  fatherName: string | null;
  motherName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  guardianOccupation: string | null;
  qualification: string | null;
  passYear: string | null;
  board: string | null;
  courseId: string | null;
  course?: { id: string; name: string } | null;
  coursePreference: string | null;
  durationPreference: string | null;
  whatsapp: string | null;
  centerId: string | null;
  center?: { id: string; name: string } | null;
  tcAcceptedAt: string | null;
  status: "pending" | "rejected" | "admitted";
  rejectionReason: string | null;
  reviewedById: string | null;
  reviewedBy?: { id: string; fullName: string } | null;
  reviewedAt: string | null;
  studentId: string | null;
  student?: { id: string; studentCode: string; fullName: string } | null;
  createdAt: string;
}

export async function listAdmissionApplications(status?: string): Promise<AdmissionApplication[]> {
  const { data } = await apiClient.get<AdmissionApplication[]>("/api/admission-applications", {
    params: status && status !== "all" ? { status } : undefined,
  });
  return data;
}

export async function getAdmissionApplication(id: string): Promise<AdmissionApplication> {
  const { data } = await apiClient.get<AdmissionApplication>(`/api/admission-applications/${id}`);
  return data;
}

export async function rejectAdmissionApplication(id: string, reason: string): Promise<AdmissionApplication> {
  const { data } = await apiClient.post<AdmissionApplication>(`/api/admission-applications/${id}/reject`, { reason });
  return data;
}

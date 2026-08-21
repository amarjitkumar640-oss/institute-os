import { apiClient } from "./client";

export type ApplicationStatus = "pending" | "rejected" | "admitted";

export interface AdmissionApplicationItem {
  id:                 string;
  fullName:           string;
  phone:              string;
  email:              string | null;
  dob:                string | null;
  gender:             string | null;
  address:            string | null;
  fatherName:         string | null;
  motherName:         string | null;
  guardianPhone:      string | null;
  guardianEmail:      string | null;
  guardianOccupation: string | null;
  qualification:      string | null;
  passYear:           string | null;
  board:              string | null;
  courseId:           string | null;
  course?:            { id: string; name: string } | null;
  coursePreference:   string | null;
  durationPreference: string | null;
  whatsapp:           string | null;
  centerId:           string | null;
  center?:            { id: string; name: string } | null;
  tcAcceptedAt:       string | null;
  status:             ApplicationStatus;
  rejectionReason:    string | null;
  reviewedById:       string | null;
  reviewedBy?:        { id: string; fullName: string } | null;
  reviewedAt:         string | null;
  studentId:          string | null;
  student?:           { id: string; studentCode: string; fullName: string } | null;
  createdAt:          string;
}

export async function listAdmissionApplications(status?: ApplicationStatus): Promise<AdmissionApplicationItem[]> {
  const { data } = await apiClient.get<AdmissionApplicationItem[]>("/admission-applications", {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function getAdmissionApplication(id: string): Promise<AdmissionApplicationItem> {
  const { data } = await apiClient.get<AdmissionApplicationItem>(`/admission-applications/${id}`);
  return data;
}

export async function rejectAdmissionApplication(
  id: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.post(`/admission-applications/${id}/reject`, { reason });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to reject application" };
  }
}

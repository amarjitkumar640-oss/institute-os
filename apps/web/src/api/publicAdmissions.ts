import { apiClient } from "./client";
import type { SubmitAdmissionApplicationInput } from "@institute-os/shared";

export interface PublicCourse {
  id: string;
  name: string;
  durationMonths: number;
  defaultFee: number;
  examCategories: { id: string; key: string; label: string }[];
}

export async function listPublicCourses(tenantSlug: string): Promise<PublicCourse[]> {
  const { data } = await apiClient.get<PublicCourse[]>(`/api/public/${tenantSlug}/courses`);
  return data;
}

export interface PublicCenter {
  id: string;
  name: string;
  address: string | null;
}

export async function listPublicCenters(tenantSlug: string): Promise<PublicCenter[]> {
  const { data } = await apiClient.get<PublicCenter[]>(`/api/public/${tenantSlug}/centers`);
  return data;
}

export async function submitAdmissionApplication(
  tenantSlug: string,
  payload: SubmitAdmissionApplicationInput & { website?: string },
): Promise<{ id: string }> {
  const { data } = await apiClient.post<{ id: string }>(
    `/api/public/${tenantSlug}/admission-applications`,
    payload
  );
  return data;
}

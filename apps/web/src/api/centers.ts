import { apiClient } from "./client";

export interface Center {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  counts?: { students: number; batches: number; staff: number };
}

export interface CenterStaffMember {
  id: string;
  // A staff member can hold more than one role at once at the same center.
  roles: ("admin" | "teacher" | "frontdesk")[];
  staffId: string;
  fullName: string;
  email: string;
  phone: string;
  isActive: boolean;
}

export async function listAllCenters(): Promise<Center[]> {
  const { data } = await apiClient.get<Center[]>("/api/centers/all");
  return data;
}

export async function listAssignableCenters(): Promise<{ id: string; name: string }[]> {
  const { data } = await apiClient.get<{ id: string; name: string }[]>("/api/centers/assignable");
  return data;
}

export async function createCenter(payload: { name: string; address?: string; phone?: string }): Promise<Center> {
  const { data } = await apiClient.post<Center>("/api/centers", payload);
  return data;
}

export async function updateCenter(id: string, payload: { name?: string; address?: string; phone?: string; isActive?: boolean }): Promise<Center> {
  const { data } = await apiClient.patch<Center>(`/api/centers/${id}`, payload);
  return data;
}

export async function listCenterStaff(centerId: string): Promise<CenterStaffMember[]> {
  const { data } = await apiClient.get<CenterStaffMember[]>(`/api/centers/${centerId}/staff`);
  return data;
}

export async function assignStaffToCenter(centerId: string, staffId: string, roles: ("admin" | "teacher" | "frontdesk")[]): Promise<unknown> {
  const { data } = await apiClient.post(`/api/centers/${centerId}/staff`, { staffId, roles });
  return data;
}

export async function removeStaffFromCenter(centerId: string, staffId: string): Promise<void> {
  await apiClient.delete(`/api/centers/${centerId}/staff/${staffId}`);
}

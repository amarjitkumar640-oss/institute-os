import { apiClient } from "./client";

export interface Staff {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  username: string | null;
  role: "admin" | "teacher" | "frontdesk";
  isActive: boolean;
  createdAt: string;
  linkedFaculty?: { id: string } | null;
  centerAssignments: Array<{
    role: "admin" | "teacher" | "frontdesk";
    center: { id: string; name: string };
  }>;
}

export interface CreateStaffPayload {
  fullName: string;
  email: string;
  phone: string;
  username?: string;
  role: "admin" | "teacher" | "frontdesk";
  password: string;
}

export interface UpdateStaffPayload {
  fullName?: string;
  phone?: string;
  username?: string | null;
  role?: "admin" | "teacher" | "frontdesk";
  isActive?: boolean;
}

export async function listStaff(): Promise<Staff[]> {
  const { data } = await apiClient.get<Staff[]>("/api/staff");
  return data;
}

export async function createStaff(payload: CreateStaffPayload): Promise<Staff> {
  const { data } = await apiClient.post<Staff>("/api/staff", payload);
  return data;
}

export async function updateStaff(id: string, payload: UpdateStaffPayload): Promise<Staff> {
  const { data } = await apiClient.patch<Staff>(`/api/staff/${id}`, payload);
  return data;
}

export async function resetPassword(id: string, password: string): Promise<void> {
  await apiClient.post(`/api/staff/${id}/reset-password`, { password });
}

import { apiClient } from "./client";

export interface StaffCenterAssignment {
  role:   "admin" | "teacher" | "frontdesk";
  center: { id: string; name: string };
}

export interface StaffMember {
  id:                string;
  fullName:          string;
  email:             string;
  phone:             string;
  role:              "admin" | "teacher" | "frontdesk";
  isActive:          boolean;
  createdAt:         string;
  centerAssignments: StaffCenterAssignment[];
}

export interface CreateStaffInput {
  fullName: string;
  email:    string;
  phone:    string;
  role:     "admin" | "teacher" | "frontdesk";
  password: string;
}

export interface UpdateStaffInput {
  fullName?: string;
  phone?:    string;
  role?:     "admin" | "teacher" | "frontdesk";
  isActive?: boolean;
}

export async function fetchAllStaffDetailed(): Promise<StaffMember[]> {
  const { data } = await apiClient.get<StaffMember[]>("/staff");
  return data;
}

export async function createStaffMember(input: CreateStaffInput): Promise<StaffMember> {
  const { data } = await apiClient.post<StaffMember>("/staff", input);
  return data;
}

export async function updateStaffMember(id: string, input: UpdateStaffInput): Promise<StaffMember> {
  const { data } = await apiClient.patch<StaffMember>(`/staff/${id}`, input);
  return data;
}

export async function resetStaffPassword(id: string, password: string): Promise<void> {
  await apiClient.post(`/staff/${id}/reset-password`, { password });
}

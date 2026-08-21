import { apiClient } from "./client";

export interface CenterItem {
  id:        string;
  name:      string;
  address:   string | null;
  phone:     string | null;
  isActive:  boolean;
  createdAt: string;
  counts:    { students: number; batches: number; staff: number };
}

export interface CenterStaffItem {
  id:       string;
  staffId:  string;
  fullName: string;
  email:    string;
  phone:    string | null;
  isActive: boolean;
  // A staff member can hold more than one role at once at the same center.
  roles:    ("admin" | "teacher" | "frontdesk")[];
}

export interface AllStaffItem {
  id:       string;
  fullName: string;
  email:    string;
  roles:    ("admin" | "teacher" | "frontdesk")[];
  isActive: boolean;
}

export async function fetchAllCenters(): Promise<CenterItem[]> {
  const { data } = await apiClient.get<CenterItem[]>("/centers/all");
  return data;
}

export async function createCenter(body: { name: string; address?: string; phone?: string }): Promise<CenterItem> {
  const { data } = await apiClient.post<CenterItem>("/centers", body);
  return data;
}

export async function updateCenter(
  id: string,
  body: { name?: string; address?: string; phone?: string; isActive?: boolean }
): Promise<CenterItem> {
  const { data } = await apiClient.patch<CenterItem>(`/centers/${id}`, body);
  return data;
}

export async function fetchCenterStaff(centerId: string): Promise<CenterStaffItem[]> {
  const { data } = await apiClient.get<CenterStaffItem[]>(`/centers/${centerId}/staff`);
  return data;
}

export async function assignStaffToCenter(
  centerId: string,
  staffId: string,
  roles: ("admin" | "teacher" | "frontdesk")[]
): Promise<void> {
  await apiClient.post(`/centers/${centerId}/staff`, { staffId, roles });
}

export async function removeStaffFromCenter(centerId: string, staffId: string): Promise<void> {
  await apiClient.delete(`/centers/${centerId}/staff/${staffId}`);
}

export async function fetchAllStaff(): Promise<AllStaffItem[]> {
  const { data } = await apiClient.get<AllStaffItem[]>("/staff");
  return data;
}

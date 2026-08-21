import { apiClient } from "./client";
import type { ExamCategory } from "./leads";
import type { Subject } from "./subjects";

export interface Faculty {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  qualification: string;
  experienceYears: number;
  joiningDate: string;
  isActive: boolean;
  centerId: string;
  tenantId: string;
  createdAt: string;
  subjects: (Subject & { examCategories: ExamCategory[] })[];
  linkedStaff?: { id: string; fullName: string } | null;
}

export interface CreateFacultyPayload {
  fullName: string;
  phone: string;
  email: string;
  qualification: string;
  experienceYears?: number;
  joiningDate: string;
  subjectIds?: string[];
  centerId?: string;
}

export interface UpdateFacultyPayload {
  fullName?: string;
  phone?: string;
  email?: string;
  qualification?: string;
  experienceYears?: number;
  joiningDate?: string;
  isActive?: boolean;
  subjectIds?: string[];
  staffId?: string | null;
}

export async function listFaculty(params?: { search?: string; isActive?: boolean; page?: number; limit?: number }): Promise<{ data: Faculty[]; total: number }> {
  const { data } = await apiClient.get<{ data: Faculty[]; total: number }>("/api/faculty", { params });
  return data;
}

export async function getFaculty(id: string): Promise<Faculty> {
  const { data } = await apiClient.get<Faculty>(`/api/faculty/${id}`);
  return data;
}

export async function createFaculty(payload: CreateFacultyPayload): Promise<Faculty> {
  const { data } = await apiClient.post<Faculty>("/api/faculty", payload);
  return data;
}

export async function updateFaculty(id: string, payload: UpdateFacultyPayload): Promise<Faculty> {
  const { data } = await apiClient.patch<Faculty>(`/api/faculty/${id}`, payload);
  return data;
}

export async function deleteFaculty(id: string): Promise<void> {
  await apiClient.delete(`/api/faculty/${id}`);
}

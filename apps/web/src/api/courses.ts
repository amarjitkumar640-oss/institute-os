import { apiClient } from "./client";
import type { ExamCategory } from "./leads";

export interface Course {
  id: string;
  name: string;
  durationMonths: number;
  defaultFee: number;
  tenantId: string;
  createdAt: string;
  examCategories: ExamCategory[];
}

export interface CreateCoursePayload {
  name: string;
  examCategoryIds: string[];
  durationMonths: number;
  defaultFee: number;
}

export async function listCourses(params?: { search?: string; examCategoryId?: string }): Promise<{ data: Course[]; total: number }> {
  const { data } = await apiClient.get<{ data: Course[]; total: number }>("/api/courses", { params });
  return data;
}

export async function getCourse(id: string): Promise<Course> {
  const { data } = await apiClient.get<Course>(`/api/courses/${id}`);
  return data;
}

export async function createCourse(payload: CreateCoursePayload): Promise<Course> {
  const { data } = await apiClient.post<Course>("/api/courses", payload);
  return data;
}

export async function updateCourse(id: string, payload: Partial<CreateCoursePayload>): Promise<Course> {
  const { data } = await apiClient.patch<Course>(`/api/courses/${id}`, payload);
  return data;
}

export async function deleteCourse(id: string): Promise<void> {
  await apiClient.delete(`/api/courses/${id}`);
}

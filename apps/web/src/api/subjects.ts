import { apiClient } from "./client";
export type { ExamCategory } from "./leads";
import type { ExamCategory } from "./leads";

export interface Subject {
  id: string;
  name: string;
  facultyCount: number;
  examCategories: ExamCategory[];
}

export async function listSubjects(params?: { search?: string; examCategoryId?: string }): Promise<Subject[]> {
  const { data } = await apiClient.get<Subject[]>("/api/subjects", { params });
  return data;
}

export async function createSubject(payload: { name: string; examCategoryIds: string[] }): Promise<Subject> {
  const { data } = await apiClient.post<Subject>("/api/subjects", payload);
  return data;
}

export async function updateSubject(id: string, payload: { name?: string; examCategoryIds?: string[] }): Promise<Subject> {
  const { data } = await apiClient.patch<Subject>(`/api/subjects/${id}`, payload);
  return data;
}

export async function deleteSubject(id: string): Promise<void> {
  await apiClient.delete(`/api/subjects/${id}`);
}

export async function listExamCategories(): Promise<ExamCategory[]> {
  const { data } = await apiClient.get<ExamCategory[]>("/api/exam-categories");
  return data;
}

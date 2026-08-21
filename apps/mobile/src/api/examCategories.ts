import { apiClient } from "./client";

export interface ExamCategoryItem {
  id:        string;
  key:       string;
  label:     string;
  color:     string;
  sortOrder: number;
  isActive:  boolean;
}

export async function listExamCategories(): Promise<ExamCategoryItem[]> {
  const { data } = await apiClient.get<ExamCategoryItem[]>("/exam-categories");
  return data;
}

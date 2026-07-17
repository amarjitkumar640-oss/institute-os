import { apiClient } from "./client";
import { AxiosError } from "axios";

export type ExamCategory = "ssc" | "banking" | "railway";

export interface CreateCoursePayload {
  name: string;
  examCategory: ExamCategory;
  durationMonths: number;
  defaultFee: number;
}

export interface CourseItem {
  id: string;
  name: string;
  examCategory: ExamCategory;
  durationMonths: number;
  defaultFee: number;
  batchCount: number;
  activeBatches: number;
}

export interface CreateCourseResult {
  ok: true;
  course: CourseItem;
}

export interface CreateCourseConflict {
  ok: false;
  conflict: true;
  message: string;
}

export type CreateCourseResponse = CreateCourseResult | CreateCourseConflict;

export async function createCourse(
  payload: CreateCoursePayload
): Promise<CreateCourseResponse> {
  try {
    const { data } = await apiClient.post<CourseItem>("/courses", payload);
    return { ok: true, course: data };
  } catch (err) {
    const axiosErr = err as AxiosError<{ error: string }>;
    if (axiosErr.response?.status === 409) {
      return {
        ok: false,
        conflict: true,
        message:
          axiosErr.response.data?.error ??
          "A course with this name already exists for the selected exam category.",
      };
    }
    throw err;
  }
}

export async function listCourses(params?: {
  examCategory?: ExamCategory;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await apiClient.get<{
    data: CourseItem[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }>("/courses", { params });
  return data;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export interface UpdateCoursePayload {
  name?: string;
  examCategory?: ExamCategory;
  durationMonths?: number;
  defaultFee?: number;
}

export type UpdateCourseResponse =
  | { ok: true; course: CourseItem }
  | { ok: false; conflict: true; message: string }
  | { ok: false; notFound: true };

export async function updateCourse(
  id: string,
  payload: UpdateCoursePayload
): Promise<UpdateCourseResponse> {
  try {
    const { data } = await apiClient.patch<CourseItem>(`/courses/${id}`, payload);
    return { ok: true, course: data };
  } catch (err) {
    const axiosErr = err as AxiosError<{ error: string }>;
    if (axiosErr.response?.status === 409) {
      return {
        ok: false,
        conflict: true,
        message:
          axiosErr.response.data?.error ??
          "Another course with this name already exists for the selected category.",
      };
    }
    if (axiosErr.response?.status === 404) {
      return { ok: false, notFound: true };
    }
    throw err;
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export type DeleteCourseResponse =
  | { ok: true }
  | { ok: false; hasData: true; message: string }
  | { ok: false; notFound: true };

export async function deleteCourse(id: string): Promise<DeleteCourseResponse> {
  try {
    await apiClient.delete(`/courses/${id}`);
    return { ok: true };
  } catch (err) {
    const axiosErr = err as AxiosError<{ error: string }>;
    if (axiosErr.response?.status === 409) {
      return {
        ok: false,
        hasData: true,
        message:
          axiosErr.response.data?.error ??
          "Cannot delete this course — it has associated batches.",
      };
    }
    if (axiosErr.response?.status === 404) {
      return { ok: false, notFound: true };
    }
    throw err;
  }
}

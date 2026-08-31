import { apiClient } from "./client";
import { AxiosError } from "axios";
import type { ExamCategoryItem } from "./examCategories";

export interface CreateCoursePayload {
  name: string;
  examCategoryIds?: string[];
  durationMonths: number;
  defaultFee: number;
  discountAmount?: number;
  discountReason?: string;
  isFree?: boolean;
}

export interface CourseItem {
  id: string;
  name: string;
  examCategories: ExamCategoryItem[];
  durationMonths: number;
  defaultFee: number;
  discountAmount: number;
  discountReason: string | null;
  isFree: boolean;
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

export interface CreateCourseDiscountExceedsFee {
  ok: false;
  discountExceedsFee: true;
  message: string;
}

export type CreateCourseResponse = CreateCourseResult | CreateCourseConflict | CreateCourseDiscountExceedsFee;

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
    if (axiosErr.response?.status === 422) {
      return {
        ok: false,
        discountExceedsFee: true,
        message: axiosErr.response.data?.error ?? "Discount cannot exceed the default fee.",
      };
    }
    throw err;
  }
}

export interface CourseNameItem {
  id: string;
  name: string;
}

// Deliberately open to any authenticated staff (unlike listCourses(), which
// requires courses.read) — for populating course-filter chips on screens
// like the student list, so a role without access to the full Courses
// management screen (e.g. teacher) can still filter by course.
export async function listCourseNames(): Promise<CourseNameItem[]> {
  const { data } = await apiClient.get<CourseNameItem[]>("/courses/names");
  return data;
}

export async function listCourses(params?: {
  examCategoryId?: string;
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
  examCategoryIds?: string[];
  durationMonths?: number;
  defaultFee?: number;
  discountAmount?: number;
  discountReason?: string;
  isFree?: boolean;
}

export type UpdateCourseResponse =
  | { ok: true; course: CourseItem }
  | { ok: false; conflict: true; message: string }
  | { ok: false; notFound: true }
  | { ok: false; discountExceedsFee: true; message: string };

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
    if (axiosErr.response?.status === 422) {
      return {
        ok: false,
        discountExceedsFee: true,
        message: axiosErr.response.data?.error ?? "Discount cannot exceed the default fee.",
      };
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

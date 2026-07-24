import { apiClient } from "./client";
import { AxiosError } from "axios";

export type ExamCategory = "ssc" | "banking" | "railway" | "foundation";

export interface FacultySubject {
  id: string;
  name: string;
  examCategory: ExamCategory | null;
}

export interface FacultyItem {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string;
  email: string;
  qualification: string;
  experienceYears: number;
  isActive: boolean;
  joiningDate: string; // "YYYY-MM-DD"
  subjects: FacultySubject[];
}

export interface CreateFacultyPayload {
  fullName: string;
  phone: string;
  email: string;
  qualification: string;
  experienceYears: number;
  joiningDate: string; // "YYYY-MM-DD"
  subjectIds: string[];
  centerId?: string; // only needed when the session has no center pinned
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
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listFaculty(params?: {
  search?: string;
  examCategory?: ExamCategory;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) {
  const { data } = await apiClient.get<{
    data: FacultyItem[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }>("/faculty", { params });
  return data;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export type CreateFacultyResponse =
  | { ok: true; faculty: FacultyItem }
  | { ok: false; conflict: true; field: "email" | "phone"; message: string };

export async function createFaculty(
  payload: CreateFacultyPayload
): Promise<CreateFacultyResponse> {
  try {
    const { data } = await apiClient.post<FacultyItem>("/faculty", payload);
    return { ok: true, faculty: data };
  } catch (err) {
    const ax = err as AxiosError<{ error: string; field?: string }>;
    if (ax.response?.status === 409) {
      return {
        ok: false,
        conflict: true,
        field: (ax.response.data?.field ?? "email") as "email" | "phone",
        message: ax.response.data?.error ?? "A faculty member with this information already exists.",
      };
    }
    throw err;
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export type UpdateFacultyResponse =
  | { ok: true; faculty: FacultyItem }
  | { ok: false; conflict: true; field: "email" | "phone"; message: string }
  | { ok: false; notFound: true };

export async function updateFaculty(
  id: string,
  payload: UpdateFacultyPayload
): Promise<UpdateFacultyResponse> {
  try {
    const { data } = await apiClient.patch<FacultyItem>(`/faculty/${id}`, payload);
    return { ok: true, faculty: data };
  } catch (err) {
    const ax = err as AxiosError<{ error: string; field?: string }>;
    if (ax.response?.status === 409) {
      return {
        ok: false,
        conflict: true,
        field: (ax.response.data?.field ?? "email") as "email" | "phone",
        message: ax.response.data?.error ?? "Another faculty member with this information already exists.",
      };
    }
    if (ax.response?.status === 404) return { ok: false, notFound: true };
    throw err;
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export type DeleteFacultyResponse =
  | { ok: true }
  | { ok: false; notFound: true };

export async function deleteFaculty(id: string): Promise<DeleteFacultyResponse> {
  try {
    await apiClient.delete(`/faculty/${id}`);
    return { ok: true };
  } catch (err) {
    const ax = err as AxiosError;
    if (ax.response?.status === 404) return { ok: false, notFound: true };
    throw err;
  }
}

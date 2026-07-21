import { apiClient } from "./client";

export type ExamCategory = "ssc" | "banking" | "railway" | "foundation";

export interface SubjectItem {
  id:           string;
  name:         string;
  examCategory: ExamCategory | null;
  facultyCount: number;
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface ListSubjectsParams {
  examCategory?: ExamCategory;
  search?: string;
}

export async function listSubjects(params?: ListSubjectsParams): Promise<SubjectItem[]> {
  const { data } = await apiClient.get<SubjectItem[]>("/subjects", { params });
  return data;
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateSubjectPayload {
  name:         string;
  examCategory: ExamCategory | null;
}

export type CreateSubjectResponse =
  | { ok: true; subject: SubjectItem }
  | { ok: false; conflict: true; message: string };

export async function createSubject(payload: CreateSubjectPayload): Promise<CreateSubjectResponse> {
  try {
    const { data } = await apiClient.post<SubjectItem>("/subjects", payload);
    return { ok: true, subject: data };
  } catch (err: any) {
    const d = err?.response?.data;
    if (err?.response?.status === 409 && d?.conflict) {
      return { ok: false, conflict: true, message: d.message };
    }
    throw err;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface UpdateSubjectPayload {
  name?:         string;
  examCategory?: ExamCategory | null;
}

export type UpdateSubjectResponse =
  | { ok: true; subject: SubjectItem }
  | { ok: false; conflict: true; message: string }
  | { ok: false; notFound: true };

export async function updateSubject(id: string, payload: UpdateSubjectPayload): Promise<UpdateSubjectResponse> {
  try {
    const { data } = await apiClient.patch<SubjectItem>(`/subjects/${id}`, payload);
    return { ok: true, subject: data };
  } catch (err: any) {
    const d = err?.response?.data;
    if (err?.response?.status === 409 && d?.conflict) {
      return { ok: false, conflict: true, message: d.message };
    }
    if (err?.response?.status === 404) {
      return { ok: false, notFound: true };
    }
    throw err;
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export type DeleteSubjectResponse =
  | { ok: true }
  | { ok: false; hasData: true; message: string }
  | { ok: false; notFound: true };

export async function deleteSubject(id: string): Promise<DeleteSubjectResponse> {
  try {
    await apiClient.delete(`/subjects/${id}`);
    return { ok: true };
  } catch (err: any) {
    const d = err?.response?.data;
    if (err?.response?.status === 409 && d?.hasData) {
      return { ok: false, hasData: true, message: d.message };
    }
    if (err?.response?.status === 404) {
      return { ok: false, notFound: true };
    }
    throw err;
  }
}

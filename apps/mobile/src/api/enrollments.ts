import { apiClient } from "./client";
import type { BatchItem } from "./batches";

export interface EnrollmentItem {
  id: string;
  enrolledOn: string;
  status: "active" | "paused" | "completed" | "dropped";
  batch: BatchItem;
}

export type EnrollResult =
  | { ok: true; enrollment: EnrollmentItem }
  | { ok: false; alreadyEnrolled: true; message: string }
  | { ok: false; batchFull: true; message: string }
  | { ok: false; error: string };

export async function listStudentEnrollments(studentId: string): Promise<EnrollmentItem[]> {
  const { data } = await apiClient.get<EnrollmentItem[]>("/enrollments", { params: { studentId } });
  return data;
}

export async function enrollStudent(studentId: string, batchId: string): Promise<EnrollResult> {
  try {
    const { data } = await apiClient.post<EnrollmentItem>("/enrollments", { studentId, batchId });
    return { ok: true, enrollment: data };
  } catch (err: any) {
    const msg: string = err?.response?.data?.error ?? "Enrollment failed";
    if (err?.response?.status === 409) {
      if (msg.toLowerCase().includes("already enrolled")) {
        return { ok: false, alreadyEnrolled: true, message: msg };
      }
      return { ok: false, batchFull: true, message: msg };
    }
    return { ok: false, error: msg };
  }
}

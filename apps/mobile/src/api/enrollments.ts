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

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Student is discontinuing this batch — soft status change, fee records untouched.
export async function dropEnrollment(enrollmentId: string): Promise<ActionResult<EnrollmentItem>> {
  try {
    const { data } = await apiClient.post<EnrollmentItem>(`/enrollments/${enrollmentId}/drop`);
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Could not remove student from batch" };
  }
}

// Student is moving to a different batch — creates the new enrollment and
// drops the old one atomically on the server.
export async function transferEnrollment(enrollmentId: string, toBatchId: string): Promise<ActionResult<EnrollmentItem>> {
  try {
    const { data } = await apiClient.post<EnrollmentItem>(`/enrollments/${enrollmentId}/transfer`, { toBatchId });
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Could not move student to the new batch" };
  }
}

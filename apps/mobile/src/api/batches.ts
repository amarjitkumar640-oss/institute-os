import { apiClient } from "./client";

export type BatchStatus  = "upcoming" | "running" | "completed";
export type ExamCategory = "ssc" | "banking" | "railway";

export interface BatchItem {
  id:            string;
  name:          string;
  courseId:      string;
  capacity:      number;
  startDate:     string;
  endDate:       string;
  status:        BatchStatus;
  enrolledCount: number;
  centerId?:     string | null;
  center?:       { id: string; name: string } | null;
  course: {
    id:             string;
    name:           string;
    examCategory:   ExamCategory;
    durationMonths: number;
    defaultFee:     string;
  };
}

export interface CreateBatchPayload {
  courseId:  string;
  name:      string;
  capacity:  number;
  startDate: string;
  endDate:   string;
}

export interface UpdateBatchPayload {
  name?:      string;
  capacity?:  number;
  startDate?: string;
  endDate?:   string;
  status?:    BatchStatus;
}

export type BatchResponse =
  | { ok: true; batch: BatchItem }
  | { ok: false; error: string };

export type DeleteBatchResponse =
  | { ok: true }
  | { ok: false; hasEnrollments: true; message: string }
  | { ok: false; error: string };

export async function listBatches(): Promise<BatchItem[]> {
  const { data } = await apiClient.get<BatchItem[]>("/batches");
  return data;
}

export async function createBatch(payload: CreateBatchPayload): Promise<BatchResponse> {
  try {
    const { data } = await apiClient.post<BatchItem>("/batches", payload);
    return { ok: true, batch: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to create batch" };
  }
}

export async function updateBatch(id: string, payload: UpdateBatchPayload): Promise<BatchResponse> {
  try {
    const { data } = await apiClient.patch<BatchItem>(`/batches/${id}`, payload);
    return { ok: true, batch: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to update batch" };
  }
}

export async function deleteBatch(id: string): Promise<DeleteBatchResponse> {
  try {
    await apiClient.delete(`/batches/${id}`);
    return { ok: true };
  } catch (err: any) {
    const d = err?.response?.data;
    if (err?.response?.status === 409 && d?.hasEnrollments) {
      return { ok: false, hasEnrollments: true, message: d.message };
    }
    return { ok: false, error: d?.error ?? "Failed to delete batch" };
  }
}

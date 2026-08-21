import { apiClient } from "./client";
import type { ExamCategory } from "./leads";

export interface Batch {
  id: string;
  name: string;
  status: "upcoming" | "running" | "completed";
  capacity: number;
  startDate: string;
  endDate: string;
  centerId: string;
  tenantId: string;
  createdAt: string;
  enrolledCount: number;
  course: {
    id: string;
    name: string;
    durationMonths: number;
    defaultFee: number;
    examCategories: ExamCategory[];
  };
  center?: { id: string; name: string };
}

export interface CreateBatchPayload {
  courseId: string;
  name: string;
  capacity: number;
  startDate: string;
  endDate: string;
  centerId?: string;
}

export interface UpdateBatchPayload {
  name?: string;
  capacity?: number;
  startDate?: string;
  endDate?: string;
  status?: "upcoming" | "running" | "completed";
}

export async function listBatches(): Promise<Batch[]> {
  const { data } = await apiClient.get<Batch[]>("/api/batches");
  return data;
}

export async function getBatch(id: string): Promise<Batch> {
  const { data } = await apiClient.get<Batch>(`/api/batches/${id}`);
  return data;
}

export async function createBatch(payload: CreateBatchPayload): Promise<Batch> {
  const { data } = await apiClient.post<Batch>("/api/batches", payload);
  return data;
}

export async function updateBatch(id: string, payload: UpdateBatchPayload): Promise<Batch> {
  const { data } = await apiClient.patch<Batch>(`/api/batches/${id}`, payload);
  return data;
}

export async function deleteBatch(id: string): Promise<void> {
  await apiClient.delete(`/api/batches/${id}`);
}

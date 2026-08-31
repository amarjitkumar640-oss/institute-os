import { apiClient } from "./client";
import type { ExamCategory } from "./leads";

export interface Batch {
  id: string;
  name: string;
  status: "upcoming" | "running" | "completed" | "merged";
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
  status?: "upcoming" | "running" | "completed" | "merged";
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

export interface MergeBatchResult {
  mergedCount: number;
  skipped: { studentId: string; fullName: string; reason: string }[];
  sourceBatchStatus: "merged" | null;
}

export async function mergeBatch(fromBatchId: string, toBatchId: string): Promise<MergeBatchResult> {
  const { data } = await apiClient.post<MergeBatchResult>(`/api/batches/${fromBatchId}/merge`, { toBatchId });
  return data;
}

// ── Discount offers ("first N students in this batch get ₹X off") ────────────

export interface BatchDiscountOffer {
  id: string;
  batchId: string;
  discountAmount: number;
  maxRedemptions: number;
  redeemedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OfferPayload {
  discountAmount: number;
  maxRedemptions: number;
}

export async function listBatchOffers(batchId: string): Promise<BatchDiscountOffer[]> {
  const { data } = await apiClient.get<BatchDiscountOffer[]>(`/api/batches/${batchId}/offers`);
  return data;
}

export async function createBatchOffer(batchId: string, payload: OfferPayload): Promise<BatchDiscountOffer> {
  const { data } = await apiClient.post<BatchDiscountOffer>(`/api/batches/${batchId}/offers`, payload);
  return data;
}

export async function updateBatchOffer(
  offerId: string,
  payload: Partial<OfferPayload> & { isActive?: boolean },
): Promise<BatchDiscountOffer> {
  const { data } = await apiClient.patch<BatchDiscountOffer>(`/api/batches/offers/${offerId}`, payload);
  return data;
}

export async function deleteBatchOffer(offerId: string): Promise<void> {
  await apiClient.delete(`/api/batches/offers/${offerId}`);
}

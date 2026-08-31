import { apiClient } from "./client";
import type { ExamCategoryItem } from "./examCategories";

export type BatchStatus  = "upcoming" | "running" | "completed" | "merged";

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
    examCategories: ExamCategoryItem[];
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
  centerId?: string;
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

export interface MergeBatchSkip {
  studentId: string;
  fullName:  string;
  reason:    string;
}

export interface MergeBatchResult {
  mergedCount:       number;
  skipped:           MergeBatchSkip[];
  sourceBatchStatus: "merged" | null;
}

export type MergeBatchResponse =
  | { ok: true; data: MergeBatchResult }
  | { ok: false; error: string };

// ── Discount offers ("first N students in this batch get ₹X off") ────────────

export interface BatchDiscountOffer {
  id:             string;
  batchId:        string;
  discountAmount: number;
  maxRedemptions: number;
  redeemedCount:  number;
  isActive:       boolean;
  createdAt:      string;
  updatedAt:      string;
}

export interface OfferPayload {
  discountAmount: number;
  maxRedemptions: number;
}

export type OfferResponse =
  | { ok: true; offer: BatchDiscountOffer }
  | { ok: false; error: string };

export type DeleteOfferResponse =
  | { ok: true }
  | { ok: false; error: string };

export async function listBatchOffers(batchId: string): Promise<BatchDiscountOffer[]> {
  const { data } = await apiClient.get<BatchDiscountOffer[]>(`/batches/${batchId}/offers`);
  return data;
}

export async function createBatchOffer(batchId: string, payload: OfferPayload): Promise<OfferResponse> {
  try {
    const { data } = await apiClient.post<BatchDiscountOffer>(`/batches/${batchId}/offers`, payload);
    return { ok: true, offer: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to create offer" };
  }
}

export async function updateBatchOffer(
  offerId: string,
  payload: Partial<OfferPayload> & { isActive?: boolean },
): Promise<OfferResponse> {
  try {
    const { data } = await apiClient.patch<BatchDiscountOffer>(`/batches/offers/${offerId}`, payload);
    return { ok: true, offer: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to update offer" };
  }
}

export async function deleteBatchOffer(offerId: string): Promise<DeleteOfferResponse> {
  try {
    await apiClient.delete(`/batches/offers/${offerId}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to delete offer" };
  }
}

// Moves every active student out of fromBatchId and into toBatchId — see
// batch-merge.service.ts on the API side. No course-match requirement; a
// student's own course record and fee amount are left untouched either way.
export async function mergeBatch(fromBatchId: string, toBatchId: string): Promise<MergeBatchResponse> {
  try {
    const { data } = await apiClient.post<MergeBatchResult>(`/batches/${fromBatchId}/merge`, { toBatchId });
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Could not merge batches" };
  }
}

import { apiClient } from "./client";

export interface FeeSchedule {
  id: string;
  enrollmentId: string;
  totalFee: number;
  discountAmount: number;
  effectiveFee: number;
  creditBalance: number;
  pendingAmount: number;
  status: "active" | "completed" | "overdue";
  createdAt: string;
  enrollment?: {
    student: { id: string; fullName: string; phone: string };
    batch: { id: string; name: string };
  };
  installments?: Installment[];
}

export interface Installment {
  id: string;
  sortOrder: number;
  label: string;
  plannedAmount: number;
  paidAmount: number;
  waivedAmount: number;
  dueDate: string;
  status: "pending" | "partial" | "paid" | "overdue" | "waived" | "deferred";
  lateFee: number;
  notes: string | null;
  waivedReason: string | null;
}

export interface ScheduleListItem {
  id: string;
  enrollmentId: string;
  totalFee: number;
  discountAmount: number;
  effectiveFee: number;
  creditBalance: number;
  status: string;
  student: { id: string; fullName: string; phone: string };
  batch: { id: string; name: string; center: { id: string; name: string } | null };
  paidAmount: number;
  pendingAmount: number;
}

export interface RecordPaymentPayload {
  scheduleId: string;
  installmentId?: string;
  amount: number;
  mode: "cash" | "upi" | "card" | "bank_transfer" | "cheque";
  paidAt: string;
  chequeNo?: string;
  bankName?: string;
  upiRef?: string;
  notes?: string;
}

export async function listFeeSchedules(params?: { search?: string; status?: string; batchId?: string }): Promise<ScheduleListItem[]> {
  const { data } = await apiClient.get<ScheduleListItem[]>("/api/fees/schedules", { params });
  return data;
}

export async function getFeeSchedule(enrollmentId: string): Promise<FeeSchedule> {
  const { data } = await apiClient.get<FeeSchedule>(`/api/fees/schedules/${enrollmentId}`);
  return data;
}

export async function generateFeeSchedule(enrollmentId: string, payload: { totalFee: number; discountAmount?: number; discountReason?: string; enrollmentDate?: string }): Promise<FeeSchedule> {
  const { data } = await apiClient.post<FeeSchedule>(`/api/fees/schedules/${enrollmentId}/generate`, payload);
  return data;
}

export async function applyDiscount(scheduleId: string, payload: { discountAmount: number; discountReason?: string }): Promise<FeeSchedule> {
  const { data } = await apiClient.patch<FeeSchedule>(`/api/fees/schedules/${scheduleId}/discount`, payload);
  return data;
}

export async function editInstallment(id: string, payload: {
  label?: string;
  plannedAmount?: number;
  dueDate?: string;
  waivedAmount?: number;
  waivedReason?: string;
  lateFee?: number;
  notes?: string;
  status?: string;
}): Promise<Installment> {
  const { data } = await apiClient.patch<Installment>(`/api/fees/installments/${id}`, payload);
  return data;
}

export async function recordPayment(payload: RecordPaymentPayload): Promise<unknown> {
  const { data } = await apiClient.post("/api/fees/payments", payload);
  return data;
}

export async function getFeeSummary(): Promise<{
  totalCollected: number;
  totalPending: number;
  overdueCount: number;
}> {
  const { data } = await apiClient.get("/api/fees/summary");
  return data;
}

export type CollectionPeriod = "today" | "week" | "month" | "year";

export interface CollectionSummary {
  collectedToday: number;
  collectedThisWeek: number;
  collectedThisMonth: number;
  collectedThisYear: number;
  totalPending: number;
  overdueCount: number;
}

export interface BatchCollectionRow {
  batchId: string;
  batchName: string;
  collectedAmount: number;
  pendingAmount: number;
  pendingStudentCount: number;
}

export async function getCollectionSummary(): Promise<CollectionSummary> {
  const { data } = await apiClient.get("/api/fees/collection-summary");
  return data;
}

export async function getCollectionByBatch(period: CollectionPeriod): Promise<{ period: CollectionPeriod; batches: BatchCollectionRow[] }> {
  const { data } = await apiClient.get("/api/fees/collection-by-batch", { params: { period } });
  return data;
}

export type TemplateLineType = "fixed" | "percentage" | "equal_split" | "remaining";
export type TemplateTrigger = "on_admission" | "days_after_admission" | "days_after_previous" | "monthly_recurring";

export interface TemplateLine {
  id: string;
  templateId: string;
  sortOrder: number;
  label: string;
  lineType: TemplateLineType;
  amount: string | null;
  percentage: string | null;
  splitCount: number | null;
  trigger: TemplateTrigger;
  offsetDays: number | null;
  dayOfMonth: number | null;
}

export interface FeeTemplate {
  id: string;
  courseId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines: TemplateLine[];
}

export interface UpsertTemplateLinePayload {
  sortOrder: number;
  label: string;
  lineType: TemplateLineType;
  amount?: number;
  percentage?: number;
  splitCount?: number;
  trigger: TemplateTrigger;
  offsetDays?: number;
  dayOfMonth?: number;
}

export interface UpsertTemplatePayload {
  notes?: string;
  lines: UpsertTemplateLinePayload[];
}

export async function getFeeTemplate(courseId: string): Promise<FeeTemplate | null> {
  try {
    const { data } = await apiClient.get<FeeTemplate>(`/api/fees/templates/${courseId}`);
    return data;
  } catch (err: unknown) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
    throw err;
  }
}

export async function upsertFeeTemplate(courseId: string, payload: UpsertTemplatePayload): Promise<FeeTemplate> {
  const { data } = await apiClient.post<FeeTemplate>(`/api/fees/templates/${courseId}`, payload);
  return data;
}

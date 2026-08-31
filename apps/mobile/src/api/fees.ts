import { apiClient } from "./client";

// ── Enums / literals ──────────────────────────────────────────────────────────

export type TxnMode           = "cash" | "upi" | "card" | "bank_transfer" | "cheque";
export type TxnType           = "payment" | "refund" | "adjustment" | "credit_applied";
export type InstallmentStatus = "pending" | "partial" | "paid" | "overdue" | "waived" | "deferred";
export type FeeScheduleStatus = "active" | "completed" | "cancelled";
export type TemplateLineType  = "fixed" | "percentage" | "equal_split" | "remaining";
export type TemplateTrigger   = "on_admission" | "days_after_admission" | "days_after_previous" | "monthly_recurring";

// ── Template types ────────────────────────────────────────────────────────────

export interface TemplateLine {
  id:         string;
  templateId: string;
  sortOrder:  number;
  label:      string;
  lineType:   TemplateLineType;
  amount:     string | null;
  percentage: string | null;
  splitCount: number | null;
  trigger:    TemplateTrigger;
  offsetDays: number | null;
  dayOfMonth: number | null;
}

export interface FeeTemplate {
  id:        string;
  courseId:  string;
  notes:     string | null;
  createdAt: string;
  updatedAt: string;
  lines:     TemplateLine[];
}

// ── Schedule / installment types ──────────────────────────────────────────────

export interface PaymentTransaction {
  id:            string;
  scheduleId:    string;
  installmentId: string | null;
  amount:        string;
  mode:          TxnMode;
  type:          TxnType;
  receiptNo:     string | null;
  paidAt:        string;
  collectedById: string | null;
  chequeNo:      string | null;
  bankName:      string | null;
  upiRef:        string | null;
  notes:         string | null;
  createdAt:     string;
  collectedBy?:  { id: string; fullName: string } | null;
  installment?:  { id: string; label: string } | null;
}

export interface ScheduleInstallment {
  id:            string;
  scheduleId:    string;
  sortOrder:     number;
  label:         string;
  plannedAmount: string;
  paidAmount:    string;
  waivedAmount:  string;
  lateFee:       string;
  dueDate:       string;
  status:        InstallmentStatus;
  waivedReason:  string | null;
  notes:         string | null;
  createdAt:     string;
  updatedAt:     string;
  transactions?: PaymentTransaction[];
}

export interface StudentFeeSchedule {
  id:             string;
  enrollmentId:   string;
  totalFee:       string | number;
  discountAmount: string | number;
  discountReason?: string | null;
  effectiveFee:   string | number;
  creditBalance:  string | number;
  status:         FeeScheduleStatus;
  createdAt?:     string;
  updatedAt?:     string;
  // List view returns installments; detail view always includes them
  installments?:  ScheduleInstallment[];
  transactions?:  PaymentTransaction[];
  // Flat fields returned by the list endpoint
  student?:       { id: string; fullName: string; studentCode: string; phone?: string; whatsapp?: string | null };
  batch?:         { id: string; name: string };
  paidAmount?:    number;
  pendingAmount?: number;
  // Nested fields returned by the detail endpoint
  enrollment?:    {
    student: { id: string; fullName: string; studentCode: string; phone: string; whatsapp?: string | null };
    batch:   { id: string; name: string };
  };
}

export interface FeeSummary {
  totalCollected: number;
  totalPending:   number;
  overdueCount:   number;
}

export type CollectionPeriod = "today" | "week" | "month" | "year";

export interface CollectionSummary {
  collectedToday:     number;
  collectedThisWeek:  number;
  collectedThisMonth: number;
  collectedThisYear:  number;
  totalPending:       number;
  overdueCount:       number;
}

export interface BatchCollectionRow {
  batchId:             string;
  batchName:           string;
  collectedAmount:     number;
  pendingAmount:       number;
  pendingStudentCount: number;
}

// ── Request payload types ─────────────────────────────────────────────────────

export interface UpsertTemplatePayload {
  notes?: string;
  lines: Array<{
    sortOrder:  number;
    label:      string;
    lineType:   TemplateLineType;
    amount?:    number;
    percentage?: number;
    splitCount?: number;
    trigger:    TemplateTrigger;
    offsetDays?: number;
    dayOfMonth?: number;
  }>;
}

export interface GenerateSchedulePayload {
  totalFee:        number;
  discountAmount?: number;
  discountReason?: string;
  enrollmentDate?: string; // YYYY-MM-DD
}

export interface ApplyDiscountPayload {
  discountAmount: number;
  discountReason?: string;
}

export interface EditInstallmentPayload {
  label?:        string;
  plannedAmount?: number;
  dueDate?:      string;
  waivedAmount?: number;
  waivedReason?: string;
  lateFee?:      number;
  notes?:        string;
  status?:       InstallmentStatus;
}

export interface RecordPaymentPayload {
  scheduleId:     string;
  installmentId?: string;
  amount:         number;
  mode:           TxnMode;
  paidAt:         string; // YYYY-MM-DD
  chequeNo?:      string;
  bankName?:      string;
  upiRef?:        string;
  notes?:         string;
}

// ── API functions ─────────────────────────────────────────────────────────────

// Templates
export async function getFeeTemplate(courseId: string): Promise<FeeTemplate | null> {
  try {
    const { data } = await apiClient.get<FeeTemplate>(`/fees/templates/${courseId}`);
    return data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function upsertFeeTemplate(courseId: string, payload: UpsertTemplatePayload): Promise<FeeTemplate> {
  const { data } = await apiClient.post<FeeTemplate>(`/fees/templates/${courseId}`, payload);
  return data;
}

// Schedules
export async function listSchedules(params?: {
  search?:  string;
  status?:  "active" | "overdue" | "partial" | "completed";
  batchId?: string;
}): Promise<StudentFeeSchedule[]> {
  const { data } = await apiClient.get<StudentFeeSchedule[]>("/fees/schedules", { params });
  return data;
}

export async function getScheduleDetail(enrollmentId: string): Promise<StudentFeeSchedule | null> {
  try {
    const { data } = await apiClient.get<StudentFeeSchedule>(`/fees/schedules/${enrollmentId}`);
    return data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function generateSchedule(
  enrollmentId: string,
  payload:      GenerateSchedulePayload,
): Promise<StudentFeeSchedule> {
  const { data } = await apiClient.post<StudentFeeSchedule>(
    `/fees/schedules/${enrollmentId}/generate`,
    payload,
  );
  return data;
}

export async function applyDiscount(
  scheduleId: string,
  payload:    ApplyDiscountPayload,
): Promise<StudentFeeSchedule> {
  const { data } = await apiClient.patch<StudentFeeSchedule>(
    `/fees/schedules/${scheduleId}/discount`,
    payload,
  );
  return data;
}

// Installments
export async function editInstallment(
  installmentId: string,
  payload:       EditInstallmentPayload,
): Promise<ScheduleInstallment> {
  const { data } = await apiClient.patch<ScheduleInstallment>(
    `/fees/installments/${installmentId}`,
    payload,
  );
  return data;
}

// Payments
export async function recordPayment(payload: RecordPaymentPayload): Promise<PaymentTransaction> {
  const { data } = await apiClient.post<PaymentTransaction>("/fees/payments", payload);
  return data;
}

export async function listPayments(scheduleId?: string): Promise<PaymentTransaction[]> {
  const { data } = await apiClient.get<PaymentTransaction[]>("/fees/payments", {
    params: scheduleId ? { scheduleId } : undefined,
  });
  return data;
}

// Summary
export async function getFeeSummary(): Promise<FeeSummary> {
  const { data } = await apiClient.get<FeeSummary>("/fees/summary");
  return data;
}

export async function getCollectionSummary(): Promise<CollectionSummary> {
  const { data } = await apiClient.get<CollectionSummary>("/fees/collection-summary");
  return data;
}

export async function getCollectionByBatch(period: CollectionPeriod): Promise<{ period: CollectionPeriod; batches: BatchCollectionRow[] }> {
  const { data } = await apiClient.get("/fees/collection-by-batch", { params: { period } });
  return data;
}

// ── Derived helpers (pure, no network) ───────────────────────────────────────

export function installmentOutstanding(inst: ScheduleInstallment): number {
  return Math.max(
    0,
    Number(inst.plannedAmount) + Number(inst.lateFee)
    - Number(inst.paidAmount) - Number(inst.waivedAmount),
  );
}

export function scheduleTotalPaid(schedule: StudentFeeSchedule): number {
  if (schedule.paidAmount !== undefined) return schedule.paidAmount;
  return (schedule.installments ?? []).reduce((sum, i) => sum + Number(i.paidAmount), 0);
}

export function scheduleTotalOutstanding(schedule: StudentFeeSchedule): number {
  if (schedule.pendingAmount !== undefined) return schedule.pendingAmount;
  return (schedule.installments ?? []).reduce((sum, i) => sum + installmentOutstanding(i), 0);
}

export function scheduleHasOverdue(schedule: StudentFeeSchedule): boolean {
  return (schedule.installments ?? []).some((i) => i.status === "overdue");
}

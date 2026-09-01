import { apiClient } from "./client";

export interface Sponsor {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  stateCode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SponsorDetail extends Sponsor {
  contracts: (SponsorshipContract & { batch: { id: string; name: string }; milestones: (Milestone & { invoice: SponsorInvoice | null })[] })[];
}

export interface CreateSponsorPayload {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  stateCode?: string;
  notes?: string;
}

export interface SponsorshipContract {
  id: string;
  sponsorId: string;
  batchId: string;
  contractedStudentCount: number;
  totalContractAmount: number;
  gstRate: number | null;
  tdsRate: number | null;
  startDate: string;
  endDate: string | null;
  status: "active" | "completed" | "cancelled";
  documentUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractWithSponsor extends SponsorshipContract {
  sponsor: Sponsor;
  milestones: (Milestone & { invoice: SponsorInvoice | null })[];
}

export interface CreateContractPayload {
  sponsorId: string;
  batchId: string;
  contractedStudentCount: number;
  totalContractAmount: number;
  gstRate?: number | null;
  tdsRate?: number | null;
  startDate: string;
  endDate?: string | null;
  notes?: string;
}

export interface Milestone {
  id: string;
  contractId: string;
  label: string;
  amount: number;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: "pending" | "received";
  receivedAt: string | null;
  receivedAmount: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMilestonePayload {
  label: string;
  amount: number;
  dueDate?: string | null;
  notes?: string;
}

export interface GenerateMonthlyMilestonesPayload {
  monthlyAmount: number;
  numberOfMonths: number;
  startMonth: string;
  labelPrefix?: string;
}

export interface SponsorInvoice {
  id: string;
  contractId: string;
  milestoneId: string;
  invoiceNumber: string;
  issueDate: string;
  taxableAmount: number;
  gstRate: number | null;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  tdsRate: number | null;
  tdsAmount: number;
  netReceivableAmount: number;
  shareToken: string;
  createdAt: string;
}

export async function listSponsors(): Promise<Sponsor[]> {
  const { data } = await apiClient.get<Sponsor[]>("/api/sponsors");
  return data;
}

export async function getSponsor(id: string): Promise<SponsorDetail> {
  const { data } = await apiClient.get<SponsorDetail>(`/api/sponsors/${id}`);
  return data;
}

export async function createSponsor(payload: CreateSponsorPayload): Promise<Sponsor> {
  const { data } = await apiClient.post<Sponsor>("/api/sponsors", payload);
  return data;
}

export async function updateSponsor(id: string, payload: Partial<CreateSponsorPayload>): Promise<Sponsor> {
  const { data } = await apiClient.patch<Sponsor>(`/api/sponsors/${id}`, payload);
  return data;
}

export async function getContractForBatch(batchId: string): Promise<ContractWithSponsor | null> {
  const { data } = await apiClient.get<ContractWithSponsor | null>(`/api/sponsors/by-batch/${batchId}`);
  return data;
}

export async function createContract(payload: CreateContractPayload): Promise<SponsorshipContract> {
  const { data } = await apiClient.post<SponsorshipContract>("/api/sponsors/contracts", payload);
  return data;
}

export async function updateContract(id: string, payload: Partial<Omit<CreateContractPayload, "sponsorId" | "batchId">> & { status?: string }): Promise<SponsorshipContract> {
  const { data } = await apiClient.patch<SponsorshipContract>(`/api/sponsors/contracts/${id}`, payload);
  return data;
}

export async function uploadContractDocument(contractId: string, file: File): Promise<SponsorshipContract & { documentUrl: string }> {
  const formData = new FormData();
  formData.append("document", file);
  const { data } = await apiClient.post(`/api/sponsors/contracts/${contractId}/document`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function createMilestone(contractId: string, payload: CreateMilestonePayload): Promise<Milestone> {
  const { data } = await apiClient.post<Milestone>(`/api/sponsors/contracts/${contractId}/milestones`, payload);
  return data;
}

export async function generateMonthlyMilestones(contractId: string, payload: GenerateMonthlyMilestonesPayload): Promise<Milestone[]> {
  const { data } = await apiClient.post<Milestone[]>(`/api/sponsors/contracts/${contractId}/milestones/generate-monthly`, payload);
  return data;
}

export async function markMilestoneReceived(milestoneId: string, payload: { receivedAmount: number; receivedAt?: string }): Promise<Milestone> {
  const { data } = await apiClient.patch<Milestone>(`/api/sponsors/milestones/${milestoneId}/received`, payload);
  return data;
}

export async function generateInvoice(milestoneId: string): Promise<SponsorInvoice> {
  const { data } = await apiClient.post<SponsorInvoice>(`/api/sponsors/milestones/${milestoneId}/invoice`);
  return data;
}

export async function getInvoiceDownloadUrl(invoiceId: string): Promise<{ downloadUrl: string; invoiceNumber: string; shareToken: string }> {
  const { data } = await apiClient.get(`/api/sponsors/invoices/${invoiceId}/download`);
  return data;
}

// ── Public, unauthenticated — the shareable invoice link ──────────────────────

export interface PublicInvoice {
  invoiceNumber: string;
  issueDate: string;
  sponsorName: string;
  totalAmount: number;
  downloadUrl: string;
}

export async function getPublicSponsorInvoice(shareToken: string): Promise<PublicInvoice> {
  const { data } = await apiClient.get<PublicInvoice>(`/api/public/sponsor-invoices/${shareToken}`);
  return data;
}

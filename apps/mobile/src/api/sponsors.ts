import { apiClient } from "./client";

export interface Sponsor {
  id:            string;
  name:          string;
  contactPerson: string | null;
  phone:         string | null;
  email:         string | null;
  address:       string | null;
  gstin:         string | null;
  stateCode:     string | null;
  notes:         string | null;
  createdAt:     string;
  updatedAt:     string;
}

export interface CreateSponsorPayload {
  name:          string;
  contactPerson?: string;
  phone?:        string;
  email?:        string;
  address?:      string;
  gstin?:        string;
  stateCode?:    string;
  notes?:        string;
}

export interface Milestone {
  id:             string;
  contractId:     string;
  label:          string;
  amount:         number;
  dueDate:        string | null;
  status:         "pending" | "received";
  receivedAt:     string | null;
  receivedAmount: number | null;
  notes:          string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface SponsorInvoice {
  id:            string;
  contractId:    string;
  milestoneId:   string;
  invoiceNumber: string;
  issueDate:     string;
  taxableAmount: number;
  gstRate:       number | null;
  cgstAmount:    number;
  sgstAmount:    number;
  igstAmount:    number;
  totalAmount:   number;
  shareToken:    string;
  createdAt:     string;
}

export type MilestoneWithInvoice = Milestone & { invoice: SponsorInvoice | null };

export interface SponsorshipContract {
  id:                     string;
  sponsorId:              string;
  batchId:                string;
  contractedStudentCount: number;
  totalContractAmount:    number;
  gstRate:                number | null;
  startDate:              string;
  endDate:                string | null;
  status:                 "active" | "completed" | "cancelled";
  documentUrl:            string | null;
  notes:                  string | null;
  createdAt:              string;
  updatedAt:              string;
}

export interface ContractWithSponsor extends SponsorshipContract {
  sponsor:    Sponsor;
  milestones: MilestoneWithInvoice[];
}

export interface SponsorDetail extends Sponsor {
  contracts: (SponsorshipContract & { batch: { id: string; name: string }; milestones: MilestoneWithInvoice[] })[];
}

export interface CreateContractPayload {
  sponsorId:              string;
  batchId:                string;
  contractedStudentCount: number;
  totalContractAmount:    number;
  gstRate?:               number | null;
  startDate:              string;
  endDate?:               string | null;
  notes?:                 string;
}

export interface CreateMilestonePayload {
  label:    string;
  amount:   number;
  dueDate?: string | null;
  notes?:   string;
}

export type SponsorResponse = { ok: true; sponsor: Sponsor } | { ok: false; error: string };
export type ContractResponse = { ok: true; contract: SponsorshipContract } | { ok: false; error: string };
export type MilestoneResponse = { ok: true; milestone: Milestone } | { ok: false; error: string };
export type InvoiceResponse = { ok: true; invoice: SponsorInvoice } | { ok: false; error: string };

export async function listSponsors(): Promise<Sponsor[]> {
  const { data } = await apiClient.get<Sponsor[]>("/sponsors");
  return data;
}

export async function getSponsor(id: string): Promise<SponsorDetail> {
  const { data } = await apiClient.get<SponsorDetail>(`/sponsors/${id}`);
  return data;
}

export async function createSponsor(payload: CreateSponsorPayload): Promise<SponsorResponse> {
  try {
    const { data } = await apiClient.post<Sponsor>("/sponsors", payload);
    return { ok: true, sponsor: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to add sponsor" };
  }
}

export async function updateSponsor(id: string, payload: Partial<CreateSponsorPayload>): Promise<SponsorResponse> {
  try {
    const { data } = await apiClient.patch<Sponsor>(`/sponsors/${id}`, payload);
    return { ok: true, sponsor: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to update sponsor" };
  }
}

export async function getContractForBatch(batchId: string): Promise<ContractWithSponsor | null> {
  const { data } = await apiClient.get<ContractWithSponsor | null>(`/sponsors/by-batch/${batchId}`);
  return data;
}

export async function createContract(payload: CreateContractPayload): Promise<ContractResponse> {
  try {
    const { data } = await apiClient.post<SponsorshipContract>("/sponsors/contracts", payload);
    return { ok: true, contract: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to link sponsor" };
  }
}

export async function uploadContractDocument(contractId: string, uri: string, mimeType = "application/pdf"): Promise<ContractResponse> {
  try {
    const formData = new FormData();
    const filename = uri.split("/").pop() ?? "agreement.pdf";
    (formData as any).append("document", { uri, name: filename, type: mimeType } as any);
    const { data } = await apiClient.post<SponsorshipContract>(`/sponsors/contracts/${contractId}/document`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return { ok: true, contract: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Upload failed" };
  }
}

export async function createMilestone(contractId: string, payload: CreateMilestonePayload): Promise<MilestoneResponse> {
  try {
    const { data } = await apiClient.post<Milestone>(`/sponsors/contracts/${contractId}/milestones`, payload);
    return { ok: true, milestone: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to add milestone" };
  }
}

export async function markMilestoneReceived(milestoneId: string, payload: { receivedAmount: number; receivedAt?: string }): Promise<MilestoneResponse> {
  try {
    const { data } = await apiClient.patch<Milestone>(`/sponsors/milestones/${milestoneId}/received`, payload);
    return { ok: true, milestone: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to mark received" };
  }
}

export async function generateInvoice(milestoneId: string): Promise<InvoiceResponse> {
  try {
    const { data } = await apiClient.post<SponsorInvoice>(`/sponsors/milestones/${milestoneId}/invoice`);
    return { ok: true, invoice: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Failed to generate invoice" };
  }
}

export async function getInvoiceDownloadUrl(invoiceId: string): Promise<{ downloadUrl: string; invoiceNumber: string; shareToken: string }> {
  const { data } = await apiClient.get(`/sponsors/invoices/${invoiceId}/download`);
  return data;
}

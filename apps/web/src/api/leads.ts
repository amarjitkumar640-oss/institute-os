import { apiClient } from "./client";

export interface ExamCategory {
  id: string;
  key: string;
  label: string;
  color: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: "new" | "contacted" | "visited" | "converted" | "lost";
  notes: string | null;
  assignedTo: string | null;
  centerId: string;
  center: { id: string; name: string } | null;
  tenantId: string;
  createdAt: string;
  targetExam: ExamCategory;
}

export interface CreateLeadPayload {
  name: string;
  phone: string;
  targetExamId: string;
  source: string;
  assignedTo?: string | null;
  notes?: string;
  centerId?: string;
}

export interface ConvertLeadPayload {
  batchId: string;
  studentDob?: string;
  guardianPhone?: string;
}

export async function listLeads(): Promise<Lead[]> {
  const { data } = await apiClient.get<Lead[]>("/api/leads");
  return data;
}

export async function createLead(payload: CreateLeadPayload): Promise<Lead> {
  const { data } = await apiClient.post<Lead>("/api/leads", payload);
  return data;
}

export async function convertLead(id: string, payload: ConvertLeadPayload): Promise<{ student: unknown; enrollment: unknown }> {
  const { data } = await apiClient.post<{ student: unknown; enrollment: unknown }>(`/api/leads/${id}/convert`, payload);
  return data;
}

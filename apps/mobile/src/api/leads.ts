import { apiClient } from "./client";
import type { ExamCategory } from "./courses";

export type LeadStatus = "new" | "contacted" | "visited" | "converted" | "lost";

export interface LeadItem {
  id:         string;
  name:       string;
  phone:      string;
  targetExam: ExamCategory;
  source:     string;
  status:     LeadStatus;
  notes:      string | null;
  createdAt:  string;
  centerId?:  string | null;
}

export interface CreateLeadPayload {
  name:       string;
  phone:      string;
  targetExam: ExamCategory;
  source:     string;
  notes?:     string;
  centerId?:  string; // only needed when the session has no center pinned
}

export type CreateLeadResponse =
  | { ok: true; lead: LeadItem }
  | { ok: false; error: string };

export async function listLeads(): Promise<LeadItem[]> {
  const { data } = await apiClient.get<LeadItem[]>("/leads");
  return data;
}

export async function createLead(payload: CreateLeadPayload): Promise<CreateLeadResponse> {
  try {
    const { data } = await apiClient.post<LeadItem>("/leads", payload);
    return { ok: true, lead: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Unknown error" };
  }
}

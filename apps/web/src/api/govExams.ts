import { apiClient } from "./client";

export type GovOrgType = "ssc" | "banking" | "railway" | "other";
export type GovRecruitmentStatus = "draft" | "published" | "archived";
export type GovContentSource = "manual" | "scraped";
export type GovDocumentType = "admit_card" | "result" | "answer_key" | "notification" | "syllabus";
export type GovCurrentAffairCategory =
  | "national" | "international" | "banking" | "economy" | "science" | "technology"
  | "defence" | "sports" | "awards" | "appointments" | "govt_schemes" | "environment";

export interface GovOrganization {
  id: string;
  name: string;
  shortName: string;
  type: GovOrgType;
  logoUrl: string | null;
  officialWebsite: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GovOrganizationInput {
  name: string;
  shortName: string;
  type: GovOrgType;
  logoUrl?: string;
  officialWebsite?: string;
}

export interface GovDocument {
  id: string;
  recruitmentId: string;
  type: GovDocumentType;
  title: string;
  releaseDate: string | null;
  documentUrl: string | null;
  source: GovContentSource;
  createdAt: string;
}

export interface GovDocumentInput {
  recruitmentId: string;
  type: GovDocumentType;
  title: string;
  releaseDate?: string;
  documentUrl?: string;
}

export interface GovRecruitment {
  id: string;
  organizationId: string;
  organization: GovOrganization;
  title: string;
  slug: string;
  totalVacancies: number | null;
  qualification: string | null;
  ageMin: number | null;
  ageMax: number | null;
  categoryRelaxations: Record<string, number> | null;
  applicationFee: Record<string, number> | null;
  posts: { name: string; vacancyCount?: number; payScale?: string }[] | null;
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  examDate: string | null;
  officialNotificationUrl: string | null;
  officialWebsiteUrl: string | null;
  status: GovRecruitmentStatus;
  source: GovContentSource;
  sourceUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documents?: GovDocument[];
}

export interface GovRecruitmentInput {
  organizationId: string;
  title: string;
  slug: string;
  totalVacancies?: number;
  qualification?: string;
  ageMin?: number;
  ageMax?: number;
  categoryRelaxations?: Record<string, number>;
  applicationFee?: Record<string, number>;
  posts?: { name: string; vacancyCount?: number; payScale?: string }[];
  applicationStartDate?: string;
  applicationEndDate?: string;
  examDate?: string;
  officialNotificationUrl?: string;
  officialWebsiteUrl?: string;
}

export interface GovCurrentAffair {
  id: string;
  title: string;
  slug: string;
  category: GovCurrentAffairCategory;
  whatHappened: string;
  keyFacts: string[] | null;
  whyImportant: string | null;
  examRelevance: Record<string, string> | null;
  publishedDate: string;
  status: GovRecruitmentStatus;
  source: GovContentSource;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GovCurrentAffairInput {
  title: string;
  slug: string;
  category: GovCurrentAffairCategory;
  whatHappened: string;
  keyFacts?: string[];
  whyImportant?: string;
  examRelevance?: Record<string, string>;
  publishedDate: string;
  sourceUrl?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const BASE = "/api/gov-exams/admin";

// ── Organizations ────────────────────────────────────────────────────────────

export async function listOrganizations(): Promise<GovOrganization[]> {
  const { data } = await apiClient.get<GovOrganization[]>(`${BASE}/organizations`);
  return data;
}

export async function createOrganization(input: GovOrganizationInput): Promise<GovOrganization> {
  const { data } = await apiClient.post<GovOrganization>(`${BASE}/organizations`, input);
  return data;
}

export async function updateOrganization(id: string, input: Partial<GovOrganizationInput>): Promise<GovOrganization> {
  const { data } = await apiClient.patch<GovOrganization>(`${BASE}/organizations/${id}`, input);
  return data;
}

export async function deleteOrganization(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/organizations/${id}`);
}

// ── Recruitments ─────────────────────────────────────────────────────────────

export async function listRecruitments(params: {
  status?: GovRecruitmentStatus;
  organizationId?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedResult<GovRecruitment>> {
  const { data } = await apiClient.get<PaginatedResult<GovRecruitment>>(`${BASE}/recruitments`, {
    params: { ...params, limit: params.limit ?? 100 },
  });
  return data;
}

export async function createRecruitment(input: GovRecruitmentInput): Promise<GovRecruitment> {
  const { data } = await apiClient.post<GovRecruitment>(`${BASE}/recruitments`, input);
  return data;
}

export async function updateRecruitment(id: string, input: Partial<GovRecruitmentInput>): Promise<GovRecruitment> {
  const { data } = await apiClient.patch<GovRecruitment>(`${BASE}/recruitments/${id}`, input);
  return data;
}

export async function setRecruitmentStatus(id: string, status: GovRecruitmentStatus): Promise<GovRecruitment> {
  const { data } = await apiClient.patch<GovRecruitment>(`${BASE}/recruitments/${id}/status`, { status });
  return data;
}

export async function deleteRecruitment(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/recruitments/${id}`);
}

export async function getRecruitment(id: string): Promise<GovRecruitment> {
  const { data } = await apiClient.get<GovRecruitment>(`${BASE}/recruitments/${id}`);
  return data;
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function createDocument(input: GovDocumentInput): Promise<GovDocument> {
  const { data } = await apiClient.post<GovDocument>(`${BASE}/documents`, input);
  return data;
}

export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/documents/${id}`);
}

// ── Current affairs ──────────────────────────────────────────────────────────

export async function listCurrentAffairs(params: {
  status?: GovRecruitmentStatus;
  category?: GovCurrentAffairCategory;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedResult<GovCurrentAffair>> {
  const { data } = await apiClient.get<PaginatedResult<GovCurrentAffair>>(`${BASE}/current-affairs`, {
    params: { ...params, limit: params.limit ?? 100 },
  });
  return data;
}

export async function createCurrentAffair(input: GovCurrentAffairInput): Promise<GovCurrentAffair> {
  const { data } = await apiClient.post<GovCurrentAffair>(`${BASE}/current-affairs`, input);
  return data;
}

export async function updateCurrentAffair(id: string, input: Partial<GovCurrentAffairInput>): Promise<GovCurrentAffair> {
  const { data } = await apiClient.patch<GovCurrentAffair>(`${BASE}/current-affairs/${id}`, input);
  return data;
}

export async function setCurrentAffairStatus(id: string, status: GovRecruitmentStatus): Promise<GovCurrentAffair> {
  const { data } = await apiClient.patch<GovCurrentAffair>(`${BASE}/current-affairs/${id}/status`, { status });
  return data;
}

export async function deleteCurrentAffair(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/current-affairs/${id}`);
}

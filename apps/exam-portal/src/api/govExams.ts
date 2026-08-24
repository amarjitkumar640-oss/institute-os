import { apiClient } from "./client";

export type GovOrgType = "ssc" | "banking" | "railway" | "other";
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
}

export interface GovDocument {
  id: string;
  type: GovDocumentType;
  title: string;
  releaseDate: string | null;
  documentUrl: string | null;
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
  applyUrl: string | null;
  publishedAt: string | null;
  documents?: GovDocument[];
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
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface EligibilityCheckInput {
  age: number;
  qualification?: string;
  category?: string;
}

const BASE = "/api/gov-exams";

export async function listOrganizations(): Promise<GovOrganization[]> {
  const { data } = await apiClient.get<GovOrganization[]>(`${BASE}/organizations`);
  return data;
}

export async function listRecruitments(params: { organizationId?: string; page?: number; limit?: number } = {}): Promise<PaginatedResult<GovRecruitment>> {
  const { data } = await apiClient.get<PaginatedResult<GovRecruitment>>(`${BASE}/recruitments`, { params });
  return data;
}

export async function getRecruitment(slug: string): Promise<GovRecruitment> {
  const { data } = await apiClient.get<GovRecruitment>(`${BASE}/recruitments/${slug}`);
  return data;
}

export async function listCurrentAffairs(params: { category?: GovCurrentAffairCategory; page?: number; limit?: number } = {}): Promise<PaginatedResult<GovCurrentAffair>> {
  const { data } = await apiClient.get<PaginatedResult<GovCurrentAffair>>(`${BASE}/current-affairs`, { params });
  return data;
}

export async function getCurrentAffair(slug: string): Promise<GovCurrentAffair> {
  const { data } = await apiClient.get<GovCurrentAffair>(`${BASE}/current-affairs/${slug}`);
  return data;
}

export async function checkEligibility(input: EligibilityCheckInput): Promise<GovRecruitment[]> {
  const { data } = await apiClient.post<GovRecruitment[]>(`${BASE}/eligibility-check`, input);
  return data;
}

import { apiClient } from "./client";

export type GovOrgType = "ssc" | "banking" | "railway" | "other";
export type GovDocumentType = "admit_card" | "result" | "answer_key" | "notification" | "syllabus";

export interface CurrentAffairCategory {
  id: string;
  key: string;
  labelEn: string;
  labelHi: string;
  shortLabelEn: string;
  shortLabelHi: string;
  priority: "primary" | "secondary";
  sortOrder: number;
  isVisible: boolean;
  isDefault: boolean;
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
  category: GovOrgType;
  organization: string | null;
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

  // Rich fields — populated only for recruitments added via the manual JSON
  // import; null for anything entered through the plain admin form.
  department: string | null;
  jobLocation: string | null;
  advertisementNumber: string | null;
  payScale: string | null;
  basicPay: string | null;
  salaryRange: string | null;
  otherBenefits: string | null;
  summary: string | null;
  whoCanApply: string | null;
  howToApply: string | null;
  importantNote: string | null;
  selectionProcess: string[] | null;
  applicationProcess: string[] | null;
  highlights: string[] | null;
  examPattern: { mode?: string; stages?: string[]; subjects?: string[]; duration?: string; negativeMarking?: string } | null;
  postsByCategory: Record<string, number> | null;
}

export interface GovCurrentAffair {
  id: string;
  title: string;
  slug: string;
  category: CurrentAffairCategory;
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

export async function listRecruitments(params: { category?: GovOrgType; page?: number; limit?: number } = {}): Promise<PaginatedResult<GovRecruitment>> {
  const { data } = await apiClient.get<PaginatedResult<GovRecruitment>>(`${BASE}/recruitments`, { params });
  return data;
}

export async function getRecruitment(slug: string): Promise<GovRecruitment> {
  const { data } = await apiClient.get<GovRecruitment>(`${BASE}/recruitments/${slug}`);
  return data;
}

export async function listCurrentAffairs(params: { category?: string; date?: string; page?: number; limit?: number } = {}): Promise<PaginatedResult<GovCurrentAffair>> {
  const { data } = await apiClient.get<PaginatedResult<GovCurrentAffair>>(`${BASE}/current-affairs`, { params });
  return data;
}

/** Calendar days (YYYY-MM-DD) that have published current affairs, most recent first — powers the date strip. */
export async function listCurrentAffairDates(params: { category?: string; limit?: number } = {}): Promise<string[]> {
  const { data } = await apiClient.get<string[]>(`${BASE}/current-affairs/dates`, { params });
  return data;
}

export async function getCurrentAffair(slug: string): Promise<GovCurrentAffair> {
  const { data } = await apiClient.get<GovCurrentAffair>(`${BASE}/current-affairs/${slug}`);
  return data;
}

export async function listCurrentAffairCategories(): Promise<CurrentAffairCategory[]> {
  const { data } = await apiClient.get<CurrentAffairCategory[]>(`${BASE}/current-affair-categories`);
  return data;
}

export async function checkEligibility(input: EligibilityCheckInput): Promise<GovRecruitment[]> {
  const { data } = await apiClient.post<GovRecruitment[]>(`${BASE}/eligibility-check`, input);
  return data;
}

import { apiClient } from "./client";
import type { ResponseBlock } from "@/components/ai/types";

export type GovOrgType = "ssc" | "banking" | "railway" | "other";
export type GovRecruitmentStatus = "draft" | "published" | "archived";
export type GovContentSource = "manual" | "scraped";
export type GovDocumentType = "admit_card" | "result" | "answer_key" | "notification" | "syllabus";
export type CurrentAffairCategoryPriority = "primary" | "secondary";

export interface CurrentAffairCategory {
  id: string;
  key: string;
  labelEn: string;
  labelHi: string;
  shortLabelEn: string;
  shortLabelHi: string;
  priority: CurrentAffairCategoryPriority;
  sortOrder: number;
  isVisible: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentAffairCategoryInput {
  key: string;
  labelEn: string;
  labelHi: string;
  shortLabelEn: string;
  shortLabelHi: string;
  priority?: CurrentAffairCategoryPriority;
  isVisible?: boolean;
  isDefault?: boolean;
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
  status: GovRecruitmentStatus;
  source: GovContentSource;
  sourceUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documents?: GovDocument[];

  // Rich fields — populated by the manual JSON import, left null otherwise.
  department: string | null;
  advertisementNumber: string | null;
  jobLocation: string | null;
  localLanguageRequirement: string | null;
  requiredExperience: string | null;
  payScale: string | null;
  basicPay: string | null;
  salaryRange: string | null;
  otherBenefits: string | null;
  ageAsOnDate: string | null;
  paymentLastDate: string | null;
  correctionLastDate: string | null;
  prelimsDate: string | null;
  mainsDate: string | null;
  admitCardDate: string | null;
  resultDate: string | null;
  interviewDate: string | null;
  verificationStatus: string | null;
  lastVerifiedAt: string | null;
  summary: string | null;
  whoCanApply: string | null;
  howToApply: string | null;
  importantNote: string | null;
  selectionProcess: string[] | null;
  applicationProcess: string[] | null;
  documentsRequired: string[] | null;
  highlights: string[] | null;
  examPattern: { mode?: string; stages?: string[]; subjects?: string[]; duration?: string; negativeMarking?: string } | null;
  postsByCategory: Record<string, number> | null;
  postsByState: Record<string, number> | null;
}

export interface GovRecruitmentInput {
  category: GovOrgType;
  organization?: string;
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
  applyUrl?: string;
}

export interface GovCurrentAffair {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  category: CurrentAffairCategory;
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
  categoryId: string;
  whatHappened: string;
  keyFacts?: string[];
  whyImportant?: string;
  examRelevance?: Record<string, string>;
  publishedDate: string;
  sourceUrl?: string;
}

export type GovSourceContentType = "recruitment" | "current_affair";
// "search" is deprecated — replaced by the per-category prompt-template
// system (see GovJobVacancyPromptTemplate / GovCurrentAffairsPromptTemplate
// below). No existing GovSource rows use it.
export type GovSourceFetchMode = "url";

// Independent per-row scheduling — see ScheduleFields.tsx. "hourly" needs
// no further fields; daily/weekly/monthly need scheduleTimeOfDay (entered/
// displayed as IST); weekly also needs scheduleDayOfWeek; monthly also
// needs scheduleDayOfMonth.
export type GovScheduleFrequency = "hourly" | "daily" | "weekly" | "monthly";

export interface GovScheduleFields {
  scheduleFrequency: GovScheduleFrequency;
  scheduleTimeOfDay: string | null;
  scheduleDayOfWeek: number | null;
  scheduleDayOfMonth: number | null;
}

export interface GovScheduleFieldsInput {
  scheduleFrequency?: GovScheduleFrequency;
  scheduleTimeOfDay?: string;
  scheduleDayOfWeek?: number;
  scheduleDayOfMonth?: number;
}

export interface GovSource extends GovScheduleFields {
  id: string;
  category: GovOrgType;
  contentType: GovSourceContentType;
  fetchMode: GovSourceFetchMode;
  label: string;
  url: string | null;
  searchQuery: string | null;
  enabled: boolean;
  lastScrapedAt: string | null;
  lastScrapeStatus: string | null;
  lastScrapeError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GovSourceInput extends GovScheduleFieldsInput {
  category: GovOrgType;
  contentType: GovSourceContentType;
  fetchMode: GovSourceFetchMode;
  label: string;
  url?: string;
  searchQuery?: string;
  enabled?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const BASE = "/api/gov-exams/admin";

// ── Recruitments ─────────────────────────────────────────────────────────────

export async function listRecruitments(params: {
  status?: GovRecruitmentStatus;
  category?: GovOrgType;
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
  categoryId?: string;
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

// ── Current affair categories ────────────────────────────────────────────────

export async function listCurrentAffairCategories(): Promise<CurrentAffairCategory[]> {
  const { data } = await apiClient.get<CurrentAffairCategory[]>(`${BASE}/current-affair-categories`);
  return data;
}

export async function createCurrentAffairCategory(input: CurrentAffairCategoryInput): Promise<CurrentAffairCategory> {
  const { data } = await apiClient.post<CurrentAffairCategory>(`${BASE}/current-affair-categories`, input);
  return data;
}

export async function updateCurrentAffairCategory(
  id: string,
  input: Partial<CurrentAffairCategoryInput>,
): Promise<CurrentAffairCategory> {
  const { data } = await apiClient.patch<CurrentAffairCategory>(`${BASE}/current-affair-categories/${id}`, input);
  return data;
}

export async function reorderCurrentAffairCategories(ids: string[]): Promise<CurrentAffairCategory[]> {
  const { data } = await apiClient.post<CurrentAffairCategory[]>(`${BASE}/current-affair-categories/reorder`, { ids });
  return data;
}

export async function deleteCurrentAffairCategory(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/current-affair-categories/${id}`);
}

// ── Sources (step 4 — automated scraping) ───────────────────────────────────

const SOURCES_BASE = "/api/gov-exams/admin/sources";

export async function listSources(): Promise<GovSource[]> {
  const { data } = await apiClient.get<GovSource[]>(SOURCES_BASE);
  return data;
}

export async function createSource(input: GovSourceInput): Promise<GovSource> {
  const { data } = await apiClient.post<GovSource>(SOURCES_BASE, input);
  return data;
}

export async function updateSource(id: string, input: Partial<GovSourceInput>): Promise<GovSource> {
  const { data } = await apiClient.patch<GovSource>(`${SOURCES_BASE}/${id}`, input);
  return data;
}

export async function deleteSource(id: string): Promise<void> {
  await apiClient.delete(`${SOURCES_BASE}/${id}`);
}

export async function runSourceNow(id: string): Promise<GovRunResult> {
  const { data } = await apiClient.post<GovRunResult>(`${SOURCES_BASE}/${id}/run`);
  return data;
}

// ── Manual JSON import ──────────────────────────────────────────────────────
// An admin pastes an AI-Overview-style export (search results generated
// externally, e.g. via ChatGPT) and this maps it onto GovRecruitment rows —
// a third way to populate data alongside the plain form above and the
// scraper, useful for testing/backfilling without the scraper's own
// dependencies. Two-step: preview never writes to the DB, commit does.

export type ImportPlanItem =
  | { index: number; outcome: "unusable"; reason: string; title: string }
  | {
      index: number;
      outcome: "draft" | "published";
      reasons?: string[];
      title: string;
      recruitmentInput: { organization?: string };
    };

export interface ImportCommitResult {
  created: number;
  published: number;
  skippedDuplicates: number;
  unusable: number;
  items: {
    index: number;
    title: string;
    outcome: "created_published" | "created_draft" | "skipped_duplicate" | "unusable";
    reason?: string;
    recruitmentId?: string;
  }[];
}

const IMPORT_BASE = "/api/gov-exams/admin/import";

export async function previewRecruitmentImport(category: GovOrgType, vacancies: unknown[]): Promise<{ items: ImportPlanItem[] }> {
  const { data } = await apiClient.post<{ items: ImportPlanItem[] }>(`${IMPORT_BASE}/recruitments/preview`, { category, vacancies });
  return data;
}

export async function commitRecruitmentImport(category: GovOrgType, vacancies: unknown[]): Promise<ImportCommitResult> {
  const { data } = await apiClient.post<ImportCommitResult>(`${IMPORT_BASE}/recruitments/commit`, { category, vacancies });
  return data;
}

// ── Current affairs JSON import ──────────────────────────────────────────────
// No category param — each pasted item self-declares its own category
// (see CurrentAffairsPrompt shape); matched per item server-side.

export type CurrentAffairImportPlanItem =
  | { index: number; outcome: "unusable"; reason: string; title: string }
  | {
      index: number;
      outcome: "draft" | "published";
      reasons?: string[];
      title: string;
      matchedCategoryKey: string | null;
    };

export interface CurrentAffairImportCommitResult {
  created: number;
  published: number;
  skippedDuplicates: number;
  unusable: number;
  items: {
    index: number;
    title: string;
    outcome: "created_published" | "created_draft" | "skipped_duplicate" | "unusable";
    reason?: string;
    currentAffairId?: string;
  }[];
}

export async function previewCurrentAffairImport(items: unknown[]): Promise<{ items: CurrentAffairImportPlanItem[] }> {
  const { data } = await apiClient.post<{ items: CurrentAffairImportPlanItem[] }>(`${IMPORT_BASE}/current-affairs/preview`, { items });
  return data;
}

export async function commitCurrentAffairImport(items: unknown[]): Promise<CurrentAffairImportCommitResult> {
  const { data } = await apiClient.post<CurrentAffairImportCommitResult>(`${IMPORT_BASE}/current-affairs/commit`, { items });
  return data;
}

// ── Search prompt templates (replaces GovSource's "search" fetchMode) ───────
// One admin-written prompt per job-vacancy category, plus one shared
// current-affairs prompt — passed to the AI Gateway's native web search
// as-is every sweep. See gov-search-prompts.service.ts.

export interface GovPromptTemplate extends GovScheduleFields {
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  updatedAt: string;
}

export interface GovJobVacancyPromptTemplate extends GovPromptTemplate {
  category: GovOrgType;
}

export interface GovCurrentAffairsPromptTemplate extends GovPromptTemplate {
  id: string;
}

export interface GovPromptTemplateInput extends GovScheduleFieldsInput {
  prompt: string;
  enabled?: boolean;
}

/** Result of a completed (not skipped) run — same shape whether triggered by the scheduler or Run Now. */
export interface GovRunResult {
  status: "success" | "partial" | "error";
  error?: string;
  created: number;
  published: number;
  skippedDuplicates: number;
  unusable: number;
}

const SEARCH_PROMPTS_BASE = "/api/gov-exams/admin/search-prompts";

export async function listJobVacancyPromptTemplates(): Promise<GovJobVacancyPromptTemplate[]> {
  const { data } = await apiClient.get<GovJobVacancyPromptTemplate[]>(`${SEARCH_PROMPTS_BASE}/job-vacancy-prompts`);
  return data;
}

export async function saveJobVacancyPromptTemplate(
  category: GovOrgType,
  input: GovPromptTemplateInput,
): Promise<GovJobVacancyPromptTemplate> {
  const { data } = await apiClient.put<GovJobVacancyPromptTemplate>(
    `${SEARCH_PROMPTS_BASE}/job-vacancy-prompts/${category}`,
    input,
  );
  return data;
}

export async function deleteJobVacancyPromptTemplate(category: GovOrgType): Promise<void> {
  await apiClient.delete(`${SEARCH_PROMPTS_BASE}/job-vacancy-prompts/${category}`);
}

export async function runJobVacancyPromptTemplateNow(category: GovOrgType): Promise<GovRunResult> {
  const { data } = await apiClient.post<GovRunResult>(`${SEARCH_PROMPTS_BASE}/job-vacancy-prompts/${category}/run`);
  return data;
}

export async function getCurrentAffairsPromptTemplate(): Promise<GovCurrentAffairsPromptTemplate | null> {
  try {
    const { data } = await apiClient.get<GovCurrentAffairsPromptTemplate>(`${SEARCH_PROMPTS_BASE}/current-affairs-prompt`);
    return data;
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
    throw err;
  }
}

export async function saveCurrentAffairsPromptTemplate(
  input: GovPromptTemplateInput,
): Promise<GovCurrentAffairsPromptTemplate> {
  const { data } = await apiClient.put<GovCurrentAffairsPromptTemplate>(
    `${SEARCH_PROMPTS_BASE}/current-affairs-prompt`,
    input,
  );
  return data;
}

export async function deleteCurrentAffairsPromptTemplate(): Promise<void> {
  await apiClient.delete(`${SEARCH_PROMPTS_BASE}/current-affairs-prompt`);
}

export async function runCurrentAffairsPromptTemplateNow(): Promise<GovRunResult> {
  const { data } = await apiClient.post<GovRunResult>(`${SEARCH_PROMPTS_BASE}/current-affairs-prompt/run`);
  return data;
}

const ASSISTANT_BASE = "/api/gov-exams/admin/assistant";

export interface AssistantSession {
  id: string;
  title: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  contentBlocks: ResponseBlock[] | null;
  mechanism: "planned" | "reactive" | null;
  toolCalls: { toolName: string; status: string }[] | null;
  createdAt: string;
  // Assistant-row-only — null for user rows, and for assistant rows served
  // from cache (no new AI call was made) or written before this existed.
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
}

export interface AssistantSessionDetail {
  id: string;
  title: string | null;
  createdAt: string;
  messages: AssistantMessage[];
}

export interface AssistantAskResult {
  answer: string;
  blocks: ResponseBlock[];
  mechanism: "planned" | "reactive";
  toolCalls: { toolName: string; status: string }[];
  cached: boolean;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number };
}

export async function listAssistantSessions(): Promise<{ sessions: AssistantSession[] }> {
  const { data } = await apiClient.get<{ sessions: AssistantSession[] }>(`${ASSISTANT_BASE}/sessions`);
  return data;
}

export async function createAssistantSession(): Promise<AssistantSession> {
  const { data } = await apiClient.post<AssistantSession>(`${ASSISTANT_BASE}/sessions`, {});
  return data;
}

export async function getAssistantSession(sessionId: string): Promise<AssistantSessionDetail> {
  const { data } = await apiClient.get<AssistantSessionDetail>(`${ASSISTANT_BASE}/sessions/${sessionId}`);
  return data;
}

export async function deleteAssistantSession(sessionId: string): Promise<void> {
  await apiClient.delete(`${ASSISTANT_BASE}/sessions/${sessionId}`);
}

export async function askInSession(sessionId: string, question: string): Promise<AssistantAskResult> {
  const { data } = await apiClient.post<AssistantAskResult>(`${ASSISTANT_BASE}/sessions/${sessionId}/messages`, { question });
  return data;
}

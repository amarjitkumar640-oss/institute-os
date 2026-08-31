import type {
  GovContentSource,
  GovDocumentType,
  GovOrgType,
  GovRecruitmentStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";

const GOV_EXAMS_META_ID = "singleton";

// Bumps GovExamsMeta.lastDataChangeAt — the freshness stamp the Gov Exams
// AI Assistant folds into its cache key (see lib/aiCacheStore.ts and
// gov-exams-assistant.routes.ts). Called from every recruitment/current-
// affair write below so a stale cached answer is never explicitly deleted —
// it just stops being the key any subsequent request looks up.
export async function bumpGovExamsDataVersion(): Promise<void> {
  await prisma.govExamsMeta.upsert({
    where: { id: GOV_EXAMS_META_ID },
    create: { id: GOV_EXAMS_META_ID },
    update: { lastDataChangeAt: new Date() },
  });
}

// ── Recruitments ─────────────────────────────────────────────────────────────

export interface ListRecruitmentsParams {
  category?: GovOrgType;
  status?: GovRecruitmentStatus | GovRecruitmentStatus[];
  page: number;
  limit: number;
}

export async function listRecruitments(params: ListRecruitmentsParams) {
  const { category, status, page, limit } = params;
  const where: Prisma.GovRecruitmentWhereInput = {
    ...(category ? { category } : {}),
    ...(status ? { status: Array.isArray(status) ? { in: status } : status } : {}),
  };

  const [total, data] = await prisma.$transaction([
    prisma.govRecruitment.count({ where }),
    prisma.govRecruitment.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

// Free-text search — used by the Gov Exams AI Assistant tool, no other
// caller needs this today (listRecruitments only filters by
// category/status). Matches title OR organization — title-only missed real
// recruitments when the keyword was an org name/abbreviation ("SBI") not
// literally present in the title text itself (caught live: "Recruitment of
// Junior Associates..." doesn't contain "SBI" even though it belongs to
// State Bank of India).
export async function searchRecruitments(keyword: string, limit = 8) {
  return prisma.govRecruitment.findMany({
    where: {
      OR: [
        { title: { contains: keyword, mode: "insensitive" } },
        { organization: { contains: keyword, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getRecruitmentBySlug(slug: string, opts: { includeAllStatuses?: boolean } = {}) {
  return prisma.govRecruitment.findFirst({
    where: { slug, ...(opts.includeAllStatuses ? {} : { status: "published" }) },
    include: { documents: true },
  });
}

export async function getRecruitmentById(id: string) {
  return prisma.govRecruitment.findUnique({ where: { id }, include: { documents: true } });
}

export interface RecruitmentInput {
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
  applicationStartDate?: Date;
  applicationEndDate?: Date;
  examDate?: Date;
  officialNotificationUrl?: string;
  officialWebsiteUrl?: string;
  applyUrl?: string;
  source?: GovContentSource;
  sourceUrl?: string;
  // Rich fields — populated by the manual JSON import (see gov-exams/import.ts);
  // left unset by the plain admin form and the scraper.
  department?: string;
  advertisementNumber?: string;
  jobLocation?: string;
  localLanguageRequirement?: string;
  requiredExperience?: string;
  payScale?: string;
  basicPay?: string;
  salaryRange?: string;
  otherBenefits?: string;
  ageAsOnDate?: Date;
  paymentLastDate?: Date;
  correctionLastDate?: Date;
  prelimsDate?: Date;
  mainsDate?: Date;
  admitCardDate?: Date;
  resultDate?: Date;
  interviewDate?: Date;
  verificationStatus?: string;
  lastVerifiedAt?: Date;
  summary?: string;
  whoCanApply?: string;
  howToApply?: string;
  importantNote?: string;
  selectionProcess?: string[];
  applicationProcess?: string[];
  documentsRequired?: string[];
  highlights?: string[];
  examPattern?: { mode?: string; stages?: string[]; subjects?: string[]; duration?: string; negativeMarking?: string };
  postsByCategory?: Record<string, number>;
  postsByState?: Record<string, number>;
}

export type CreateRecruitmentResult =
  | { ok: true; recruitment: Prisma.GovRecruitmentGetPayload<object> }
  | { ok: false; conflict: true };

export async function createRecruitment(data: RecruitmentInput): Promise<CreateRecruitmentResult> {
  const clash = await prisma.govRecruitment.findUnique({ where: { slug: data.slug } });
  if (clash) return { ok: false, conflict: true };

  const recruitment = await prisma.govRecruitment.create({
    data: {
      ...data,
      categoryRelaxations: data.categoryRelaxations ?? undefined,
      applicationFee: data.applicationFee ?? undefined,
      posts: data.posts ?? undefined,
      selectionProcess: data.selectionProcess ?? undefined,
      applicationProcess: data.applicationProcess ?? undefined,
      documentsRequired: data.documentsRequired ?? undefined,
      highlights: data.highlights ?? undefined,
      examPattern: data.examPattern ?? undefined,
      postsByCategory: data.postsByCategory ?? undefined,
      postsByState: data.postsByState ?? undefined,
    },
  });
  await bumpGovExamsDataVersion();
  return { ok: true, recruitment };
}

export type UpdateRecruitmentResult =
  | { ok: true; recruitment: Prisma.GovRecruitmentGetPayload<object> }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true };

export async function updateRecruitment(
  id: string,
  data: Partial<RecruitmentInput>,
): Promise<UpdateRecruitmentResult> {
  const existing = await prisma.govRecruitment.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };

  if (data.slug !== undefined && data.slug !== existing.slug) {
    const clash = await prisma.govRecruitment.findUnique({ where: { slug: data.slug } });
    if (clash) return { ok: false, conflict: true };
  }

  const recruitment = await prisma.govRecruitment.update({ where: { id }, data });
  await bumpGovExamsDataVersion();
  return { ok: true, recruitment };
}

export type SetRecruitmentStatusResult =
  | { ok: true; recruitment: Prisma.GovRecruitmentGetPayload<object> }
  | { ok: false; notFound: true };

export async function setRecruitmentStatus(
  id: string,
  status: GovRecruitmentStatus,
): Promise<SetRecruitmentStatusResult> {
  const existing = await prisma.govRecruitment.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };

  const recruitment = await prisma.govRecruitment.update({
    where: { id },
    data: { status, publishedAt: status === "published" && !existing.publishedAt ? new Date() : existing.publishedAt },
  });
  await bumpGovExamsDataVersion();
  return { ok: true, recruitment };
}

export async function deleteRecruitment(id: string): Promise<{ ok: true } | { ok: false; notFound: true }> {
  const existing = await prisma.govRecruitment.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };
  await prisma.govDocument.deleteMany({ where: { recruitmentId: id } });
  await prisma.govRecruitment.delete({ where: { id } });
  return { ok: true };
}

// ── Documents (admit cards / results / answer keys / notifications / syllabus) ─

export interface DocumentInput {
  recruitmentId: string;
  type: GovDocumentType;
  title: string;
  releaseDate?: Date;
  documentUrl?: string;
  source?: GovContentSource;
}

export type CreateDocumentResult =
  | { ok: true; document: Prisma.GovDocumentGetPayload<object> }
  | { ok: false; notFound: true };

export async function createDocument(data: DocumentInput): Promise<CreateDocumentResult> {
  const recruitment = await prisma.govRecruitment.findUnique({ where: { id: data.recruitmentId } });
  if (!recruitment) return { ok: false, notFound: true };
  const document = await prisma.govDocument.create({ data });
  return { ok: true, document };
}

export async function deleteDocument(id: string): Promise<{ ok: true } | { ok: false; notFound: true }> {
  const existing = await prisma.govDocument.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };
  await prisma.govDocument.delete({ where: { id } });
  return { ok: true };
}

// ── Current affairs ──────────────────────────────────────────────────────────

export interface ListCurrentAffairsParams {
  categoryId?: string;
  status?: GovRecruitmentStatus | GovRecruitmentStatus[];
  /** A single calendar day (UTC), YYYY-MM-DD — matches against publishedDate. */
  date?: string;
  page: number;
  limit: number;
}

function dayRange(date: string): { gte: Date; lt: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}

export async function listCurrentAffairs(params: ListCurrentAffairsParams) {
  const { categoryId, status, date, page, limit } = params;
  const where: Prisma.GovCurrentAffairWhereInput = {
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status: Array.isArray(status) ? { in: status } : status } : {}),
    ...(date ? { publishedDate: dayRange(date) } : {}),
  };

  const [total, data] = await prisma.$transaction([
    prisma.govCurrentAffair.count({ where }),
    prisma.govCurrentAffair.findMany({
      where,
      include: { category: true },
      orderBy: { publishedDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

// Powers the exam-portal's date strip: which calendar days actually have
// published content (never show a chip for an empty day), most recent
// first, plus resolving "the latest date with content" for the page's
// default view. Fetches a bounded window of recent published rows and
// reduces to distinct calendar days in application code — current-affairs
// volume is modest (one daily batch) so this stays cheap; a raw DISTINCT-
// on-date SQL query isn't worth the departure from Prisma's query builder
// at this scale.
const RECENT_ROWS_FOR_DATE_LIST = 500;

export async function listCurrentAffairDates(params: { categoryId?: string; limit?: number }): Promise<string[]> {
  const { categoryId, limit = 14 } = params;
  const rows = await prisma.govCurrentAffair.findMany({
    where: { status: "published", ...(categoryId ? { categoryId } : {}) },
    select: { publishedDate: true },
    orderBy: { publishedDate: "desc" },
    take: RECENT_ROWS_FOR_DATE_LIST,
  });

  const dates: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const day = row.publishedDate.toISOString().slice(0, 10);
    if (!seen.has(day)) {
      seen.add(day);
      dates.push(day);
      if (dates.length >= limit) break;
    }
  }
  return dates;
}

export async function getCurrentAffairBySlug(slug: string, opts: { includeAllStatuses?: boolean } = {}) {
  return prisma.govCurrentAffair.findFirst({
    where: { slug, ...(opts.includeAllStatuses ? {} : { status: "published" }) },
    include: { category: true },
  });
}

export async function getCurrentAffairById(id: string) {
  return prisma.govCurrentAffair.findUnique({ where: { id }, include: { category: true } });
}

export interface CurrentAffairInput {
  title: string;
  slug: string;
  categoryId: string;
  whatHappened: string;
  keyFacts?: string[];
  whyImportant?: string;
  // Widened from the older free-text-per-key shape to the boolean-flag
  // shape the prompt-template extraction (and manual JSON import) actually
  // produce — e.g. { ssc: true, banking: false, ... }. Still just Json at
  // the DB layer, no migration needed.
  examRelevance?: Record<string, boolean | string[]>;
  publishedDate: Date;
  source?: GovContentSource;
  sourceUrl?: string;
  // ── Rich fields (populated by the prompt-template scraper / manual JSON
  // import) — see current-affairs-import-mapper.ts. All optional. ─────────
  level?: string;
  newsStatus?: string;
  importance?: string;
  organization?: string;
  ministry?: string;
  state?: string;
  eventDate?: Date;
  verificationStatus?: string;
  richData?: Prisma.InputJsonValue;
}

export type CreateCurrentAffairResult =
  | { ok: true; currentAffair: Prisma.GovCurrentAffairGetPayload<object> }
  | { ok: false; conflict: true };

export async function createCurrentAffair(data: CurrentAffairInput): Promise<CreateCurrentAffairResult> {
  const slugClash = await prisma.govCurrentAffair.findUnique({ where: { slug: data.slug } });
  if (slugClash) return { ok: false, conflict: true };
  // A repeated web search for "today's current affairs" is far more likely
  // to reproduce the same cited source URL for a real-world event than an
  // exact title (the LLM paraphrases titles slightly on every run) —
  // sourceUrl is a second, more reliable dedup signal on top of slug.
  if (data.sourceUrl) {
    const sourceClash = await prisma.govCurrentAffair.findFirst({ where: { sourceUrl: data.sourceUrl } });
    if (sourceClash) return { ok: false, conflict: true };
  }
  const currentAffair = await prisma.govCurrentAffair.create({
    data: { ...data, keyFacts: data.keyFacts ?? undefined, examRelevance: data.examRelevance ?? undefined },
  });
  await bumpGovExamsDataVersion();
  return { ok: true, currentAffair };
}

export type UpdateCurrentAffairResult =
  | { ok: true; currentAffair: Prisma.GovCurrentAffairGetPayload<object> }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true };

export async function updateCurrentAffair(
  id: string,
  data: Partial<CurrentAffairInput>,
): Promise<UpdateCurrentAffairResult> {
  const existing = await prisma.govCurrentAffair.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };

  if (data.slug !== undefined && data.slug !== existing.slug) {
    const clash = await prisma.govCurrentAffair.findUnique({ where: { slug: data.slug } });
    if (clash) return { ok: false, conflict: true };
  }

  const currentAffair = await prisma.govCurrentAffair.update({ where: { id }, data });
  await bumpGovExamsDataVersion();
  return { ok: true, currentAffair };
}

export type SetCurrentAffairStatusResult =
  | { ok: true; currentAffair: Prisma.GovCurrentAffairGetPayload<object> }
  | { ok: false; notFound: true };

export async function setCurrentAffairStatus(
  id: string,
  status: GovRecruitmentStatus,
): Promise<SetCurrentAffairStatusResult> {
  const existing = await prisma.govCurrentAffair.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };
  const currentAffair = await prisma.govCurrentAffair.update({ where: { id }, data: { status } });
  await bumpGovExamsDataVersion();
  return { ok: true, currentAffair };
}

export async function deleteCurrentAffair(id: string): Promise<{ ok: true } | { ok: false; notFound: true }> {
  const existing = await prisma.govCurrentAffair.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };
  await prisma.govCurrentAffair.delete({ where: { id } });
  return { ok: true };
}

// ── Eligibility (deterministic rule engine — never delegated to an LLM) ──────

export interface EligibilityCheckInput {
  age: number;
  qualification?: string;
  category?: string;
}

// Qualification matching is intentionally loose (case-insensitive substring)
// for v1 — age + category relaxation is the real filter. Tighten only if
// real-world qualification data (once scraped, step 4) turns out consistent
// enough to match more strictly.
export async function checkEligibility(input: EligibilityCheckInput) {
  const recruitments = await prisma.govRecruitment.findMany({
    where: { status: "published" },
  });

  return recruitments.filter((recruitment) => {
    const relaxations = (recruitment.categoryRelaxations as Record<string, number> | null) ?? {};
    const relaxation = input.category ? (relaxations[input.category] ?? 0) : 0;
    const effectiveMax = recruitment.ageMax != null ? recruitment.ageMax + relaxation : null;

    if (recruitment.ageMin != null && input.age < recruitment.ageMin) return false;
    if (effectiveMax != null && input.age > effectiveMax) return false;
    if (input.qualification && recruitment.qualification) {
      const matches = recruitment.qualification.toLowerCase().includes(input.qualification.toLowerCase());
      if (!matches) return false;
    }
    return true;
  });
}

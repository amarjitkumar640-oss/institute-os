import type {
  GovContentSource,
  GovCurrentAffairCategory,
  GovDocumentType,
  GovOrgType,
  GovRecruitmentStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";

// ── Organizations ────────────────────────────────────────────────────────────

export async function listOrganizations() {
  return prisma.govOrganization.findMany({ orderBy: { name: "asc" } });
}

export interface CreateOrganizationInput {
  name: string;
  shortName: string;
  type: GovOrgType;
  logoUrl?: string;
  officialWebsite?: string;
}

export type CreateOrganizationResult =
  | { ok: true; organization: Prisma.GovOrganizationGetPayload<object> }
  | { ok: false; conflict: true };

export async function createOrganization(data: CreateOrganizationInput): Promise<CreateOrganizationResult> {
  const clash = await prisma.govOrganization.findUnique({ where: { shortName: data.shortName } });
  if (clash) return { ok: false, conflict: true };
  const organization = await prisma.govOrganization.create({ data });
  return { ok: true, organization };
}

export type UpdateOrganizationResult =
  | { ok: true; organization: Prisma.GovOrganizationGetPayload<object> }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true };

export async function updateOrganization(
  id: string,
  data: Partial<CreateOrganizationInput>,
): Promise<UpdateOrganizationResult> {
  const existing = await prisma.govOrganization.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };

  if (data.shortName !== undefined && data.shortName !== existing.shortName) {
    const clash = await prisma.govOrganization.findUnique({ where: { shortName: data.shortName } });
    if (clash) return { ok: false, conflict: true };
  }

  const organization = await prisma.govOrganization.update({ where: { id }, data });
  return { ok: true, organization };
}

export type DeleteOrganizationResult =
  | { ok: true }
  | { ok: false; notFound: true }
  | { ok: false; hasData: true; recruitmentCount: number };

export async function deleteOrganization(id: string): Promise<DeleteOrganizationResult> {
  const organization = await prisma.govOrganization.findUnique({
    where: { id },
    include: { _count: { select: { recruitments: true } } },
  });
  if (!organization) return { ok: false, notFound: true };
  if (organization._count.recruitments > 0) {
    return { ok: false, hasData: true, recruitmentCount: organization._count.recruitments };
  }
  await prisma.govOrganization.delete({ where: { id } });
  return { ok: true };
}

// ── Recruitments ─────────────────────────────────────────────────────────────

export interface ListRecruitmentsParams {
  organizationId?: string;
  status?: GovRecruitmentStatus | GovRecruitmentStatus[];
  page: number;
  limit: number;
}

export async function listRecruitments(params: ListRecruitmentsParams) {
  const { organizationId, status, page, limit } = params;
  const where: Prisma.GovRecruitmentWhereInput = {
    ...(organizationId ? { organizationId } : {}),
    ...(status ? { status: Array.isArray(status) ? { in: status } : status } : {}),
  };

  const [total, data] = await prisma.$transaction([
    prisma.govRecruitment.count({ where }),
    prisma.govRecruitment.findMany({
      where,
      include: { organization: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getRecruitmentBySlug(slug: string, opts: { includeAllStatuses?: boolean } = {}) {
  return prisma.govRecruitment.findFirst({
    where: { slug, ...(opts.includeAllStatuses ? {} : { status: "published" }) },
    include: { organization: true, documents: true },
  });
}

export async function getRecruitmentById(id: string) {
  return prisma.govRecruitment.findUnique({ where: { id }, include: { organization: true, documents: true } });
}

export interface RecruitmentInput {
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
  | { ok: true; recruitment: Prisma.GovRecruitmentGetPayload<{ include: { organization: true } }> }
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
    include: { organization: true },
  });
  return { ok: true, recruitment };
}

export type UpdateRecruitmentResult =
  | { ok: true; recruitment: Prisma.GovRecruitmentGetPayload<{ include: { organization: true } }> }
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

  const recruitment = await prisma.govRecruitment.update({
    where: { id },
    data,
    include: { organization: true },
  });
  return { ok: true, recruitment };
}

export type SetRecruitmentStatusResult =
  | { ok: true; recruitment: Prisma.GovRecruitmentGetPayload<{ include: { organization: true } }> }
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
    include: { organization: true },
  });
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
  category?: GovCurrentAffairCategory;
  status?: GovRecruitmentStatus | GovRecruitmentStatus[];
  page: number;
  limit: number;
}

export async function listCurrentAffairs(params: ListCurrentAffairsParams) {
  const { category, status, page, limit } = params;
  const where: Prisma.GovCurrentAffairWhereInput = {
    ...(category ? { category } : {}),
    ...(status ? { status: Array.isArray(status) ? { in: status } : status } : {}),
  };

  const [total, data] = await prisma.$transaction([
    prisma.govCurrentAffair.count({ where }),
    prisma.govCurrentAffair.findMany({
      where,
      orderBy: { publishedDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getCurrentAffairBySlug(slug: string, opts: { includeAllStatuses?: boolean } = {}) {
  return prisma.govCurrentAffair.findFirst({
    where: { slug, ...(opts.includeAllStatuses ? {} : { status: "published" }) },
  });
}

export async function getCurrentAffairById(id: string) {
  return prisma.govCurrentAffair.findUnique({ where: { id } });
}

export interface CurrentAffairInput {
  title: string;
  slug: string;
  category: GovCurrentAffairCategory;
  whatHappened: string;
  keyFacts?: string[];
  whyImportant?: string;
  examRelevance?: Record<string, string>;
  publishedDate: Date;
  source?: GovContentSource;
  sourceUrl?: string;
}

export type CreateCurrentAffairResult =
  | { ok: true; currentAffair: Prisma.GovCurrentAffairGetPayload<object> }
  | { ok: false; conflict: true };

export async function createCurrentAffair(data: CurrentAffairInput): Promise<CreateCurrentAffairResult> {
  const clash = await prisma.govCurrentAffair.findUnique({ where: { slug: data.slug } });
  if (clash) return { ok: false, conflict: true };
  const currentAffair = await prisma.govCurrentAffair.create({
    data: { ...data, keyFacts: data.keyFacts ?? undefined, examRelevance: data.examRelevance ?? undefined },
  });
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
    include: { organization: true },
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

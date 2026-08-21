import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { getSignedPhotoUrl } from "../../lib/s3";
import type { SiteHighlight } from "@prisma/client";

// The marketing site is deliberately single-tenant (see prisma schema
// comment on SiteHighlight) — SITE_TENANT_SLUG picks which tenant's data it
// reads/writes, so the same code works unchanged across dev/QA/prod even
// though this tenant's actual id differs between them (confirmed firsthand
// this session: dev and QA ended up with different ids for the same
// "success-tutorial" slug).
export async function getSiteTenant() {
  if (!env.SITE_TENANT_SLUG) return null;
  return prisma.tenant.findUnique({ where: { slug: env.SITE_TENANT_SLUG } });
}

// imageUrl is stored as a bare S3 key (same convention as Student.photoUrl,
// Staff.photoUrl, Tenant.logoUrl) — resolved to a short-lived signed URL at
// read time, never persisted as a plain URL.
export async function serializeHighlight(h: SiteHighlight) {
  return {
    id:          h.id,
    type:        h.type,
    title:       h.title,
    description: h.description,
    imageUrl:    h.imageUrl ? await getSignedPhotoUrl(h.imageUrl) : null,
    meta:        h.meta,
    isActive:    h.isActive,
    publishedAt: h.publishedAt,
  };
}

export async function serializeHighlights(highlights: SiteHighlight[]) {
  return Promise.all(highlights.map(serializeHighlight));
}

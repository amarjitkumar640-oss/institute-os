import { Router } from "express";
import { createAppReleaseSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { getSignedApkUrl } from "../../lib/s3";

export const appReleasesRouter = Router();

// ── GET /api/app-releases/:tenantId/latest — unauthenticated update check ─────
// Called by the mobile app (tenant baked in at build time) to see whether a
// newer native build exists. downloadUrl is minted fresh per request — the
// bucket is private, same as every other file this API serves.
appReleasesRouter.get("/:tenantId/latest", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant || !tenant.isActive) return res.status(404).json({ error: "Organization not found" });
  const audience = req.query.audience === "student" ? "student" : "staff";
  const payload = await latestReleasePayload(tenant.id, audience);
  if (!payload) return res.status(404).json({ error: "No release available" });
  res.json(payload);
});

// ── GET /api/app-releases/slug/:slug/latest — same lookup, keyed by slug ──────
// Used by the public download page (apps/web's /download/:tenantSlug) so a
// shareable link doesn't need to bake in the tenant's UUID — mirrors
// tenants.routes.ts's GET /slug/:slug/public precedent exactly.
appReleasesRouter.get("/slug/:slug/latest", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug } });
  if (!tenant || !tenant.isActive) return res.status(404).json({ error: "Organization not found" });
  const audience = req.query.audience === "student" ? "student" : "staff";
  const payload = await latestReleasePayload(tenant.id, audience);
  if (!payload) return res.status(404).json({ error: "No release available" });
  res.json(payload);
});

async function latestReleasePayload(tenantId: string, audience: "staff" | "student") {
  const release = await prisma.appRelease.findFirst({
    where:   { tenantId, platform: "android", audience, isActive: true },
    orderBy: { versionCode: "desc" },
  });
  if (!release) return null;
  return {
    versionName: release.versionName,
    versionCode: release.versionCode,
    changelog:   release.changelog,
    downloadUrl: await getSignedApkUrl(release.s3Key),
  };
}

// ── POST /api/app-releases — admin registers a release already uploaded to S3 ─
// The APK's bytes never pass through this API (50-100MB shouldn't be buffered
// into the Express process — see publish-release.ts, which PUTs directly to
// S3 first and only calls this endpoint with the resulting key).
appReleasesRouter.post("/", requireAuth, requireRole("admin"), validateBody(createAppReleaseSchema), async (req, res) => {
  // Never trust a body-supplied tenantId — same convention as every other
  // tenant-scoped write route in this app.
  if (req.body.tenantId !== req.auth!.tenantId) {
    return res.status(403).json({ error: "tenantId must match the authenticated admin's tenant" });
  }

  const release = await prisma.appRelease.create({
    data: {
      tenantId:    req.auth!.tenantId,
      audience:    req.body.audience,
      versionName: req.body.versionName,
      versionCode: req.body.versionCode,
      s3Key:       req.body.s3Key,
      changelog:   req.body.changelog,
    },
  });
  res.status(201).json(release);
});

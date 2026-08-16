import { Router } from "express";
import { z } from "zod";
import { StaffRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { SCREEN_REGISTRY } from "./registry";

export const permissionsRouter = Router();

const ROLES: StaffRole[] = ["admin", "teacher", "frontdesk"];

// GET / — every registry screen × every role, merged with this tenant's
// current PermissionGrant rows (a missing row reads as all-false, matching
// the "missing row = deny" rule the rest of the system relies on).
// Hardcoded requireRole("admin"), never requirePermission — this IS the
// screen that configures the permission system, excluded from it entirely
// (see registry.ts's comment on why "settings" stays outside the grid).
permissionsRouter.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  const grants = await prisma.permissionGrant.findMany({ where: { tenantId: req.auth!.tenantId } });
  const byKey = new Map(grants.map((g) => [`${g.role}:${g.screenKey}`, g]));

  const screens = SCREEN_REGISTRY.map((def) => ({
    key: def.key,
    label: def.label,
    module: def.module,
    platforms: def.platforms,
    roles: Object.fromEntries(
      ROLES.map((role) => {
        const g = byKey.get(`${role}:${def.key}`);
        return [role, {
          canRead: g?.canRead ?? false,
          canWrite: g?.canWrite ?? false,
          canEdit: g?.canEdit ?? false,
          canDelete: g?.canDelete ?? false,
        }];
      }),
    ),
  }));

  res.json(screens);
});

const grantSchema = z.object({
  screenKey: z.string(),
  role: z.enum(["admin", "teacher", "frontdesk"]),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

// PATCH / — bulk upsert. Body is the full set of changed cells (the web
// client sends one entry per edited checkbox-group on Save, not per
// individual checkbox) — one transaction so a partial failure never leaves
// the grid half-updated.
permissionsRouter.patch(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(z.array(grantSchema).min(1)),
  async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = req.body as z.infer<typeof grantSchema>[];

    const unknownKey = body.find((g) => !SCREEN_REGISTRY.some((s) => s.key === g.screenKey));
    if (unknownKey) return res.status(400).json({ error: `Unknown screen: ${unknownKey.screenKey}` });

    await prisma.$transaction(
      body.map((g) =>
        prisma.permissionGrant.upsert({
          where: { tenantId_role_screenKey: { tenantId, role: g.role, screenKey: g.screenKey } },
          update: { canRead: g.canRead, canWrite: g.canWrite, canEdit: g.canEdit, canDelete: g.canDelete, updatedById: req.auth!.staffId },
          create: { tenantId, role: g.role, screenKey: g.screenKey, canRead: g.canRead, canWrite: g.canWrite, canEdit: g.canEdit, canDelete: g.canDelete, updatedById: req.auth!.staffId },
        }),
      ),
    );

    res.json({ ok: true });
  },
);

import { Router } from "express";
import { z } from "zod";
import { NotificationType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody, validateQuery } from "../../middleware/validate";
import { DEFAULT_ROUTING } from "./notification.service";

export const notificationsRouter = Router();

const listQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ─── GET / — this staff member's own notifications, newest first ─────────────
notificationsRouter.get("/", requireAuth, validateQuery(listQuerySchema), async (req, res) => {
  const { page, limit } = (req as any).parsedQuery as z.infer<typeof listQuerySchema>;
  const where = { recipientId: req.auth!.staffId };

  const [total, data] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
});

// ─── GET /unread-count ─────────────────────────────────────────────────────────
notificationsRouter.get("/unread-count", requireAuth, async (req, res) => {
  const count = await prisma.notification.count({
    where: { recipientId: req.auth!.staffId, readAt: null },
  });
  res.json({ count });
});

// ─── PATCH /:id/read ────────────────────────────────────────────────────────────
notificationsRouter.patch("/:id/read", requireAuth, async (req, res) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, recipientId: req.auth!.staffId },
  });
  if (!notification) return res.status(404).json({ error: "Notification not found" });

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data:  { readAt: notification.readAt ?? new Date() },
  });
  res.json(updated);
});

// ─── PATCH /read-all ────────────────────────────────────────────────────────────
notificationsRouter.patch("/read-all", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { recipientId: req.auth!.staffId, readAt: null },
    data:  { readAt: new Date() },
  });
  res.json({ ok: true });
});

// ─── PUT /push-token — register or refresh the caller's device push token ────
const pushTokenSchema = z.object({ token: z.string().min(1) });

notificationsRouter.put("/push-token", requireAuth, validateBody(pushTokenSchema), async (req, res) => {
  await prisma.pushToken.upsert({
    where:  { token: req.body.token },
    update: { staffId: req.auth!.staffId },
    create: { staffId: req.auth!.staffId, token: req.body.token },
  });
  res.json({ ok: true });
});

// ─── DELETE /push-token — deregister on logout ────────────────────────────────
notificationsRouter.delete("/push-token", requireAuth, validateBody(pushTokenSchema), async (req, res) => {
  await prisma.pushToken.deleteMany({
    where: { staffId: req.auth!.staffId, token: req.body.token },
  });
  res.json({ ok: true });
});

// ─── GET /routing — admin: every notification type + its current/default roles ──
notificationsRouter.get("/routing", requireAuth, requireRole("admin"), async (req, res) => {
  const rules = await prisma.notificationRoutingRule.findMany({ where: { tenantId: req.auth!.tenantId } });
  const byType = new Map(rules.map((r) => [r.type, r.roles]));

  res.json(
    Object.values(NotificationType).map((type) => ({
      type,
      roles:        byType.get(type) ?? DEFAULT_ROUTING[type] ?? [],
      isDefault:    !byType.has(type),
      configurable: type in DEFAULT_ROUTING,
    }))
  );
});

// ─── PATCH /routing/:type — admin: set which roles receive a type ──────────────
const routingBodySchema = z.object({
  roles: z.array(z.enum(["admin", "teacher", "frontdesk"])),
});

notificationsRouter.patch("/routing/:type", requireAuth, requireRole("admin"), validateBody(routingBodySchema), async (req, res) => {
  const type = req.params.type as NotificationType;
  if (!Object.values(NotificationType).includes(type)) {
    return res.status(400).json({ error: "Invalid notification type" });
  }

  const rule = await prisma.notificationRoutingRule.upsert({
    where:  { tenantId_type: { tenantId: req.auth!.tenantId, type } },
    update: { roles: req.body.roles },
    create: { tenantId: req.auth!.tenantId, type, roles: req.body.roles },
  });
  res.json(rule);
});

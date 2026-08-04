import { NotificationType, StaffRole, PrismaClient, Prisma } from "@prisma/client";
import { sendFcm } from "../../lib/firebase";

// Built-in recipient roles for broadcast-style notification types, used when
// a tenant hasn't configured a NotificationRoutingRule override. Only the
// broadcast types (routed via notifyByRole) need an entry here — direct
// person-to-person types (session_cancelled/rescheduled, class_reminder) are
// sent via notify() and don't go through routing at all.
export const DEFAULT_ROUTING: Partial<Record<NotificationType, StaffRole[]>> = {
  new_enrollment:      ["admin"],
  installment_overdue: ["admin", "frontdesk"],
  batch_capacity:      ["frontdesk"],
};

// Android channel ID + icon tint per type. Channel IDs must exactly match
// the channels created client-side (apps/mobile/src/lib/pushNotifications.ts)
// — colors mirror the in-app notification list's per-type palette.
const TYPE_META: Record<NotificationType, { channelId: string; color: string }> = {
  session_cancelled:   { channelId: "session_cancelled",   color: "#C0392B" },
  session_rescheduled: { channelId: "session_rescheduled", color: "#F5B301" },
  session_assigned:    { channelId: "session_assigned",    color: "#2CA6A4" },
  class_reminder:      { channelId: "class_reminder",      color: "#2563A8" },
  new_enrollment:       { channelId: "new_enrollment",       color: "#1B9C63" },
  installment_overdue: { channelId: "installment_overdue", color: "#C0392B" },
  batch_capacity:      { channelId: "batch_capacity",      color: "#5B2D8E" },
};

// Look up registered FCM tokens for the given staff IDs and fire one push
// per staff member — separately (not one shared call) so each person gets
// their own live unread-count badge. Errors are logged but never thrown —
// a push failure must never break the caller.
async function sendPush(
  db:       PrismaClient,
  staffIds: string[],
  type:     NotificationType,
  title:    string,
  body:     string,
  data?:    Prisma.InputJsonValue,
) {
  if (staffIds.length === 0) return;

  const tokenRows = await db.pushToken.findMany({
    where:  { staffId: { in: staffIds } },
    select: { staffId: true, token: true },
  });
  if (tokenRows.length === 0) return;

  const tokensByStaff = new Map<string, string[]>();
  for (const row of tokenRows) {
    const list = tokensByStaff.get(row.staffId) ?? [];
    list.push(row.token);
    tokensByStaff.set(row.staffId, list);
  }

  const unreadCounts = await db.notification.groupBy({
    by:     ["recipientId"],
    where:  { recipientId: { in: [...tokensByStaff.keys()] }, readAt: null },
    _count: { _all: true },
  });
  const badgeByStaff = new Map(unreadCounts.map((r) => [r.recipientId, r._count._all]));

  // FCM data values must all be strings.
  const strData: Record<string, string> = {};
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      strData[k] = String(v ?? "");
    }
  }

  const meta = TYPE_META[type];
  for (const [staffId, tokens] of tokensByStaff) {
    sendFcm(tokens, title, body, strData, {
      channelId: meta.channelId,
      color:     meta.color,
      threadId:  type,
      badge:     badgeByStaff.get(staffId) ?? 1,
    });
  }
}

// Direct, single-recipient notification — e.g. "your class starts soon."
export async function notify(
  db:          PrismaClient,
  recipientId: string,
  tenantId:    string,
  type:        NotificationType,
  title:       string,
  body:        string,
  data?:       Prisma.InputJsonValue,
) {
  const notification = await db.notification.create({
    data: { recipientId, tenantId, type, title, body, data },
  });
  sendPush(db, [recipientId], type, title, body, data).catch(console.error);
  return notification;
}

// Broadcast to every active staff member matching the configured (or
// default) roles for this notification type. When centerId is given,
// scopes to staff assigned to that center; otherwise broadcasts tenant-wide.
export async function notifyByRole(
  db:       PrismaClient,
  tenantId: string,
  type:     NotificationType,
  title:    string,
  body:     string,
  data?:    Prisma.InputJsonValue,
  centerId?: string | null,
) {
  const rule  = await db.notificationRoutingRule.findUnique({ where: { tenantId_type: { tenantId, type } } });
  const roles = rule ? rule.roles : (DEFAULT_ROUTING[type] ?? []);
  if (roles.length === 0) return [];

  const recipientIds = centerId
    ? (await db.centerStaff.findMany({
        where:  { centerId, role: { in: roles }, staff: { isActive: true } },
        select: { staffId: true },
      })).map((cs) => cs.staffId)
    : (await db.staff.findMany({
        where:  { tenantId, role: { in: roles }, isActive: true },
        select: { id: true },
      })).map((s) => s.id);

  if (recipientIds.length === 0) return [];

  await db.notification.createMany({
    data: recipientIds.map((recipientId) => ({ recipientId, tenantId, type, title, body, data })),
  });
  sendPush(db, recipientIds, type, title, body, data).catch(console.error);
  return recipientIds;
}

// Fired after a class session is patched — notifies the linked teacher when
// their session is cancelled or its date/time changes. `patchBody` is the raw
// PATCH input (declares intent directly, so no old-vs-new diffing needed).
// Silently no-ops when the faculty on the session has no linked staff login.
export async function notifySessionChange(
  db:       PrismaClient,
  tenantId: string,
  session: {
    batchId: string;
    facultyId: string | null;
    subject: { name: string } | null;
    batch: { name: string };
  },
  patchBody: { status?: string; scheduledDate?: string; startTime?: string },
) {
  if (!session.facultyId) return;
  const faculty = await db.faculty.findUnique({ where: { id: session.facultyId }, select: { staffId: true } });
  if (!faculty?.staffId) return;

  const subjectName = session.subject?.name ?? "Class";
  const data = { screen: "BatchSchedule", batchId: session.batchId, batchName: session.batch.name };

  if (patchBody.status === "cancelled") {
    await notify(db, faculty.staffId, tenantId, "session_cancelled",
      "Class cancelled", `${subjectName} — ${session.batch.name} has been cancelled`, data);
  } else if (patchBody.scheduledDate !== undefined || patchBody.startTime !== undefined) {
    await notify(db, faculty.staffId, tenantId, "session_rescheduled",
      "Class rescheduled", `${subjectName} — ${session.batch.name} has been rescheduled`, data);
  }
}

// Fired when a class slot's or session's facultyId changes to a different
// faculty member — the outgoing teacher gets a "removed" notice (reusing
// session_cancelled, since from their side the class disappears from their
// schedule) and the incoming teacher gets "session_assigned". Silently
// no-ops for whichever side has no linked staff login, or when the faculty
// didn't actually change.
export async function notifyFacultyReassignment(
  db:       PrismaClient,
  tenantId: string,
  context: { batchId: string; batchName: string; subjectName: string | null },
  previousFacultyId: string | null,
  newFacultyId:      string | null,
) {
  if (previousFacultyId === newFacultyId) return;

  const facultyIds = [previousFacultyId, newFacultyId].filter((id): id is string => !!id);
  if (facultyIds.length === 0) return;

  const facultyRows = await db.faculty.findMany({
    where:  { id: { in: facultyIds } },
    select: { id: true, staffId: true },
  });
  const staffByFaculty = new Map(facultyRows.map((f) => [f.id, f.staffId]));

  const subjectLabel = context.subjectName ?? "Class";
  const data = { screen: "BatchSchedule", batchId: context.batchId, batchName: context.batchName };

  if (previousFacultyId) {
    const staffId = staffByFaculty.get(previousFacultyId);
    if (staffId) {
      await notify(db, staffId, tenantId, "session_cancelled",
        "Class reassigned", `${subjectLabel} — ${context.batchName} has been reassigned to another teacher`, data);
    }
  }
  if (newFacultyId) {
    const staffId = staffByFaculty.get(newFacultyId);
    if (staffId) {
      await notify(db, staffId, tenantId, "session_assigned",
        "New class assigned", `You've been assigned ${subjectLabel} — ${context.batchName}`, data);
    }
  }
}

// Fired after a successful enrollment (from any of its 3 call sites), once
// their transaction has already committed — never call this inside a
// transaction, it does its own fresh reads and must never roll back the
// enrollment itself if it fails. Fires "new_enrollment" always, and
// "batch_capacity" only on the exact tick the batch crosses 90% or 100% full.
export async function notifyEnrollmentEvents(db: PrismaClient, tenantId: string, batchId: string) {
  const batch = await db.batch.findUnique({ where: { id: batchId }, select: { name: true, capacity: true, centerId: true } });
  if (!batch) return;
  const activeCount = await db.enrollment.count({ where: { batchId, status: "active" } });
  const data = { screen: "StudentList", batchId, batchName: batch.name };

  await notifyByRole(db, tenantId, "new_enrollment",
    "New enrollment", `A new student enrolled in ${batch.name}`, data, batch.centerId);

  if (batch.capacity > 0 && activeCount === batch.capacity) {
    await notifyByRole(db, tenantId, "batch_capacity",
      "Batch is full", `${batch.name} has reached full capacity (${activeCount}/${batch.capacity})`, data, batch.centerId);
  } else if (batch.capacity > 0 && activeCount === Math.round(batch.capacity * 0.9)) {
    await notifyByRole(db, tenantId, "batch_capacity",
      "Batch nearly full", `${batch.name} is nearly full (${activeCount}/${batch.capacity})`, data, batch.centerId);
  }
}

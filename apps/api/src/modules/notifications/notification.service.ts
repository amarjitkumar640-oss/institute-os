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
  new_application:     ["admin", "frontdesk"],
};

// Android channel ID + icon tint per type. Channel IDs must exactly match
// the channels created client-side (apps/mobile/src/lib/pushNotifications.ts)
// — colors mirror the in-app notification list's per-type palette.
const TYPE_META: Record<NotificationType, { channelId: string; color: string }> = {
  session_cancelled:       { channelId: "session_cancelled",       color: "#C0392B" },
  session_rescheduled:     { channelId: "session_rescheduled",     color: "#F5B301" },
  session_assigned:        { channelId: "session_assigned",        color: "#2CA6A4" },
  session_subject_changed: { channelId: "session_subject_changed", color: "#8E44AD" },
  class_reminder:      { channelId: "class_reminder",      color: "#2563A8" },
  new_enrollment:       { channelId: "new_enrollment",       color: "#1B9C63" },
  installment_overdue: { channelId: "installment_overdue", color: "#C0392B" },
  batch_capacity:      { channelId: "batch_capacity",      color: "#5B2D8E" },
  new_application:     { channelId: "new_application",     color: "#2563A8" },
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
  // Bypasses the configured routing rule / DEFAULT_ROUTING lookup and
  // notifies exactly these roles instead — used by notifyByRoleCenterAware
  // to split one notification type's configured roles across two delivery
  // scopes (tenant-wide vs center-scoped) without hardcoding role lists at
  // the call site.
  rolesOverride?: StaffRole[],
) {
  const roles = rolesOverride
    ?? (await db.notificationRoutingRule.findUnique({ where: { tenantId_type: { tenantId, type } } }))?.roles
    ?? (DEFAULT_ROUTING[type] ?? []);
  if (roles.length === 0) return [];

  const recipientIds = centerId
    ? (await db.centerStaff.findMany({
        where:  { centerId, roles: { hasSome: roles }, staff: { isActive: true } },
        select: { staffId: true },
      })).map((cs) => cs.staffId)
    : (await db.staff.findMany({
        where:  { tenantId, roles: { hasSome: roles }, isActive: true },
        select: { id: true },
      })).map((s) => s.id);

  if (recipientIds.length === 0) return [];

  await db.notification.createMany({
    data: recipientIds.map((recipientId) => ({ recipientId, tenantId, type, title, body, data })),
  });
  sendPush(db, recipientIds, type, title, body, data).catch(console.error);
  return recipientIds;
}

// Like notifyByRole, but splits the type's configured roles across two
// delivery scopes: "admin" always reaches every admin tenant-wide (admins
// oversee the whole institute, not one center), while every other
// configured role is scoped to `centerId` — falling back to tenant-wide for
// them too when no center is given. Used for events tied to a specific
// center that isn't necessarily the recipient's own (e.g. a self-service
// admission application naming a preferred center).
export async function notifyByRoleCenterAware(
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

  const adminRoles = roles.filter((r) => r === "admin");
  const otherRoles = roles.filter((r) => r !== "admin");

  const [adminRecipients, otherRecipients] = await Promise.all([
    adminRoles.length ? notifyByRole(db, tenantId, type, title, body, data, null, adminRoles) : Promise.resolve([]),
    otherRoles.length ? notifyByRole(db, tenantId, type, title, body, data, centerId, otherRoles) : Promise.resolve([]),
  ]);
  return [...adminRecipients, ...otherRecipients];
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
//
// oldSubjectName/newSubjectName are separate (not one shared subjectName)
// because a single PATCH can change subject and faculty together — the
// outgoing teacher lost the OLD subject, not whatever the session's subject
// was changed to, and conflating the two previously showed the outgoing
// teacher the wrong (new) subject name.
export async function notifyFacultyReassignment(
  db:       PrismaClient,
  tenantId: string,
  context: { batchId: string; batchName: string; oldSubjectName: string | null; newSubjectName: string | null },
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

  const data = { screen: "BatchSchedule", batchId: context.batchId, batchName: context.batchName };

  if (previousFacultyId) {
    const staffId = staffByFaculty.get(previousFacultyId);
    if (staffId) {
      const subjectLabel = context.oldSubjectName ?? "Class";
      await notify(db, staffId, tenantId, "session_cancelled",
        "Class reassigned", `${subjectLabel} — ${context.batchName} has been reassigned to another teacher`, data);
    }
  }
  if (newFacultyId) {
    const staffId = staffByFaculty.get(newFacultyId);
    if (staffId) {
      const subjectLabel = context.newSubjectName ?? "Class";
      await notify(db, staffId, tenantId, "session_assigned",
        "New class assigned", `You've been assigned ${subjectLabel} — ${context.batchName}`, data);
    }
  }
}

// Fired when a session's subjectId changes but its facultyId stays the same
// — the assigned teacher keeps the class but now teaches a different
// subject in that slot. Silently no-ops if the session has no assigned
// faculty, or that faculty has no linked staff login.
export async function notifySubjectChange(
  db:       PrismaClient,
  tenantId: string,
  context: { batchId: string; batchName: string },
  facultyId: string | null,
  oldSubjectName: string | null,
  newSubjectName: string | null,
) {
  if (!facultyId) return;
  const faculty = await db.faculty.findUnique({ where: { id: facultyId }, select: { staffId: true } });
  if (!faculty?.staffId) return;

  const data = { screen: "BatchSchedule", batchId: context.batchId, batchName: context.batchName };
  await notify(db, faculty.staffId, tenantId, "session_subject_changed",
    "Class subject changed",
    `${context.batchName}'s class has changed from ${oldSubjectName ?? "—"} to ${newSubjectName ?? "—"}`,
    data);
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

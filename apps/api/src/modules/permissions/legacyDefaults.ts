import type { StaffRole } from "@prisma/client";

// One-time reproduction of *today's* effective access per screen, derived by
// walking every requireRole(...) call, every <ProtectedRoute roles={...}>,
// the web sidebar's NAV array, and every mobile role check across all three
// apps. Consumed ONLY by the seed script (scripts/seedPermissionDefaults.ts)
// — never imported at request time. Do not treat this as a live source of
// truth; once seeded, apps/web's new PermissionsPage.tsx grid is the real
// source of truth going forward.
//
// Several cells below are judgment calls where the three apps didn't agree
// with each other before this migration (there was no single source of
// truth — that's the whole reason this system exists). Each is commented
// with the reasoning. Review these specifically once the admin UI ships.
type RoleAccess = Partial<Record<StaffRole, string>>; // "rwed"-style letters, missing role = deny

export const LEGACY_ROLE_ACCESS: Record<string, RoleAccess> = {
  // JUDGMENT CALL: API's GET routes are open to any role (with teacher
  // ownership-scoping), and mobile's teacher dashboard has a real, working
  // "Students" bottom-nav tab (TeacherDashboardScreen.tsx) showing a
  // teacher's own students. Web's /students route blocks teacher entirely —
  // that's web simply never building a teacher-facing view, not a security
  // boundary. Preserving mobile's real feature: teacher gets read=true. This
  // incidentally makes web's /students route reachable by teacher too
  // (they'd see their own ownership-scoped students, same data mobile
  // already shows them) — a minor capability gain on web, not a regression
  // anywhere.
  students: { admin: "rwed", frontdesk: "rwed", teacher: "r" },

  // No mobile nav entry for teacher; web + API both admin/frontdesk-only.
  leads: { admin: "rwed", frontdesk: "rwed" },

  // Same as leads — admin/frontdesk-only everywhere, no teacher access
  // anywhere. "write" unused (applications are created via the public
  // self-service form, not by staff).
  "admission-applications": { admin: "rwe", frontdesk: "rwe" },

  // API read is open to all roles (teacher ownership-scoped); web nav
  // explicitly lists Batches for all three roles too; mobile's teacher
  // dashboard has a real "Batches" tab. Write/edit require admin+frontdesk
  // everywhere; delete is explicitly admin-only at the API.
  batches: { admin: "rwed", frontdesk: "rwe", teacher: "r" },

  // JUDGMENT CALL: API read has no requireRole, but no client actually
  // exercises teacher access to Courses (no nav entry on either platform for
  // teacher) — unlike Batches/Students, this isn't a real, used feature for
  // teacher, so seeded deny rather than trusting the technically-open API.
  // Frontdesk DOES have a real, working mobile entry point (Dashboard's
  // quick-actions grid) despite web restricting Courses to admin-only —
  // preserving frontdesk's real mobile feature.
  courses: { admin: "rwed", frontdesk: "r" },

  // Same shape and same reasoning as courses.
  subjects: { admin: "rwed", frontdesk: "r" },

  // Same shape as courses/subjects for the base screen; write/edit/delete
  // admin-only per explicit API gate. Frontdesk's real mobile access is
  // read-only here (attendance marking is a separate "faculty-attendance"
  // screen below).
  faculty: { admin: "rwed", frontdesk: "r" },

  // The heaviest exception module (see plan's Part 4 table for the
  // route-level detail this collapses).
  // - read: API has no role gate on any GET here (teacher ownership-scoped),
  //   matching real usage on both platforms.
  // - write (slot creation, session generation): explicit
  //   requireRole("admin","frontdesk") on slot writes; session-generation
  //   routes have NO requireRole today (an apparent oversight vs. their
  //   sibling slot routes in the same file) — closed by matching the
  //   sibling pattern rather than preserving the gap.
  // - edit (slot edits + session complete/cancel + attendance marking,
  //   bundled under one flag — a real precision loss, flagged in the plan):
  //   slot edits are explicitly admin+frontdesk; session complete/cancel has
  //   NO requireRole at the API (only ownership-scoping) and is only hidden
  //   from frontdesk in the web UI's button visibility, not actually
  //   blocked server-side — since frontdesk could already do this via a
  //   direct API call today, granting schedule.edit=true for frontdesk
  //   changes no real security boundary, it just makes the already-true API
  //   behavior consistent with the UI. Teacher already has this via the
  //   Complete/Cancel buttons on their own sessions (ownership-scoped).
  // - delete: only slot deletion exists, explicitly admin+frontdesk.
  schedule: { admin: "rwed", frontdesk: "rwed", teacher: "re" },

  // Mobile-only. Entry point (FacultyListScreen's attendance button) is
  // explicitly admin/frontdesk, matching the API's explicit
  // requireRole("admin","frontdesk") on both attendance routes.
  "faculty-attendance": { admin: "rwe", frontdesk: "rwe" },

  // JUDGMENT CALL, already flagged before implementation: API reads have no
  // requireRole at all, but neither client gives teacher a real path to fee
  // data (no nav entry on mobile or web) — seeded deny for teacher, matching
  // real usage, not the technically-open API. "write" (recording a payment)
  // is explicitly admin+frontdesk. "edit" bundles two API gates that
  // actually differ (discount/installment edits are admin-ONLY;
  // payment-recording is admin+frontdesk) into one flag — resolved
  // permissive (admin+frontdesk) to avoid regressing frontdesk's real
  // payment-recording feature. This technically also grants frontdesk
  // discount/installment editing they couldn't do before — flagged
  // explicitly for review via the new admin UI, not a silent decision.
  fees: { admin: "rwed", frontdesk: "rwe" },

  // Explicit admin-only everywhere (API, web route, web nav).
  staff: { admin: "rwed" },

  // "Centers" here means center MANAGEMENT (create/edit centers, assign
  // staff) — explicit admin-only everywhere. The separate center-PICKER flow
  // used by every role during login/center-switching is a different,
  // always-available feature outside this permission system entirely (like
  // login itself).
  centers: { admin: "rwed" },

  // A personal inbox (you only ever see/mark-read your OWN notifications —
  // ownership-scoped by definition, there's no "other people's
  // notifications" to gate), open to every role today at the API
  // (requireAuth only) with no client-side restriction anywhere. Seeded
  // fully permissive to preserve that. (Notification ROUTING config is a
  // separate, hardcoded-admin-only Settings concern, excluded from this
  // grid same as "settings" itself.)
  notifications: { admin: "re", teacher: "re", frontdesk: "re" },
};

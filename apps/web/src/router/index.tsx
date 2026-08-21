import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { ProtectedRoute } from "./ProtectedRoute";

import { LoginPage } from "@/modules/auth/LoginPage";
import { TenantEntryPage } from "@/modules/auth/TenantEntryPage";
import { ApplyPage } from "@/modules/apply/ApplyPage";
import { DownloadPage } from "@/modules/download/DownloadPage";
import { CenterPickPage } from "@/modules/auth/CenterPickPage";
import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { StudentsPage } from "@/modules/students/StudentsPage";
import { StudentDetailPage } from "@/modules/students/StudentDetailPage";
import { LeadsPage } from "@/modules/leads/LeadsPage";
import { AdmissionApplicationsPage } from "@/modules/admissionApplications/AdmissionApplicationsPage";
import { BatchesPage } from "@/modules/batches/BatchesPage";
import { BatchDetailPage } from "@/modules/batches/BatchDetailPage";
import { CoursesPage } from "@/modules/courses/CoursesPage";
import { SubjectsPage } from "@/modules/subjects/SubjectsPage";
import { FacultyPage } from "@/modules/faculty/FacultyPage";
import { StaffPage } from "@/modules/staff/StaffPage";
import { FeesPage } from "@/modules/fees/FeesPage";
import { FeeDetailPage } from "@/modules/fees/FeeDetailPage";
import { SchedulePage } from "@/modules/schedule/SchedulePage";
import { CentersPage } from "@/modules/centers/CentersPage";
import { CenterDetailPage } from "@/modules/centers/CenterDetailPage";
import { NotificationsPage } from "@/modules/notifications/NotificationsPage";
import { ProfilePage } from "@/modules/profile/ProfilePage";
import { SettingsPage } from "@/modules/settings/SettingsPage";
import { PermissionsPage } from "@/modules/permissions/PermissionsPage";
import { SiteContentPage } from "@/modules/site-content/SiteContentPage";

export const router = createBrowserRouter([
  // Shareable per-institute link — not wrapped in AuthLayout, it's a
  // near-instant redirect to /login, not a screen anyone lingers on.
  { path: "/org/:slug", element: <TenantEntryPage /> },
  // Shorter alias for the same thing — /success-tutorial instead of
  // /org/success-tutorial. Safe to add: React Router ranks every static
  // route above (/dashboard, /login, /students, etc.) as more specific than
  // this single dynamic segment, so none of them can be shadowed by it —
  // this only ever catches a first path segment that isn't one of those.
  { path: "/:slug", element: <TenantEntryPage /> },
  // Public self-service admission form — fully unauthenticated, no nav shell.
  { path: "/apply/:tenantSlug", element: <ApplyPage /> },
  // Public shareable APK download link — fully unauthenticated, no nav shell.
  { path: "/download/:tenantSlug", element: <DownloadPage /> },
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        path: "/pick-center",
        element: (
          <ProtectedRoute>
            <CenterPickPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "/dashboard", element: <DashboardPage /> },
      {
        path: "/profile",
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/students",
        element: (
          <ProtectedRoute screenKey="students">
            <StudentsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/students/:id",
        element: (
          <ProtectedRoute screenKey="students">
            <StudentDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/leads",
        element: (
          <ProtectedRoute screenKey="leads">
            <LeadsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/admission-applications",
        element: (
          <ProtectedRoute screenKey="admission-applications">
            <AdmissionApplicationsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/batches",
        element: (
          <ProtectedRoute screenKey="batches">
            <BatchesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/batches/:id",
        element: (
          <ProtectedRoute screenKey="batches">
            <BatchDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/courses",
        element: (
          <ProtectedRoute screenKey="courses">
            <CoursesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/subjects",
        element: (
          <ProtectedRoute screenKey="subjects">
            <SubjectsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/faculty",
        element: (
          <ProtectedRoute screenKey="faculty">
            <FacultyPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/staff",
        element: (
          <ProtectedRoute screenKey="staff">
            <StaffPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/fees",
        element: (
          <ProtectedRoute screenKey="fees">
            <FeesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/fees/:enrollmentId",
        element: (
          <ProtectedRoute screenKey="fees">
            <FeeDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        // Previously had no route-level gate at all, while the sidebar nav
        // hid this from frontdesk — an inconsistency (the API itself never
        // restricted reading schedule data for any role). Resolved toward
        // what the API actually already allowed: seeded open to all three
        // roles, so frontdesk gains real route access matching their
        // existing (unblocked) API access, rather than being newly excluded.
        path: "/schedule",
        element: (
          <ProtectedRoute screenKey="schedule">
            <SchedulePage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/centers",
        element: (
          <ProtectedRoute screenKey="centers">
            <CentersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/centers/:id",
        element: (
          <ProtectedRoute screenKey="centers">
            <CenterDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/notifications",
        element: (
          <ProtectedRoute screenKey="notifications">
            <NotificationsPage />
          </ProtectedRoute>
        ),
      },
      {
        // Not in the screenKey permission grid — this is a one-off feature
        // for a single tenant's standalone marketing site (apps/site), not
        // a general operational screen, so adminOnly is the right fit here
        // too (same reasoning as Settings, just not for lockout reasons).
        path: "/site-content",
        element: (
          <ProtectedRoute adminOnly>
            <SiteContentPage />
          </ProtectedRoute>
        ),
      },
      {
        // Deliberately NOT screenKey-gated — see ProtectedRoute's adminOnly
        // doc comment (self-lockout hazard).
        path: "/settings",
        element: (
          <ProtectedRoute adminOnly>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        // Same self-lockout reasoning as /settings — this IS the screen that
        // configures every screenKey grant, so it can't be gated by one.
        path: "/settings/permissions",
        element: (
          <ProtectedRoute adminOnly>
            <PermissionsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: "*", element: <DashboardPage /> },
], {
  // Vite's built-in that auto-reflects vite.config.ts's `base` option — "/"
  // locally, "/qa/" in the QA deploy. Keeps every route/navigate call in
  // this app working unchanged regardless of which path prefix it's served
  // under; only this one setting needs to know about it.
  basename: import.meta.env.BASE_URL,
});

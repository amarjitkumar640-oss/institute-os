import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { ProtectedRoute } from "./ProtectedRoute";

import { LoginPage } from "@/modules/auth/LoginPage";
import { TenantEntryPage } from "@/modules/auth/TenantEntryPage";
import { CenterPickPage } from "@/modules/auth/CenterPickPage";
import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { StudentsPage } from "@/modules/students/StudentsPage";
import { StudentDetailPage } from "@/modules/students/StudentDetailPage";
import { LeadsPage } from "@/modules/leads/LeadsPage";
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
import { SettingsPage } from "@/modules/settings/SettingsPage";

export const router = createBrowserRouter([
  // Shareable per-institute link — not wrapped in AuthLayout, it's a
  // near-instant redirect to /login, not a screen anyone lingers on.
  { path: "/org/:slug", element: <TenantEntryPage /> },
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
        path: "/students",
        element: (
          <ProtectedRoute roles={["admin", "frontdesk"]}>
            <StudentsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/students/:id",
        element: (
          <ProtectedRoute roles={["admin", "frontdesk"]}>
            <StudentDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/leads",
        element: (
          <ProtectedRoute roles={["admin", "frontdesk"]}>
            <LeadsPage />
          </ProtectedRoute>
        ),
      },
      { path: "/batches", element: <BatchesPage /> },
      { path: "/batches/:id", element: <BatchDetailPage /> },
      {
        path: "/courses",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <CoursesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/subjects",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <SubjectsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/faculty",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <FacultyPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/staff",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <StaffPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/fees",
        element: (
          <ProtectedRoute roles={["admin", "frontdesk"]}>
            <FeesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/fees/:enrollmentId",
        element: (
          <ProtectedRoute roles={["admin", "frontdesk"]}>
            <FeeDetailPage />
          </ProtectedRoute>
        ),
      },
      { path: "/schedule", element: <SchedulePage /> },
      {
        path: "/centers",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <CentersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/centers/:id",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <CenterDetailPage />
          </ProtectedRoute>
        ),
      },
      { path: "/notifications", element: <NotificationsPage /> },
      {
        path: "/settings",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <SettingsPage />
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

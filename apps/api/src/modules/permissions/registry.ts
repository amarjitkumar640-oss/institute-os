export type PlatformKey = "web" | "mobile";

export interface ScreenDefinition {
  key: string;      // stable id referenced by requirePermission()/ProtectedRoute/usePermission()
  label: string;     // shown in the admin grid
  module: string;     // grouping in the admin UI ("Students", "Fees", "Schedule", ...)
  platforms: PlatformKey[];
}

// Deliberately excludes "dashboard" (no create/edit/delete concept, no
// requireRole today, stays open to any authenticated staff) and "settings"
// (this permission-config screen itself, plus notification routing and the
// jobs tab, must stay hardcoded requireRole("admin") forever — letting an
// admin revoke settings.edit from the admin role would permanently lock
// every admin out of the one screen that could undo the mistake).
export const SCREEN_REGISTRY: ScreenDefinition[] = [
  { key: "students", label: "Students", module: "Students", platforms: ["web", "mobile"] },
  { key: "leads", label: "Leads", module: "Students", platforms: ["web", "mobile"] },
  { key: "admission-applications", label: "Admission Applications", module: "Students", platforms: ["web", "mobile"] },
  { key: "batches", label: "Batches", module: "Academics", platforms: ["web", "mobile"] },
  { key: "courses", label: "Courses", module: "Academics", platforms: ["web", "mobile"] },
  { key: "subjects", label: "Subjects", module: "Academics", platforms: ["web", "mobile"] },
  { key: "faculty", label: "Faculty", module: "Academics", platforms: ["web", "mobile"] },
  { key: "schedule", label: "Schedule", module: "Academics", platforms: ["web", "mobile"] },
  { key: "faculty-attendance", label: "Faculty Attendance", module: "Academics", platforms: ["mobile"] },
  { key: "fees", label: "Fees", module: "Finance", platforms: ["web", "mobile"] },
  { key: "sponsors", label: "CSR Sponsors", module: "Finance", platforms: ["web", "mobile"] },
  { key: "staff", label: "Staff", module: "Organization", platforms: ["web", "mobile"] },
  { key: "centers", label: "Centers", module: "Organization", platforms: ["web", "mobile"] },
  { key: "notifications", label: "Notifications", module: "Organization", platforms: ["web", "mobile"] },
];

export function getScreenDefinition(key: string): ScreenDefinition | undefined {
  return SCREEN_REGISTRY.find((s) => s.key === key);
}

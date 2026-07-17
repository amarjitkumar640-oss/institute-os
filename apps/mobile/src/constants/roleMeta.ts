export const ROLES = ["admin", "teacher", "frontdesk"] as const;
export type Role = typeof ROLES[number];

export const ROLE_META: Record<Role, { label: string; color: string; bg: string; icon: string; desc: string }> = {
  admin:     { label: "Admin",      color: "#8B1E3F", bg: "#FDF0F3", icon: "shield-checkmark-outline", desc: "Full access — manage centers, staff, courses, batches" },
  teacher:   { label: "Teacher",    color: "#2CA6A4", bg: "#EBF8F8", icon: "school-outline",            desc: "View & teach assigned batches and students" },
  frontdesk: { label: "Front Desk", color: "#E8752C", bg: "#FEF3EA", icon: "desktop-outline",           desc: "Admissions, leads, batch scheduling" },
};

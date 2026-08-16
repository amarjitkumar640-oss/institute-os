import { apiClient } from "./client";

export interface LoginPayload {
  tenantId: string;
  identifier: string;
  password: string;
}

export type StaffRole = "admin" | "teacher" | "frontdesk";

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  // A staff member can hold more than one role at once (e.g. admin +
  // teacher at the same center) — `roles` is every role held here, while
  // `activeRole` is the single one currently in effect for access control.
  staff: { id: string; fullName: string; roles: StaffRole[]; activeRole: StaffRole; permissions: Record<string, string> };
  centers: { id: string; name: string; roles: StaffRole[] }[];
  currentCenter: { id: string; name: string } | null;
  branding: { primary: string | null; secondary: string | null; accent: string | null; logoUrl: string | null };
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/api/auth/login", payload);
  return data;
}

export interface SelectCenterResponse {
  accessToken: string;
  refreshToken: string;
  center: { id: string; name: string } | null;
  roles: StaffRole[];
  activeRole: StaffRole;
  permissions: Record<string, string>;
}

export async function selectCenter(centerId: string | null) {
  const { data } = await apiClient.post<SelectCenterResponse>(
    "/api/auth/select-center",
    { centerId }
  );
  return data;
}

export interface SelectRoleResponse {
  accessToken: string;
  refreshToken: string;
  center: { id: string; name: string } | null;
  roles: StaffRole[];
  activeRole: StaffRole;
  permissions: Record<string, string>;
}

// Exchange the current session for one scoped to a different role you hold
// at your current center — mirrors selectCenter exactly, but along the role
// axis. The API rejects (403) a role you don't actually hold there.
export async function selectRole(role: StaffRole) {
  const { data } = await apiClient.post<SelectRoleResponse>(
    "/api/auth/select-role",
    { role }
  );
  return data;
}

export interface TenantPublic {
  name: string;
  loginMethod: "phone" | "email_username";
  branding: { primary: string | null; secondary: string | null; accent: string | null; logoUrl: string | null };
}

export async function getTenantPublic(tenantId: string): Promise<TenantPublic> {
  const { data } = await apiClient.get<TenantPublic>(`/api/tenants/${tenantId}/public`);
  return data;
}

export interface TenantBySlug extends TenantPublic {
  id: string;
}

export async function getTenantBySlug(slug: string): Promise<TenantBySlug> {
  const { data } = await apiClient.get<TenantBySlug>(`/api/tenants/slug/${slug}/public`);
  return data;
}

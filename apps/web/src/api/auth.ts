import { apiClient } from "./client";

export interface LoginPayload {
  tenantId: string;
  identifier: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  staff: { id: string; fullName: string; role: "admin" | "teacher" | "frontdesk" };
  centers: { id: string; name: string; role: "admin" | "teacher" | "frontdesk" }[];
  currentCenter: { id: string; name: string } | null;
  branding: { primary: string | null; secondary: string | null; accent: string | null; logoUrl: string | null };
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/api/auth/login", payload);
  return data;
}

export async function selectCenter(centerId: string | null) {
  const { data } = await apiClient.post<{ accessToken: string; center: { id: string; name: string } | null }>(
    "/api/auth/select-center",
    { centerId }
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

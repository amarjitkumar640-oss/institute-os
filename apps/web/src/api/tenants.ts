import { apiClient } from "./client";

export interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  loginMethod: "phone" | "email_username";
  branding: {
    primary: string | null;
    secondary: string | null;
    accent: string | null;
    background: string | null;
    logoUrl: string | null;
  };
  classReminderMinutes: number;
  overdueGraceDays: number;
}

export interface UpdateSettingsPayload {
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
  background?: string | null;
  logoUrl?: string | null;
  loginMethod?: "phone" | "email_username";
  classReminderMinutes?: number;
  overdueGraceDays?: number;
}

export async function getTenantSettings(): Promise<TenantSettings> {
  const { data } = await apiClient.get<TenantSettings>("/api/tenants/me");
  return data;
}

export async function updateTenantSettings(payload: UpdateSettingsPayload): Promise<TenantSettings["branding"] & Omit<UpdateSettingsPayload, "primary" | "secondary" | "accent" | "background" | "logoUrl">> {
  const { data } = await apiClient.patch("/api/tenants/me/settings", payload);
  return data;
}

export async function uploadTenantLogo(file: File): Promise<{ logoUrl: string }> {
  const formData = new FormData();
  formData.append("logo", file);
  const { data } = await apiClient.post<{ logoUrl: string }>("/api/tenants/me/logo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteTenantLogo(): Promise<void> {
  await apiClient.delete("/api/tenants/me/logo");
}

import { apiClient } from "./client";

export type LoginMethod = "phone" | "email_username";

export interface TenantSettings {
  id:          string;
  name:        string;
  slug:        string;
  loginMethod: LoginMethod;
  branding: {
    primary:    string | null;
    secondary:  string | null;
    accent:     string | null;
    background: string | null;
    logoUrl:    string | null;
  };
  classReminderMinutes: number;
  overdueGraceDays:     number;
}

export async function getTenantSettings(): Promise<TenantSettings> {
  const { data } = await apiClient.get<TenantSettings>("/tenants/me");
  return data;
}

export async function updateLoginMethod(loginMethod: LoginMethod): Promise<{ loginMethod: LoginMethod }> {
  const { data } = await apiClient.patch("/tenants/me/settings", { loginMethod });
  return data;
}

export async function updateNotificationTiming(input: {
  classReminderMinutes?: number;
  overdueGraceDays?:     number;
}): Promise<{ classReminderMinutes: number; overdueGraceDays: number }> {
  const { data } = await apiClient.patch("/tenants/me/settings", input);
  return data;
}

export async function updateBrandingBackground(background: string | null): Promise<void> {
  await apiClient.patch("/tenants/me/settings", { background });
}

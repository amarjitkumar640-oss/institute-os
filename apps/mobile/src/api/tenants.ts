import { apiClient } from "./client";

export type LoginMethod = "phone" | "email_username";

export interface TenantSettings {
  id:          string;
  name:        string;
  slug:        string;
  loginMethod: LoginMethod;
  branding: {
    primary:   string | null;
    secondary: string | null;
    accent:    string | null;
    logoUrl:   string | null;
  };
}

export async function getTenantSettings(): Promise<TenantSettings> {
  const { data } = await apiClient.get<TenantSettings>("/tenants/me");
  return data;
}

export async function updateLoginMethod(loginMethod: LoginMethod): Promise<{ loginMethod: LoginMethod }> {
  const { data } = await apiClient.patch("/tenants/me/settings", { loginMethod });
  return data;
}

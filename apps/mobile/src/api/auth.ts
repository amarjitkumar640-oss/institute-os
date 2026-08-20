import { apiClient } from "./client";

const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? "";

// Always resolves — the API returns { ok: true } whether or not the
// identifier matched an account, by design (never leaks which identifiers
// exist).
export async function forgotPassword(identifier: string): Promise<void> {
  await apiClient.post("/auth/forgot-password", { tenantId: TENANT_ID, identifier });
}

export async function resetPassword(identifier: string, code: string, password: string): Promise<void> {
  await apiClient.post("/auth/reset-password", { tenantId: TENANT_ID, identifier, code, password });
}

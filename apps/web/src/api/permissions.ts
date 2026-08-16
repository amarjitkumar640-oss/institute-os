import { apiClient } from "./client";

export type StaffRole = "admin" | "teacher" | "frontdesk";

export interface PermissionActions {
  canRead: boolean;
  canWrite: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface PermissionScreen {
  key: string;
  label: string;
  module: string;
  platforms: ("web" | "mobile")[];
  roles: Record<StaffRole, PermissionActions>;
}

export interface PermissionGrantUpdate extends PermissionActions {
  screenKey: string;
  role: StaffRole;
}

export async function getPermissions(): Promise<PermissionScreen[]> {
  const { data } = await apiClient.get<PermissionScreen[]>("/api/permissions");
  return data;
}

export async function updatePermissions(grants: PermissionGrantUpdate[]): Promise<void> {
  await apiClient.patch("/api/permissions", grants);
}

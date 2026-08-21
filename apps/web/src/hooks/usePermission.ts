import { useAuth } from "@/context/AuthContext";

export interface PermissionFlags {
  canRead: boolean;
  canWrite: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// Reads the compact "rwed"-style permission claim already carried on
// staff.permissions (resolved server-side at login/select-center) — no
// network call here, this is purely a client-side lookup.
export function usePermission(screenKey: string): PermissionFlags {
  const { staff } = useAuth();
  const letters = staff?.permissions?.[screenKey] ?? "";
  return {
    canRead: letters.includes("r"),
    canWrite: letters.includes("w"),
    canEdit: letters.includes("e"),
    canDelete: letters.includes("d"),
  };
}

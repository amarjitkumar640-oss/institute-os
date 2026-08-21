import { useAuth } from "../context/AuthContext";

export function usePermission(screenKey: string) {
  const { staff } = useAuth();
  const letters = staff?.permissions?.[screenKey] ?? "";
  return {
    canRead:   letters.includes("r"),
    canWrite:  letters.includes("w"),
    canEdit:   letters.includes("e"),
    canDelete: letters.includes("d"),
  };
}

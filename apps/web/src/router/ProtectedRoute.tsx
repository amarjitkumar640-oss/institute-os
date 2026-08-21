import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { usePermission } from "@/hooks/usePermission";

interface ProtectedRouteProps {
  children: React.ReactNode;
  // The permission screen key this route requires "read" access to (see
  // apps/api/src/modules/permissions/registry.ts for valid keys). Omit for
  // routes any authenticated staff can reach regardless of role (dashboard,
  // notifications, batches, schedule — matches today's real access).
  screenKey?: string;
  // Escape hatch for the one screen deliberately EXCLUDED from the
  // permission grid: settings (and everything nested under it — Jobs,
  // Notification Routing, this permission grid itself). Letting an admin
  // revoke their own settings access via the grid they're editing would be
  // a self-lockout hazard, so this stays a hardcoded role check, never a
  // screenKey. Don't reach for this for anything else — new screens belong
  // in the registry, not here.
  adminOnly?: boolean;
}

export function ProtectedRoute({ children, screenKey, adminOnly }: ProtectedRouteProps) {
  const { isAuthenticated, needsCenterPick, staff } = useAuth();
  const { canRead } = usePermission(screenKey ?? "");
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Don't redirect to /pick-center when already there — CenterPickPage is
  // itself wrapped in this guard, so without this check needsCenterPick
  // being true (the exact reason we're on this route) would redirect to
  // the current route forever, and children (the page) would never render.
  if (needsCenterPick && location.pathname !== "/pick-center") return <Navigate to="/pick-center" replace />;
  if (adminOnly && staff?.activeRole !== "admin") return <Navigate to="/dashboard" replace />;
  if (screenKey && !canRead) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

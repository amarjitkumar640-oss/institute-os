import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type StaffRole } from "@/context/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: StaffRole[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { isAuthenticated, needsCenterPick, staff } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Don't redirect to /pick-center when already there — CenterPickPage is
  // itself wrapped in this guard, so without this check needsCenterPick
  // being true (the exact reason we're on this route) would redirect to
  // the current route forever, and children (the page) would never render.
  if (needsCenterPick && location.pathname !== "/pick-center") return <Navigate to="/pick-center" replace />;
  if (roles && staff && !roles.includes(staff.role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

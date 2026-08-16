import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearTokens, getStoredRefreshToken, registerAuthFailureHandler, setTokens } from "@/api/client";
import { selectRole as selectRoleApi } from "@/api/auth";
import { queryClient } from "@/context/QueryProvider";

export type StaffRole = "admin" | "teacher" | "frontdesk";

export interface Center {
  id: string;
  name: string;
  roles: StaffRole[];
}

export interface StaffInfo {
  id: string;
  fullName: string;
  // Every role held at the current center (or the tenant-level fallback in
  // all-centers mode) — the full set the role-switcher can offer.
  roles: StaffRole[];
  // The ONE role currently in effect — every permission check is scoped to
  // this single role, the same way currentCenter scopes everything to one
  // center. Changed via selectRole(), never derived implicitly from `roles`.
  activeRole: StaffRole;
  // Compact per-screen action string ("rwed") resolved for activeRole alone
  // at login/select-center/select-role time — see apps/api's permissions.service.ts.
  permissions: Record<string, string>;
}

export interface Branding {
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  logoUrl: string | null;
}

export interface AuthState {
  staff: StaffInfo | null;
  centers: Center[];
  currentCenter: { id: string; name: string } | null;
  // True once the center-pick step is behind us — independent of whether
  // that resulted in a specific center or "All Centers" (currentCenter null
  // either way). Without this, needsCenterPick can't tell "hasn't picked
  // yet" apart from "explicitly chose All Centers" — both look identical as
  // just currentCenter === null.
  centerPicked: boolean;
  branding: Branding | null;
  accessToken: string | null;
}

interface AuthContextValue extends AuthState {
  login: (data: LoginResponse) => void;
  selectCenter: (
    center: { id: string; name: string } | null,
    newToken: string,
    newRefreshToken: string,
    roles: StaffRole[],
    activeRole: StaffRole,
    permissions: Record<string, string>,
  ) => void;
  // Switches which of your held roles is currently in effect, without
  // changing center — hits the API (mirrors selectCenter) since access
  // control must be re-scoped server-side, not just relabeled client-side.
  selectRole: (role: StaffRole) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  needsCenterPick: boolean;
  isAllCenters: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  staff: StaffInfo;
  centers: Center[];
  currentCenter: { id: string; name: string } | null;
  branding: Branding;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "auth_state";

function loadFromStorage(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState;
    // A session saved before activeRole existed (or any other required
    // field is missing) can't be trusted — every screen assumes
    // staff.activeRole is always present and crashes otherwise. Discard it
    // here rather than patch every read site; the next login saves a
    // correctly-shaped one.
    if (parsed.staff && !parsed.staff.activeRole) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const stored = loadFromStorage();
    if (stored?.accessToken && getStoredRefreshToken()) {
      setTokens(stored.accessToken, getStoredRefreshToken()!);
      return stored;
    }
    return { staff: null, centers: [], currentCenter: null, centerPicked: false, branding: null, accessToken: null };
  });

  const logout = useCallback(() => {
    clearTokens();
    localStorage.removeItem(STORAGE_KEY);
    setState({ staff: null, centers: [], currentCenter: null, centerPicked: false, branding: null, accessToken: null });
    // Drop every cached query outright — nothing should carry over into
    // whichever session (or staff member) logs in next in this browser.
    queryClient.clear();
  }, []);

  useEffect(() => {
    registerAuthFailureHandler(logout);
  }, [logout]);

  const login = useCallback((data: LoginResponse) => {
    setTokens(data.accessToken, data.refreshToken);
    const next: AuthState = {
      staff: data.staff,
      centers: data.centers,
      currentCenter: data.currentCenter,
      // 0 or 1 centers: login already resolved it, no pick screen needed.
      // 2+: stays false until they actually go through /pick-center.
      centerPicked: data.centers.length <= 1,
      branding: data.branding,
      accessToken: data.accessToken,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
    // No page reload happens on login — anything already mounted (rare, but
    // possible via the browser back button) must refetch under the new token.
    queryClient.invalidateQueries();
  }, []);

  const selectCenter = useCallback((
    center: { id: string; name: string } | null,
    newToken: string,
    newRefreshToken: string,
    roles: StaffRole[],
    activeRole: StaffRole,
    permissions: Record<string, string>,
  ) => {
    setTokens(newToken, newRefreshToken);
    setState((prev) => {
      // roles/activeRole/permissions can genuinely differ per center
      // (CenterStaff.roles), so this must update staff, not just the
      // center/token fields — otherwise the UI keeps showing controls for
      // whatever roles the staff member had in their *previous* center
      // after switching. Switching centers always resets activeRole to that
      // center's most-privileged role — same as the API does.
      const next = {
        ...prev,
        staff: prev.staff ? { ...prev.staff, roles, activeRole, permissions } : prev.staff,
        currentCenter: center,
        centerPicked: true,
        accessToken: newToken,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    // The new token scopes every request to a different center — every
    // cached query (dashboard, students, batches, ...) is stale the instant
    // this resolves, regardless of query key or staleTime. Without this,
    // already-mounted pages keep rendering the old center's data until a
    // manual reload.
    queryClient.invalidateQueries();
  }, []);

  // Mirrors selectCenter exactly, but along the role axis — the API
  // validates you actually hold the requested role at your current center
  // before issuing a re-scoped token.
  const selectRole = useCallback(async (role: StaffRole) => {
    const data = await selectRoleApi(role);
    setTokens(data.accessToken, data.refreshToken);
    setState((prev) => {
      const next = {
        ...prev,
        staff: prev.staff ? { ...prev.staff, roles: data.roles, activeRole: data.activeRole, permissions: data.permissions } : prev.staff,
        accessToken: data.accessToken,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    // Every screen's access/content can differ under the new active role —
    // same reasoning as selectCenter's invalidation above.
    queryClient.invalidateQueries();
  }, []);

  const isAuthenticated = !!state.staff && !!state.accessToken;
  const needsCenterPick = isAuthenticated && !state.centerPicked;
  // True only once the pick gate is behind us and no specific center is
  // pinned — excludes the pre-auth and pre-pick windows, which also have
  // currentCenter === null but aren't genuine "All Centers" mode.
  const isAllCenters = isAuthenticated && !needsCenterPick && !state.currentCenter;

  return (
    <AuthContext.Provider value={{ ...state, login, selectCenter, selectRole, logout, isAuthenticated, needsCenterPick, isAllCenters }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

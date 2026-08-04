import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearTokens, getStoredRefreshToken, registerAuthFailureHandler, setTokens } from "@/api/client";
import { queryClient } from "@/context/QueryProvider";

export type StaffRole = "admin" | "teacher" | "frontdesk";

export interface Center {
  id: string;
  name: string;
  role: StaffRole;
}

export interface StaffInfo {
  id: string;
  fullName: string;
  role: StaffRole;
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
  branding: Branding | null;
  accessToken: string | null;
}

interface AuthContextValue extends AuthState {
  login: (data: LoginResponse) => void;
  selectCenter: (center: { id: string; name: string } | null, newToken: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  needsCenterPick: boolean;
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
    return JSON.parse(raw) as AuthState;
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
    return { staff: null, centers: [], currentCenter: null, branding: null, accessToken: null };
  });

  const logout = useCallback(() => {
    clearTokens();
    localStorage.removeItem(STORAGE_KEY);
    setState({ staff: null, centers: [], currentCenter: null, branding: null, accessToken: null });
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
      branding: data.branding,
      accessToken: data.accessToken,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
    // No page reload happens on login — anything already mounted (rare, but
    // possible via the browser back button) must refetch under the new token.
    queryClient.invalidateQueries();
  }, []);

  const selectCenter = useCallback((center: { id: string; name: string } | null, newToken: string) => {
    setTokens(newToken, getStoredRefreshToken() ?? "");
    setState((prev) => {
      const next = { ...prev, currentCenter: center, accessToken: newToken };
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

  const isAuthenticated = !!state.staff && !!state.accessToken;
  const needsCenterPick = isAuthenticated && !state.currentCenter && state.centers.length > 1;

  return (
    <AuthContext.Provider value={{ ...state, login, selectCenter, logout, isAuthenticated, needsCenterPick }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

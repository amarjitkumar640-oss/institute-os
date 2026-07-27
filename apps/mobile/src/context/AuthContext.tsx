import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
  apiClient,
  clearAccessToken, clearRefreshToken,
  getAccessToken,
  storeAccessToken, storeRefreshToken,
  registerUnauthorizedHandler,
} from "../api/client";

const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? "";

export interface CenterInfo {
  id:   string;
  name: string;
  role: "admin" | "teacher" | "frontdesk";
}

export interface StaffInfo {
  id:       string;
  fullName: string;
  role:     "admin" | "teacher" | "frontdesk";
}

interface AuthContextValue {
  staff:          StaffInfo | null;
  currentCenter:  CenterInfo | null;   // null = all-centers mode (after center selection)
  isAllCenters:   boolean;
  pendingCenters: CenterInfo[] | null; // non-null only between login and center pick
  isLoading:      boolean;
  login:         (identifier: string, password: string) => Promise<{ needsCenterSelect: boolean }>;
  selectCenter:  (centerId: string | null) => Promise<void>;
  switchCenter:  () => Promise<void>; // re-surface the center picker from within the app
  logout:        () => Promise<void>;
}

const STAFF_KEY  = "auth_staff";
const CENTER_KEY = "auth_center";
const lastCenterKey = (staffId: string) => `last_center_${staffId}`;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [staff,          setStaff]          = useState<StaffInfo | null>(null);
  const [currentCenter,  setCurrentCenter]  = useState<CenterInfo | null>(null);
  const [pendingCenters, setPendingCenters] = useState<CenterInfo[] | null>(null);
  const [isLoading,      setIsLoading]      = useState(true);

  // Wire the 401 interceptor to our logout function so any expired/invalid
  // token anywhere in the app immediately returns the user to the login screen.
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setStaff(null);
      setCurrentCenter(null);
      setPendingCenters(null);
    });
  }, []);

  // Restore persisted session on mount
  useEffect(() => {
    (async () => {
      try {
        const [token, staffJson, centerJson] = await Promise.all([
          getAccessToken(),
          SecureStore.getItemAsync(STAFF_KEY),
          SecureStore.getItemAsync(CENTER_KEY),
        ]);

        if (token && staffJson) {
          setStaff(JSON.parse(staffJson));
          // centerJson being the string "null" means all-centers mode was active
          if (centerJson && centerJson !== "null") {
            setCurrentCenter(JSON.parse(centerJson));
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function login(identifier: string, password: string): Promise<{ needsCenterSelect: boolean }> {
    const { data } = await apiClient.post("/auth/login", { tenantId: TENANT_ID, identifier, password });
    const centers: CenterInfo[] = data.centers ?? [];

    await storeAccessToken(data.accessToken);
    if (data.refreshToken) await storeRefreshToken(data.refreshToken);
    await SecureStore.setItemAsync(STAFF_KEY, JSON.stringify(data.staff));
    setStaff(data.staff);

    if (centers.length <= 1) {
      // Single center auto-selected — token is already scoped
      const center: CenterInfo | null = data.currentCenter ?? centers[0] ?? null;
      setCurrentCenter(center);
      await SecureStore.setItemAsync(CENTER_KEY, JSON.stringify(center));
      return { needsCenterSelect: false };
    }

    // Multiple centers — check for a saved preference from a previous session
    const savedId   = await SecureStore.getItemAsync(lastCenterKey(data.staff.id));
    const preferred = savedId ? centers.find((c) => c.id === savedId) : null;

    if (preferred) {
      const { data: sd } = await apiClient.post("/auth/select-center", { centerId: preferred.id });
      await storeAccessToken(sd.accessToken);
      const center: CenterInfo | null = sd.center
        ? { ...sd.center, role: preferred.role }
        : null;
      setCurrentCenter(center);
      await SecureStore.setItemAsync(CENTER_KEY, JSON.stringify(center));
      return { needsCenterSelect: false };
    }

    // No saved preference — surface the picker screen
    setPendingCenters(centers);
    return { needsCenterSelect: true };
  }

  async function selectCenter(centerId: string | null) {
    const { data } = await apiClient.post("/auth/select-center", { centerId });
    await storeAccessToken(data.accessToken);

    // data.center is null in all-centers mode
    const center: CenterInfo | null = data.center
      ? {
          ...data.center,
          role: pendingCenters?.find((c) => c.id === centerId)?.role ?? "admin",
        }
      : null;

    setCurrentCenter(center);
    setPendingCenters(null);
    await SecureStore.setItemAsync(CENTER_KEY, JSON.stringify(center));

    // Persist preference so next login auto-selects this center
    if (centerId && staff) {
      await SecureStore.setItemAsync(lastCenterKey(staff.id), centerId);
    }
  }

  async function switchCenter() {
    // Re-fetch this staff member's assigned centers from the API and re-show the picker.
    // Only truly a no-op when there are zero centers to choose from — a single
    // assignment still needs to be shown so the user can select into it (e.g. right
    // after being auto-assigned to a newly-created center, before their session
    // token has been refreshed to reflect it).
    const { data } = await apiClient.get<CenterInfo[]>("/centers");
    if (data.length === 0) return;
    setPendingCenters(data);
  }

  async function logout() {
    await Promise.all([
      clearAccessToken(),
      clearRefreshToken(),
      SecureStore.deleteItemAsync(STAFF_KEY),
      SecureStore.deleteItemAsync(CENTER_KEY),
    ]);
    setStaff(null);
    setCurrentCenter(null);
    setPendingCenters(null);
  }

  // All-centers mode = logged in, center selection done, but no specific center pinned
  const isAllCenters = staff !== null && currentCenter === null && pendingCenters === null;

  return (
    <AuthContext.Provider
      value={{ staff, currentCenter, isAllCenters, pendingCenters, isLoading, login, selectCenter, switchCenter, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

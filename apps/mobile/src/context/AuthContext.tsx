import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
  apiClient,
  clearAccessToken, clearRefreshToken,
  getAccessToken,
  storeAccessToken, storeRefreshToken,
  registerUnauthorizedHandler,
} from "../api/client";
import { useSetBrandColors } from "./ThemeContext";
import { registerPushToken, deregisterPushToken } from "../lib/pushNotifications";

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
  // True only when pendingCenters was surfaced by switchCenter() (a session
  // already exists) rather than login() (no session to fall back to yet) —
  // lets the picker's back button know whether "back" means cancel-back-in
  // or log-out.
  isSwitchingCenter: boolean;
  cancelCenterSwitch: () => void;
  // True only when this staff has zero CenterStaff assignments — distinct
  // from isAllCenters, which is also true for a genuine 2+-center staff who
  // chose the aggregate view. RootNavigator gates on this before the normal
  // app ever mounts, so screens that read isAllCenters never see this case.
  noCentersAssigned: boolean;
  recheckCenterAssignment: () => Promise<void>;
  logout:        () => Promise<void>;
}

const STAFF_KEY  = "auth_staff";
const CENTER_KEY = "auth_center";
const lastCenterKey = (staffId: string) => `last_center_${staffId}`;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setBrandColors = useSetBrandColors();
  const [staff,          setStaff]          = useState<StaffInfo | null>(null);
  const [currentCenter,  setCurrentCenter]  = useState<CenterInfo | null>(null);
  const [pendingCenters, setPendingCenters] = useState<CenterInfo[] | null>(null);
  const [isLoading,      setIsLoading]      = useState(true);
  const [isSwitchingCenter, setIsSwitchingCenter] = useState(false);
  const [noCentersAssigned, setNoCentersAssigned] = useState(false);

  // Re-checks this staff's own CenterStaff assignments and updates state
  // accordingly: 0 → flag it, 1 → silently auto-select it (same as the
  // single-center login path), 2+ → clear the flag and stay in All Centers
  // mode. Shared by the mount-restore effect and the "Refresh" action on
  // NoCenterAssignedScreen, so there's exactly one place this logic lives.
  async function recheckCenterAssignment() {
    try {
      const { data: myCenters } = await apiClient.get<CenterInfo[]>("/centers");
      if (myCenters.length === 0) {
        setNoCentersAssigned(true);
      } else if (myCenters.length === 1) {
        setNoCentersAssigned(false);
        const { data: sd } = await apiClient.post("/auth/select-center", { centerId: myCenters[0].id });
        await storeAccessToken(sd.accessToken);
        const center = myCenters[0];
        setCurrentCenter(center);
        await SecureStore.setItemAsync(CENTER_KEY, JSON.stringify(center));
      } else {
        setNoCentersAssigned(false);
        // 2+: stays in All Centers mode, currentCenter remains null
      }
    } catch {
      // Network unavailable — leave state as-is, caller can retry
    }
  }

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
          if (centerJson && centerJson !== "null") {
            setCurrentCenter(JSON.parse(centerJson));
          } else if (centerJson === "null") {
            // Was in All Centers mode (or had zero assignments) — re-validate
            // against this staff's own current assignments.
            await recheckCenterAssignment();
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
    if (data.branding) setBrandColors(data.branding);

    // Register for push notifications after successful auth (fire-and-forget)
    registerPushToken().catch(console.error);

    // Reset here (not just in the branch below) so re-logging in as a
    // different, now-assigned staff on the same device clears a stale flag.
    setNoCentersAssigned(false);

    if (centers.length <= 1) {
      // Single center auto-selected — token is already scoped. 0 centers is
      // also handled by this branch (data.currentCenter/centers[0] both
      // resolve to null), just flagged so RootNavigator can show why.
      const center: CenterInfo | null = data.currentCenter ?? centers[0] ?? null;
      setCurrentCenter(center);
      setNoCentersAssigned(centers.length === 0);
      await SecureStore.setItemAsync(CENTER_KEY, JSON.stringify(center));
      return { needsCenterSelect: false };
    }

    // Multiple centers — check for a saved preference from a previous session
    const savedId   = await SecureStore.getItemAsync(lastCenterKey(data.staff.id));

    if (savedId === "__all__") {
      // User previously chose "All Centers" — restore that without showing picker
      const { data: sd } = await apiClient.post("/auth/select-center", { centerId: null });
      await storeAccessToken(sd.accessToken);
      setCurrentCenter(null);
      await SecureStore.setItemAsync(CENTER_KEY, JSON.stringify(null));
      return { needsCenterSelect: false };
    }

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
    setIsSwitchingCenter(false);
    await SecureStore.setItemAsync(CENTER_KEY, JSON.stringify(center));

    // Persist preference so next login auto-selects this center (or all-centers mode)
    if (staff) {
      await SecureStore.setItemAsync(lastCenterKey(staff.id), centerId ?? "__all__");
    }
  }

  async function switchCenter() {
    // Only centers this staff is actually assigned to (same source as
    // login) — not /centers/assignable, which is deliberately tenant-wide
    // for the "attach a new record to any center" create-flow picker, a
    // different concern from "which center do I want to work in."
    const { data } = await apiClient.get<CenterInfo[]>("/centers");
    if (data.length === 0) return;
    setPendingCenters(data);
    setIsSwitchingCenter(true);
  }

  // Dismisses the picker without changing anything — only valid mid-session
  // (isSwitchingCenter), since currentCenter/isAllCenters were never touched
  // by switchCenter() in the first place, so there's nothing to restore.
  function cancelCenterSwitch() {
    setPendingCenters(null);
    setIsSwitchingCenter(false);
  }

  async function logout() {
    deregisterPushToken().catch(console.error);
    await Promise.all([
      clearAccessToken(),
      clearRefreshToken(),
      SecureStore.deleteItemAsync(STAFF_KEY),
      SecureStore.deleteItemAsync(CENTER_KEY),
    ]);
    setStaff(null);
    setCurrentCenter(null);
    setPendingCenters(null);
    setIsSwitchingCenter(false);
    setNoCentersAssigned(false);
  }

  // All-centers mode = logged in, center selection done, but no specific center pinned
  const isAllCenters = staff !== null && currentCenter === null && pendingCenters === null;

  return (
    <AuthContext.Provider
      value={{
        staff, currentCenter, isAllCenters, pendingCenters, isLoading,
        login, selectCenter, switchCenter, isSwitchingCenter, cancelCenterSwitch,
        noCentersAssigned, recheckCenterAssignment, logout,
      }}
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

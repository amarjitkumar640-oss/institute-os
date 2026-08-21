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
import { invalidateDashboardCache } from "../api/dashboard";

const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? "";

export interface CenterInfo {
  id:   string;
  name: string;
  // A staff member can hold more than one role at once (e.g. admin +
  // teacher at the same center).
  roles: ("admin" | "teacher" | "frontdesk")[];
}

export type StaffRole = "admin" | "teacher" | "frontdesk";

export interface StaffInfo {
  id:       string;
  fullName: string;
  // Signed URL, resolved fresh at login time — null when no photo is set.
  // Not re-resolved by selectCenter()/selectRole() (they don't touch it),
  // so it's carried forward via state spread until it naturally goes stale;
  // the signed URL's own 1-hour expiry is a pre-existing tradeoff shared
  // with Student.photoUrl, not something new introduced here.
  photoUrl: string | null;
  // Every role held at the current center (or the tenant-level fallback in
  // all-centers mode) — the full set the role-switcher can offer.
  roles:    StaffRole[];
  // The ONE role currently in effect — every permission check is scoped to
  // this single role, the same way currentCenter scopes everything to one
  // center. Changed via selectRole(), never derived implicitly from `roles`.
  activeRole: StaffRole;
  // Compact per-screen action string ("rwed") resolved for activeRole alone
  // at login/select-center/select-role time — see apps/api's permissions.service.ts.
  permissions: Record<string, string>;
}

interface AuthContextValue {
  staff:          StaffInfo | null;
  currentCenter:  CenterInfo | null;   // null = all-centers mode (after center selection)
  isAllCenters:   boolean;
  pendingCenters: CenterInfo[] | null; // non-null only between login and center pick
  isLoading:      boolean;
  login:         (identifier: string, password: string) => Promise<{ needsCenterSelect: boolean }>;
  selectCenter:  (centerId: string | null) => Promise<void>;
  // Switches which of your held roles is currently in effect, without
  // changing center — hits the API (mirrors selectCenter) since access
  // control must be re-scoped server-side, not just relabeled client-side.
  selectRole:    (role: StaffRole) => Promise<void>;
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
  // Whether this staff member is assigned to 2+ centers — drives whether a
  // dashboard's center chip is a tappable switcher or a static label, the
  // same way staff.roles.length > 1 already does for the role chip. Unlike
  // roles (persisted on the staff object itself), the center list isn't
  // normally kept around after selection, so this needs its own persisted
  // flag rather than being derived on the fly.
  hasMultipleCenters: boolean;
  // Updates just the local staff.photoUrl (state + persisted copy) after a
  // self-service upload/remove — the upload/delete API calls themselves
  // live in api/staff.ts (uploadMyPhoto/deleteMyPhoto) since they're plain
  // one-shot requests, not session-mutating like selectCenter/selectRole.
  updateProfilePhoto: (photoUrl: string | null) => Promise<void>;
  logout:        () => Promise<void>;
}

// Exported so AppLockContext can check for a persisted session directly,
// without depending on this context's (async-restored) `staff` state.
export const STAFF_KEY  = "auth_staff";
const CENTER_KEY = "auth_center";
const MULTI_CENTER_KEY = "auth_has_multiple_centers";
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
  const [hasMultipleCenters, setHasMultipleCenters] = useState(false);

  // Re-checks this staff's own CenterStaff assignments and updates state
  // accordingly: 0 → flag it, 1 → silently auto-select it (same as the
  // single-center login path), 2+ → clear the flag and stay in All Centers
  // mode. Shared by the mount-restore effect and the "Refresh" action on
  // NoCenterAssignedScreen, so there's exactly one place this logic lives.
  async function recheckCenterAssignment() {
    try {
      const { data: myCenters } = await apiClient.get<CenterInfo[]>("/centers");
      const multi = myCenters.length > 1;
      setHasMultipleCenters(multi);
      await SecureStore.setItemAsync(MULTI_CENTER_KEY, multi ? "1" : "0");
      if (myCenters.length === 0) {
        setNoCentersAssigned(true);
      } else if (myCenters.length === 1) {
        setNoCentersAssigned(false);
        const { data: sd } = await apiClient.post("/auth/select-center", { centerId: myCenters[0].id });
        await storeAccessToken(sd.accessToken);
        if (sd.refreshToken) await storeRefreshToken(sd.refreshToken);
        invalidateDashboardCache();
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
        const [token, staffJson, centerJson, multiCenterJson] = await Promise.all([
          getAccessToken(),
          SecureStore.getItemAsync(STAFF_KEY),
          SecureStore.getItemAsync(CENTER_KEY),
          SecureStore.getItemAsync(MULTI_CENTER_KEY),
        ]);

        if (token && staffJson) {
          const parsedStaff = JSON.parse(staffJson);
          // A session saved before activeRole existed (or any other required
          // field is missing) can't be trusted — every screen assumes
          // staff.activeRole is always present and crashes otherwise. Rather
          // than patch every read site, discard the stale session here and
          // fall through to the logged-out state; the next login saves a
          // correctly-shaped one.
          if (!parsedStaff?.activeRole) {
            await Promise.all([
              clearAccessToken(),
              clearRefreshToken(),
              SecureStore.deleteItemAsync(STAFF_KEY),
              SecureStore.deleteItemAsync(CENTER_KEY),
            ]);
          } else {
            setStaff(parsedStaff);
            if (centerJson && centerJson !== "null") {
              setCurrentCenter(JSON.parse(centerJson));
              setHasMultipleCenters(multiCenterJson === "1");
            } else if (centerJson === "null") {
              // Was in All Centers mode (or had zero assignments) — re-validate
              // against this staff's own current assignments.
              await recheckCenterAssignment();
            }
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
    setHasMultipleCenters(centers.length > 1);
    await SecureStore.setItemAsync(MULTI_CENTER_KEY, centers.length > 1 ? "1" : "0");

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
      if (sd.refreshToken) await storeRefreshToken(sd.refreshToken);
      setCurrentCenter(null);
      // All-centers roles/permissions can differ from the auto-resolved
      // (centers.length>1 → staff.roles fallback) value already in data.staff
      // — same bug class as the center-specific branch below. Persist to
      // STAFF_KEY too, not just React state, so an app restart doesn't
      // revert to the stale login-time roles.
      const updatedStaff = { ...data.staff, roles: sd.roles, activeRole: sd.activeRole, permissions: sd.permissions };
      setStaff(updatedStaff);
      await SecureStore.setItemAsync(STAFF_KEY, JSON.stringify(updatedStaff));
      await SecureStore.setItemAsync(CENTER_KEY, JSON.stringify(null));
      return { needsCenterSelect: false };
    }

    const preferred = savedId ? centers.find((c) => c.id === savedId) : null;

    if (preferred) {
      const { data: sd } = await apiClient.post("/auth/select-center", { centerId: preferred.id });
      await storeAccessToken(sd.accessToken);
      if (sd.refreshToken) await storeRefreshToken(sd.refreshToken);
      const center: CenterInfo | null = sd.center
        ? { ...sd.center, roles: preferred.roles }
        : null;
      setCurrentCenter(center);
      // sd.roles/sd.activeRole/sd.permissions reflect this specific center's
      // CenterStaff.roles, which can differ from the login response's
      // staff.roles (resolved from the multi-center fallback) — update
      // staff state so it doesn't go stale.
      const updatedStaff = { ...data.staff, roles: sd.roles, activeRole: sd.activeRole, permissions: sd.permissions };
      setStaff(updatedStaff);
      await SecureStore.setItemAsync(STAFF_KEY, JSON.stringify(updatedStaff));
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
    if (data.refreshToken) await storeRefreshToken(data.refreshToken);
    // Every count on the dashboard is scoped to whichever center's JWT claim
    // was just replaced above — the old cached response belongs to the
    // previous center and must not survive the switch.
    invalidateDashboardCache();

    // data.center is null in all-centers mode
    const center: CenterInfo | null = data.center
      ? {
          ...data.center,
          roles: pendingCenters?.find((c) => c.id === centerId)?.roles ?? ["admin"],
        }
      : null;

    setCurrentCenter(center);
    // roles/activeRole/permissions can genuinely differ per center
    // (CenterStaff.roles) — update staff (and its persisted copy) so the UI
    // stops showing controls for whatever roles this staff member had in
    // their previous center, and an app restart doesn't revert to the stale
    // pre-switch roles. Switching centers always resets activeRole to that
    // center's most-privileged held role — same as the API does.
    if (staff) {
      const updatedStaff = { ...staff, roles: data.roles, activeRole: data.activeRole, permissions: data.permissions };
      setStaff(updatedStaff);
      await SecureStore.setItemAsync(STAFF_KEY, JSON.stringify(updatedStaff));
    }
    setPendingCenters(null);
    setIsSwitchingCenter(false);
    await SecureStore.setItemAsync(CENTER_KEY, JSON.stringify(center));

    // Persist preference so next login auto-selects this center (or all-centers mode)
    if (staff) {
      await SecureStore.setItemAsync(lastCenterKey(staff.id), centerId ?? "__all__");
    }
  }

  // Mirrors selectCenter exactly, but along the role axis — the API
  // validates you actually hold the requested role at your current center
  // before issuing a re-scoped token.
  async function selectRole(role: StaffRole) {
    const { data } = await apiClient.post("/auth/select-role", { role });
    await storeAccessToken(data.accessToken);
    if (data.refreshToken) await storeRefreshToken(data.refreshToken);
    // Every screen's access/content can differ under the new active role —
    // same reasoning as selectCenter's cache invalidation.
    invalidateDashboardCache();

    if (staff) {
      const updatedStaff = { ...staff, roles: data.roles, activeRole: data.activeRole, permissions: data.permissions };
      setStaff(updatedStaff);
      await SecureStore.setItemAsync(STAFF_KEY, JSON.stringify(updatedStaff));
    }
  }

  async function updateProfilePhoto(photoUrl: string | null) {
    if (!staff) return;
    const updatedStaff = { ...staff, photoUrl };
    setStaff(updatedStaff);
    await SecureStore.setItemAsync(STAFF_KEY, JSON.stringify(updatedStaff));
  }

  async function switchCenter() {
    // Only centers this staff is actually assigned to (same source as
    // login) — not /centers/assignable, which is deliberately tenant-wide
    // for the "attach a new record to any center" create-flow picker, a
    // different concern from "which center do I want to work in."
    const { data } = await apiClient.get<CenterInfo[]>("/centers");
    if (data.length === 0) return;
    setHasMultipleCenters(data.length > 1);
    await SecureStore.setItemAsync(MULTI_CENTER_KEY, data.length > 1 ? "1" : "0");
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
      SecureStore.deleteItemAsync(MULTI_CENTER_KEY),
    ]);
    setStaff(null);
    setCurrentCenter(null);
    setPendingCenters(null);
    setIsSwitchingCenter(false);
    setNoCentersAssigned(false);
    setHasMultipleCenters(false);
  }

  // All-centers mode = logged in, center selection done, but no specific center pinned
  const isAllCenters = staff !== null && currentCenter === null && pendingCenters === null;

  return (
    <AuthContext.Provider
      value={{
        staff, currentCenter, isAllCenters, pendingCenters, isLoading,
        login, selectCenter, selectRole, switchCenter, isSwitchingCenter, cancelCenterSwitch,
        noCentersAssigned, recheckCenterAssignment, hasMultipleCenters, updateProfilePhoto, logout,
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

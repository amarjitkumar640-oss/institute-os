import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Application from "expo-application";
import { apiClient } from "../api/client";

const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? "";
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min, same cadence as otaUpdates.ts

export interface LatestRelease {
  versionName: string;
  versionCode: number;
  changelog:   string | null;
  downloadUrl: string;
}

interface AppUpdateContextValue {
  updateAvailable: boolean;
  release: LatestRelease | null;
  // Signed downloadUrl expires (30 min server-side) — call this right
  // before starting a download rather than relying on whatever URL was
  // fetched when the banner first appeared, in case time has passed.
  refetchLatest: () => Promise<LatestRelease | null>;
}

const AppUpdateContext = createContext<AppUpdateContextValue | undefined>(undefined);

export function AppUpdateProvider({ children }: { children: React.ReactNode }) {
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const lastCheckAt = useRef(0);

  const refetchLatest = useCallback(async (): Promise<LatestRelease | null> => {
    if (!TENANT_ID) return null;
    try {
      // Explicit ?audience=staff — this installed app is always the staff
      // build today, so it only ever checks the staff release line, not
      // relying on the server's default (which could change later).
      const { data } = await apiClient.get<LatestRelease>(`/app-releases/${TENANT_ID}/latest?audience=staff`);
      setRelease(data);
      return data;
    } catch {
      // No release registered yet, tenant offline, etc. — not an error
      // state worth surfacing; just means no update banner shows.
      return null;
    }
  }, []);

  useEffect(() => {
    refetchLatest();
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) return;
      lastCheckAt.current = now;
      refetchLatest();
    });
    return () => sub.remove();
  }, [refetchLatest]);

  const installedVersionCode = Application.nativeBuildVersion ? Number(Application.nativeBuildVersion) : 0;
  const updateAvailable = !!release && release.versionCode > installedVersionCode;

  return (
    <AppUpdateContext.Provider value={{ updateAvailable, release, refetchLatest }}>
      {children}
    </AppUpdateContext.Provider>
  );
}

export function useAppUpdate() {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) throw new Error("useAppUpdate must be used within AppUpdateProvider");
  return ctx;
}

import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { apiClient } from "../api/client";
import { useSetBrandColors, type TenantBranding } from "./ThemeContext";

const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? "";
const ORG_CACHE_KEY = "org_public_cache";

export type LoginMethod = "phone" | "email_username";

interface OrgContextValue {
  name:        string | null;
  loginMethod: LoginMethod;
  isLoading:   boolean;
  /** Set only when the app's baked-in tenant ID is missing/invalid or the org fetch failed — a build/config problem, not a normal offline case. */
  configError: boolean;
}

interface CachedOrgData {
  name: string;
  loginMethod: LoginMethod;
  branding: TenantBranding;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

// Fetched at launch, before the login screen ever renders — the
// organization is baked into this build (EXPO_PUBLIC_TENANT_ID), so there's
// no need to resolve it from anything the user types.
//
// A cached copy of the last-seen response is restored immediately on mount
// (SecureStore — local, no network) so the splash screen doesn't have to
// block on a live network round-trip on every single cold start; only a
// genuine first-ever launch (nothing cached yet) waits on the real fetch.
// The live fetch still always runs in the background to keep the cache
// fresh — it just no longer gates the first paint once a cache exists.
export function OrgProvider({ children }: { children: React.ReactNode }) {
  const setBrandColors = useSetBrandColors();
  const [name, setName] = useState<string | null>(null);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email_username");
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    if (!TENANT_ID) {
      setConfigError(true);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const cachePromise = SecureStore.getItemAsync(ORG_CACHE_KEY)
      .then((raw) => (raw ? (JSON.parse(raw) as CachedOrgData) : null))
      .catch(() => null);

    cachePromise.then((cached) => {
      if (cancelled || !cached) return;
      setName(cached.name);
      setLoginMethod(cached.loginMethod);
      setBrandColors(cached.branding);
      setIsLoading(false);
    });

    (async () => {
      try {
        const { data } = await apiClient.get(`/tenants/${TENANT_ID}/public`);
        if (cancelled) return;
        setName(data.name);
        setLoginMethod(data.loginMethod ?? "email_username");
        setBrandColors(data.branding);
        SecureStore.setItemAsync(ORG_CACHE_KEY, JSON.stringify({
          name: data.name,
          loginMethod: data.loginMethod ?? "email_username",
          branding: data.branding,
        })).catch(() => {});
      } catch {
        // Only a real problem if there's no cached copy to fall back on —
        // wait for the (local, fast) cache read to settle before deciding,
        // so a slow-but-cached launch never flashes a false config error.
        const cached = await cachePromise;
        if (!cancelled && !cached) setConfigError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <OrgContext.Provider value={{ name, loginMethod, isLoading, configError }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}

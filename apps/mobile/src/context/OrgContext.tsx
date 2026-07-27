import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useSetBrandColors } from "./ThemeContext";

const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? "";

export type LoginMethod = "phone" | "email_username";

interface OrgContextValue {
  name:        string | null;
  loginMethod: LoginMethod;
  isLoading:   boolean;
  /** Set only when the app's baked-in tenant ID is missing/invalid or the org fetch failed — a build/config problem, not a normal offline case. */
  configError: boolean;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

// Fetched once at launch, before the login screen ever renders — the
// organization is baked into this build (EXPO_PUBLIC_TENANT_ID), so there's
// no need to resolve it from anything the user types.
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
    apiClient.get(`/tenants/${TENANT_ID}/public`)
      .then(({ data }) => {
        setName(data.name);
        setLoginMethod(data.loginMethod ?? "email_username");
        setBrandColors(data.branding);
      })
      .catch(() => setConfigError(true))
      .finally(() => setIsLoading(false));
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

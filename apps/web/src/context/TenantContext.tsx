import React, { createContext, useCallback, useContext, useState } from "react";
import { getTenantBySlug } from "@/api/auth";

// Resolves which tenant this browser session is for, at RUNTIME — unlike the
// mobile app, the web portal doesn't need a separate build per tenant (no
// app-store bundle ID/icon constraint), so one deployed build can serve every
// institute. Resolution source, in priority order:
//   1. Previously resolved via /org/:slug this session (localStorage)
//   2. VITE_TENANT_ID build-time fallback (keeps local dev / a single-tenant
//      deployment working with zero config, unchanged from before)
// A fresh /org/:slug visit always overwrites whichever of the two was active.

const STORAGE_KEY = "resolved_tenant_id";
// Written alongside STORAGE_KEY whenever a tenant's branding is known, and
// read synchronously by index.html's inline script before React mounts —
// see that file for why (avoids a flash of the default color on load).
const PRIMARY_STORAGE_KEY = "resolved_tenant_primary";
const DEFAULT_TENANT_ID = import.meta.env.VITE_TENANT_ID as string | undefined;

interface TenantContextValue {
  tenantId: string | null;
  resolveSlug: (slug: string) => Promise<boolean>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

function loadStoredTenantId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantId] = useState<string | null>(
    () => loadStoredTenantId() || DEFAULT_TENANT_ID || null
  );

  const resolveSlug = useCallback(async (slug: string): Promise<boolean> => {
    try {
      const tenant = await getTenantBySlug(slug);
      setTenantId(tenant.id);
      localStorage.setItem(STORAGE_KEY, tenant.id);
      const primary = tenant.branding.primary ?? "#7C3AED";
      localStorage.setItem(PRIMARY_STORAGE_KEY, primary);
      document.documentElement.style.setProperty("--color-primary", primary);
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <TenantContext.Provider value={{ tenantId, resolveSlug }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}

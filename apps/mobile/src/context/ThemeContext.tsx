import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import * as SecureStore from "expo-secure-store";

const DEFAULT_COLORS = {
  primary: "#8B1E3F",
  secondary: "#F5B301",
  accent: "#2CA6A4",
  orange: "#E8752C",
  blue: "#2563A8",
  purple: "#5B2D8E",
  green: "#1B9C63",
  red: "#C0392B",
  purpleBg: "#F3EDFF",
  greenBg: "#EAF7F1",
  bg: "#F4F1EC",
  card: "#FFFFFF",
  text: "#2B1B1F",
  muted: "#8A7F82",
  placeholder: "#B8ACAF",
  border: "#EDE8E3",
  inputBg: "#FAF6F4",
} as const;

export type ColorToken = keyof typeof DEFAULT_COLORS | "safeArea" | "screenBg" | "headerBg" | "headerText";
export type ThemeColors = Record<ColorToken, string>;

// Returns "#FFFFFF" for dark backgrounds, "#2B1B1F" (C.text) for light ones.
// Uses perceived brightness: (R×299 + G×587 + B×114) / 1000 — threshold 128.
export function contrastColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128 ? "#FFFFFF" : "#2B1B1F";
}

export interface TenantBranding {
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
  background?: string | null;
  headerBg?: string | null;
  logoUrl?: string | null;
}

// Darkens/lightens a "#rrggbb" color by `amount` (0–1). Used to derive shades
// (status-bar area, header gradient stops) from a single tenant-configured
// color, so tenants never have to hand-pick a whole coordinated palette.
export function darken(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r * (1 - amount))}${toHex(g * (1 - amount))}${toHex(b * (1 - amount))}`;
}

export function lighten(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r + (255 - r) * amount)}${toHex(g + (255 - g) * amount)}${toHex(b + (255 - b) * amount)}`;
}

interface ThemeContextValue {
  colors: ThemeColors;
  logoUrl: string | null;
  setBrandColors: (branding?: TenantBranding | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Caches the last tenant branding this device saw, so the splash screen (and
// anything else that renders before the OrgContext network fetch resolves)
// can show the org's real configured color immediately on the next cold
// start instead of always falling back to DEFAULT_COLORS while loading.
const BRAND_CACHE_KEY = "tenant_branding_cache";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<{
    primary: string; secondary: string; accent: string;
    background: string; headerBg: string | null; logoUrl: string | null;
  }>({
    primary: DEFAULT_COLORS.primary,
    secondary: DEFAULT_COLORS.secondary,
    accent: DEFAULT_COLORS.accent,
    background: DEFAULT_COLORS.bg,
    headerBg: null,
    logoUrl: null,
  });

  // Restore the cached branding as soon as possible on mount — before the
  // real fetch (OrgContext) has a chance to complete — so the very first
  // paint after a cold start already reflects this device's last-known
  // tenant colors rather than the hardcoded defaults.
  useEffect(() => {
    SecureStore.getItemAsync(BRAND_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        setBrandColors(JSON.parse(raw) as TenantBranding);
      })
      .catch(() => {});
  }, []);

  function setBrandColors(branding?: TenantBranding | null) {
    setBrand({
      primary:    branding?.primary    || DEFAULT_COLORS.primary,
      secondary:  branding?.secondary  || DEFAULT_COLORS.secondary,
      accent:     branding?.accent     || DEFAULT_COLORS.accent,
      background: branding?.background || DEFAULT_COLORS.bg,
      headerBg:   branding?.headerBg   || null,
      logoUrl:    branding?.logoUrl    || null,
    });
    // Persist for next launch — every real branding update (login, org
    // fetch) refreshes the cache; a null/undefined branding (e.g. logout)
    // intentionally leaves the last-known cache in place so the *next*
    // cold start still starts from the right tenant color.
    if (branding) {
      SecureStore.setItemAsync(BRAND_CACHE_KEY, JSON.stringify(branding)).catch(() => {});
    }
  }

  const colors = useMemo<ThemeColors>(() => ({
    ...DEFAULT_COLORS,
    primary:  brand.primary,
    secondary: brand.secondary,
    accent:    brand.accent,
    bg:        brand.background,
    safeArea:  darken(brand.primary, 0.28),
    screenBg:  lighten(brand.background, 0.6),
    // headerBg: use tenant-configured color if set, otherwise fall back to bg
    headerBg:   brand.headerBg || brand.background,
    // headerText: auto-derived contrast color — white on dark headers, dark on light
    headerText: contrastColor(brand.headerBg || brand.background),
  }), [brand.primary, brand.secondary, brand.accent, brand.background, brand.headerBg]);

  const value = useMemo(() => ({ colors, logoUrl: brand.logoUrl, setBrandColors }), [colors, brand.logoUrl]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeColors/useSetBrandColors must be used within ThemeProvider");
  return ctx;
}

/** The one hook screens use to read live, tenant-branded colors. */
export function useThemeColors(): ThemeColors {
  return useThemeContext().colors;
}

/** Used by AuthContext at login/session-restore/logout — not by screens. */
export function useSetBrandColors(): (branding?: TenantBranding | null) => void {
  return useThemeContext().setBrandColors;
}

/** The tenant's logo URL, or null when none is set (fall back to a bundled default asset). */
export function useBrandLogoUrl(): string | null {
  return useThemeContext().logoUrl;
}

/**
 * For components whose styles depend on brand colors: pass a factory defined
 * at module scope (so its identity is stable) that itself calls
 * `StyleSheet.create` — keeping that call inside the factory (rather than
 * wrapping it here) preserves normal StyleSheet type-inference/literal
 * narrowing, and it's only actually invoked lazily at render time via the
 * memo below, not at module-import time.
 *
 *   const makeStyles = (colors: ThemeColors) => StyleSheet.create({
 *     header: { backgroundColor: colors.primary },
 *   });
 *   function MyComponent() { const s = useThemedStyles(makeStyles); ... }
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const colors = useThemeColors();
  return useMemo(() => factory(colors), [colors, factory]);
}

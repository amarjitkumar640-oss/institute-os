import React, { createContext, useContext, useMemo, useState } from "react";
import { StyleSheet } from "react-native";

const DEFAULT_COLORS = {
  primary:     "#8B1E3F",
  secondary:   "#F5B301",
  accent:      "#2CA6A4",
  orange:      "#E8752C",
  blue:        "#2563A8",
  purple:      "#5B2D8E",
  green:       "#1B9C63",
  red:         "#C0392B",
  purpleBg:    "#F3EDFF",
  greenBg:     "#EAF7F1",
  bg:          "#FFFBF0",
  card:        "#FFFFFF",
  text:        "#2B1B1F",
  muted:       "#8A7F82",
  placeholder: "#B8ACAF",
  border:      "#EDE8E3",
  inputBg:     "#FAF6F4",
} as const;

export type ColorToken = keyof typeof DEFAULT_COLORS | "safeArea";
export type ThemeColors = Record<ColorToken, string>;

export interface TenantBranding {
  primary?:   string | null;
  secondary?: string | null;
  accent?:    string | null;
  logoUrl?:   string | null;
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<{ primary: string; secondary: string; accent: string; logoUrl: string | null }>({
    primary:   DEFAULT_COLORS.primary,
    secondary: DEFAULT_COLORS.secondary,
    accent:    DEFAULT_COLORS.accent,
    logoUrl:   null,
  });

  function setBrandColors(branding?: TenantBranding | null) {
    // Use `||` (not `??`) so a blank string from bad/legacy tenant data
    // ("" instead of null) also falls back to the default, instead of
    // rendering with an empty/invalid color.
    setBrand({
      primary:   branding?.primary   || DEFAULT_COLORS.primary,
      secondary: branding?.secondary || DEFAULT_COLORS.secondary,
      accent:    branding?.accent    || DEFAULT_COLORS.accent,
      logoUrl:   branding?.logoUrl   || null,
    });
  }

  const colors = useMemo<ThemeColors>(() => ({
    ...DEFAULT_COLORS,
    primary:   brand.primary,
    secondary: brand.secondary,
    accent:    brand.accent,
    safeArea:  darken(brand.primary, 0.28),
  }), [brand.primary, brand.secondary, brand.accent]);

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

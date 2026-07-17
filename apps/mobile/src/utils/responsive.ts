/**
 * Responsive scaling utilities for React Native.
 *
 * Design base: 390dp wide (Pixel 6 / Galaxy S22 class).
 * All sizes computed once at module load from the device's actual window dimensions.
 */
import { Dimensions } from "react-native";

const { width: W, height: H } = Dimensions.get("window");
const BASE_W = 390;

/**
 * Proportional linear scale relative to screen width.
 * Use for SVG path coordinates and values that must be strictly proportional.
 */
export const scale = (size: number): number => (W / BASE_W) * size;

/**
 * Moderate scale — avoids extremes on very small (320dp) or large (430dp+) screens.
 * factor=0 → no scaling, factor=1 → full proportional scale. Default 0.5.
 * Best for padding, margin, border radius, icon sizes, avatar sizes.
 */
export const ms = (size: number, factor = 0.5): number =>
  size + (scale(size) - size) * factor;

/**
 * Font scale — uses a gentler factor (0.3) so text doesn't grow too large
 * on wide screens while the system font-size accessibility setting still applies.
 */
export const fs = (size: number): number => ms(size, 0.3);

/** Actual screen width in dp */
export const sw = W;

/** Actual screen height in dp */
export const sh = H;

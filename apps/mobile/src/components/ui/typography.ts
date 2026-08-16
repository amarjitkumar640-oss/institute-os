import type { TextStyle } from "react-native";
import { fs } from "../../utils/responsive";
import { F } from "../../theme";

// ── App-wide typography scale ───────────────────────────────────────────────
// See apps/mobile/DESIGN_SYSTEM.md for how this was derived (an audit found 18+
// distinct font sizes and near-equal use of 700/800 weight for the same visual
// role across the app). This is the single source of truth every screen's
// styles should spread from — e.g. `name: { ...T.listItemTitle, color: colors.text }`
// — never a bespoke `{ fontSize: fs(14), fontFamily: "Inter_700Bold", ... }`.
//
// No color here on purpose: color always comes from `colors.x` (or its semantic
// aliases — colors.textPrimary/textSecondary/textDisabled/textInverse/success/
// warning/error) at the call site, per the app's theme rule.
//
// Weight cap: 400/500/600/700 only. Inter_800ExtraBold is not used anywhere in
// this scale — every role that used to reach for it maps to 700 (or 600, where
// 700 reads as over-emphasized) instead.

type Token = Pick<TextStyle, "fontSize" | "fontFamily" | "fontWeight" | "lineHeight" | "letterSpacing" | "textTransform">;

export const T = {
  displayLarge: {
    fontSize: fs(26), fontFamily: F.bold, fontWeight: "700",
    lineHeight: fs(32), letterSpacing: -0.4,
  },
  displayMedium: {
    fontSize: fs(20), fontFamily: F.bold, fontWeight: "700",
    lineHeight: fs(26), letterSpacing: -0.3,
  },
  screenTitle: {
    fontSize: fs(18), fontFamily: F.bold, fontWeight: "700",
    lineHeight: fs(23), letterSpacing: -0.2,
  },
  sectionHeading: {
    fontSize: fs(12), fontFamily: F.bold, fontWeight: "700",
    lineHeight: fs(16), letterSpacing: 0.5, textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: fs(15), fontFamily: F.semibold, fontWeight: "600",
    lineHeight: fs(20), letterSpacing: 0,
  },
  listItemTitle: {
    fontSize: fs(14), fontFamily: F.semibold, fontWeight: "600",
    lineHeight: fs(19), letterSpacing: 0,
  },
  body: {
    fontSize: fs(13), fontFamily: F.regular, fontWeight: "400",
    lineHeight: fs(19), letterSpacing: 0,
  },
  bodySmall: {
    fontSize: fs(12), fontFamily: F.regular, fontWeight: "400",
    lineHeight: fs(17), letterSpacing: 0,
  },
  caption: {
    fontSize: fs(11), fontFamily: F.medium, fontWeight: "500",
    lineHeight: fs(15), letterSpacing: 0.1,
  },
  helperText: {
    fontSize: fs(11.5), fontFamily: F.regular, fontWeight: "400",
    lineHeight: fs(16), letterSpacing: 0,
  },
  buttonText: {
    fontSize: fs(15), fontFamily: F.semibold, fontWeight: "600",
    lineHeight: fs(20), letterSpacing: 0.1,
  },
  chipText: {
    fontSize: fs(11), fontFamily: F.semibold, fontWeight: "600",
    lineHeight: fs(14), letterSpacing: 0.2,
  },
  badgeText: {
    fontSize: fs(10), fontFamily: F.bold, fontWeight: "700",
    lineHeight: fs(13), letterSpacing: 0.3, textTransform: "uppercase",
  },
  navigationLabel: {
    fontSize: fs(11), fontFamily: F.semibold, fontWeight: "600",
    lineHeight: fs(14), letterSpacing: 0,
  },
  tableHeader: {
    fontSize: fs(11), fontFamily: F.semibold, fontWeight: "600",
    lineHeight: fs(14), letterSpacing: 0.3, textTransform: "uppercase",
  },
  tableCell: {
    fontSize: fs(13), fontFamily: F.regular, fontWeight: "400",
    lineHeight: fs(18), letterSpacing: 0,
  },
} satisfies Record<string, Token>;

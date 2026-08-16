import { ms } from "../../utils/responsive";

// ── List-avatar design system ───────────────────────────────────────────────
// Every list screen's leading avatar/icon box (Students, Faculty, Fees, Leads,
// Applications, Staff, Courses, Subjects, Centers) pulls its size, shape, and
// fill treatment from here instead of hand-rolling its own — see
// apps/mobile/DESIGN_SYSTEM.md for why this exists (they'd all drifted to
// different sizes, corner radii, and fill styles before this was added).
//
// Flip this one flag to compare solid vs. tinted across every list screen at
// once, e.g. for a design review — no per-screen edits needed.
export const AVATAR_FILL_STYLE: "solid" | "tinted" = "solid";

// Canonical size/shape — a squircle (not a full circle), matching the
// majority of screens before this change (Students/Faculty/Courses).
export const AVATAR_SIZE   = ms(46);
export const AVATAR_RADIUS = ms(12);

export interface AvatarFill {
  backgroundColor: string;
  color:           string;
  borderWidth:     number;
  borderColor:     string;
}

/**
 * Given the "identity color" a screen already picks for an item (a course's
 * category color, a rotating palette entry, a role color, brand primary...),
 * returns how that color should actually be painted onto the avatar —
 * centralizing the *fill mechanism* while leaving each screen's own
 * *color-selection* logic untouched.
 */
export function getAvatarFill(baseColor: string): AvatarFill {
  if (AVATAR_FILL_STYLE === "tinted") {
    return {
      backgroundColor: baseColor + "1C",
      color:           baseColor,
      borderWidth:     1.5,
      borderColor:     baseColor + "40",
    };
  }
  return {
    backgroundColor: baseColor,
    color:           "#fff",
    borderWidth:     0,
    borderColor:     "transparent",
  };
}

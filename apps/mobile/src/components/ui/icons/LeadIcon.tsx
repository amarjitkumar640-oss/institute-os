import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

// A single line-icon glyph (Ionicons' "people-outline" is only two people,
// and nothing in the set matches "a group with one in front") — a group of
// three, matching the reference the user supplied. All strokes only (no fill
// occlusion behind the center figure like the reference), since this icon
// renders on both a solid brand-color chip and a plain card background —
// there's no single fill color that would correctly mask the side figures
// in both places.
export function LeadIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Left person */}
      <Circle cx={5.6} cy={7.7} r={2.3} stroke={color} strokeWidth={1.6} />
      <Path
        d="M1.2 16.7c0-3.35 1.97-6 4.4-6 1.1 0 2.1.53 2.9 1.42"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none"
      />
      {/* Right person */}
      <Circle cx={18.4} cy={7.7} r={2.3} stroke={color} strokeWidth={1.6} />
      <Path
        d="M22.8 16.7c0-3.35-1.97-6-4.4-6-1.1 0-2.1.53-2.9 1.42"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none"
      />
      {/* Center person (bigger, in front) */}
      <Circle cx={12} cy={6.4} r={3.1} stroke={color} strokeWidth={1.7} />
      <Path
        d="M5 20.4c0-4.3 3.13-7.4 7-7.4s7 3.1 7 7.4"
        stroke={color} strokeWidth={1.7} strokeLinecap="round" fill="none"
      />
    </Svg>
  );
}

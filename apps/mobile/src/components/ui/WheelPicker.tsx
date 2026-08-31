import React, { useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";
import { T } from "./typography";

// Extracted from CreateBatchScreen.tsx's DatePickerModal, which went through
// four rounds of on-device fixes to stop the wheel's highlighted selection
// from drifting away from the actually-scrolled-to item (root cause: guessing
// each item's position as `index * itemHeight` doesn't hold once ms()/fs()'s
// different moderation factors make padding and line-height drift apart at
// non-baseline screen widths — see usePositionMap below). Reused here as-is
// for AddClassPeriodModal's time wheel rather than re-deriving/re-breaking
// the same fix a second time.

// A stable, module-level component — not declared inside the modal that uses
// it — is what makes tapping an item behave correctly. A component defined
// inline inside another component's render gets a brand-new identity every
// re-render, so React unmounts and remounts its ScrollView on every single
// state change (tap an item → state updates → re-render → "new" column → the
// ScrollView is destroyed and recreated from scratch) — which is exactly why
// the list used to snap back to the top on every tap instead of keeping its
// scroll position.

export const WHEEL_SELECTORS_H = ms(180);
export const WHEEL_HIGHLIGHT_H = ms(44);

// Tracks the real measured vertical center of every item in one column, keyed
// by index — filled in directly from each item's own onLayout event. A plain
// (non-virtualized) ScrollView renders every child immediately on mount, so
// this map is populated right away, before anything tries to scroll using it.
export function usePositionMap() {
  const positions = useRef<number[]>([]);
  const onItemLayout = (i: number, e: { nativeEvent: { layout: { y: number; height: number } } }) => {
    positions.current[i] = e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2;
  };
  return { positions, onItemLayout };
}

export function scrollToIndex(
  ref: React.RefObject<ScrollView | null>,
  positions: React.RefObject<number[]>,
  idx: number,
  containerHeight: number,
  animated = false,
) {
  const centerY = positions.current[idx];
  if (centerY == null) return; // not measured yet — the mount-time effect will retry once it is
  ref.current?.scrollTo({ y: Math.max(0, centerY - containerHeight / 2), animated });
}

// A column label's own marginBottom — onLayout reports a Text's content box
// only, never its margin, so this has to be added back on top of the
// measured height explicitly or the derived scrollAreaH/highlightTop below
// are off by exactly this much.
const WHEEL_LABEL_MARGIN_BOTTOM = ms(4);

// Measures the real rendered height of a column's label ("HOUR", "DAY", …)
// once, from whichever column's label mounts first — every column shares the
// exact same colLabel style, so one measurement is authoritative for all of
// them. Returns the derived scrollable-area height, plus the exact top
// offset (relative to the selectors row, not the whole sheet) that centers
// the highlight box over that scrollable area.
export function useMeasuredColumnLayout() {
  const [labelTextH, setLabelTextH] = useState(ms(12)); // fallback (text only) until the real onLayout fires
  const labelTotalH = labelTextH + WHEEL_LABEL_MARGIN_BOTTOM;
  const scrollAreaH = WHEEL_SELECTORS_H - labelTotalH;
  const highlightTop = labelTotalH + (scrollAreaH - WHEEL_HIGHLIGHT_H) / 2;
  const onLabelLayout = (e: { nativeEvent: { layout: { height: number } } }) => setLabelTextH(e.nativeEvent.layout.height);
  return { scrollAreaH, highlightTop, onLabelLayout };
}

export function WheelColumn<T>({ items, selected, onSelect, fmt, scrollRef, onItemLayout, accentColor }: {
  items: T[]; selected: T; onSelect: (v: T) => void; fmt: (v: T) => string;
  scrollRef?: React.RefObject<ScrollView | null>;
  onItemLayout?: (i: number, e: { nativeEvent: { layout: { y: number; height: number } } }) => void;
  accentColor: string;
}) {
  return (
    <ScrollView ref={scrollRef} style={wheelStyles.col} showsVerticalScrollIndicator={false} nestedScrollEnabled>
      <View style={{ paddingVertical: ms(60) }}>
        {items.map((item, i) => {
          const active = item === selected;
          return (
            <TouchableOpacity
              key={String(item)}
              style={[wheelStyles.item, active && { backgroundColor: accentColor + "12", borderRadius: ms(8) }]}
              onPress={() => onSelect(item)}
              activeOpacity={0.7}
              onLayout={onItemLayout ? (e) => onItemLayout(i, e) : undefined}
            >
              <Text style={[wheelStyles.itemT, active && { color: accentColor, fontFamily: "Inter_700Bold", fontWeight: "700" }]}>
                {fmt(item)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

export const wheelStyles = StyleSheet.create({
  selectors: { flexDirection: "row", height: WHEEL_SELECTORS_H, gap: ms(4) },
  selector:  { flex: 1 },
  colLabel:  { ...T.sectionHeading, color: C.muted, letterSpacing: 1, textAlign: "center", marginBottom: ms(4) },
  col:       { flex: 1 },
  item:      { alignItems: "center", paddingVertical: ms(10) },
  itemT:     { ...T.cardTitle, color: C.muted },
  // top is set inline per-instance (see useMeasuredColumnLayout) — it
  // depends on the real rendered colLabel height, not a fixed value here.
  highlight: { position: "absolute", left: 0, right: 0, height: WHEEL_HIGHLIGHT_H, borderRadius: ms(10), borderWidth: 2 },
});

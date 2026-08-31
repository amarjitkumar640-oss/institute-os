import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, ActivityIndicator,
} from "react-native";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { KeyboardAvoidingScroll } from "../../components/ui/KeyboardAvoidingScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { T } from "../../components/ui/typography";
import { updateBatch, type BatchItem, type BatchStatus } from "../../api/batches";
import {
  listSlots, createSlot, updateSlot, deleteSlot,
  DAY_LABELS, DAY_ORDER, type DayOfWeek, type ClassSlot,
} from "../../api/classSchedule";
import { AddClassPeriodModal, type ClassPeriodDraft } from "./AddClassPeriodModal";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { usePermission } from "../../hooks/usePermission";

type Props = NativeStackScreenProps<RootStackParamList, "EditBatch">;

// ── Maps ──────────────────────────────────────────────────────────────────────


const STATUS_OPTIONS: { key: BatchStatus; label: string; color: string; icon: string }[] = [
  { key: "upcoming",  label: "Upcoming",  color: C.blue,    icon: "time-outline"           },
  { key: "running",   label: "Running",   color: C.green,   icon: "play-circle-outline"    },
  { key: "completed", label: "Completed", color: C.muted,   icon: "checkmark-done-outline" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoToDate(iso: string): Date | null {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function fmtDisplay(d: Date | null): string {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Just for the period preview list below — periods store times as plain 24h
// "HH:MM" (matching the API), this only formats them for display.
function fmt12hStr(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10) || 0;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${mStr} ${suffix}`;
}

function newDraftId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Reconciling ClassPeriodDrafts against real ClassSlot rows ─────────────────
// Unlike CreateBatchScreen (where periods are purely local until the batch
// exists), a batch being edited already has real ClassSlot rows server-side.
// Loading them back into the same period-drafting UI means grouping slots
// that share one period's identity (same time/subject/faculty/room, just a
// different day) back together, and tracking each draft's real slot id per
// day so saving can update/create/delete the exact right rows instead of
// naively deleting everything and recreating it from scratch.
function groupSlotsIntoPeriods(slots: ClassSlot[]): {
  periods: ClassPeriodDraft[];
  slotIdsByPeriod: Record<string, Partial<Record<DayOfWeek, string>>>;
} {
  const groups = new Map<string, ClassSlot[]>();
  for (const slot of slots) {
    const key = `${slot.startTime}|${slot.endTime}|${slot.subjectId ?? ""}|${slot.facultyId ?? ""}|${slot.room ?? ""}`;
    const existing = groups.get(key);
    if (existing) existing.push(slot); else groups.set(key, [slot]);
  }

  const periods: ClassPeriodDraft[] = [];
  const slotIdsByPeriod: Record<string, Partial<Record<DayOfWeek, string>>> = {};

  for (const groupSlots of groups.values()) {
    const id = newDraftId();
    const first = groupSlots[0];
    periods.push({
      id,
      days:        DAY_ORDER.filter((d) => groupSlots.some((s) => s.dayOfWeek === d)),
      startTime:   first.startTime,
      endTime:     first.endTime,
      subjectId:   first.subjectId,
      subjectName: first.subject?.name ?? "",
      facultyId:   first.facultyId,
      facultyName: first.faculty?.fullName ?? "",
      room:        first.room ?? "",
    });
    const idsByDay: Partial<Record<DayOfWeek, string>> = {};
    for (const s of groupSlots) idsByDay[s.dayOfWeek] = s.id;
    slotIdsByPeriod[id] = idsByDay;
  }

  return { periods, slotIdsByPeriod };
}

// ── Shared wheel-picker column ────────────────────────────────────────────────
// A stable, module-level component — not declared inside DatePickerModal's own
// render body — is what makes tapping an item behave correctly. A component
// defined inline inside another component's render gets a brand-new identity
// every re-render, so React unmounts and remounts its ScrollView on every
// single state change (tap an item → state updates → re-render → "new" Col →
// the ScrollView is destroyed and recreated from scratch) — which is exactly
// why the list used to snap back to the top on every tap instead of keeping
// its scroll position, and why a tapped item never landed inside the
// highlighted band the way scrolling to it would.

// dp.selectors' own fixed height — genuinely exact (enforced directly by
// that style, not inferred from any font/content metric).
const WHEEL_SELECTORS_H = ms(180);
const WHEEL_HIGHLIGHT_H = ms(44);

// Tracks the real measured vertical center of every item in one column,
// keyed by index — filled in directly from each item's own onLayout event.
// A plain (non-virtualized) ScrollView renders every child immediately on
// mount, so this map is populated right away, before anything tries to
// scroll using it.
//
// This replaces an earlier version that assumed a single uniform item
// height and multiplied it by the target index (`idx * itemH`) — that
// couldn't be made reliable as a flat guess: dp.item's padding scales via
// ms() while dp.itemT's line-height scales via fs(), a different
// moderation factor, so the two drift apart on any screen width other than
// the 390dp this was designed against. Worse, that per-item error gets
// multiplied by idx, so it was invisible for an item near the top of a
// column but amplified for one further down (e.g. ~30x for day 31) —
// exactly the "only the default selection is misaligned" pattern that kept
// showing up. Reading each item's real position directly removes the
// guess (and the amplification) entirely.
function usePositionMap() {
  const positions = useRef<number[]>([]);
  const onItemLayout = (i: number, e: { nativeEvent: { layout: { y: number; height: number } } }) => {
    positions.current[i] = e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2;
  };
  return { positions, onItemLayout };
}

function scrollToIndex(
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

// dp.colLabel's own marginBottom — onLayout reports a Text's content box
// only, never its margin, so this has to be added back on top of the
// measured height explicitly or the derived scrollAreaH/highlightTop below
// are off by exactly this much.
const WHEEL_LABEL_MARGIN_BOTTOM = ms(4);

// Measures the real rendered height of a column's label ("DAY", "MONTH", …)
// once, from whichever column's label mounts first — every column shares
// the exact same dp.colLabel style, so one measurement is authoritative for
// all three. Returns the derived scrollable-area height, plus the exact
// top offset (relative to dp.selectors, not the whole sheet) that centers
// the highlight box over that scrollable area.
function useMeasuredColumnLayout() {
  const [labelTextH, setLabelTextH] = useState(ms(12)); // fallback (text only) until the real onLayout fires
  const labelTotalH = labelTextH + WHEEL_LABEL_MARGIN_BOTTOM;
  const scrollAreaH = WHEEL_SELECTORS_H - labelTotalH;
  const highlightTop = labelTotalH + (scrollAreaH - WHEEL_HIGHLIGHT_H) / 2;
  const onLabelLayout = (e: { nativeEvent: { layout: { height: number } } }) => setLabelTextH(e.nativeEvent.layout.height);
  return { scrollAreaH, highlightTop, onLabelLayout };
}

function WheelColumn<T>({ items, selected, onSelect, fmt, scrollRef, onItemLayout }: {
  items: T[]; selected: T; onSelect: (v: T) => void; fmt: (v: T) => string;
  scrollRef?: React.RefObject<ScrollView | null>;
  onItemLayout?: (i: number, e: { nativeEvent: { layout: { y: number; height: number } } }) => void;
}) {
  const dp = useThemedStyles(makeDpStyles);
  return (
    <ScrollView ref={scrollRef} style={dp.col} showsVerticalScrollIndicator={false} nestedScrollEnabled>
      <View style={{ paddingVertical: ms(60) }}>
        {items.map((item, i) => {
          const active = item === selected;
          return (
            <TouchableOpacity
              key={String(item)}
              style={[dp.item, active && dp.itemActive]}
              onPress={() => onSelect(item)}
              activeOpacity={0.7}
              onLayout={onItemLayout ? (e) => onItemLayout(i, e) : undefined}
            >
              <Text style={[dp.itemT, active && dp.itemActiveT]}>{fmt(item)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Date Picker Modal ─────────────────────────────────────────────────────────

function DatePickerModal({ visible, value, minYear = 2020, maxYear = 2035, onConfirm, onClose }: {
  visible: boolean;
  value: Date | null;
  minYear?: number;
  maxYear?: number;
  onConfirm: (d: Date) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const dp = useThemedStyles(makeDpStyles);
  const now = value ?? new Date();
  const [day,   setDay]   = useState(now.getDate());
  const [month, setMonth] = useState(now.getMonth());
  const [year,  setYear]  = useState(now.getFullYear());

  const dayRef   = useRef<ScrollView>(null);
  const monthRef = useRef<ScrollView>(null);
  const yearRef  = useRef<ScrollView>(null);

  const dayPos   = usePositionMap();
  const monthPos = usePositionMap();
  const yearPos  = usePositionMap();

  const { scrollAreaH, highlightTop, onLabelLayout } = useMeasuredColumnLayout();

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const safeDay = Math.min(day, daysInMonth);

  // Keeps the wheels scrolled to whatever's currently selected — the
  // sheet's initial open uses scrollAreaH's fallback value before the real
  // onLayout measurement replaces it a beat later, and without re-running
  // this effect when that happens, the *default* selection stays stuck at
  // the fallback position forever even though a tap moments later already
  // uses the corrected one. The position maps are refs, so scrollToIndex
  // always reads their latest values at call time regardless of this
  // dependency array.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      scrollToIndex(dayRef,   dayPos.positions,   safeDay - 1,    scrollAreaH);
      scrollToIndex(monthRef, monthPos.positions, month,          scrollAreaH);
      scrollToIndex(yearRef,  yearPos.positions,  year - minYear, scrollAreaH);
    }, 80);
    return () => clearTimeout(t);
  }, [visible, scrollAreaH, safeDay, month, year, minYear]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={dp.sheetPad}>
        <View style={dp.handle} />
        <Text style={dp.title}>Select Date</Text>

        <View style={dp.selectors}>
          <View style={dp.selector}>
            <Text style={dp.colLabel} onLayout={onLabelLayout}>DAY</Text>
            <WheelColumn
              items={days} selected={safeDay} scrollRef={dayRef} fmt={(v) => String(v)} onItemLayout={dayPos.onItemLayout}
              onSelect={(v) => { setDay(v); scrollToIndex(dayRef, dayPos.positions, days.indexOf(v), scrollAreaH, true); }}
            />
          </View>
          <View style={[dp.selector, { flex: 1.4 }]}>
            <Text style={dp.colLabel}>MONTH</Text>
            <WheelColumn
              items={MONTHS} selected={MONTHS[month]} scrollRef={monthRef} fmt={(v) => v} onItemLayout={monthPos.onItemLayout}
              onSelect={(v) => { const idx = MONTHS.indexOf(v); setMonth(idx); scrollToIndex(monthRef, monthPos.positions, idx, scrollAreaH, true); }}
            />
          </View>
          <View style={dp.selector}>
            <Text style={dp.colLabel}>YEAR</Text>
            <WheelColumn
              items={years} selected={year} scrollRef={yearRef} fmt={(v) => String(v)} onItemLayout={yearPos.onItemLayout}
              onSelect={(v) => { setYear(v); scrollToIndex(yearRef, yearPos.positions, years.indexOf(v), scrollAreaH, true); }}
            />
          </View>

          {/* highlight bar — positioned relative to this row, at a top
              offset derived from real measured label/item heights, not
              guessed constants */}
          <View pointerEvents="none" style={[dp.highlight, { top: highlightTop }]} />
        </View>

        <View style={dp.btnRow}>
          <TouchableOpacity style={dp.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={dp.cancelT}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={dp.confirmBtn}
            onPress={() => onConfirm(new Date(year, month, safeDay))}
            activeOpacity={0.85}
          >
            <Text style={dp.confirmT}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const makeDpStyles = (colors: ThemeColors) => StyleSheet.create({
  sheetPad:    { paddingTop: ms(12), paddingHorizontal: ms(20), paddingBottom: ms(32) },
  handle:      { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginBottom: ms(16) },
  title:       { ...T.cardTitle, color: C.text, marginBottom: ms(8), textAlign: "center" },
  selectors:   { flexDirection: "row", height: ms(180), gap: ms(4) },
  selector:    { flex: 1 },
  colLabel:    { ...T.sectionHeading, color: C.muted, letterSpacing: 1, textAlign: "center", marginBottom: ms(4) },
  col:         { flex: 1 },
  item:        { alignItems: "center", paddingVertical: ms(10) },
  itemActive:  { backgroundColor: colors.primary + "12", borderRadius: ms(8) },
  itemT:       { ...T.cardTitle, color: C.muted },
  itemActiveT: { color: colors.primary, fontFamily: "Inter_700Bold", fontWeight: "700" },
  // top is set inline per-instance (see useMeasuredColumnLayout) — it
  // depends on the real rendered label/item heights, not a fixed value
  // here. left/right are 0, not the sheet's own horizontal padding,
  // because this is now positioned relative to dp.selectors (which has
  // none of its own), not the padded sheet container.
  highlight:   { position: "absolute", left: 0, right: 0, height: ms(44), borderRadius: ms(10), borderWidth: 1.5, borderColor: colors.primary + "30", backgroundColor: colors.primary + "06" },
  btnRow:      { flexDirection: "row", gap: ms(10), marginTop: ms(20) },
  cancelBtn:   { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg },
  cancelT:     { ...T.buttonText, color: C.muted },
  confirmBtn:  { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), backgroundColor: colors.primary },
  confirmT:    { ...T.buttonText, color: "#fff" },
});

// ── Date display field ────────────────────────────────────────────────────────

function DateField({ label, value, placeholder, onPress, readOnly = false, error }: {
  label: string; value: string; placeholder: string;
  onPress?: () => void; readOnly?: boolean; error?: string;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ marginBottom: ms(14) }}>
      <Text style={f.label}>{label}</Text>
      <TouchableOpacity
        style={[f.field, readOnly && f.fieldReadOnly, !!error && f.fieldError]}
        onPress={onPress}
        activeOpacity={readOnly ? 1 : 0.8}
        disabled={readOnly}
      >
        <Ionicons
          name={readOnly ? "lock-closed-outline" : "calendar-outline"}
          size={ms(16)}
          color={readOnly ? C.placeholder : value ? colors.primary : C.placeholder}
        />
        <Text style={[f.fieldT, !value && f.placeholder, readOnly && { color: C.muted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {!readOnly ? (
          <Ionicons name="chevron-down" size={ms(14)} color={C.placeholder} />
        ) : (
          <View style={f.autoBadge}>
            <Text style={f.autoT}>Auto</Text>
          </View>
        )}
      </TouchableOpacity>
      {error ? (
        <View style={f.errRow}>
          <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
          <Text style={f.errT}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const f = StyleSheet.create({
  label:       { ...T.chipText, color: C.text, marginBottom: ms(7) },
  field:       { flexDirection: "row", alignItems: "center", gap: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(13), backgroundColor: C.inputBg },
  fieldReadOnly:{ backgroundColor: C.bg, borderColor: C.border },
  fieldError:  { borderColor: C.red, backgroundColor: C.red + "06" },
  fieldT:      { flex: 1, ...T.listItemTitle, color: C.text },
  placeholder: { color: C.placeholder, fontFamily: "Inter_400Regular", fontWeight: "400" },
  autoBadge:   { backgroundColor: C.green + "18", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  autoT:       { ...T.badgeText, color: C.green },
  errRow:      { flexDirection: "row", alignItems: "center", marginTop: ms(5), gap: ms(4) },
  errT:        { ...T.helperText, color: C.red, flex: 1 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export function EditBatchScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { batch } = route.params;

  // Nothing links here for a role without batches.edit today (the pencil
  // icon that opens this screen is itself hidden), but nothing stops a
  // direct navigation.navigate("EditBatch") either — RootNavigator registers
  // every route unconditionally. Closes that deep-link gap at the destination.
  const { canEdit } = usePermission("batches");
  useEffect(() => { if (!canEdit) navigation.goBack(); }, [canEdit]);

  const [name, setName]         = useState(batch.name);
  const [capacity, setCapacity] = useState(String(batch.capacity));
  const [status, setStatus]     = useState<BatchStatus>(batch.status);
  const [startDate, setStartDate] = useState<Date | null>(isoToDate(batch.startDate));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const endDate: Date | null = startDate
    ? addMonths(startDate, batch.course.durationMonths)
    : null;

  // ── Class periods ──────────────────────────────────────────────────────────
  const [periods, setPeriods] = useState<ClassPeriodDraft[]>([]);
  const [periodModal, setPeriodModal] = useState<{ visible: boolean; editing: ClassPeriodDraft | null }>({ visible: false, editing: null });
  const [slotsLoading, setSlotsLoading] = useState(true);
  // Every real slot id this batch had when the screen loaded, keyed by which
  // loaded period (and day within it) it came from — the save-time diff
  // walks the current `periods` state and, for each surviving day, either
  // updates the id recorded here or creates a new slot; any id from here
  // that no longer gets "claimed" by anything in the final `periods` state
  // (its period was removed, or that day was dropped from it) gets deleted.
  const originalSlotIdsByPeriod = useRef<Record<string, Partial<Record<DayOfWeek, string>>>>({});

  useEffect(() => {
    listSlots(batch.id)
      .then((slots) => {
        const { periods: loaded, slotIdsByPeriod } = groupSlotsIntoPeriods(slots);
        originalSlotIdsByPeriod.current = slotIdsByPeriod;
        setPeriods(loaded);
      })
      .catch(() => {}) // best-effort — an admin can still edit name/capacity/dates/status without this
      .finally(() => setSlotsLoading(false));
  }, [batch.id]);

  function handleSavePeriod(draft: ClassPeriodDraft) {
    setPeriods((prev) => {
      const idx = prev.findIndex((p) => p.id === draft.id);
      if (idx === -1) return [...prev, draft];
      const next = [...prev];
      next[idx] = draft;
      return next;
    });
    setPeriodModal({ visible: false, editing: null });
  }

  function removePeriod(id: string) {
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  }

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<BatchItem | null>(null);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(ms(40))).current;
  const checkScale  = useRef(new Animated.Value(0)).current;

  const examColor = batch.course.examCategories[0]?.color ?? C.muted;
  const examLabel = batch.course.examCategories.length
    ? batch.course.examCategories.map((c) => c.label).join(", ")
    : "General";

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim())                                                    errs.name     = "Batch name is required.";
    if (!capacity.trim() || isNaN(Number(capacity)) || Number(capacity) < 1) errs.capacity = "Enter a valid capacity (min 1).";
    if (!startDate)                                                       errs.startDate = "Please select a start date.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Reconciles the current `periods` state against whatever real ClassSlot
  // rows this batch had when the screen loaded — update the ones that
  // survived (by their recorded real id), create ones for newly-added
  // days/periods, and delete any original id nothing in the final state
  // still claims. Best-effort per call, same philosophy as
  // CreateBatchScreen's own slot creation: the batch's core fields already
  // saved successfully, so one slot failing shouldn't undo that — staff can
  // always fix an individual slot later from the batch's Class Schedule screen.
  async function reconcileClassPeriods() {
    const claimedIds = new Set<string>();
    const ops: Promise<unknown>[] = [];

    for (const period of periods) {
      const existingIdsForPeriod = originalSlotIdsByPeriod.current[period.id] ?? {};
      for (const day of period.days) {
        const existingId = existingIdsForPeriod[day];
        if (existingId) {
          claimedIds.add(existingId);
          ops.push(updateSlot(existingId, {
            startTime: period.startTime,
            endTime:   period.endTime,
            subjectId: period.subjectId,
            facultyId: period.facultyId,
            room:      period.room || null,
          }).catch(() => {}));
        } else {
          ops.push(createSlot(batch.id, {
            dayOfWeek: day,
            startTime: period.startTime,
            endTime:   period.endTime,
            subjectId: period.subjectId ?? undefined,
            facultyId: period.facultyId ?? undefined,
            room:      period.room || undefined,
            validFrom: toISO(startDate!),
          }).catch(() => {}));
        }
      }
    }

    for (const idsByDay of Object.values(originalSlotIdsByPeriod.current)) {
      for (const id of Object.values(idsByDay)) {
        if (id && !claimedIds.has(id)) ops.push(deleteSlot(id).catch(() => {}));
      }
    }

    await Promise.all(ops);
  }

  async function handleSave() {
    if (!validate() || !startDate || !endDate) return;
    setLoading(true);
    const response = await updateBatch(batch.id, {
      name:      name.trim(),
      capacity:  Number(capacity),
      startDate: toISO(startDate),
      endDate:   toISO(endDate),
      status,
    });

    if (response.ok) await reconcileClassPeriods();

    setLoading(false);
    if (response.ok) {
      setUpdated(response.batch);
      Animated.parallel([
        Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7, delay: 100 }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 60 }),
      ]).start();
    } else {
      setErrors({ submit: response.error });
    }
  }

  if (!canEdit) return null;

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="Edit Batch" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingScroll
        style={s.scroll}
        contentContainerStyle={s.body}
        footer={
          <View style={s.footer}>
            <TouchableOpacity
              style={[s.saveBtn, loading && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={ms(20)} color="#fff" />
                  <Text style={s.saveBtnT}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        }
      >
          {/* ── Course (read-only) ── */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <View style={[s.cardHeadIcon, { backgroundColor: examColor + "18" }]}>
                <Ionicons name="book-outline" size={ms(15)} color={examColor} />
              </View>
              <Text style={s.cardHeadT}>Course</Text>
              <View style={s.lockChip}>
                <Ionicons name="lock-closed-outline" size={ms(11)} color={C.muted} />
                <Text style={s.lockChipT}>Fixed</Text>
              </View>
            </View>
            <View style={s.divider} />
            <View style={s.courseRow}>
              <View style={[s.examBadge, { backgroundColor: examColor + "18" }]}>
                <Text style={[s.examBadgeT, { color: examColor }]}>{examLabel}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.courseName} numberOfLines={2}>{batch.course.name}</Text>
                <Text style={s.courseSub}>
                  {batch.course.durationMonths} months · ₹{Number(batch.course.defaultFee).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Batch details ── */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <View style={[s.cardHeadIcon, { backgroundColor: C.blue + "18" }]}>
                <Ionicons name="layers-outline" size={ms(15)} color={C.blue} />
              </View>
              <Text style={s.cardHeadT}>Batch Details</Text>
            </View>
            <View style={[s.divider, { marginBottom: ms(14) }]} />
            <View style={s.fieldsPad}>
              <FormField
                label="Batch Name"
                value={name}
                onChangeText={(v) => { setName(v); setErrors((p) => ({ ...p, name: "" })); }}
                placeholder="e.g. SSC Morning Batch A"
                error={errors.name}
                icon="layers-outline"
                maxLength={120}
                clearable
                required
              />
              <FormField
                label="Capacity (seats)"
                value={capacity}
                onChangeText={(v) => { setCapacity(v.replace(/\D/g, "")); setErrors((p) => ({ ...p, capacity: "" })); }}
                placeholder="e.g. 40"
                keyboardType="number-pad"
                error={errors.capacity}
                icon="people-outline"
                required
              />
            </View>
          </View>

          {/* ── Status ── */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <View style={[s.cardHeadIcon, { backgroundColor: C.orange + "18" }]}>
                <Ionicons name="pulse-outline" size={ms(15)} color={C.orange} />
              </View>
              <Text style={s.cardHeadT}>Status</Text>
            </View>
            <View style={s.divider} />
            <View style={s.statusGrid}>
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.statusChip, active && { backgroundColor: opt.color, borderColor: opt.color }]}
                    onPress={() => setStatus(opt.key)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={opt.icon as any} size={ms(15)} color={active ? "#fff" : C.muted} />
                    <Text style={[s.statusChipT, active && { color: "#fff" }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {batch.enrolledCount > 0 && (
              <View style={s.enrolledNote}>
                <Ionicons name="people-outline" size={ms(13)} color={C.blue} />
                <Text style={s.enrolledNoteT}>
                  {batch.enrolledCount} student{batch.enrolledCount !== 1 ? "s" : ""} currently enrolled
                </Text>
              </View>
            )}
          </View>

          {/* ── Schedule ── */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <View style={[s.cardHeadIcon, { backgroundColor: C.green + "18" }]}>
                <Ionicons name="calendar-outline" size={ms(15)} color={C.green} />
              </View>
              <Text style={s.cardHeadT}>Schedule</Text>
            </View>
            <View style={[s.divider, { marginBottom: ms(14) }]} />
            <View style={s.fieldsPad}>
              <DateField
                label="Start Date"
                value={fmtDisplay(startDate)}
                placeholder="Tap to pick start date"
                onPress={() => setDatePickerOpen(true)}
                error={errors.startDate}
              />
              <DateField
                label={`End Date  ·  auto-calculated (${batch.course.durationMonths} months)`}
                value={fmtDisplay(endDate)}
                placeholder="Auto-calculated"
                readOnly
              />
            </View>
          </View>

          {/* ── Class Timing — same period-drafting model as Create, loaded
              back from this batch's real ClassSlot rows (see
              groupSlotsIntoPeriods) and reconciled against them on save. ── */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <View style={[s.cardHeadIcon, { backgroundColor: colors.primary + "18" }]}>
                <Ionicons name="time-outline" size={ms(15)} color={colors.primary} />
              </View>
              <Text style={s.cardHeadT}>Class Timing</Text>
            </View>
            <View style={[s.divider, { marginBottom: ms(12) }]} />
            <View style={s.fieldsPad}>
              {slotsLoading ? (
                <View style={s.periodsLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={s.periodsEmptyT}>Loading class periods…</Text>
                </View>
              ) : periods.length === 0 ? (
                <Text style={s.periodsEmptyT}>No class periods set up yet.</Text>
              ) : (
                <View style={{ gap: ms(8) }}>
                  {periods.map((period) => (
                    <View key={period.id} style={s.periodRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.periodDays} numberOfLines={1}>
                          {DAY_ORDER.filter((d) => period.days.includes(d)).map((d) => DAY_LABELS[d]).join(", ")}
                        </Text>
                        <Text style={s.periodMeta} numberOfLines={1}>
                          {fmt12hStr(period.startTime)} – {fmt12hStr(period.endTime)}
                          {period.subjectName ? ` · ${period.subjectName}` : ""}
                          {period.facultyName ? ` · ${period.facultyName}` : ""}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={s.periodIconBtn}
                        onPress={() => setPeriodModal({ visible: true, editing: period })}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="pencil-outline" size={ms(15)} color={C.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.periodIconBtn}
                        onPress={() => removePeriod(period.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="trash-outline" size={ms(15)} color={C.red} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[s.addPeriodBtn, { borderColor: colors.primary + "40" }]}
                onPress={() => setPeriodModal({ visible: true, editing: null })}
                activeOpacity={0.75}
                disabled={slotsLoading}
              >
                <Ionicons name="add-circle-outline" size={ms(16)} color={colors.primary} />
                <Text style={[s.addPeriodBtnT, { color: colors.primary }]}>Add Class Period</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Submit error ── */}
          {errors.submit ? (
            <View style={s.submitErr}>
              <Ionicons name="alert-circle-outline" size={ms(15)} color={C.red} />
              <Text style={s.submitErrT}>{errors.submit}</Text>
            </View>
          ) : null}

      </KeyboardAvoidingScroll>

      {/* ── Date picker ── */}
      <DatePickerModal
        visible={datePickerOpen}
        value={startDate}
        onConfirm={(d) => { setStartDate(d); setDatePickerOpen(false); setErrors((p) => ({ ...p, startDate: "" })); }}
        onClose={() => setDatePickerOpen(false)}
      />

      {/* Add / edit one class period */}
      <AddClassPeriodModal
        visible={periodModal.visible}
        initial={periodModal.editing}
        onClose={() => setPeriodModal({ visible: false, editing: null })}
        onSave={handleSavePeriod}
      />

      {/* ── Success overlay ── */}
      {updated && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <ScrollView contentContainerStyle={s.successScroll} showsVerticalScrollIndicator={false}>
            <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>

              {/* Check circle */}
              <Animated.View style={[s.checkWrap, { transform: [{ scale: checkScale }] }]}>
                <View style={s.checkCircle}>
                  <Ionicons name="checkmark" size={ms(40)} color="#fff" />
                </View>
              </Animated.View>

              <Text style={s.successTitle}>Batch Updated!</Text>
              <View style={s.successNameRow}>
                <Ionicons name="layers-outline" size={ms(13)} color={colors.primary} />
                <Text style={s.successName} numberOfLines={1}>{updated.name}</Text>
              </View>
              <Text style={s.successSub}>All changes saved successfully</Text>

              {/* Summary tiles */}
              <View style={s.summaryGrid}>
                {[
                  { icon: "book-outline",        label: "Course",   value: updated.course.name, color: C.blue   },
                  { icon: "people-outline",       label: "Capacity", value: `${updated.capacity} seats`, color: C.green  },
                  { icon: "pulse-outline",        label: "Status",   value: STATUS_OPTIONS.find((o) => o.key === updated.status)?.label ?? updated.status, color: C.orange },
                  { icon: "calendar-outline",     label: "Starts",   value: new Date(updated.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), color: colors.primary },
                  { icon: "flag-outline",         label: "Ends",     value: new Date(updated.endDate).toLocaleDateString("en-IN",   { day: "2-digit", month: "short", year: "numeric" }), color: colors.primary },
                ].map((row, i, arr) => (
                  <View key={row.label} style={[s.summaryRow, i < arr.length - 1 && s.summaryRowBorder]}>
                    <View style={[s.summaryIcon, { backgroundColor: row.color + "18" }]}>
                      <Ionicons name={row.icon as any} size={ms(14)} color={row.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.summaryLabel}>{row.label}</Text>
                      <Text style={s.summaryValue} numberOfLines={1}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={s.goBackBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
                <Ionicons name="arrow-back" size={ms(18)} color="#fff" />
                <Text style={s.goBackT}>Back to Batch</Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.screenBg },
  scroll: { flex: 1, backgroundColor: colors.screenBg },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(8), gap: ms(14) },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius:    ms(18),
    overflow:        "hidden",
    shadowColor:     C.text,
    shadowOffset:    { width: 0, height: ms(2) },
    shadowOpacity:   0.07,
    shadowRadius:    ms(8),
    elevation:       3,
  },
  cardHead:     { flexDirection: "row", alignItems: "center", gap: ms(10), padding: ms(14) },
  cardHeadIcon: { width: ms(32), height: ms(32), borderRadius: ms(9), alignItems: "center", justifyContent: "center" },
  cardHeadT:    { flex: 1, ...T.listItemTitle, color: C.text },
  divider:      { height: 1, backgroundColor: C.border },

  // Lock chip
  lockChip:  { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.inputBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(4) },
  lockChipT: { ...T.badgeText, color: C.muted },

  // Course row
  courseRow:   { flexDirection: "row", alignItems: "center", gap: ms(12), padding: ms(14) },
  examBadge:   { borderRadius: ms(8), paddingHorizontal: ms(10), paddingVertical: ms(5) },
  examBadgeT:  { ...T.badgeText },
  courseName:  { ...T.listItemTitle, color: C.text },
  courseSub:   { ...T.caption, color: C.muted, marginTop: ms(2) },

  // Fields padding wrapper
  fieldsPad: { paddingHorizontal: ms(14) },

  // Status
  statusGrid:   { flexDirection: "row", gap: ms(8), padding: ms(14) },
  statusChip:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6), paddingVertical: ms(10), borderRadius: ms(12), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },
  statusChipT:  { ...T.chipText, color: C.muted },
  enrolledNote: { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: C.blue + "12", borderRadius: ms(10), padding: ms(10), margin: ms(14), marginTop: 0 },
  enrolledNoteT:{ ...T.chipText, color: C.blue },

  // Class periods
  periodsEmptyT: { ...T.bodySmall, color: C.muted, marginBottom: ms(12) },
  periodsLoadingRow: { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(12) },
  periodRow: {
    flexDirection: "row", alignItems: "center", gap: ms(8),
    backgroundColor: C.inputBg, borderRadius: ms(12), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    paddingHorizontal: ms(12), paddingVertical: ms(10),
  },
  periodDays: { ...T.listItemTitle, color: C.text },
  periodMeta: { ...T.caption, color: C.muted, marginTop: ms(2) },
  periodIconBtn: {
    width: ms(28), height: ms(28), borderRadius: ms(9),
    alignItems: "center", justifyContent: "center", backgroundColor: C.card,
  },
  addPeriodBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6),
    marginTop: ms(12), paddingVertical: ms(11), borderRadius: ms(10),
    borderWidth: 1.5, borderStyle: "dashed",
  },
  addPeriodBtnT: { ...T.chipText },

  // Submit error
  submitErr:  { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.red + "12", borderRadius: ms(12), padding: ms(12) },
  submitErrT: { ...T.body, color: C.red, flex: 1 },

  footer: { paddingHorizontal: ms(16), paddingTop: ms(12), paddingBottom: ms(14), backgroundColor: colors.screenBg, borderTopWidth: 1, borderTopColor: C.border },

  // Save button
  saveBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             ms(8),
    backgroundColor: colors.primary,
    borderRadius:    ms(16),
    paddingVertical: ms(16),
    shadowColor:     colors.primary,
    shadowOffset:    { width: 0, height: ms(4) },
    shadowOpacity:   0.35,
    shadowRadius:    ms(10),
    elevation:       6,
  },
  saveBtnT: { ...T.buttonText, color: "#fff" },

  // Success overlay
  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg },
  successScroll:  { flexGrow: 1, justifyContent: "center", paddingHorizontal: ms(20), paddingVertical: ms(32) },
  successCard: {
    backgroundColor: C.card,
    borderRadius:    ms(24),
    padding:         ms(24),
    alignItems:      "center",
    shadowColor:     C.text,
    shadowOffset:    { width: 0, height: ms(6) },
    shadowOpacity:   0.10,
    shadowRadius:    ms(20),
    elevation:       10,
  },
  checkWrap:   { marginBottom: ms(20) },
  checkCircle: { width: ms(80), height: ms(80), borderRadius: ms(40), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },

  successTitle:   { ...T.displayMedium, color: C.text, marginBottom: ms(8) },
  successNameRow: { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: colors.primary + "10", borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(6), marginBottom: ms(6) },
  successName:    { ...T.listItemTitle, color: colors.primary, flex: 1 },
  successSub:     { ...T.body, color: C.muted, marginBottom: ms(20) },

  summaryGrid:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(14), marginBottom: ms(20), borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  summaryRow:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(11), paddingHorizontal: ms(14), gap: ms(12) },
  summaryRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  summaryIcon:      { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  summaryLabel:     { ...T.sectionHeading, color: C.muted },
  summaryValue:     { ...T.listItemTitle, color: C.text, marginTop: ms(1) },

  goBackBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), backgroundColor: colors.primary, borderRadius: ms(14), paddingVertical: ms(14) },
  goBackT:   { ...T.buttonText, color: "#fff" },
});

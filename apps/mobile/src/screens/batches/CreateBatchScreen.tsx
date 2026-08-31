import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, ActivityIndicator, FlatList,
  Modal, TextInput,
} from "react-native";
import { BottomSheet, SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { KeyboardAvoidingScroll } from "../../components/ui/KeyboardAvoidingScroll";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { CenterPickerSheet } from "../../components/ui/CenterPickerSheet";
import { T } from "../../components/ui/typography";
import { listCourses, type CourseItem } from "../../api/courses";
import { createBatch, type BatchItem } from "../../api/batches";
import { createSlot, DAY_LABELS, DAY_ORDER, type DayOfWeek } from "../../api/classSchedule";
import { AddClassPeriodModal, type ClassPeriodDraft } from "./AddClassPeriodModal";
import { ms, fs } from "../../utils/responsive";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { usePermission } from "../../hooks/usePermission";
import { C } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "CreateBatch">;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Just for the period preview list below — AddClassPeriodModal stores/edits
// times as plain 24h "HH:MM" (matching the API), this only formats them for
// display.
function fmt12hStr(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${meridiem}`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function fmtDisplay(d: Date | null): string {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Shared wheel-picker column (used by both Date and Time pickers) ──────────
// A stable, module-level component — not declared inside DatePickerModal /
// TimePickerModal's own render body — is what makes tapping an item behave
// correctly. A component defined inline inside another component's render
// gets a brand-new identity every re-render, so React unmounts and remounts
// its ScrollView on every single state change (tap an item → state updates →
// re-render → "new" Col → the ScrollView is destroyed and recreated from
// scratch) — which is exactly why the list used to snap back to the top on
// every tap instead of keeping its scroll position.

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
// column but amplified for one further down (e.g. ~8x for hour 9, ~30x for
// day 31) — exactly the "only the default selection is misaligned" pattern
// that kept showing up. Reading each item's real position directly removes
// the guess (and the amplification) entirely.
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

// Measures the real rendered height of a column's label ("HOUR", "DAY", …)
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

function DatePickerModal({ visible, value, minYear = 2024, maxYear = 2032, onConfirm, onClose }: {
  visible: boolean;
  value: Date | null;
  minYear?: number;
  maxYear?: number;
  onConfirm: (d: Date) => void;
  onClose: () => void;
}) {
  const now = value ?? new Date();
  const [day,   setDay]   = useState(now.getDate());
  const [month, setMonth] = useState(now.getMonth());
  const [year,  setYear]  = useState(now.getFullYear());
  const colors = useThemeColors();
  const dp = useThemedStyles(makeDpStyles);

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

  // clamp day if month/year changed
  const safeDay = Math.min(day, daysInMonth);

  // Keeps the wheels scrolled to whatever's currently selected — see
  // TimePickerModal's identical effect. scrollAreaH is reactive state so it
  // has to be a dependency here (the sheet's initial open uses its fallback
  // value before the real onLayout measurement replaces it a beat later);
  // the position maps are refs, so scrollToIndex always reads their latest
  // values at call time regardless of the dependency array.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      scrollToIndex(dayRef,   dayPos.positions,   safeDay - 1,    scrollAreaH);
      scrollToIndex(monthRef, monthPos.positions, month,          scrollAreaH);
      scrollToIndex(yearRef,  yearPos.positions,  year - minYear, scrollAreaH);
    }, 80);
    return () => clearTimeout(t);
  }, [visible, scrollAreaH, safeDay, month, year, minYear]);

  function confirm() {
    onConfirm(new Date(year, month, safeDay));
  }

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
              offset derived from the real measured label height, not a
              guessed constant */}
          <View pointerEvents="none" style={[dp.highlight, { top: highlightTop }]} />
        </View>

        <View style={dp.btnRow}>
          <TouchableOpacity style={dp.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={dp.cancelT}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={dp.confirmBtn} onPress={confirm} activeOpacity={0.85}>
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
  // depends on the real rendered colLabel height, not a fixed value here.
  // left/right are 0, not the sheet's own horizontal padding, because this
  // is now positioned relative to dp.selectors (which has none of its own),
  // not the padded sheet container.
  highlight:   { position: "absolute", left: 0, right: 0, height: ms(44), borderRadius: ms(10), borderWidth: 2, borderColor: colors.primary + "20", backgroundColor: colors.primary + "06" },
  btnRow:      { flexDirection: "row", gap: ms(10), marginTop: ms(20) },
  cancelBtn:   { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), borderWidth: 1.5, borderColor: C.border },
  cancelT:     { ...T.buttonText, color: C.muted },
  confirmBtn:  { flex: 1, borderRadius: ms(14), alignItems: "center", paddingVertical: ms(14), backgroundColor: colors.primary },
  confirmT:    { ...T.buttonText, color: "#fff" },
});

// ── Course Picker Modal ───────────────────────────────────────────────────────

function CoursePickerModal({ visible, courses, loading, selectedId, onSelect, onClose }: {
  visible:    boolean;
  courses:    CourseItem[];
  loading:    boolean;
  selectedId: string | null;
  onSelect:   (c: CourseItem) => void;
  onClose:    () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  useEffect(() => { if (!visible) setSearch(""); }, [visible]);

  const filtered = courses.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.examCategories.length ? c.examCategories.map((ec) => ec.label).join(", ") : "General").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <TouchableOpacity style={pm.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[pm.panel, { paddingBottom: insets.bottom + ms(8) }]}>
          <View style={pm.handle} />

          <View style={pm.headerRow}>
            <View style={[pm.headerIco, { backgroundColor: C.purple + "18" }]}>
              <Ionicons name="book-outline" size={ms(18)} color={C.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={pm.headerTitle}>Select Course</Text>
              <Text style={pm.headerSub}>{courses.length} course{courses.length !== 1 ? "s" : ""} available</Text>
            </View>
            <TouchableOpacity style={pm.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>

          <View style={pm.searchWrap}>
            <View style={pm.searchRow}>
              <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
              <TextInput
                style={pm.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search courses…"
                placeholderTextColor={C.placeholder}
                returnKeyType="search"
                autoCorrect={false}
              />
              {!!search && (
                <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close-circle" size={ms(15)} color={C.placeholder} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView style={pm.list} contentContainerStyle={pm.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={pm.empty}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={pm.emptyT}>Loading courses…</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={pm.empty}>
                <Ionicons name="search-outline" size={ms(32)} color={C.placeholder} />
                <Text style={pm.emptyT}>{search ? "No courses found" : "No courses yet"}</Text>
                <Text style={pm.emptySub}>{search ? "Try a different search term" : "Create a course first"}</Text>
              </View>
            ) : (
              <View style={pm.grid}>
                {filtered.map((c) => {
                  const color = c.examCategories[0]?.color ?? C.muted;
                  const label = c.examCategories.length ? c.examCategories.map((ec) => ec.label).join(", ") : "General";
                  const sel   = selectedId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[pm.gridCard, { borderColor: sel ? color : C.border }, sel && { backgroundColor: color + "10" }]}
                      onPress={() => onSelect(c)}
                      activeOpacity={0.75}
                    >
                      <View style={pm.gridTop}>
                        <View style={[pm.gridCatPill, { backgroundColor: color + "16" }]}>
                          <View style={[pm.gridDot, { backgroundColor: color }]} />
                          <Text style={[pm.gridCat, { color }]}>{label}</Text>
                        </View>
                        {sel && <Ionicons name="checkmark-circle" size={ms(16)} color={color} />}
                      </View>
                      <Text style={[pm.gridName, sel && { color }]} numberOfLines={2}>{c.name}</Text>
                      <View style={pm.gridMeta}>
                        <Text style={pm.gridDur}>{c.durationMonths}mo</Text>
                        {c.defaultFee > 0 && (
                          <Text style={pm.gridFee}>₹{Number(c.defaultFee / 1000).toFixed(0)}k</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  panel:       { backgroundColor: C.card, borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), maxHeight: SHEET_HEIGHT.tall, paddingTop: ms(10) },
  handle:      { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginBottom: ms(12) },
  headerRow:   { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: ms(16), paddingBottom: ms(14), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  headerIco:   { width: ms(40), height: ms(40), borderRadius: ms(13), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  headerTitle: { ...T.cardTitle, color: C.text },
  headerSub:   { ...T.caption, color: C.muted, marginTop: ms(2) },
  closeBtn:    { width: ms(36), height: ms(36), borderRadius: ms(11), backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  searchWrap:  { paddingHorizontal: ms(16), paddingTop: ms(12), paddingBottom: ms(4) },
  searchRow:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.inputBg, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  searchInput: { flex: 1, ...T.body, color: C.text, includeFontPadding: false, padding: 0 },
  list:        { flexGrow: 0 },
  listContent: { paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(40) },
  empty:       { alignItems: "center", gap: ms(8), paddingVertical: ms(32) },
  emptyT:      { ...T.listItemTitle, color: C.muted },
  emptySub:    { ...T.bodySmall, color: C.placeholder },
  grid:        { flexDirection: "row", flexWrap: "wrap", gap: ms(10) },
  gridCard:    { width: "47%", backgroundColor: C.card, borderRadius: ms(14), borderWidth: 1.5, overflow: "hidden" },
  gridTop:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ms(10), paddingVertical: ms(8) },
  gridCatPill: { flexDirection: "row", alignItems: "center", gap: ms(5), borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  gridDot:     { width: ms(6), height: ms(6), borderRadius: ms(3) },
  gridCat:     { ...T.chipText },
  gridName:    { ...T.cardTitle, color: C.text, paddingHorizontal: ms(10), paddingVertical: ms(4) },
  gridMeta:    { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(10), paddingBottom: ms(10) },
  gridDur:     { ...T.caption, color: C.muted },
  gridFee:     { ...T.caption, color: C.green },
});

// ── Date field button ─────────────────────────────────────────────────────────

function DateField({ label, value, placeholder, onPress, readOnly = false, error, required = false }: {
  label: string; value: string; placeholder: string;
  onPress?: () => void; readOnly?: boolean; error?: string; required?: boolean;
}) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  return (
    <View style={s.dateFieldWrap}>
      <Text style={s.fieldLabel}>
        {label}
        {required ? <Text style={s.asterisk}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={[s.dateField, readOnly && s.dateFieldReadOnly, !!error && s.dateFieldError]}
        onPress={onPress}
        activeOpacity={readOnly ? 1 : 0.8}
        disabled={readOnly}
      >
        <Ionicons
          name={readOnly ? "lock-closed-outline" : "calendar-outline"}
          size={ms(16)}
          color={readOnly ? C.placeholder : value ? colors.primary : C.placeholder}
        />
        <Text style={[s.dateFieldT, !value && s.dateFieldPlaceholder, readOnly && { color: C.muted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {!readOnly && <Ionicons name="chevron-down" size={ms(14)} color={C.placeholder} />}
        {readOnly && (
          <View style={s.autoCalcBadge}>
            <Text style={s.autoCalcT}>Auto</Text>
          </View>
        )}
      </TouchableOpacity>
      {error ? <Text style={s.errT}>{error}</Text> : null}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function CreateBatchScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);

  // Nothing links here for a role without batches.write today (the FAB that
  // opens this screen is itself hidden), but nothing stops a direct
  // navigation.navigate("CreateBatch") either — RootNavigator registers
  // every route unconditionally. Closes that deep-link gap at the destination.
  const { canWrite } = usePermission("batches");
  useEffect(() => { if (!canWrite) navigation.goBack(); }, [canWrite]);

  const [courses, setCourses]           = useState<CourseItem[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseItem | null>(null);

  const [name, setName]         = useState("");
  const [capacity, setCapacity] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);

  // Each period is fully independent — its own days, timing, subject and
  // faculty — added one at a time via AddClassPeriodModal and only turned
  // into real ClassSlot rows once the batch itself exists (see
  // handleSubmit). Deliberately not a single shared day-set + time-range:
  // a batch can have back-to-back periods that are genuinely different
  // classes (different subject/faculty), which a single range can't express.
  const [periods, setPeriods] = useState<ClassPeriodDraft[]>([]);
  const [periodModal, setPeriodModal] = useState<{ visible: boolean; editing: ClassPeriodDraft | null }>({ visible: false, editing: null });

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

  // end date is always auto-calculated
  const endDate: Date | null = startDate && selectedCourse
    ? addMonths(startDate, selectedCourse.durationMonths)
    : null;

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<BatchItem | null>(null);
  const [centerPickerVisible, setCenterPickerVisible] = useState(false);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(ms(40))).current;
  const checkScale  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setCoursesLoading(true);
    listCourses({ limit: 100 })
      .then((res) => setCourses(res.data))
      .catch(() => {})
      .finally(() => setCoursesLoading(false));
  }, []);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!selectedCourse)                         errs.course   = "Please select a course.";
    if (!name.trim())                            errs.name     = "Batch name is required.";
    if (!capacity.trim() || Number(capacity) < 1) errs.capacity = "Enter a valid capacity.";
    if (!startDate)                              errs.startDate = "Please select a start date.";
    // Every period was already validated for itself (at least one day, a
    // real start<end range) inside AddClassPeriodModal before it could be
    // added to the list — nothing left to cross-check here.
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(overrideCenterId?: string) {
    if (!validate() || !selectedCourse || !startDate || !endDate) return;
    setLoading(true);
    const response = await createBatch({
      courseId:  selectedCourse.id,
      name:      name.trim(),
      capacity:  Number(capacity),
      startDate: toISO(startDate),
      endDate:   toISO(endDate),
      ...(overrideCenterId ? { centerId: overrideCenterId } : {}),
    });

    if (response.ok && periods.length > 0) {
      // Best-effort — the batch itself already exists at this point, so a slot
      // failure shouldn't block success; staff can always add/fix slots later
      // from the batch's Class Schedule screen. One ClassSlot per (day × period)
      // — a period covering 3 days becomes 3 slots, each with that period's own
      // timing/subject/faculty/room.
      await Promise.all(
        periods.flatMap((period) =>
          period.days.map((dayOfWeek) =>
            createSlot(response.batch.id, {
              dayOfWeek,
              startTime: period.startTime,
              endTime:   period.endTime,
              subjectId: period.subjectId ?? undefined,
              facultyId: period.facultyId ?? undefined,
              room:      period.room || undefined,
              validFrom: toISO(startDate),
            }).catch(() => {})
          )
        )
      );
    }

    setLoading(false);
    if (response.ok) {
      setCreated(response.batch);
      Animated.parallel([
        Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7, delay: 100 }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 60 }),
      ]).start();
    } else if (response.error.includes("centerId") && !overrideCenterId) {
      // Session has no center pinned ("all-centers" mode) — offer the fallback picker
      // instead of surfacing a raw error. Only on the first attempt: if we already
      // supplied a centerId and it still failed, retrying would loop forever.
      setCenterPickerVisible(true);
    } else {
      setErrors({ submit: response.error });
    }
  }

  const examColor = selectedCourse?.examCategories[0]?.color ?? C.muted;
  const examLabel = selectedCourse
    ? (selectedCourse.examCategories.length ? selectedCourse.examCategories.map((ec) => ec.label).join(", ") : "General")
    : "";

  if (!canWrite) return null;

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="Create Batch" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingScroll
        style={s.scroll}
        contentContainerStyle={s.body}
        footer={
          <View style={s.footer}>
            <TouchableOpacity style={s.submitBtn} onPress={() => handleSubmit()} disabled={loading} activeOpacity={0.85}>
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={ms(20)} color="#fff" />
                    <Text style={s.submitT}>Create Batch</Text>
                  </>}
            </TouchableOpacity>
          </View>
        }
      >

          {/* Course */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: colors.primary + "18" }]}>
                <Ionicons name="book-outline" size={ms(16)} color={colors.primary} />
              </View>
              <Text style={[s.sectionLabel, { color: colors.primary }]}>COURSE</Text>
            </View>

            <View style={s.coursePickerWrap}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: ms(8) }}>
                <Text style={[s.fieldLabel, { marginBottom: 0 }, !!errors.course && { color: C.red }]}>SELECT COURSE</Text>
                <Text style={s.asterisk}> *</Text>
              </View>
              <TouchableOpacity
                style={[s.courseSel, !!errors.course && s.courseSelErr]}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.75}
              >
                {coursesLoading ? (
                  <>
                    <ActivityIndicator size="small" color={C.muted} />
                    <Text style={s.courseSelPlaceholder}>Loading courses…</Text>
                  </>
                ) : selectedCourse ? (
                  <>
                    <View style={[s.courseSelDot, { backgroundColor: examColor }]} />
                    <Text style={s.courseSelValue} numberOfLines={1}>{selectedCourse.name}</Text>
                    <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
                  </>
                ) : (
                  <>
                    <Ionicons name="book-outline" size={ms(16)} color={errors.course ? C.red : C.muted} />
                    <Text style={[s.courseSelPlaceholder, !!errors.course && { color: C.red }]}>Tap to select a course</Text>
                    <Ionicons name="chevron-forward" size={ms(16)} color={errors.course ? C.red : C.placeholder} />
                  </>
                )}
              </TouchableOpacity>
              {!!errors.course && (
                <View style={s.inlineError}>
                  <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
                  <Text style={s.inlineErrorT}>{errors.course}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Batch details */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: colors.primary + "18" }]}>
                <Ionicons name="layers-outline" size={ms(16)} color={colors.primary} />
              </View>
              <Text style={[s.sectionLabel, { color: colors.primary }]}>BATCH DETAILS</Text>
            </View>
            <FormField label="BATCH NAME" value={name}
              onChangeText={(v) => { setName(v); setErrors((p) => ({ ...p, name: "" })); }}
              placeholder="e.g. SSC Morning Batch A" error={errors.name} icon="layers-outline" maxLength={120} clearable required />
            <FormField label="CAPACITY (SEATS)" value={capacity}
              onChangeText={(v) => { setCapacity(v.replace(/\D/g, "")); setErrors((p) => ({ ...p, capacity: "" })); }}
              placeholder="e.g. 40" keyboardType="number-pad" error={errors.capacity} icon="people-outline" required />
          </View>

          {/* Schedule */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: colors.primary + "18" }]}>
                <Ionicons name="calendar-outline" size={ms(16)} color={colors.primary} />
              </View>
              <Text style={[s.sectionLabel, { color: colors.primary }]}>SCHEDULE</Text>
            </View>

            <DateField
              label="START DATE"
              value={fmtDisplay(startDate)}
              placeholder="Tap to select start date"
              onPress={() => setDatePickerOpen(true)}
              error={errors.startDate}
              required
            />

            <DateField
              label={`END DATE${selectedCourse ? ` (${selectedCourse.durationMonths} months from start)` : ""}`}
              value={fmtDisplay(endDate)}
              placeholder={startDate ? "Select a course to auto-calculate" : "Auto-calculated from start date"}
              readOnly
            />
          </View>

          {/* Class Timing — optional; each period is its own days/time/subject/
              faculty, so batches with genuinely different back-to-back classes
              (not just one continuous block) are fully representable here,
              not just via the batch's Class Schedule screen afterward. */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: colors.primary + "18" }]}>
                <Ionicons name="time-outline" size={ms(16)} color={colors.primary} />
              </View>
              <Text style={[s.sectionLabel, { color: colors.primary }]}>CLASS TIMING</Text>
            </View>

            {periods.length === 0 ? (
              <Text style={s.periodsEmptyT}>No class periods added yet — optional, can also be set up later.</Text>
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
              style={s.addPeriodBtn}
              onPress={() => setPeriodModal({ visible: true, editing: null })}
              activeOpacity={0.75}
            >
              <Ionicons name="add-circle-outline" size={ms(16)} color={colors.primary} />
              <Text style={[s.addPeriodBtnT, { color: colors.primary }]}>Add Class Period</Text>
            </TouchableOpacity>
          </View>

          {errors.submit ? (
            <View style={s.submitErr}>
              <Ionicons name="alert-circle-outline" size={ms(16)} color={C.red} />
              <Text style={s.submitErrT}>{errors.submit}</Text>
            </View>
          ) : null}

      </KeyboardAvoidingScroll>

      {/* Course picker */}
      <CoursePickerModal
        visible={pickerOpen}
        courses={courses}
        loading={coursesLoading}
        selectedId={selectedCourse?.id ?? null}
        onSelect={(c) => { setSelectedCourse(c); setPickerOpen(false); setErrors((p) => ({ ...p, course: "" })); }}
        onClose={() => setPickerOpen(false)}
      />

      {/* Date picker */}
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

      <CenterPickerSheet
        visible={centerPickerVisible}
        onClose={() => setCenterPickerVisible(false)}
        onSelect={(centerId) => { setCenterPickerVisible(false); handleSubmit(centerId); }}
      />

      {/* Success card */}
      {created && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <ScrollView contentContainerStyle={s.successScroll} showsVerticalScrollIndicator={false}>
            <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>
              <Animated.View style={{ transform: [{ scale: checkScale }], marginBottom: ms(20) }}>
                <LinearGradient colors={[C.green, "#16A085"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
                  <Ionicons name="checkmark" size={ms(44)} color="#fff" />
                </LinearGradient>
              </Animated.View>
              <Text style={s.successTitle}>Batch Created!</Text>
              <Text style={s.successSub}>The batch is ready for student enrollment</Text>

              <View style={s.detailBox}>
                {[
                  { icon: "layers-outline",     label: "Batch Name", value: created.name,                           color: colors.primary },
                  { icon: "book-outline",        label: "Course",     value: created.course.name,                    color: C.blue },
                  { icon: "people-outline",      label: "Capacity",   value: `${created.capacity} seats`,            color: C.green },
                  { icon: "play-circle-outline", label: "Starts",     value: new Date(created.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), color: C.orange },
                  { icon: "stop-circle-outline", label: "Ends",       value: new Date(created.endDate).toLocaleDateString("en-IN",   { day: "2-digit", month: "short", year: "numeric" }), color: C.orange },
                  ...(periods.length > 0 ? [{
                    icon: "time-outline", label: "Class Periods",
                    value: `${periods.length} period${periods.length !== 1 ? "s" : ""} added`,
                    color: colors.primary,
                  }] : []),
                ].map((row, i, arr) => (
                  <View key={row.label} style={[s.detailRow, i < arr.length - 1 && s.detailRowBorder]}>
                    <View style={[s.detailIcon, { backgroundColor: row.color + "18" }]}>
                      <Ionicons name={row.icon as any} size={ms(14)} color={row.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.detailLabel}>{row.label}</Text>
                      <Text style={s.detailValue}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.viewAllBtn}>
                <View style={s.viewAllGrad}>
                  <Ionicons name="layers-outline" size={ms(16)} color="#fff" />
                  <Text style={s.viewAllT}>View All Batches</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.screenBg },
  scroll: { flex: 1, backgroundColor: colors.screenBg },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(16) },

  card:        { backgroundColor: C.card, borderRadius: ms(18), paddingHorizontal: ms(14), paddingTop: ms(14), paddingBottom: ms(2), marginBottom: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(12) },
  sectionIcon: { width: ms(32), height: ms(32), borderRadius: ms(9), justifyContent: "center", alignItems: "center" },
  sectionLabel:{ ...T.sectionHeading, letterSpacing: 0.8 },

  coursePickerWrap:     { marginBottom: ms(16) },
  courseSel:            { flexDirection: "row", alignItems: "center", gap: ms(10), backgroundColor: C.inputBg, borderRadius: ms(14), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, paddingHorizontal: ms(14), paddingVertical: ms(14) },
  courseSelErr:         { borderColor: C.red, backgroundColor: C.red + "08" },
  courseSelDot:         { width: ms(10), height: ms(10), borderRadius: ms(5), flexShrink: 0 },
  courseSelValue:       { flex: 1, ...T.listItemTitle, color: C.text },
  courseSelPlaceholder: { flex: 1, ...T.body, color: C.placeholder },
  inlineError:          { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(6) },
  inlineErrorT:         { ...T.helperText, color: C.red, flex: 1 },

  dateFieldWrap:      { marginBottom: ms(16) },
  fieldLabel:         { ...T.sectionHeading, color: C.text, letterSpacing: 0.8, marginBottom: ms(8) },
  asterisk:           { color: C.red, fontFamily: "Inter_700Bold", fontWeight: "700" },
  dateField:          { flexDirection: "row", alignItems: "center", gap: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(13), backgroundColor: C.inputBg },
  dateFieldReadOnly:  { backgroundColor: C.bg, borderColor: C.border },
  dateFieldError:     { borderColor: C.red },
  dateFieldT:         { flex: 1, ...T.listItemTitle, color: C.text },
  dateFieldPlaceholder: { color: C.placeholder, fontFamily: "Inter_400Regular", fontWeight: "400" },
  autoCalcBadge:      { backgroundColor: C.greenBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  autoCalcT:          { ...T.badgeText, color: C.green },

  periodsEmptyT: { ...T.bodySmall, color: C.muted, marginBottom: ms(12) },
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
    borderWidth: 1.5, borderColor: colors.primary + "40", borderStyle: "dashed",
  },
  addPeriodBtnT: { ...T.chipText },

  errT:        { ...T.helperText, color: C.red, marginTop: ms(4) },
  submitBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16), backgroundColor: colors.primary },
  submitT:     { ...T.buttonText, color: "#fff" },
  footer:      { paddingHorizontal: ms(16), paddingTop: ms(12), paddingBottom: ms(14), backgroundColor: colors.screenBg, borderTopWidth: 1, borderTopColor: C.border },
  submitErr:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.red + "18", borderRadius: ms(10), padding: ms(12), marginBottom: ms(12) },
  submitErrT:  { ...T.body, color: C.red, flex: 1 },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg },
  successScroll:  { flexGrow: 1, justifyContent: "center", paddingHorizontal: ms(20), paddingVertical: ms(32) },
  successCard:    { backgroundColor: C.card, borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { ...T.displayMedium, color: C.text, marginBottom: ms(6) },
  successSub:     { ...T.body, color: C.muted, marginBottom: ms(20), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(20), borderWidth: 1, borderColor: C.border },
  detailRow:      { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), gap: ms(12) },
  detailRowBorder:{ borderBottomWidth: 1, borderBottomColor: C.border },
  detailIcon:     { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  detailLabel:    { ...T.sectionHeading, color: C.muted },
  detailValue:    { ...T.listItemTitle, color: C.text, marginTop: ms(1) },
  viewAllBtn:     { width: "100%", borderRadius: ms(16), backgroundColor: colors.primary },
  viewAllGrad:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), paddingVertical: ms(16) },
  viewAllT:       { ...T.buttonText, color: "#fff" },
});

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Animated, ActivityIndicator, FlatList,
  Modal, TextInput, Keyboard,
} from "react-native";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { listCourses, type CourseItem } from "../../api/courses";
import { createBatch, type BatchItem } from "../../api/batches";
import { createSlot, DAY_LABELS, DAY_ORDER, type DayOfWeek } from "../../api/classSchedule";
import { ms, fs } from "../../utils/responsive";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "CreateBatch">;

// ── Time helpers (24h "HH:MM" storage ↔ 12h AM/PM display) ────────────────────

const HOURS_12   = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES_05 = Array.from({ length: 12 }, (_, i) => i * 5);  // 0,5,...,55
const MERIDIEMS: ("AM" | "PM")[] = ["AM", "PM"];

function to24h(hour12: number, minute: number, meridiem: "AM" | "PM"): string {
  let h = hour12 % 12;
  if (meridiem === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function from24h(time: string): { hour12: number; minute: number; meridiem: "AM" | "PM" } {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const meridiem: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: m, meridiem };
}

function fmt12h(time: string | null): string {
  if (!time) return "";
  const { hour12, minute, meridiem } = from24h(time);
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // clamp day if month/year changed
  const safeDay = Math.min(day, daysInMonth);

  // selectors container is ms(180); colLabel (fontSize 10 + mb 4) ~ms(16) reduces ScrollView height
  const ITEM_H  = ms(42);
  const CONT_H  = ms(164);
  const PAD_TOP = ms(60);

  function scrollToIndex(ref: React.RefObject<ScrollView | null>, idx: number) {
    const offset = PAD_TOP + idx * ITEM_H + ITEM_H / 2 - CONT_H / 2;
    ref.current?.scrollTo({ y: Math.max(0, offset), animated: false });
  }

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      scrollToIndex(dayRef,   safeDay - 1);
      scrollToIndex(monthRef, month);
      scrollToIndex(yearRef,  year - minYear);
    }, 80);
    return () => clearTimeout(t);
  }, [visible]);

  function confirm() {
    onConfirm(new Date(year, month, safeDay));
  }

  function Col<T>({ items, selected, onSelect, fmt, scrollRef }: {
    items: T[]; selected: T; onSelect: (v: T) => void; fmt: (v: T) => string;
    scrollRef?: React.RefObject<ScrollView | null>;
  }) {
    return (
      <ScrollView ref={scrollRef} style={dp.col} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ paddingVertical: ms(60) }}>
          {items.map((item) => {
            const active = item === selected;
            return (
              <TouchableOpacity key={String(item)} style={[dp.item, active && dp.itemActive]} onPress={() => onSelect(item)} activeOpacity={0.7}>
                <Text style={[dp.itemT, active && dp.itemActiveT]}>{fmt(item)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={dp.sheetPad}>
        <View style={dp.handle} />
        <Text style={dp.title}>Select Date</Text>

        <View style={dp.selectors}>
          <View style={dp.selector}>
            <Text style={dp.colLabel}>DAY</Text>
            <Col items={days} selected={safeDay} onSelect={setDay} fmt={(v) => String(v)} scrollRef={dayRef} />
          </View>
          <View style={[dp.selector, { flex: 1.4 }]}>
            <Text style={dp.colLabel}>MONTH</Text>
            <Col items={MONTHS} selected={MONTHS[month]} onSelect={(v) => setMonth(MONTHS.indexOf(v))} fmt={(v) => v} scrollRef={monthRef} />
          </View>
          <View style={dp.selector}>
            <Text style={dp.colLabel}>YEAR</Text>
            <Col items={years} selected={year} onSelect={setYear} fmt={(v) => String(v)} scrollRef={yearRef} />
          </View>
        </View>

        {/* highlight bar */}
        <View pointerEvents="none" style={dp.highlight} />

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
  title:       { fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, marginBottom: ms(8), textAlign: "center" },
  selectors:   { flexDirection: "row", height: ms(180), gap: ms(4) },
  selector:    { flex: 1 },
  colLabel:    { fontSize: fs(10), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.muted, letterSpacing: 1, textAlign: "center", marginBottom: ms(4) },
  col:         { flex: 1 },
  item:        { alignItems: "center", paddingVertical: ms(10) },
  itemActive:  { backgroundColor: colors.primary + "12", borderRadius: ms(8) },
  itemT:       { fontSize: fs(15), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  itemActiveT: { color: colors.primary, fontFamily: "Inter_800ExtraBold", fontWeight: "800" },
  highlight:   { position: "absolute", left: ms(20), right: ms(20), top: ms(138), height: ms(44), borderRadius: ms(10), borderWidth: 2, borderColor: colors.primary + "20", backgroundColor: colors.primary + "06" },
  btnRow:      { flexDirection: "row", gap: ms(10), marginTop: ms(20) },
  cancelBtn:   { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), borderWidth: 1.5, borderColor: C.border },
  cancelT:     { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.muted },
  confirmBtn:  { flex: 1, borderRadius: ms(14), alignItems: "center", paddingVertical: ms(14), backgroundColor: colors.primary },
  confirmT:    { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff" },
});

// ── Time Picker Modal (Hour / Minute / AM-PM wheels) ──────────────────────────

function TimePickerModal({ visible, value, title, onConfirm, onClose }: {
  visible: boolean;
  value: string | null; // 24h "HH:MM"
  title: string;
  onConfirm: (time24: string) => void;
  onClose: () => void;
}) {
  const initial = from24h(value ?? "09:00");
  const [hour, setHour]         = useState(initial.hour12);
  const [minute, setMinute]     = useState(initial.minute);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">(initial.meridiem);
  const colors = useThemeColors();
  const dp = useThemedStyles(makeDpStyles);

  useEffect(() => {
    if (!visible) return;
    const v = from24h(value ?? "09:00");
    setHour(v.hour12);
    setMinute(v.minute);
    setMeridiem(v.meridiem);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function Col<T>({ items, selected, onSelect, fmt }: {
    items: T[]; selected: T; onSelect: (v: T) => void; fmt: (v: T) => string;
  }) {
    return (
      <ScrollView style={dp.col} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ paddingVertical: ms(60) }}>
          {items.map((item) => {
            const active = item === selected;
            return (
              <TouchableOpacity key={String(item)} style={[dp.item, active && dp.itemActive]} onPress={() => onSelect(item)} activeOpacity={0.7}>
                <Text style={[dp.itemT, active && dp.itemActiveT]}>{fmt(item)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={dp.sheetPad}>
        <View style={dp.handle} />
        <Text style={dp.title}>{title}</Text>

        <View style={dp.selectors}>
          <View style={dp.selector}>
            <Text style={dp.colLabel}>HOUR</Text>
            <Col items={HOURS_12} selected={hour} onSelect={setHour} fmt={(v) => String(v)} />
          </View>
          <View style={dp.selector}>
            <Text style={dp.colLabel}>MIN</Text>
            <Col items={MINUTES_05} selected={minute} onSelect={setMinute} fmt={(v) => String(v).padStart(2, "0")} />
          </View>
          <View style={dp.selector}>
            <Text style={dp.colLabel}>&nbsp;</Text>
            <Col items={MERIDIEMS} selected={meridiem} onSelect={setMeridiem} fmt={(v) => v} />
          </View>
        </View>

        <View pointerEvents="none" style={dp.highlight} />

        <View style={dp.btnRow}>
          <TouchableOpacity style={dp.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={dp.cancelT}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={dp.confirmBtn} onPress={() => onConfirm(to24h(hour, minute, meridiem))} activeOpacity={0.85}>
            <Text style={dp.confirmT}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

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
  panel:       { backgroundColor: C.card, borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), maxHeight: "92%", paddingTop: ms(10) },
  handle:      { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginBottom: ms(12) },
  headerRow:   { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: ms(16), paddingBottom: ms(14), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  headerIco:   { width: ms(40), height: ms(40), borderRadius: ms(13), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  headerTitle: { fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  headerSub:   { fontSize: fs(12), color: C.muted, marginTop: ms(2) },
  closeBtn:    { width: ms(36), height: ms(36), borderRadius: ms(11), backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  searchWrap:  { paddingHorizontal: ms(16), paddingTop: ms(12), paddingBottom: ms(4) },
  searchRow:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.inputBg, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, fontSize: fs(14), color: C.text, includeFontPadding: false, padding: 0 },
  list:        { flexGrow: 0 },
  listContent: { paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(40) },
  empty:       { alignItems: "center", gap: ms(8), paddingVertical: ms(32) },
  emptyT:      { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.muted },
  emptySub:    { fontSize: fs(12), color: C.placeholder },
  grid:        { flexDirection: "row", flexWrap: "wrap", gap: ms(10) },
  gridCard:    { width: "47%", backgroundColor: C.card, borderRadius: ms(14), borderWidth: 1.5, overflow: "hidden" },
  gridTop:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ms(10), paddingVertical: ms(8) },
  gridCatPill: { flexDirection: "row", alignItems: "center", gap: ms(5), borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  gridDot:     { width: ms(6), height: ms(6), borderRadius: ms(3) },
  gridCat:     { fontSize: fs(9.5), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  gridName:    { fontSize: fs(12.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text, paddingHorizontal: ms(10), paddingVertical: ms(4), lineHeight: fs(18) },
  gridMeta:    { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(10), paddingBottom: ms(10) },
  gridDur:     { fontSize: fs(10.5), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  gridFee:     { fontSize: fs(10.5), color: C.green, fontFamily: "Inter_700Bold", fontWeight: "700" },
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
  const scrollRef = useRef<ScrollView>(null);

  // RN auto-scrolls to keep a focused field visible above the keyboard but
  // never scrolls back on dismiss — undo that so the form returns to its
  // original scroll position once the keyboard is fully gone.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => sub.remove();
  }, []);
  const [courses, setCourses]           = useState<CourseItem[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseItem | null>(null);

  const [name, setName]         = useState("");
  const [capacity, setCapacity] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [selectedDays, setSelectedDays] = useState<Set<DayOfWeek>>(new Set());
  const [startTimeStr, setStartTimeStr] = useState<string | null>(null); // 24h "HH:MM"
  const [endTimeStr, setEndTimeStr]     = useState<string | null>(null);
  const [startTimePickerOpen, setStartTimePickerOpen] = useState(false);
  const [endTimePickerOpen, setEndTimePickerOpen]     = useState(false);

  function toggleDay(day: DayOfWeek) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
    setErrors((p) => ({ ...p, timing: "" }));
  }

  // end date is always auto-calculated
  const endDate: Date | null = startDate && selectedCourse
    ? addMonths(startDate, selectedCourse.durationMonths)
    : null;

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<BatchItem | null>(null);

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
    // Timing is optional overall, but if any part is picked the rest is required too.
    const hasTiming = !!startTimeStr || !!endTimeStr || selectedDays.size > 0;
    if (hasTiming) {
      if (selectedDays.size === 0) errs.timing = "Select at least one class day.";
      else if (!startTimeStr || !endTimeStr) errs.timing = "Select both a start and end time.";
      else if (startTimeStr >= endTimeStr) errs.timing = "Start time must be before end time.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || !selectedCourse || !startDate || !endDate) return;
    setLoading(true);
    const response = await createBatch({
      courseId:  selectedCourse.id,
      name:      name.trim(),
      capacity:  Number(capacity),
      startDate: toISO(startDate),
      endDate:   toISO(endDate),
    });

    if (response.ok && startTimeStr && endTimeStr && selectedDays.size > 0) {
      // Best-effort — the batch itself already exists at this point, so a slot
      // failure shouldn't block success; staff can always add slots later from
      // the batch's Class Schedule screen.
      await Promise.all(
        Array.from(selectedDays).map((dayOfWeek) =>
          createSlot(response.batch.id, {
            dayOfWeek,
            startTime: startTimeStr,
            endTime:   endTimeStr,
            validFrom: toISO(startDate),
          }).catch(() => {})
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
    } else {
      setErrors({ submit: response.error });
    }
  }

  const examColor = selectedCourse?.examCategories[0]?.color ?? C.muted;
  const examLabel = selectedCourse
    ? (selectedCourse.examCategories.length ? selectedCourse.examCategories.map((ec) => ec.label).join(", ") : "General")
    : "";

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="Create Batch" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

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

          {/* Class Timing — optional; can also be set later from the batch's Class Schedule screen */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: colors.primary + "18" }]}>
                <Ionicons name="time-outline" size={ms(16)} color={colors.primary} />
              </View>
              <Text style={[s.sectionLabel, { color: colors.primary }]}>CLASS TIMING</Text>
            </View>

            <Text style={s.fieldLabel}>CLASS DAYS</Text>
            <View style={s.dayRow}>
              {DAY_ORDER.map((day) => {
                const active = selectedDays.has(day);
                return (
                  <TouchableOpacity
                    key={day}
                    style={[s.dayChip, active && s.dayChipOn]}
                    onPress={() => toggleDay(day)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.dayChipT, active && s.dayChipTOn]}>{DAY_LABELS[day]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[s.timingRow, { marginTop: ms(16) }]}>
              <View style={{ flex: 1 }}>
                <DateField
                  label="START TIME"
                  value={fmt12h(startTimeStr)}
                  placeholder="Select time"
                  onPress={() => setStartTimePickerOpen(true)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DateField
                  label="END TIME"
                  value={fmt12h(endTimeStr)}
                  placeholder="Select time"
                  onPress={() => setEndTimePickerOpen(true)}
                />
              </View>
            </View>
            {errors.timing ? <Text style={s.errT}>{errors.timing}</Text> : null}
          </View>

          {errors.submit ? (
            <View style={s.submitErr}>
              <Ionicons name="alert-circle-outline" size={ms(16)} color={C.red} />
              <Text style={s.submitErrT}>{errors.submit}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={[s.submitWrap, s.submitBtn]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="checkmark-circle-outline" size={ms(20)} color="#fff" />
                  <Text style={s.submitT}>Create Batch</Text>
                </>}
          </TouchableOpacity>
          <View style={{ height: ms(32) }} />
        </ScrollView>
      </KeyboardAvoidingView>

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

      {/* Time pickers */}
      <TimePickerModal
        visible={startTimePickerOpen}
        value={startTimeStr}
        title="Start Time"
        onConfirm={(t) => { setStartTimeStr(t); setStartTimePickerOpen(false); setErrors((p) => ({ ...p, timing: "" })); }}
        onClose={() => setStartTimePickerOpen(false)}
      />
      <TimePickerModal
        visible={endTimePickerOpen}
        value={endTimeStr}
        title="End Time"
        onConfirm={(t) => { setEndTimeStr(t); setEndTimePickerOpen(false); setErrors((p) => ({ ...p, timing: "" })); }}
        onClose={() => setEndTimePickerOpen(false)}
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
                  ...(startTimeStr && endTimeStr && selectedDays.size > 0 ? [{
                    icon: "time-outline", label: "Class Timing",
                    value: `${DAY_ORDER.filter((d) => selectedDays.has(d)).map((d) => DAY_LABELS[d]).join(", ")} · ${fmt12h(startTimeStr)} to ${fmt12h(endTimeStr)}`,
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
  sectionLabel:{ fontSize: fs(12), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: 0.8 },

  coursePickerWrap:     { marginBottom: ms(16) },
  courseSel:            { flexDirection: "row", alignItems: "center", gap: ms(10), backgroundColor: C.inputBg, borderRadius: ms(14), borderWidth: 1.5, borderColor: C.border, paddingHorizontal: ms(14), paddingVertical: ms(14) },
  courseSelErr:         { borderColor: C.red, backgroundColor: C.red + "08" },
  courseSelDot:         { width: ms(10), height: ms(10), borderRadius: ms(5), flexShrink: 0 },
  courseSelValue:       { flex: 1, fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  courseSelPlaceholder: { flex: 1, fontSize: fs(14), color: C.placeholder },
  inlineError:          { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(6) },
  inlineErrorT:         { fontSize: fs(11.5), color: C.red, flex: 1 },

  dateFieldWrap:      { marginBottom: ms(16) },
  fieldLabel:         { fontSize: fs(11), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, letterSpacing: 0.8, marginBottom: ms(8) },
  asterisk:           { color: C.red, fontFamily: "Inter_800ExtraBold", fontWeight: "800" },
  dateField:          { flexDirection: "row", alignItems: "center", gap: ms(10), borderWidth: 1.5, borderColor: C.border, borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(13), backgroundColor: C.inputBg },
  dateFieldReadOnly:  { backgroundColor: C.bg, borderColor: C.border },
  dateFieldError:     { borderColor: C.red },
  dateFieldT:         { flex: 1, fontSize: fs(13.5), color: C.text, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  dateFieldPlaceholder: { color: C.placeholder, fontFamily: "Inter_400Regular", fontWeight: "400" },
  autoCalcBadge:      { backgroundColor: C.greenBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  autoCalcT:          { fontSize: fs(10), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.green },

  dayRow:      { flexDirection: "row", gap: ms(6) },
  dayChip:     { flex: 1, alignItems: "center", paddingVertical: ms(10), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border },
  dayChipOn:   { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipT:    { fontSize: fs(12), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.muted },
  dayChipTOn:  { color: "#fff" },

  timingRow:   { flexDirection: "row", gap: ms(10) },

  errT:        { fontSize: fs(11.5), color: C.red, marginTop: ms(4) },
  submitWrap:  { marginTop: ms(4) },
  submitBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16), backgroundColor: colors.primary },
  submitT:     { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  submitErr:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.red + "18", borderRadius: ms(10), padding: ms(12), marginBottom: ms(12) },
  submitErrT:  { fontSize: fs(13), color: C.red, flex: 1 },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg },
  successScroll:  { flexGrow: 1, justifyContent: "center", paddingHorizontal: ms(20), paddingVertical: ms(32) },
  successCard:    { backgroundColor: C.card, borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { fontSize: fs(22), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, marginBottom: ms(6) },
  successSub:     { fontSize: fs(13), color: C.muted, marginBottom: ms(20), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(20), borderWidth: 1, borderColor: C.border },
  detailRow:      { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), gap: ms(12) },
  detailRowBorder:{ borderBottomWidth: 1, borderBottomColor: C.border },
  detailIcon:     { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  detailLabel:    { fontSize: fs(10.5), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  detailValue:    { fontSize: fs(13.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  viewAllBtn:     { width: "100%", borderRadius: ms(16), backgroundColor: colors.primary },
  viewAllGrad:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), paddingVertical: ms(16) },
  viewAllT:       { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
});

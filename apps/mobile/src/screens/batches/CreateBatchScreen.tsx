import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  StatusBar, TouchableOpacity, Animated, ActivityIndicator, FlatList,
} from "react-native";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { listCourses, type CourseItem } from "../../api/courses";
import { createBatch, type BatchItem } from "../../api/batches";
import { createSlot, DAY_LABELS, DAY_ORDER, type DayOfWeek } from "../../api/classSchedule";
import { ms, fs } from "../../utils/responsive";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

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

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // clamp day if month/year changed
  const safeDay = Math.min(day, daysInMonth);

  function confirm() {
    onConfirm(new Date(year, month, safeDay));
  }

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
        <Text style={dp.title}>Select Date</Text>

        <View style={dp.selectors}>
          <View style={dp.selector}>
            <Text style={dp.colLabel}>DAY</Text>
            <Col items={days} selected={safeDay} onSelect={setDay} fmt={(v) => String(v)} />
          </View>
          <View style={[dp.selector, { flex: 1.4 }]}>
            <Text style={dp.colLabel}>MONTH</Text>
            <Col items={MONTHS} selected={MONTHS[month]} onSelect={(v) => setMonth(MONTHS.indexOf(v))} fmt={(v) => v} />
          </View>
          <View style={dp.selector}>
            <Text style={dp.colLabel}>YEAR</Text>
            <Col items={years} selected={year} onSelect={setYear} fmt={(v) => String(v)} />
          </View>
        </View>

        {/* highlight bar */}
        <View pointerEvents="none" style={dp.highlight} />

        <View style={dp.btnRow}>
          <TouchableOpacity style={dp.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={dp.cancelT}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={dp.confirmBtn} onPress={confirm} activeOpacity={0.85}>
            <LinearGradient colors={[colors.primary, "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={dp.confirmGrad}>
              <Text style={dp.confirmT}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const makeDpStyles = (colors: ThemeColors) => StyleSheet.create({
  sheetPad:    { paddingTop: ms(12), paddingHorizontal: ms(20), paddingBottom: ms(32) },
  handle:      { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: "#E0D8D4", alignSelf: "center", marginBottom: ms(16) },
  title:       { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(8), textAlign: "center" },
  selectors:   { flexDirection: "row", height: ms(180), gap: ms(4) },
  selector:    { flex: 1 },
  colLabel:    { fontSize: fs(10), fontWeight: "800", color: "#8A7F82", letterSpacing: 1, textAlign: "center", marginBottom: ms(4) },
  col:         { flex: 1 },
  item:        { alignItems: "center", paddingVertical: ms(10) },
  itemActive:  { backgroundColor: "#FEF4F4", borderRadius: ms(8) },
  itemT:       { fontSize: fs(15), color: "#8A7F82", fontWeight: "600" },
  itemActiveT: { color: colors.primary, fontWeight: "800" },
  highlight:   { position: "absolute", left: ms(20), right: ms(20), top: ms(138), height: ms(44), borderRadius: ms(10), borderWidth: 2, borderColor: colors.primary + "20", backgroundColor: "#FEF4F430" },
  btnRow:      { flexDirection: "row", gap: ms(10), marginTop: ms(20) },
  cancelBtn:   { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), borderWidth: 1.5, borderColor: "#E0D8D4" },
  cancelT:     { fontSize: fs(14), fontWeight: "700", color: "#8A7F82" },
  confirmBtn:  { flex: 1, borderRadius: ms(14), overflow: "hidden" },
  confirmGrad: { alignItems: "center", paddingVertical: ms(14) },
  confirmT:    { fontSize: fs(14), fontWeight: "800", color: "#fff" },
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
            <LinearGradient colors={[colors.primary, "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={dp.confirmGrad}>
              <Text style={dp.confirmT}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

// ── Course Picker Modal ───────────────────────────────────────────────────────

function CoursePickerModal({ visible, courses, loading, onSelect, onClose }: {
  visible: boolean;
  courses: CourseItem[];
  loading: boolean;
  onSelect: (c: CourseItem) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="75%">
      <View style={pm.sheetPad}>
        <View style={pm.handle} />
        <Text style={pm.title}>Select Course</Text>
        {loading ? (
            <View style={{ alignItems: "center", paddingVertical: ms(40) }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: "#8A7F82", marginTop: ms(12), fontSize: fs(13) }}>Loading courses…</Text>
            </View>
          ) : (
            <FlatList
              data={courses}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingBottom: ms(24) }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: ms(32) }}>
                  <Ionicons name="book-outline" size={ms(40)} color="#D5CCC8" />
                  <Text style={{ color: "#B0A9AC", fontSize: fs(13), marginTop: ms(10) }}>No courses found</Text>
                  <Text style={{ color: "#C7BAB4", fontSize: fs(11), marginTop: ms(4) }}>Create a course first</Text>
                </View>
              }
              renderItem={({ item: c }) => {
                const color = c.examCategories[0]?.color ?? "#8A7F82";
                const label = c.examCategories.length
                  ? c.examCategories.map((ec) => ec.label).join(", ")
                  : "General";
                return (
                  <TouchableOpacity style={pm.row} onPress={() => onSelect(c)} activeOpacity={0.75}>
                    <View style={[pm.tag, { backgroundColor: color + "20" }]}>
                      <Text style={[pm.tagT, { color }]}>{label}</Text>
                    </View>
                    <View style={pm.rowInfo}>
                      <Text style={pm.rowName}>{c.name}</Text>
                      <Text style={pm.rowSub}>{c.durationMonths} months · ₹{Number(c.defaultFee).toLocaleString("en-IN")}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={ms(16)} color="#C7BAB4" />
                  </TouchableOpacity>
                );
              }}
            />
          )}
          <TouchableOpacity style={pm.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={pm.cancelT}>Cancel</Text>
          </TouchableOpacity>
        </View>
    </BottomSheet>
  );
}

const pm = StyleSheet.create({
  sheetPad:  { paddingTop: ms(12), paddingHorizontal: ms(16) },
  handle:    { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: "#E0D8D4", alignSelf: "center", marginBottom: ms(16) },
  title:     { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(8) },
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(14), borderBottomWidth: 1, borderBottomColor: "#F0EDE8", gap: ms(12) },
  tag:       { borderRadius: ms(8), paddingHorizontal: ms(9), paddingVertical: ms(4), flexShrink: 0 },
  tagT:      { fontSize: fs(11), fontWeight: "800" },
  rowInfo:   { flex: 1 },
  rowName:   { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F" },
  rowSub:    { fontSize: fs(11), color: "#8A7F82", marginTop: ms(2) },
  cancelBtn: { marginTop: ms(8), marginBottom: ms(24), paddingVertical: ms(14), alignItems: "center", borderRadius: ms(14), borderWidth: 1.5, borderColor: "#E0D8D4" },
  cancelT:   { fontSize: fs(14), fontWeight: "700", color: "#8A7F82" },
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
          color={readOnly ? "#B0A9AC" : value ? colors.primary : "#C7BAB4"}
        />
        <Text style={[s.dateFieldT, !value && s.dateFieldPlaceholder, readOnly && { color: "#8A7F82" }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {!readOnly && <Ionicons name="chevron-down" size={ms(14)} color="#B0A9AC" />}
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

  const examColor = selectedCourse?.examCategories[0]?.color ?? "#8A7F82";
  const examLabel = selectedCourse
    ? (selectedCourse.examCategories.length ? selectedCourse.examCategories.map((ec) => ec.label).join(", ") : "General")
    : "";

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="Create Batch" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Course */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: colors.primary + "18" }]}>
                <Ionicons name="book-outline" size={ms(16)} color={colors.primary} />
              </View>
              <Text style={[s.sectionLabel, { color: colors.primary }]}>COURSE</Text>
            </View>

            <View style={s.coursePickerWrap}>
              <Text style={s.fieldLabel}>
                SELECT COURSE
                <Text style={s.asterisk}> *</Text>
              </Text>
              <TouchableOpacity
                style={[s.coursePicker, selectedCourse && { borderColor: examColor }]}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.8}
              >
                {selectedCourse ? (
                  <View style={s.coursePickerFilled}>
                    <View style={[s.coursePickerTag, { backgroundColor: examColor + "20" }]}>
                      <Text style={[s.coursePickerTagT, { color: examColor }]}>{examLabel}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.coursePickerName}>{selectedCourse.name}</Text>
                      <Text style={s.coursePickerSub}>{selectedCourse.durationMonths} months · ₹{Number(selectedCourse.defaultFee).toLocaleString("en-IN")}</Text>
                    </View>
                    <Ionicons name="chevron-down" size={ms(16)} color="#8A7F82" />
                  </View>
                ) : (
                  <View style={s.coursePickerEmpty}>
                    {coursesLoading
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Ionicons name="add-circle-outline" size={ms(20)} color="#8A7F82" />}
                    <Text style={s.coursePickerPlaceholder}>
                      {coursesLoading ? "Loading courses…" : "Tap to select a course"}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              {errors.course ? <Text style={s.errT}>{errors.course}</Text> : null}
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
              <Ionicons name="alert-circle-outline" size={ms(16)} color="#DC2626" />
              <Text style={s.submitErrT}>{errors.submit}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={s.submitWrap} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            <LinearGradient colors={[colors.primary, "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={ms(20)} color="#fff" />
                    <Text style={s.submitT}>Create Batch</Text>
                  </>}
            </LinearGradient>
          </TouchableOpacity>
          <View style={{ height: ms(32) }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Course picker */}
      <CoursePickerModal
        visible={pickerOpen}
        courses={courses}
        loading={coursesLoading}
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
                <LinearGradient colors={["#1B9C63", "#16A085"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
                  <Ionicons name="checkmark" size={ms(44)} color="#fff" />
                </LinearGradient>
              </Animated.View>
              <Text style={s.successTitle}>Batch Created!</Text>
              <Text style={s.successSub}>The batch is ready for student enrollment</Text>

              <View style={s.detailBox}>
                {[
                  { icon: "layers-outline",     label: "Batch Name", value: created.name,                           color: colors.primary },
                  { icon: "book-outline",        label: "Course",     value: created.course.name,                    color: "#2563A8" },
                  { icon: "people-outline",      label: "Capacity",   value: `${created.capacity} seats`,            color: "#1B9C63" },
                  { icon: "play-circle-outline", label: "Starts",     value: new Date(created.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), color: "#E8752C" },
                  { icon: "stop-circle-outline", label: "Ends",       value: new Date(created.endDate).toLocaleDateString("en-IN",   { day: "2-digit", month: "short", year: "numeric" }), color: "#E8752C" },
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
                <LinearGradient colors={[colors.primary, "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.viewAllGrad}>
                  <Ionicons name="layers-outline" size={ms(16)} color="#fff" />
                  <Text style={s.viewAllT}>View All Batches</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.primary },
  scroll: { flex: 1, backgroundColor: "#FFFBF0" },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(16) },

  card:        { backgroundColor: "#FFFFFF", borderRadius: ms(18), paddingHorizontal: ms(14), paddingTop: ms(14), paddingBottom: ms(2), marginBottom: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(12) },
  sectionIcon: { width: ms(32), height: ms(32), borderRadius: ms(9), justifyContent: "center", alignItems: "center" },
  sectionLabel:{ fontSize: fs(12), fontWeight: "800", letterSpacing: 0.8 },

  coursePickerWrap:   { marginBottom: ms(16) },
  coursePicker:       { borderWidth: 1.5, borderColor: "#E0D8D4", borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(12), backgroundColor: "#FAFAFA" },
  coursePickerFilled: { flexDirection: "row", alignItems: "center", gap: ms(12) },
  coursePickerTag:    { borderRadius: ms(8), paddingHorizontal: ms(9), paddingVertical: ms(5) },
  coursePickerTagT:   { fontSize: fs(11), fontWeight: "800" },
  coursePickerName:   { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F" },
  coursePickerSub:    { fontSize: fs(11), color: "#8A7F82", marginTop: ms(2) },
  coursePickerEmpty:  { flexDirection: "row", alignItems: "center", gap: ms(10) },
  coursePickerPlaceholder: { fontSize: fs(13), color: "#B0A9AC", fontWeight: "600" },

  dateFieldWrap:      { marginBottom: ms(16) },
  fieldLabel:         { fontSize: fs(11), fontWeight: "800", color: "#2B1B1F", letterSpacing: 0.8, marginBottom: ms(8) },
  asterisk:           { color: "#C0392B", fontWeight: "800" },
  dateField:          { flexDirection: "row", alignItems: "center", gap: ms(10), borderWidth: 1.5, borderColor: "#E0D8D4", borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(13), backgroundColor: "#FAFAFA" },
  dateFieldReadOnly:  { backgroundColor: "#F7F4F2", borderColor: "#EDE8E3" },
  dateFieldError:     { borderColor: "#DC2626" },
  dateFieldT:         { flex: 1, fontSize: fs(13.5), color: "#2B1B1F", fontWeight: "600" },
  dateFieldPlaceholder: { color: "#C7BAB4", fontWeight: "400" },
  autoCalcBadge:      { backgroundColor: "#E7F7EF", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  autoCalcT:          { fontSize: fs(10), fontWeight: "800", color: "#1B9C63" },

  dayRow:      { flexDirection: "row", gap: ms(6) },
  dayChip:     { flex: 1, alignItems: "center", paddingVertical: ms(10), borderRadius: ms(10), backgroundColor: "#FAFAFA", borderWidth: 1.5, borderColor: "#E0D8D4" },
  dayChipOn:   { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipT:    { fontSize: fs(12), fontWeight: "700", color: "#8A7F82" },
  dayChipTOn:  { color: "#fff" },

  timingRow:   { flexDirection: "row", gap: ms(10) },

  errT:        { fontSize: fs(11.5), color: "#DC2626", marginTop: ms(4) },
  submitWrap:  { marginTop: ms(4) },
  submitBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  submitT:     { fontSize: fs(15), fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  submitErr:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: "#FEE2E2", borderRadius: ms(10), padding: ms(12), marginBottom: ms(12) },
  submitErrT:  { fontSize: fs(13), color: "#DC2626", flex: 1 },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFBF0" },
  successScroll:  { flexGrow: 1, justifyContent: "center", paddingHorizontal: ms(20), paddingVertical: ms(32) },
  successCard:    { backgroundColor: "#FFFFFF", borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { fontSize: fs(22), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(6) },
  successSub:     { fontSize: fs(13), color: "#8A7F82", marginBottom: ms(20), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: "#FAFAFA", borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(20), borderWidth: 1, borderColor: "#F0EDE8" },
  detailRow:      { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), gap: ms(12) },
  detailRowBorder:{ borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  detailIcon:     { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  detailLabel:    { fontSize: fs(10.5), color: "#8A7F82", fontWeight: "600" },
  detailValue:    { fontSize: fs(13.5), fontWeight: "700", color: "#1A1214" },
  viewAllBtn:     { width: "100%", borderRadius: ms(16), overflow: "hidden" },
  viewAllGrad:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), paddingVertical: ms(16) },
  viewAllT:       { fontSize: fs(15), fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
});

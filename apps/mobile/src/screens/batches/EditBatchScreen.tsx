import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  StatusBar, TouchableOpacity, Animated, ActivityIndicator,
} from "react-native";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { updateBatch, type BatchItem, type BatchStatus } from "../../api/batches";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

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

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const safeDay = Math.min(day, daysInMonth);

  function Col<T>({ items, selected, onSelect, fmt }: {
    items: T[]; selected: T; onSelect: (v: T) => void; fmt: (v: T) => string;
  }) {
    return (
      <ScrollView style={dp.col} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ paddingVertical: ms(60) }}>
          {items.map((item) => {
            const active = item === selected;
            return (
              <TouchableOpacity
                key={String(item)}
                style={[dp.item, active && dp.itemActive]}
                onPress={() => onSelect(item)}
                activeOpacity={0.7}
              >
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

        <View pointerEvents="none" style={dp.highlight} />

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
  title:       { fontSize: fs(16), fontWeight: "800", color: C.text, marginBottom: ms(8), textAlign: "center" },
  selectors:   { flexDirection: "row", height: ms(180), gap: ms(4) },
  selector:    { flex: 1 },
  colLabel:    { fontSize: fs(10), fontWeight: "800", color: C.muted, letterSpacing: 1, textAlign: "center", marginBottom: ms(4) },
  col:         { flex: 1 },
  item:        { alignItems: "center", paddingVertical: ms(10) },
  itemActive:  { backgroundColor: colors.primary + "12", borderRadius: ms(8) },
  itemT:       { fontSize: fs(15), color: C.muted, fontWeight: "600" },
  itemActiveT: { color: colors.primary, fontWeight: "800" },
  highlight:   { position: "absolute", left: ms(20), right: ms(20), top: ms(138), height: ms(44), borderRadius: ms(10), borderWidth: 1.5, borderColor: colors.primary + "30", backgroundColor: colors.primary + "06" },
  btnRow:      { flexDirection: "row", gap: ms(10), marginTop: ms(20) },
  cancelBtn:   { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg },
  cancelT:     { fontSize: fs(14), fontWeight: "700", color: C.muted },
  confirmBtn:  { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), backgroundColor: colors.primary },
  confirmT:    { fontSize: fs(14), fontWeight: "800", color: "#fff" },
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
  label:       { fontSize: fs(12.5), fontWeight: "700", color: C.text, marginBottom: ms(7), letterSpacing: 0.3 },
  field:       { flexDirection: "row", alignItems: "center", gap: ms(10), borderWidth: 1, borderColor: C.border, borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(13), backgroundColor: C.inputBg },
  fieldReadOnly:{ backgroundColor: C.bg, borderColor: C.border },
  fieldError:  { borderColor: C.red, backgroundColor: C.red + "06" },
  fieldT:      { flex: 1, fontSize: fs(14), color: C.text, fontWeight: "600" },
  placeholder: { color: C.placeholder, fontWeight: "400" },
  autoBadge:   { backgroundColor: C.green + "18", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  autoT:       { fontSize: fs(10), fontWeight: "800", color: C.green },
  errRow:      { flexDirection: "row", alignItems: "center", marginTop: ms(5), gap: ms(4) },
  errT:        { fontSize: fs(11.5), color: C.red, flex: 1 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export function EditBatchScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { batch } = route.params;

  const [name, setName]         = useState(batch.name);
  const [capacity, setCapacity] = useState(String(batch.capacity));
  const [status, setStatus]     = useState<BatchStatus>(batch.status);
  const [startDate, setStartDate] = useState<Date | null>(isoToDate(batch.startDate));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const endDate: Date | null = startDate
    ? addMonths(startDate, batch.course.durationMonths)
    : null;

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

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="Edit Batch" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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

          {/* ── Submit error ── */}
          {errors.submit ? (
            <View style={s.submitErr}>
              <Ionicons name="alert-circle-outline" size={ms(15)} color={C.red} />
              <Text style={s.submitErrT}>{errors.submit}</Text>
            </View>
          ) : null}

          {/* ── Save button ── */}
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

          <View style={{ height: ms(32) }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Date picker ── */}
      <DatePickerModal
        visible={datePickerOpen}
        value={startDate}
        onConfirm={(d) => { setStartDate(d); setDatePickerOpen(false); setErrors((p) => ({ ...p, startDate: "" })); }}
        onClose={() => setDatePickerOpen(false)}
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
  safe:   { flex: 1, backgroundColor: colors.primary },
  scroll: { flex: 1, backgroundColor: C.bg },
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
  cardHeadT:    { flex: 1, fontSize: fs(14), fontWeight: "800", color: C.text },
  divider:      { height: 1, backgroundColor: C.border },

  // Lock chip
  lockChip:  { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.inputBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(4) },
  lockChipT: { fontSize: fs(10), fontWeight: "700", color: C.muted },

  // Course row
  courseRow:   { flexDirection: "row", alignItems: "center", gap: ms(12), padding: ms(14) },
  examBadge:   { borderRadius: ms(8), paddingHorizontal: ms(10), paddingVertical: ms(5) },
  examBadgeT:  { fontSize: fs(11), fontWeight: "800" },
  courseName:  { fontSize: fs(13), fontWeight: "700", color: C.text },
  courseSub:   { fontSize: fs(11), color: C.muted, marginTop: ms(2) },

  // Fields padding wrapper
  fieldsPad: { paddingHorizontal: ms(14) },

  // Status
  statusGrid:   { flexDirection: "row", gap: ms(8), padding: ms(14) },
  statusChip:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6), paddingVertical: ms(10), borderRadius: ms(12), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },
  statusChipT:  { fontSize: fs(12), fontWeight: "700", color: C.muted },
  enrolledNote: { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: C.blue + "12", borderRadius: ms(10), padding: ms(10), margin: ms(14), marginTop: 0 },
  enrolledNoteT:{ fontSize: fs(12), color: C.blue, fontWeight: "600" },

  // Submit error
  submitErr:  { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.red + "12", borderRadius: ms(12), padding: ms(12) },
  submitErrT: { fontSize: fs(13), color: C.red, flex: 1 },

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
  saveBtnT: { fontSize: fs(15), fontWeight: "800", color: "#fff", letterSpacing: 0.3 },

  // Success overlay
  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg },
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

  successTitle:   { fontSize: fs(22), fontWeight: "800", color: C.text, marginBottom: ms(8) },
  successNameRow: { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: colors.primary + "10", borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(6), marginBottom: ms(6) },
  successName:    { fontSize: fs(13), fontWeight: "800", color: colors.primary, flex: 1 },
  successSub:     { fontSize: fs(13), color: C.muted, marginBottom: ms(20) },

  summaryGrid:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(14), marginBottom: ms(20), borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  summaryRow:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(11), paddingHorizontal: ms(14), gap: ms(12) },
  summaryRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  summaryIcon:      { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  summaryLabel:     { fontSize: fs(10), color: C.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  summaryValue:     { fontSize: fs(13), fontWeight: "700", color: C.text },

  goBackBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), backgroundColor: colors.primary, borderRadius: ms(14), paddingVertical: ms(14) },
  goBackT:   { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});

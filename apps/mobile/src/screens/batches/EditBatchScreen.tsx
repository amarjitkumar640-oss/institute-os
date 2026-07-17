import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  StatusBar, TouchableOpacity, Animated, ActivityIndicator, Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { updateBatch, type BatchItem, type BatchStatus } from "../../api/batches";
import { ms, fs } from "../../utils/responsive";

type Props = NativeStackScreenProps<RootStackParamList, "EditBatch">;

const EXAM_COLOR: Record<string, string> = { ssc: "#2563A8", banking: "#1B9C63", railway: "#E8752C" };
const EXAM_LABEL: Record<string, string> = { ssc: "SSC", banking: "Banking", railway: "Railway" };

const STATUS_OPTIONS: { key: BatchStatus; label: string; color: string; icon: string }[] = [
  { key: "upcoming",  label: "Upcoming",  color: "#2563A8", icon: "time-outline"           },
  { key: "running",   label: "Running",   color: "#1B9C63", icon: "play-circle-outline"    },
  { key: "completed", label: "Completed", color: "#8A7F82", icon: "checkmark-done-outline" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoToDate(iso: string): Date | null {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function fmtDisplay(d: Date | null): string {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={dp.overlay}>
        <View style={dp.sheet}>
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
            <TouchableOpacity style={dp.confirmBtn} onPress={() => onConfirm(new Date(year, month, safeDay))} activeOpacity={0.85}>
              <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={dp.confirmGrad}>
                <Text style={dp.confirmT}>Done</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dp = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: "rgba(16,4,8,0.5)", justifyContent: "flex-end" },
  sheet:       { backgroundColor: "#FFFFFF", borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingTop: ms(12), paddingHorizontal: ms(20), paddingBottom: ms(32) },
  handle:      { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: "#E0D8D4", alignSelf: "center", marginBottom: ms(16) },
  title:       { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(16), textAlign: "center" },
  selectors:   { flexDirection: "row", height: ms(180), gap: ms(4) },
  selector:    { flex: 1 },
  colLabel:    { fontSize: fs(10), fontWeight: "800", color: "#8A7F82", letterSpacing: 1, textAlign: "center", marginBottom: ms(4) },
  col:         { flex: 1 },
  item:        { alignItems: "center", paddingVertical: ms(10) },
  itemActive:  { backgroundColor: "#FEF4F4", borderRadius: ms(8) },
  itemT:       { fontSize: fs(15), color: "#8A7F82", fontWeight: "600" },
  itemActiveT: { color: "#8B1E3F", fontWeight: "800" },
  highlight:   { position: "absolute", left: ms(20), right: ms(20), top: ms(138), height: ms(44), borderRadius: ms(10), borderWidth: 2, borderColor: "#8B1E3F20", backgroundColor: "#FEF4F430" },
  btnRow:      { flexDirection: "row", gap: ms(10), marginTop: ms(20) },
  cancelBtn:   { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), borderWidth: 1.5, borderColor: "#E0D8D4" },
  cancelT:     { fontSize: fs(14), fontWeight: "700", color: "#8A7F82" },
  confirmBtn:  { flex: 1, borderRadius: ms(14), overflow: "hidden" },
  confirmGrad: { alignItems: "center", paddingVertical: ms(14) },
  confirmT:    { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});

// ── Date display field ────────────────────────────────────────────────────────

function DateField({ label, value, placeholder, onPress, readOnly = false, error }: {
  label: string; value: string; placeholder: string;
  onPress?: () => void; readOnly?: boolean; error?: string;
}) {
  return (
    <View style={s.dateFieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={[s.dateField, readOnly && s.dateFieldReadOnly, !!error && s.dateFieldError]}
        onPress={onPress}
        activeOpacity={readOnly ? 1 : 0.8}
        disabled={readOnly}
      >
        <Ionicons
          name={readOnly ? "lock-closed-outline" : "calendar-outline"}
          size={ms(16)}
          color={readOnly ? "#B0A9AC" : value ? "#8B1E3F" : "#C7BAB4"}
        />
        <Text style={[s.dateFieldT, !value && s.dateFieldPlaceholder, readOnly && { color: "#8A7F82" }]}>
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

// ── Main screen ───────────────────────────────────────────────────────────────

export function EditBatchScreen({ navigation, route }: Props) {
  const { batch } = route.params;

  const [name, setName]         = useState(batch.name);
  const [capacity, setCapacity] = useState(String(batch.capacity));
  const [status, setStatus]     = useState<BatchStatus>(batch.status);
  const [startDate, setStartDate] = useState<Date | null>(isoToDate(batch.startDate));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // end date always auto-calculated from startDate + course duration
  const endDate: Date | null = startDate
    ? addMonths(startDate, batch.course.durationMonths)
    : null;

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<BatchItem | null>(null);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(ms(40))).current;
  const checkScale  = useRef(new Animated.Value(0)).current;

  const examColor = EXAM_COLOR[batch.course.examCategory] ?? "#8A7F82";
  const examLabel = EXAM_LABEL[batch.course.examCategory] ?? batch.course.examCategory.toUpperCase();

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim())                         errs.name     = "Batch name is required.";
    if (!capacity.trim() || isNaN(Number(capacity)) || Number(capacity) < 1)
                                              errs.capacity = "Enter a valid capacity (min 1).";
    if (!startDate)                           errs.startDate = "Please select a start date.";
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
        <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Course info (read-only) */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: examColor + "18" }]}>
                <Ionicons name="book-outline" size={ms(16)} color={examColor} />
              </View>
              <Text style={[s.sectionLabel, { color: examColor }]}>COURSE</Text>
            </View>
            <View style={[s.courseReadOnly, { borderColor: examColor + "40" }]}>
              <View style={[s.courseTag, { backgroundColor: examColor + "20" }]}>
                <Text style={[s.courseTagT, { color: examColor }]}>{examLabel}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.courseName}>{batch.course.name}</Text>
                <Text style={s.courseSub}>{batch.course.durationMonths} months · ₹{Number(batch.course.defaultFee).toLocaleString("en-IN")}</Text>
              </View>
              <View style={s.lockBadge}>
                <Ionicons name="lock-closed-outline" size={ms(12)} color="#8A7F82" />
                <Text style={s.lockT}>Fixed</Text>
              </View>
            </View>
          </View>

          {/* Batch details */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: "#2563A818" }]}>
                <Ionicons name="layers-outline" size={ms(16)} color="#2563A8" />
              </View>
              <Text style={[s.sectionLabel, { color: "#2563A8" }]}>BATCH DETAILS</Text>
            </View>
            <FormField label="BATCH NAME" value={name} onChangeText={(v) => { setName(v); setErrors((p) => ({ ...p, name: "" })); }}
              placeholder="e.g. SSC Morning Batch A" error={errors.name} icon="layers-outline" maxLength={120} clearable />
            <FormField label="CAPACITY (SEATS)" value={capacity} onChangeText={(v) => { setCapacity(v.replace(/\D/g, "")); setErrors((p) => ({ ...p, capacity: "" })); }}
              placeholder="e.g. 40" keyboardType="number-pad" error={errors.capacity} icon="people-outline" />
          </View>

          {/* Status */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: "#E8752C18" }]}>
                <Ionicons name="pulse-outline" size={ms(16)} color="#E8752C" />
              </View>
              <Text style={[s.sectionLabel, { color: "#E8752C" }]}>STATUS</Text>
            </View>
            <View style={s.statusRow}>
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.statusOpt, active && { backgroundColor: opt.color, borderColor: opt.color }]}
                    onPress={() => setStatus(opt.key)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={opt.icon as any} size={ms(16)} color={active ? "#fff" : "#8A7F82"} />
                    <Text style={[s.statusOptT, active && { color: "#fff" }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {batch.enrolledCount > 0 && (
              <View style={s.enrolledHint}>
                <Ionicons name="people-outline" size={ms(13)} color="#2563A8" />
                <Text style={s.enrolledHintT}>{batch.enrolledCount} student{batch.enrolledCount !== 1 ? "s" : ""} currently enrolled</Text>
              </View>
            )}
          </View>

          {/* Schedule */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: "#1B9C6318" }]}>
                <Ionicons name="calendar-outline" size={ms(16)} color="#1B9C63" />
              </View>
              <Text style={[s.sectionLabel, { color: "#1B9C63" }]}>SCHEDULE</Text>
            </View>

            <DateField
              label="START DATE"
              value={fmtDisplay(startDate)}
              placeholder="Tap to select start date"
              onPress={() => setDatePickerOpen(true)}
              error={errors.startDate}
            />

            <DateField
              label={`END DATE (${batch.course.durationMonths} months from start)`}
              value={fmtDisplay(endDate)}
              placeholder="Auto-calculated from start date"
              readOnly
            />
          </View>

          {errors.submit ? (
            <View style={s.submitErr}>
              <Ionicons name="alert-circle-outline" size={ms(16)} color="#DC2626" />
              <Text style={s.submitErrT}>{errors.submit}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={s.saveWrap} onPress={handleSave} disabled={loading} activeOpacity={0.85}>
            <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.saveBtn}>
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={ms(20)} color="#fff" />
                    <Text style={s.saveT}>Save Changes</Text>
                  </>}
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: ms(32) }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker */}
      <DatePickerModal
        visible={datePickerOpen}
        value={startDate}
        onConfirm={(d) => { setStartDate(d); setDatePickerOpen(false); setErrors((p) => ({ ...p, startDate: "" })); }}
        onClose={() => setDatePickerOpen(false)}
      />

      {/* Success card */}
      {updated && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <ScrollView contentContainerStyle={s.successScroll} showsVerticalScrollIndicator={false}>
            <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>
              <Animated.View style={{ transform: [{ scale: checkScale }], marginBottom: ms(20) }}>
                <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
                  <Ionicons name="pencil" size={ms(44)} color="#fff" />
                </LinearGradient>
              </Animated.View>
              <Text style={s.successTitle}>Batch Updated!</Text>
              <View style={s.regCodeRow}>
                <Ionicons name="layers-outline" size={ms(14)} color="#8B1E3F" />
                <Text style={s.regCode}>{updated.name}</Text>
              </View>
              <Text style={s.successSub}>Changes saved successfully</Text>

              <View style={s.detailBox}>
                {[
                  { icon: "book-outline",       label: "Course",   value: updated.course.name,                                        color: "#2563A8" },
                  { icon: "people-outline",      label: "Capacity", value: `${updated.capacity} seats`,                                color: "#1B9C63" },
                  { icon: "pulse-outline",       label: "Status",   value: STATUS_OPTIONS.find((o) => o.key === updated.status)?.label ?? updated.status, color: "#E8752C" },
                  { icon: "play-circle-outline", label: "Starts",   value: new Date(updated.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), color: "#8B1E3F" },
                  { icon: "stop-circle-outline", label: "Ends",     value: new Date(updated.endDate).toLocaleDateString("en-IN",   { day: "2-digit", month: "short", year: "numeric" }), color: "#8B1E3F" },
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

              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.viewAllWrap}>
                <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.viewAllBtn}>
                  <Ionicons name="layers-outline" size={ms(18)} color="#fff" />
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

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#8B1E3F" },
  scroll: { flex: 1, backgroundColor: "#FFFBF0" },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(16), paddingBottom: ms(16) },

  card:        { backgroundColor: "#FFFFFF", borderRadius: ms(20), padding: ms(18), marginBottom: ms(14), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(16) },
  sectionIcon: { width: ms(36), height: ms(36), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  sectionLabel:{ fontSize: fs(12), fontWeight: "800", letterSpacing: 0.8 },

  courseReadOnly: { flexDirection: "row", alignItems: "center", gap: ms(12), borderWidth: 1.5, borderRadius: ms(14), padding: ms(14), backgroundColor: "#FAFAFA" },
  courseTag:      { borderRadius: ms(8), paddingHorizontal: ms(9), paddingVertical: ms(5) },
  courseTagT:     { fontSize: fs(11), fontWeight: "800" },
  courseName:     { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F" },
  courseSub:      { fontSize: fs(11), color: "#8A7F82", marginTop: ms(2) },
  lockBadge:      { flexDirection: "row", alignItems: "center", gap: ms(3), backgroundColor: "#F4F4F4", borderRadius: ms(8), paddingHorizontal: ms(7), paddingVertical: ms(4) },
  lockT:          { fontSize: fs(10), fontWeight: "700", color: "#8A7F82" },

  statusRow:     { flexDirection: "row", gap: ms(8) },
  statusOpt:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6), paddingVertical: ms(10), borderRadius: ms(12), backgroundColor: "#FAFAFA", borderWidth: 1.5, borderColor: "#E0D8D4" },
  statusOptT:    { fontSize: fs(12), fontWeight: "700", color: "#8A7F82" },
  enrolledHint:  { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: "#EFF6FF", borderRadius: ms(10), padding: ms(10), marginTop: ms(12) },
  enrolledHintT: { fontSize: fs(12), color: "#2563A8", fontWeight: "600" },

  dateFieldWrap:      { marginBottom: ms(16) },
  fieldLabel:         { fontSize: fs(11), fontWeight: "800", color: "#8A7F82", letterSpacing: 0.8, marginBottom: ms(8) },
  dateField:          { flexDirection: "row", alignItems: "center", gap: ms(10), borderWidth: 1.5, borderColor: "#E0D8D4", borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(13), backgroundColor: "#FAFAFA" },
  dateFieldReadOnly:  { backgroundColor: "#F7F4F2", borderColor: "#EDE8E3" },
  dateFieldError:     { borderColor: "#DC2626" },
  dateFieldT:         { flex: 1, fontSize: fs(13.5), color: "#2B1B1F", fontWeight: "600" },
  dateFieldPlaceholder: { color: "#C7BAB4", fontWeight: "400" },
  autoCalcBadge:      { backgroundColor: "#E7F7EF", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  autoCalcT:          { fontSize: fs(10), fontWeight: "800", color: "#1B9C63" },

  errT:        { fontSize: fs(11.5), color: "#DC2626", marginTop: ms(4) },
  submitErr:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: "#FEE2E2", borderRadius: ms(10), padding: ms(12), marginBottom: ms(12) },
  submitErrT:  { fontSize: fs(13), color: "#DC2626", flex: 1 },

  saveWrap: { marginTop: ms(4) },
  saveBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  saveT:    { fontSize: fs(15), fontWeight: "800", color: "#fff", letterSpacing: 0.3 },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFBF0" },
  successScroll:  { flexGrow: 1, justifyContent: "center", paddingHorizontal: ms(20), paddingVertical: ms(32) },
  successCard:    { backgroundColor: "#FFFFFF", borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { fontSize: fs(22), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(8) },
  regCodeRow:     { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: "#FEF4F4", borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(6), marginBottom: ms(8) },
  regCode:        { fontSize: fs(13), fontWeight: "800", color: "#8B1E3F", letterSpacing: 0.5 },
  successSub:     { fontSize: fs(13), color: "#8A7F82", marginBottom: ms(20), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: "#FAFAFA", borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(20), borderWidth: 1, borderColor: "#F0EDE8" },
  detailRow:      { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), gap: ms(12) },
  detailRowBorder:{ borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  detailIcon:     { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  detailLabel:    { fontSize: fs(10.5), color: "#8A7F82", fontWeight: "600" },
  detailValue:    { fontSize: fs(13.5), fontWeight: "700", color: "#1A1214" },
  viewAllWrap:    { width: "100%", borderRadius: ms(16), overflow: "hidden" },
  viewAllBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), paddingVertical: ms(16) },
  viewAllT:       { fontSize: fs(15), fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
});

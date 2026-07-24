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
import { ms, fs } from "../../utils/responsive";

type Props = NativeStackScreenProps<RootStackParamList, "CreateBatch">;

const EXAM_COLOR: Record<string, string> = { ssc: "#2563A8", banking: "#1B9C63", railway: "#E8752C" };
const EXAM_LABEL: Record<string, string> = { ssc: "SSC", banking: "Banking", railway: "Railway" };

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
            <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={dp.confirmGrad}>
              <Text style={dp.confirmT}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const dp = StyleSheet.create({
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
  itemActiveT: { color: "#8B1E3F", fontWeight: "800" },
  highlight:   { position: "absolute", left: ms(20), right: ms(20), top: ms(138), height: ms(44), borderRadius: ms(10), borderWidth: 2, borderColor: "#8B1E3F20", backgroundColor: "#FEF4F430" },
  btnRow:      { flexDirection: "row", gap: ms(10), marginTop: ms(20) },
  cancelBtn:   { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), borderWidth: 1.5, borderColor: "#E0D8D4" },
  cancelT:     { fontSize: fs(14), fontWeight: "700", color: "#8A7F82" },
  confirmBtn:  { flex: 1, borderRadius: ms(14), overflow: "hidden" },
  confirmGrad: { alignItems: "center", paddingVertical: ms(14) },
  confirmT:    { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});

// ── Course Picker Modal ───────────────────────────────────────────────────────

function CoursePickerModal({ visible, courses, loading, onSelect, onClose }: {
  visible: boolean;
  courses: CourseItem[];
  loading: boolean;
  onSelect: (c: CourseItem) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="75%">
      <View style={pm.sheetPad}>
        <View style={pm.handle} />
        <Text style={pm.title}>Select Course</Text>
        {loading ? (
            <View style={{ alignItems: "center", paddingVertical: ms(40) }}>
              <ActivityIndicator size="large" color="#8B1E3F" />
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
                const color = EXAM_COLOR[c.examCategory] ?? "#8A7F82";
                const label = EXAM_LABEL[c.examCategory] ?? c.examCategory.toUpperCase();
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

// ── Main Screen ───────────────────────────────────────────────────────────────

export function CreateBatchScreen({ navigation }: Props) {
  const [courses, setCourses]           = useState<CourseItem[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseItem | null>(null);

  const [name, setName]         = useState("");
  const [capacity, setCapacity] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);

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

  const examColor = selectedCourse ? (EXAM_COLOR[selectedCourse.examCategory] ?? "#8A7F82") : "#8A7F82";
  const examLabel = selectedCourse ? (EXAM_LABEL[selectedCourse.examCategory] ?? "") : "";

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="Create Batch" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Course */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: "#8B1E3F18" }]}>
                <Ionicons name="book-outline" size={ms(16)} color="#8B1E3F" />
              </View>
              <Text style={[s.sectionLabel, { color: "#8B1E3F" }]}>COURSE</Text>
            </View>

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
                    ? <ActivityIndicator size="small" color="#8B1E3F" />
                    : <Ionicons name="add-circle-outline" size={ms(20)} color="#8A7F82" />}
                  <Text style={s.coursePickerPlaceholder}>
                    {coursesLoading ? "Loading courses…" : "Tap to select a course"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {errors.course ? <Text style={s.errT}>{errors.course}</Text> : null}
          </View>

          {/* Batch details */}
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={[s.sectionIcon, { backgroundColor: "#2563A818" }]}>
                <Ionicons name="layers-outline" size={ms(16)} color="#2563A8" />
              </View>
              <Text style={[s.sectionLabel, { color: "#2563A8" }]}>BATCH DETAILS</Text>
            </View>
            <FormField label="BATCH NAME" value={name}
              onChangeText={(v) => { setName(v); setErrors((p) => ({ ...p, name: "" })); }}
              placeholder="e.g. SSC Morning Batch A" error={errors.name} icon="layers-outline" maxLength={120} clearable />
            <FormField label="CAPACITY (SEATS)" value={capacity}
              onChangeText={(v) => { setCapacity(v.replace(/\D/g, "")); setErrors((p) => ({ ...p, capacity: "" })); }}
              placeholder="e.g. 40" keyboardType="number-pad" error={errors.capacity} icon="people-outline" />
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
              label={`END DATE${selectedCourse ? ` (${selectedCourse.durationMonths} months from start)` : ""}`}
              value={fmtDisplay(endDate)}
              placeholder={startDate ? "Select a course to auto-calculate" : "Auto-calculated from start date"}
              readOnly
            />
          </View>

          {errors.submit ? (
            <View style={s.submitErr}>
              <Ionicons name="alert-circle-outline" size={ms(16)} color="#DC2626" />
              <Text style={s.submitErrT}>{errors.submit}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={s.submitWrap} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
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
                  { icon: "layers-outline",     label: "Batch Name", value: created.name,                           color: "#8B1E3F" },
                  { icon: "book-outline",        label: "Course",     value: created.course.name,                    color: "#2563A8" },
                  { icon: "people-outline",      label: "Capacity",   value: `${created.capacity} seats`,            color: "#1B9C63" },
                  { icon: "play-circle-outline", label: "Starts",     value: new Date(created.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), color: "#E8752C" },
                  { icon: "stop-circle-outline", label: "Ends",       value: new Date(created.endDate).toLocaleDateString("en-IN",   { day: "2-digit", month: "short", year: "numeric" }), color: "#E8752C" },
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
                <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.viewAllGrad}>
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

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#8B1E3F" },
  scroll: { flex: 1, backgroundColor: "#FFFBF0" },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(16) },

  card:        { backgroundColor: "#FFFFFF", borderRadius: ms(20), padding: ms(18), marginBottom: ms(14), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(16) },
  sectionIcon: { width: ms(36), height: ms(36), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  sectionLabel:{ fontSize: fs(12), fontWeight: "800", letterSpacing: 0.8 },

  coursePicker:       { borderWidth: 1.5, borderColor: "#E0D8D4", borderRadius: ms(14), padding: ms(14), backgroundColor: "#FAFAFA" },
  coursePickerFilled: { flexDirection: "row", alignItems: "center", gap: ms(12) },
  coursePickerTag:    { borderRadius: ms(8), paddingHorizontal: ms(9), paddingVertical: ms(5) },
  coursePickerTagT:   { fontSize: fs(11), fontWeight: "800" },
  coursePickerName:   { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F" },
  coursePickerSub:    { fontSize: fs(11), color: "#8A7F82", marginTop: ms(2) },
  coursePickerEmpty:  { flexDirection: "row", alignItems: "center", gap: ms(10), justifyContent: "center", paddingVertical: ms(6) },
  coursePickerPlaceholder: { fontSize: fs(13), color: "#B0A9AC", fontWeight: "600" },

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

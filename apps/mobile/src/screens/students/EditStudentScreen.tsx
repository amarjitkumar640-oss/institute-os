import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TextInput, Animated, Easing, TouchableOpacity,
  ActivityIndicator, Modal, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { updateStudent, uploadStudentPhoto, deleteStudentPhoto } from "../../api/students";
import type {
  Gender, Qualification, CoursePreference, DurationPref, BatchTiming, PaymentMode, StudentItem,
} from "../../api/students";
import {
  listDocumentTypes, listStudentDocuments, uploadStudentDocument, deleteStudentDocument,
  type DocumentType,
} from "../../api/documents";
import { listCourses, type CourseItem } from "../../api/courses";
import { getCourseMeta } from "../../constants/courseMeta";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "EditStudent">;

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoToDisplay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return [
    String(d.getUTCDate()).padStart(2, "0"),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCFullYear()),
  ].join("/");
}

function autoFormatDate(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function parseDisplayDate(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31 || +yyyy < 1950 || +yyyy > 2099) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// ── Duration helper (shared with admission) ───────────────────────────────────

function monthsToDurationPref(months: number): DurationPref {
  if (months <= 3) return "3months";
  if (months <= 6) return "6months";
  return "1year";
}

// ── Shared picker-sheet styles ────────────────────────────────────────────────

const ps = StyleSheet.create({
  backdrop:    { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" },
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
  listContent: { paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(24) },
  empty:       { alignItems: "center", gap: ms(8), paddingVertical: ms(32) },
  emptyT:      { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.muted },
  emptySub:    { fontSize: fs(12), color: C.placeholder },
});

// ── Course picker modal (identical concept to admission) ─────────────────────

function CoursePickerModal({ visible, courses, selectedId, onSelect, onClose }: {
  visible:    boolean;
  courses:    CourseItem[];
  selectedId: string | null;
  onSelect:   (course: CourseItem) => void;
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
      <TouchableOpacity style={ps.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[ps.panel, { paddingBottom: insets.bottom + ms(8) }]}>
        <View style={ps.handle} />

        <View style={ps.headerRow}>
          <View style={[ps.headerIco, { backgroundColor: C.purple + "18" }]}>
            <Ionicons name="book-outline" size={ms(18)} color={C.purple} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ps.headerTitle}>Select Course</Text>
            <Text style={ps.headerSub}>{courses.length} course{courses.length !== 1 ? "s" : ""} available</Text>
          </View>
          <TouchableOpacity style={ps.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>

        <View style={ps.searchWrap}>
          <View style={ps.searchRow}>
            <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
            <TextInput
              style={ps.searchInput}
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

        <ScrollView style={ps.list} contentContainerStyle={cp.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            <View style={ps.empty}>
              <Ionicons name="search-outline" size={ms(32)} color={C.placeholder} />
              <Text style={ps.emptyT}>No courses found</Text>
              <Text style={ps.emptySub}>Try a different search term</Text>
            </View>
          ) : (
            <View style={cp.grid}>
              {filtered.map((course) => {
                const color = course.examCategories[0]?.color ?? C.muted;
                const label = course.examCategories.length ? course.examCategories.map((ec) => ec.label).join(", ") : "General";
                const sel   = selectedId === course.id;
                return (
                  <TouchableOpacity
                    key={course.id}
                    style={[cp.gridCard, { borderColor: sel ? color : C.border }, sel && { backgroundColor: color + "10" }]}
                    onPress={() => onSelect(course)}
                    activeOpacity={0.75}
                  >
                    <View style={cp.gridNameRow}>
                      <Text style={[cp.gridName, sel && { color }]} numberOfLines={2}>{course.name}</Text>
                      {sel && <Ionicons name="checkmark-circle" size={ms(16)} color={color} style={{ marginLeft: ms(4), flexShrink: 0 }} />}
                    </View>
                    <View style={cp.gridCatRow}>
                      <View style={[cp.gridCatPill, { backgroundColor: color + "16" }]}>
                        <View style={[cp.gridDot, { backgroundColor: color }]} />
                        <Text style={[cp.gridCat, { color }]}>{label}</Text>
                      </View>
                    </View>
                    <View style={cp.gridMeta}>
                      <Text style={cp.gridDur}>{course.durationMonths}mo</Text>
                      {course.defaultFee > 0 && (
                        <Text style={cp.gridFee}>₹{Number(course.defaultFee / 1000).toFixed(0)}k</Text>
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

const cp = StyleSheet.create({
  listContent: { paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(40) },
  grid:        { flexDirection: "row", flexWrap: "wrap", gap: ms(10) },
  gridCard:    { width: "47%", backgroundColor: C.card, borderRadius: ms(14), borderWidth: 1.5, overflow: "hidden" },
  gridNameRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: ms(10), paddingTop: ms(10), paddingBottom: ms(4) },
  gridCatRow:  { paddingHorizontal: ms(10), paddingBottom: ms(8) },
  gridCatPill: { flexDirection: "row", alignItems: "center", gap: ms(5), borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  gridDot:     { width: ms(6), height: ms(6), borderRadius: ms(3) },
  gridCat:     { fontSize: fs(9.5), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  gridName:    { flex: 1, fontSize: fs(12.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text, lineHeight: fs(18) },
  gridMeta:    { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(10), paddingBottom: ms(10) },
  gridDur:     { fontSize: fs(10.5), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  gridFee:     { fontSize: fs(10.5), color: C.green, fontFamily: "Inter_700Bold", fontWeight: "700" },
});

// ── Duration picker (identical concept to admission) ──────────────────────────

function DurationPicker({ value, onSelect }: {
  value: string | null | undefined;
  onSelect: (k: DurationPref) => void;
}) {
  const BLUE = C.blue;
  const items: { key: DurationPref; label: string; hint: string }[] = [
    { key: "3months", label: "3 Months", hint: "Short-term" },
    { key: "6months", label: "6 Months", hint: "Standard"   },
    { key: "1year",   label: "1 Year",   hint: "Long-term"  },
  ];
  return (
    <View style={dp.row}>
      {items.map(({ key, label, hint }) => {
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            style={[dp.card, active && { backgroundColor: BLUE, borderColor: BLUE }]}
            onPress={() => onSelect(key)}
            activeOpacity={0.75}
          >
            <Text style={[dp.label, active && { color: "#fff" }]}>{label}</Text>
            <Text style={[dp.hint, active && { color: "rgba(255,255,255,0.72)" }]}>{hint}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const dp = StyleSheet.create({
  row:   { flexDirection: "row", gap: ms(8) },
  card:  { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(12), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border, gap: ms(3) },
  label: { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  hint:  { fontSize: fs(10.5), color: C.muted },
});

// ── Qualification picker modal (identical concept to admission) ──────────────

const QUAL_DISPLAY: Record<string, { icon: string; label: string }> = {
  class10:         { icon: "book-outline",    label: "Class 10"   },
  class12:         { icon: "library-outline", label: "Class 12"   },
  graduation:      { icon: "star-outline",    label: "Graduation" },
  post_graduation: { icon: "ribbon-outline",  label: "Post Grad"  },
};

function QualPickerModal({ visible, value, onSelect, onClose }: {
  visible:  boolean;
  value:    string | null | undefined;
  onSelect: (k: Qualification) => void;
  onClose:  () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const TEAL   = colors.accent;
  const items: { key: Qualification; icon: string; label: string; sub: string }[] = [
    { key: "class10",         icon: "book-outline",    label: "Class 10",        sub: "Secondary"        },
    { key: "class12",         icon: "library-outline", label: "Class 12",        sub: "Senior Secondary" },
    { key: "graduation",      icon: "star-outline",    label: "Graduation",      sub: "Bachelor's Degree" },
    { key: "post_graduation", icon: "ribbon-outline",  label: "Post Graduation", sub: "Master's Degree"  },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <TouchableOpacity style={ps.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[ps.panel, { paddingBottom: insets.bottom + ms(8) }]}>
        <View style={ps.handle} />

        <View style={ps.headerRow}>
          <View style={[ps.headerIco, { backgroundColor: TEAL + "18" }]}>
            <Ionicons name="ribbon-outline" size={ms(18)} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ps.headerTitle}>Highest Qualification</Text>
            <Text style={ps.headerSub}>Select your most recent education level</Text>
          </View>
          <TouchableOpacity style={ps.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={qpm.body} showsVerticalScrollIndicator={false}>
          <View style={qpm.grid}>
            {items.map(({ key, icon, label, sub }) => {
              const active = value === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[qpm.card, active && { borderColor: TEAL, backgroundColor: TEAL + "12" }]}
                  onPress={() => { onSelect(key); onClose(); }}
                  activeOpacity={0.75}
                >
                  <View style={[qpm.iconWrap, { backgroundColor: active ? TEAL : TEAL + "18" }]}>
                    <Ionicons name={icon as any} size={ms(26)} color={active ? "#fff" : TEAL} />
                  </View>
                  <Text style={[qpm.cardLabel, active && { color: TEAL }]}>{label}</Text>
                  <Text style={qpm.cardSub}>{sub}</Text>
                  {active && (
                    <View style={qpm.checkBadge}>
                      <Ionicons name="checkmark-circle" size={ms(18)} color={TEAL} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
      </View>
    </Modal>
  );
}

const qpm = StyleSheet.create({
  body:       { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(48) },
  grid:       { flexDirection: "row", flexWrap: "wrap", gap: ms(14) },
  card:       { width: "47%", alignItems: "center", paddingTop: ms(22), paddingBottom: ms(16), paddingHorizontal: ms(8), borderRadius: ms(18), backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, gap: ms(8), position: "relative" },
  iconWrap:   { width: ms(56), height: ms(56), borderRadius: ms(18), justifyContent: "center", alignItems: "center" },
  cardLabel:  { fontSize: fs(13.5), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, textAlign: "center" },
  cardSub:    { fontSize: fs(10.5), color: C.muted, textAlign: "center" },
  checkBadge: { position: "absolute", top: ms(8), right: ms(8) },
});

// ── Timing picker (identical concept to admission) ────────────────────────────

function TimingPicker({ value, onSelect }: {
  value:    BatchTiming | null | undefined;
  onSelect: (k: BatchTiming) => void;
}) {
  const BLUE = C.blue;
  const items: { key: BatchTiming; icon: string; label: string; sub: string }[] = [
    { key: "morning", icon: "sunny-outline",        label: "Morning", sub: "6am – 10am" },
    { key: "midday",  icon: "partly-sunny-outline", label: "Mid Day", sub: "11am – 2pm" },
    { key: "evening", icon: "moon-outline",         label: "Evening", sub: "4pm – 8pm"  },
  ];
  return (
    <View style={tp.row}>
      {items.map(({ key, icon, label, sub }) => {
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            style={[tp.card, active && { backgroundColor: BLUE, borderColor: BLUE }]}
            onPress={() => onSelect(key)}
            activeOpacity={0.75}
          >
            <Ionicons name={icon as any} size={ms(20)} color={active ? "#fff" : BLUE} />
            <Text style={[tp.label, active && { color: "#fff" }]}>{label}</Text>
            <Text style={[tp.sub, active && { color: "rgba(255,255,255,0.72)" }]}>{sub}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tp = StyleSheet.create({
  row:   { flexDirection: "row", gap: ms(8) },
  card:  { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border, gap: ms(4) },
  label: { fontSize: fs(12), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.blue },
  sub:   { fontSize: fs(10), color: C.muted },
});

// ── Payment mode picker (identical concept to admission) ──────────────────────

function PaymentModePicker({ value, onSelect }: {
  value:    PaymentMode | null | undefined;
  onSelect: (k: PaymentMode) => void;
}) {
  const GREEN = C.green;
  const modes: { key: PaymentMode; icon: string; label: string; sub: string }[] = [
    { key: "cash",   icon: "cash-outline", label: "Cash",   sub: "Collect physically" },
    { key: "online", icon: "card-outline", label: "Online", sub: "UPI / NEFT / IMPS"  },
  ];
  return (
    <View style={pmp.row}>
      {modes.map(({ key, icon, label, sub }) => {
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            style={[pmp.card, active && { borderColor: GREEN, backgroundColor: GREEN + "10" }]}
            onPress={() => onSelect(key)}
            activeOpacity={0.75}
          >
            <View style={[pmp.iconWrap, { backgroundColor: active ? GREEN : GREEN + "18" }]}>
              <Ionicons name={icon as any} size={ms(16)} color={active ? "#fff" : GREEN} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[pmp.label, active && { color: GREEN }]} numberOfLines={1}>{label}</Text>
              <Text style={pmp.sub} numberOfLines={1}>{sub}</Text>
            </View>
            {active && <Ionicons name="checkmark-circle" size={ms(15)} color={GREEN} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const pmp = StyleSheet.create({
  row:      { flexDirection: "row", gap: ms(10) },
  card:     { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: ms(10), paddingHorizontal: ms(10), borderRadius: ms(12), backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, gap: ms(8) },
  iconWrap: { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  label:    { fontSize: fs(12.5), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  sub:      { fontSize: fs(9.5), color: C.muted, marginTop: ms(1) },
});

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Personal", icon: "person-outline"   },
  { label: "Family",   icon: "people-outline"   },
  { label: "Academic", icon: "book-outline"      },
  { label: "Contact",  icon: "call-outline"      },
  { label: "Office",   icon: "business-outline"  },
] as const;

// ── Step bar (identical to admission) ────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  const colors = useThemeColors();
  return (
    <View style={sb.wrap}>
      {STEPS.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        const color  = done || active ? colors.primary : C.border;
        return (
          <React.Fragment key={i}>
            <View style={sb.stepCol}>
              <View style={[sb.circle, { borderColor: color, backgroundColor: done ? colors.primary : C.inputBg }]}>
                {done
                  ? <Ionicons name="checkmark" size={ms(12)} color="#fff" />
                  : <Text style={[sb.num, { color }]}>{i + 1}</Text>}
              </View>
              <Text style={[sb.lbl, { color: active ? colors.primary : done ? colors.primary : C.placeholder, fontWeight: active ? "800" : "600" }]} numberOfLines={1}>
                {step.label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[sb.line, { backgroundColor: done ? colors.primary : C.border }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const sb = StyleSheet.create({
  wrap:    { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: ms(16), paddingVertical: ms(14), backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  stepCol: { alignItems: "center", gap: ms(4), width: ms(52) },
  circle:  { width: ms(28), height: ms(28), borderRadius: ms(14), borderWidth: 2, justifyContent: "center", alignItems: "center" },
  num:     { fontSize: fs(11), fontFamily: "Inter_800ExtraBold", fontWeight: "800" },
  lbl:     { fontSize: fs(9), textAlign: "center" },
  line:    { flex: 1, height: 2, alignSelf: "center", marginBottom: ms(16), marginHorizontal: ms(-2) },
});

// ── Option row (identical to admission) ──────────────────────────────────────

function OptionRow<T extends string>({ options, value, onSelect, color }: {
  options: { key: T; label: string }[];
  value: T | null | undefined;
  onSelect: (k: T) => void;
  color?: string;
}) {
  const colors = useThemeColors();
  const resolvedColor = color ?? colors.primary;
  return (
    <View style={or.row}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <TouchableOpacity key={opt.key} style={[or.pill, active && { backgroundColor: resolvedColor, borderColor: resolvedColor }]} onPress={() => onSelect(opt.key)} activeOpacity={0.75}>
            <View style={[or.radio, { borderColor: active ? "#fff" : C.border }]}>
              {active && <View style={or.radioDot} />}
            </View>
            <Text style={[or.label, active && or.labelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const or = StyleSheet.create({
  row:         { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  pill:        { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(12), paddingVertical: ms(8), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border },
  radio:       { width: ms(14), height: ms(14), borderRadius: ms(7), borderWidth: 2, justifyContent: "center", alignItems: "center" },
  radioDot:    { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: C.card },
  label:       { fontSize: fs(12.5), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.muted },
  labelActive: { color: "#fff", fontFamily: "Inter_700Bold", fontWeight: "700" },
});

// ── Section heading (identical to admission — same color throughout) ─────────

function SectionHead({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
  const colors = useThemeColors();
  return (
    <View style={sh.wrap}>
      <View style={[sh.iconBox, { backgroundColor: colors.primary + "18" }]}>
        <Ionicons name={icon as any} size={ms(16)} color={colors.primary} />
      </View>
      <View style={sh.col}>
        <Text style={[sh.label, { color: colors.primary }]}>{label.toUpperCase()}</Text>
        {sub && <Text style={sh.sub}>{sub}</Text>}
      </View>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap:   { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(16) },
  iconBox:{ width: ms(36), height: ms(36), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  col:    { flex: 1 },
  label:  { fontSize: fs(12), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: 0.8 },
  sub:    { fontSize: fs(11), color: C.muted, marginTop: ms(2) },
});

// ── Detail row (success card) ─────────────────────────────────────────────────

function DetailRow({ icon, label, value, color, last }: { icon: string; label: string; value: string; color: string; last?: boolean }) {
  const s = useThemedStyles(makeSStyles);
  return (
    <View style={[s.detailRow, !last && s.detailRowBorder]}>
      <View style={[s.detailIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(14)} color={color} />
      </View>
      <View style={s.detailMeta}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text style={s.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

// ── Photo & Documents view — same design as the admission screen's step ──────

type UploadKey = "photo" | string; // "photo" or a documentTypeId

function UploadRow({ label, uri, loading, error, onPress, onView }: {
  label: string; uri: string | null; loading: boolean; error?: string; onPress: () => void; onView: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={ds.row}>
      <TouchableOpacity
        style={[ds.rowIcon, uri && ds.rowIconDone]}
        onPress={uri ? onView : onPress}
        activeOpacity={0.75}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : uri ? (
          <Image source={{ uri }} style={ds.rowThumb} />
        ) : (
          <Ionicons name="document-attach-outline" size={ms(20)} color={C.muted} />
        )}
      </TouchableOpacity>
      <TouchableOpacity style={ds.rowBody} onPress={onPress} activeOpacity={0.75} disabled={loading}>
        <Text style={ds.rowLabel}>{label}</Text>
        <Text style={ds.rowSub}>{uri ? "Uploaded — tap photo to view, or here to replace" : "Not uploaded yet"}</Text>
        {error ? <Text style={ds.rowErr}>{error}</Text> : null}
      </TouchableOpacity>
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-forward" size={ms(18)} color={C.placeholder} />
      </TouchableOpacity>
    </View>
  );
}

function DocumentsView({ studentId, initialPhotoUri, onClose }: {
  studentId: string; initialPhotoUri: string | null; onClose: (photoUri: string | null) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [docTypes, setDocTypes]               = useState<DocumentType[]>([]);
  const [docsLoading, setDocsLoading]         = useState(true);

  const [photoUri, setPhotoUri] = useState<string | null>(initialPhotoUri);
  const [docUris, setDocUris]   = useState<Record<string, string>>({});
  const [loadingKey, setLoadingKey] = useState<UploadKey | null>(null);
  const [errorKey, setErrorKey]     = useState<{ key: UploadKey; message: string } | null>(null);
  const [activeSheet, setActiveSheet] = useState<UploadKey | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listDocumentTypes(), listStudentDocuments(studentId)])
      .then(([types, docs]) => {
        setDocTypes(types);
        const map: Record<string, string> = {};
        docs.forEach((d) => { map[d.documentTypeId] = d.fileUrl; });
        setDocUris(map);
      })
      .catch(() => {})
      .finally(() => setDocsLoading(false));
  }, [studentId]);

  async function pickAndUpload(key: UploadKey, fromCamera: boolean) {
    setActiveSheet(null);
    setErrorKey(null);
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { setErrorKey({ key, message: "Camera permission is required." }); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { setErrorKey({ key, message: "Gallery permission is required." }); return; }
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];

    setLoadingKey(key);
    if (key === "photo") {
      const res = await uploadStudentPhoto(studentId, asset.uri, asset.mimeType ?? "image/jpeg");
      setLoadingKey(null);
      if (res.ok) setPhotoUri(res.student.photoUrl ?? asset.uri);
      else setErrorKey({ key, message: res.error });
    } else {
      const res = await uploadStudentDocument(studentId, key, asset.uri, asset.mimeType ?? "image/jpeg");
      setLoadingKey(null);
      if (res.ok) setDocUris((prev) => ({ ...prev, [key]: res.document.fileUrl }));
      else setErrorKey({ key, message: res.error });
    }
  }

  async function removeUpload(key: UploadKey) {
    setActiveSheet(null);
    setLoadingKey(key);
    if (key === "photo") {
      const res = await deleteStudentPhoto(studentId);
      setLoadingKey(null);
      if (res.ok) setPhotoUri(null);
      else setErrorKey({ key, message: res.error });
    } else {
      const res = await deleteStudentDocument(studentId, key);
      setLoadingKey(null);
      if (res.ok) setDocUris((prev) => { const next = { ...prev }; delete next[key]; return next; });
      else setErrorKey({ key, message: res.error });
    }
  }

  const activeHasUpload = activeSheet === "photo" ? !!photoUri : !!(activeSheet && docUris[activeSheet]);
  const activeLabel = activeSheet === "photo" ? "Photo" : docTypes.find((d) => d.id === activeSheet)?.label ?? "";

  return (
    <View style={[ds.overlay, { backgroundColor: colors.screenBg }]}>
      <View style={[ds.header, { paddingTop: insets.top + ms(4), backgroundColor: colors.headerBg }]}>
        <View style={ds.headerContent}>
          <View style={[ds.headerIconWrap, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="images-outline" size={ms(18)} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ds.headerTitle}>Photo &amp; Documents</Text>
            <Text style={ds.headerSub}>Manage this student's files</Text>
          </View>
          <TouchableOpacity style={ds.closeBtn} onPress={() => onClose(photoUri)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={ds.scroll} showsVerticalScrollIndicator={false}>
        {docsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: ms(16) }} />
        ) : (
          <>
            <UploadRow
              label="Student Photo"
              uri={photoUri}
              loading={loadingKey === "photo"}
              error={errorKey?.key === "photo" ? errorKey.message : undefined}
              onPress={() => setActiveSheet("photo")}
              onView={() => setPreviewUri(photoUri)}
            />
            {docTypes.map((dt) => (
              <UploadRow
                key={dt.id}
                label={dt.label}
                uri={docUris[dt.id] ?? null}
                loading={loadingKey === dt.id}
                error={errorKey?.key === dt.id ? errorKey.message : undefined}
                onPress={() => setActiveSheet(dt.id)}
                onView={() => setPreviewUri(docUris[dt.id] ?? null)}
              />
            ))}
          </>
        )}
      </ScrollView>

      <BottomSheet visible={activeSheet !== null} onClose={() => setActiveSheet(null)}>
        <View style={ds.sheetInner}>
          <Text style={ds.sheetTitle}>Update {activeLabel}</Text>
          <TouchableOpacity style={ds.sheetOption} onPress={() => activeSheet && pickAndUpload(activeSheet, true)} activeOpacity={0.8}>
            <View style={[ds.sheetOptionIcon, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="camera-outline" size={ms(22)} color={colors.primary} />
            </View>
            <Text style={ds.sheetOptionLabel}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ds.sheetOption} onPress={() => activeSheet && pickAndUpload(activeSheet, false)} activeOpacity={0.8}>
            <View style={[ds.sheetOptionIcon, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="image-outline" size={ms(22)} color={colors.primary} />
            </View>
            <Text style={ds.sheetOptionLabel}>Choose from Gallery</Text>
          </TouchableOpacity>
          {activeHasUpload && (
            <TouchableOpacity style={ds.sheetOption} onPress={() => activeSheet && removeUpload(activeSheet)} activeOpacity={0.8}>
              <View style={[ds.sheetOptionIcon, { backgroundColor: C.red + "18" }]}>
                <Ionicons name="trash-outline" size={ms(22)} color={C.red} />
              </View>
              <Text style={[ds.sheetOptionLabel, { color: C.red }]}>Remove</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: ms(20) }} />
        </View>
      </BottomSheet>

      {/* Full-screen document/photo preview */}
      <Modal visible={previewUri !== null} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <View style={ds.previewOverlay}>
          <TouchableOpacity
            style={[ds.previewCloseBtn, { top: insets.top + ms(12) }]}
            onPress={() => setPreviewUri(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={ms(22)} color="#fff" />
          </TouchableOpacity>
          {previewUri && (
            <Image source={{ uri: previewUri }} style={ds.previewImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

// backgroundColor for overlay/header/headerIconWrap is set inline at each
// call site (colors.screenBg / colors.headerBg / colors.primary) — this
// static StyleSheet has no access to the live theme, unlike ds in
// StudentAdmissionScreen.tsx which is a themed factory.
const ds = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  scroll:  { padding: ms(20), paddingBottom: ms(30) },

  header:        { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  headerContent: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: ms(16), paddingVertical: ms(12) },
  headerIconWrap: { width: ms(40), height: ms(40), borderRadius: ms(13), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  headerTitle:   { fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  headerSub:     { fontSize: fs(11.5), color: C.muted, marginTop: ms(1) },
  closeBtn:      { width: ms(36), height: ms(36), borderRadius: ms(11), backgroundColor: C.inputBg, justifyContent: "center", alignItems: "center", flexShrink: 0, borderWidth: 1, borderColor: C.border },

  row: {
    flexDirection: "row", alignItems: "center", gap: ms(12),
    backgroundColor: C.card, borderRadius: ms(14), padding: ms(12), marginBottom: ms(10),
    shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: ms(6), elevation: 2,
  },
  rowIcon:     { width: ms(40), height: ms(40), borderRadius: ms(12), backgroundColor: C.inputBg, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  rowIconDone: { backgroundColor: C.greenBg },
  rowThumb:    { width: ms(40), height: ms(40) },
  rowBody:     { flex: 1 },
  rowLabel:    { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  rowSub:      { fontSize: fs(11.5), color: C.muted, marginTop: ms(2) },
  rowErr:      { fontSize: fs(11), color: C.red, marginTop: ms(3) },

  sheetInner:  { padding: ms(20) },
  sheetTitle:  { fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, marginBottom: ms(14) },
  sheetOption: { flexDirection: "row", alignItems: "center", gap: ms(14), paddingVertical: ms(12) },
  sheetOptionIcon: { width: ms(42), height: ms(42), borderRadius: ms(12), justifyContent: "center", alignItems: "center" },
  sheetOptionLabel: { fontSize: fs(14.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },

  previewOverlay:  { flex: 1, backgroundColor: "rgba(10,4,7,0.95)", justifyContent: "center", alignItems: "center" },
  previewCloseBtn: { position: "absolute", right: ms(16), width: ms(38), height: ms(38), borderRadius: ms(19), backgroundColor: "rgba(255,255,255,0.16)", justifyContent: "center", alignItems: "center", zIndex: 1 },
  previewImg:      { width: "100%", height: "80%" },
});

// ── Constants ─────────────────────────────────────────────────────────────────

const GENDER_OPTIONS: { key: Gender; label: string }[] = [{ key: "male", label: "Male" }, { key: "female", label: "Female" }];

// ── Main screen ───────────────────────────────────────────────────────────────

export function EditStudentScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const insets = useSafeAreaInsets();
  const { student } = route.params;

  const [step, setStep]   = useState(0);
  const slideAnim         = useRef(new Animated.Value(0)).current;
  const cardOpacity       = useRef(new Animated.Value(0)).current;
  const cardSlide         = useRef(new Animated.Value(ms(40))).current;
  const checkScale        = useRef(new Animated.Value(0)).current;
  const ringScale         = useRef(new Animated.Value(0)).current;
  const ringOpacity       = useRef(new Animated.Value(0)).current;
  const sparkle           = useRef(new Animated.Value(0)).current;
  const contentOpacity    = useRef(new Animated.Value(0)).current;
  const contentY          = useRef(new Animated.Value(ms(10))).current;

  // ── Photo & Documents ──
  const [photoUri, setPhotoUri]           = useState<string | null>(student.photoUrl ?? null);
  const [docsViewOpen, setDocsViewOpen]   = useState(false);

  // ── Course picker ──
  const [courses, setCourses]                       = useState<CourseItem[]>([]);
  const [coursesLoading, setCoursesLoading]         = useState(true);
  const [coursePickerOpen, setCoursePickerOpen]     = useState(false);
  const [qualPickerOpen, setQualPickerOpen]         = useState(false);
  const [selectedCourseId, setSelectedCourseId]     = useState<string | null>(student.courseId ?? null);
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(student.course?.name ?? null);

  useEffect(() => {
    listCourses({ limit: 100 })
      .then((r) => {
        setCourses(r.data);
        // If student has courseId, find and show the course name
        if (student.courseId) {
          const match = r.data.find((c) => c.id === student.courseId);
          if (match) setSelectedCourseName(match.name);
        } else if (student.coursePreference && !student.courseId) {
          // Fallback for old records without courseId
          const match = r.data.find((c) => c.examCategories[0]?.key === student.coursePreference);
          if (match) { setSelectedCourseId(match.id); setSelectedCourseName(match.name); }
        }
      })
      .catch(() => {})
      .finally(() => setCoursesLoading(false));
  }, []);

  // ── Step 0: Personal ──
  const [fullName, setFullName] = useState(student.fullName);
  const [dob, setDob]           = useState(isoToDisplay(student.dob));
  const [gender, setGender]     = useState<Gender | null>(student.gender);
  const [aadhaar, setAadhaar]   = useState(student.aadhaar ?? "");
  const [address, setAddress]   = useState(student.address ?? "");
  const [phone, setPhone]       = useState(student.phone);

  // ── Step 1: Family ──
  const [fatherName, setFatherName]                 = useState(student.fatherName ?? "");
  const [motherName, setMotherName]                 = useState(student.motherName ?? "");
  const [guardianOccupation, setGuardianOccupation] = useState(student.guardianOccupation ?? "");
  const [guardianEmail, setGuardianEmail]           = useState(student.guardianEmail ?? "");

  // ── Step 2: Academic ──
  const [coursePreference, setCoursePreference]     = useState<CoursePreference | null>(student.coursePreference);
  const [durationPreference, setDurationPreference] = useState<DurationPref | null>(student.durationPreference);
  const [qualification, setQualification]           = useState<Qualification | null>(student.qualification);
  const [passYear, setPassYear]                     = useState(student.passYear ?? "");
  const [board, setBoard]                           = useState(student.board ?? "");

  // ── Step 3: Contact ──
  const [whatsapp, setWhatsapp]           = useState(student.whatsapp ?? "");
  const [guardianPhone, setGuardianPhone] = useState(student.guardianPhone ?? "");

  // ── Step 4: Office ──
  const [preferredTiming, setPreferredTiming] = useState<BatchTiming | null>(student.preferredTiming);
  const [paymentMode, setPaymentMode]         = useState<PaymentMode | null>(student.paymentMode);
  const [amountPaid, setAmountPaid]           = useState(
    student.amountPaid ? String(Number(student.amountPaid)) : ""
  );

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<StudentItem | null>(null);
  const [discardVisible, setDiscardVisible] = useState(false);

  function isDirty(): boolean {
    return (
      fullName !== student.fullName ||
      dob !== isoToDisplay(student.dob) ||
      gender !== student.gender ||
      aadhaar !== (student.aadhaar ?? "") ||
      address !== (student.address ?? "") ||
      phone !== student.phone ||
      fatherName !== (student.fatherName ?? "") ||
      motherName !== (student.motherName ?? "") ||
      guardianOccupation !== (student.guardianOccupation ?? "") ||
      guardianEmail !== (student.guardianEmail ?? "") ||
      coursePreference !== student.coursePreference ||
      durationPreference !== student.durationPreference ||
      qualification !== student.qualification ||
      passYear !== (student.passYear ?? "") ||
      board !== (student.board ?? "") ||
      whatsapp !== (student.whatsapp ?? "") ||
      guardianPhone !== (student.guardianPhone ?? "") ||
      preferredTiming !== student.preferredTiming ||
      paymentMode !== student.paymentMode ||
      amountPaid !== (student.amountPaid ? String(Number(student.amountPaid)) : "")
    );
  }

  function handleHeaderBack() {
    if (isDirty()) {
      setDiscardVisible(true);
    } else {
      navigation.goBack();
    }
  }

  function animateStep(direction: 1 | -1, targetStep: number) {
    slideAnim.setValue(direction * ms(60));
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 120, friction: 12 }).start();
    setStep(targetStep);
  }

  function validateStep(): boolean {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!fullName.trim()) errs.fullName = "Full name is required.";
      if (!phone.trim())    errs.phone    = "Phone number is required.";
      if (dob.trim() && !parseDisplayDate(dob)) errs.dob = "Enter date in DD/MM/YYYY format.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) animateStep(1, step + 1);
    else handleSubmit();
  }

  function handlePrev() {
    if (step > 0) animateStep(-1, step - 1);
    else navigation.goBack();
  }

  function revealSuccessCard() {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 40 }),
      Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 62, friction: 6, delay: 160 }),
      Animated.sequence([
        Animated.timing(ringOpacity, { toValue: 0.4, duration: 1,   useNativeDriver: true, delay: 170 }),
        Animated.timing(ringOpacity, { toValue: 0,   duration: 550, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.timing(ringScale, { toValue: 1, duration: 650, easing: Easing.out(Easing.ease), useNativeDriver: true, delay: 170 }),
      Animated.spring(sparkle,   { toValue: 1, useNativeDriver: true, tension: 90, friction: 8, delay: 320 }),
      Animated.timing(contentOpacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true, delay: 260 }),
      Animated.spring(contentY,       { toValue: 0, useNativeDriver: true, tension: 80, friction: 11, delay: 260 }),
    ]).start();
  }

  async function handleSubmit() {
    setLoading(true);
    setErrors({});
    try {
      const response = await updateStudent(student.id, {
        fullName:           fullName.trim(),
        phone:              phone.trim(),
        dob:                parseDisplayDate(dob) ?? null,
        gender,
        aadhaar:            aadhaar.trim() || null,
        address:            address.trim() || null,
        fatherName:         fatherName.trim() || null,
        motherName:         motherName.trim() || null,
        guardianOccupation: guardianOccupation.trim() || null,
        guardianEmail:      guardianEmail.trim() || null,
        qualification,
        passYear:           passYear.trim() || null,
        board:              board.trim() || null,
        courseId:           selectedCourseId ?? null,
        coursePreference,
        durationPreference,
        whatsapp:           whatsapp.trim() || null,
        guardianPhone:      guardianPhone.trim() || null,
        preferredTiming,
        paymentMode,
        amountPaid:         amountPaid.trim() ? Number(amountPaid) : null,
      });

      if (response.ok) {
        setUpdated(response.student);
        revealSuccessCard();
      } else {
        setErrors({ submit: response.error });
      }
    } catch {
      setErrors({ submit: "Network error — please check your connection." });
    } finally {
      setLoading(false);
    }
  }

  // ── Step content ──────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      case 0: {
        return (
          <View style={s.stepContent}>
            {/* Photo & Documents entry */}
            <TouchableOpacity style={s.docsEntry} onPress={() => setDocsViewOpen(true)} activeOpacity={0.8}>
              <View style={s.docsEntryThumb}>
                {photoUri
                  ? <Image source={{ uri: photoUri }} style={s.docsEntryThumbImg} />
                  : <Ionicons name="person" size={ms(24)} color={colors.primary} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.docsEntryTitle}>Photo &amp; Documents</Text>
                <Text style={s.docsEntrySub}>Photo, Aadhar card, marksheet</Text>
              </View>
              <Ionicons name="chevron-forward" size={ms(18)} color={C.muted} />
            </TouchableOpacity>

            <SectionHead icon="person-circle-outline" label="Personal Details" sub="Basic identity information" />
            <FormField label="FULL NAME" value={fullName} onChangeText={(v) => { setFullName(v); setErrors((p) => ({ ...p, fullName: "" })); }}
              placeholder="e.g. Rahul Kumar Sharma" error={errors.fullName} icon="person-outline" maxLength={120} clearable />
            <FormField label="DATE OF BIRTH" value={dob} onChangeText={(v) => { setDob(autoFormatDate(v)); setErrors((p) => ({ ...p, dob: "" })); }}
              placeholder="DD/MM/YYYY" keyboardType="number-pad" error={errors.dob} icon="calendar-outline" />
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>GENDER</Text>
              <OptionRow options={GENDER_OPTIONS} value={gender} onSelect={setGender} />
            </View>
            <FormField label="AADHAAR NUMBER" value={aadhaar} onChangeText={(v) => setAadhaar(v.replace(/\D/g, "").slice(0, 12))}
              placeholder="12-digit Aadhaar number" keyboardType="number-pad" icon="card-outline" />
            <FormField label="ADDRESS" value={address} onChangeText={setAddress}
              placeholder="House, Street, City, State" icon="location-outline" />
            <FormField label="PHONE NUMBER" value={phone} onChangeText={(v) => { setPhone(v.replace(/\D/g, "")); setErrors((p) => ({ ...p, phone: "" })); }}
              placeholder="e.g. 9876543210" keyboardType="phone-pad" error={errors.phone} icon="call-outline" />
          </View>
        );
      }

      case 1:
        return (
          <View style={s.stepContent}>
            <SectionHead icon="people-outline" label="Family Details" sub="Parent & guardian information" />
            <FormField label="FATHER'S NAME" value={fatherName} onChangeText={setFatherName}
              placeholder="Father's full name" icon="person-outline" maxLength={120} />
            <FormField label="MOTHER'S NAME" value={motherName} onChangeText={setMotherName}
              placeholder="Mother's full name" icon="person-outline" maxLength={120} />
            <FormField label="GUARDIAN OCCUPATION" value={guardianOccupation} onChangeText={setGuardianOccupation}
              placeholder="e.g. Government Employee, Business" icon="briefcase-outline" />
            <FormField label="GUARDIAN EMAIL" value={guardianEmail} onChangeText={setGuardianEmail}
              placeholder="guardian@email.com" keyboardType="email-address" icon="mail-outline" />
          </View>
        );

      case 2:
        return (
          <View style={s.stepContent}>
            <SectionHead icon="book-outline" label="Course Interest" />

            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>COURSE PREFERENCE</Text>
              <TouchableOpacity style={s.courseSel} onPress={() => setCoursePickerOpen(true)} activeOpacity={0.75} disabled={coursesLoading}>
                {coursesLoading ? (
                  <>
                    <ActivityIndicator size="small" color={C.muted} />
                    <Text style={s.courseSelPlaceholder}>Loading courses…</Text>
                  </>
                ) : selectedCourseName ? (
                  <>
                    <View style={[s.courseSelDot, { backgroundColor: courses.find((c) => c.id === selectedCourseId)?.examCategories[0]?.color ?? colors.primary }]} />
                    <Text style={s.courseSelValue} numberOfLines={1}>{selectedCourseName}</Text>
                    <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
                  </>
                ) : coursePreference ? (
                  <>
                    <View style={[s.courseSelDot, { backgroundColor: getCourseMeta(coursePreference).color }]} />
                    <Text style={s.courseSelValue} numberOfLines={1}>{getCourseMeta(coursePreference).label}</Text>
                    <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
                  </>
                ) : (
                  <>
                    <Ionicons name="book-outline" size={ms(16)} color={C.muted} />
                    <Text style={s.courseSelPlaceholder}>Tap to select a course</Text>
                    <Ionicons name="chevron-forward" size={ms(16)} color={C.placeholder} />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={s.sectionDivider} />
            <SectionHead icon="ribbon-outline" label="Academic Background" />

            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>HIGHEST QUALIFICATION</Text>
              <TouchableOpacity style={s.courseSel} onPress={() => setQualPickerOpen(true)} activeOpacity={0.75}>
                {qualification ? (
                  <>
                    <Ionicons name={QUAL_DISPLAY[qualification]?.icon as any ?? "ribbon-outline"} size={ms(16)} color={colors.accent} />
                    <Text style={s.courseSelValue} numberOfLines={1}>{QUAL_DISPLAY[qualification]?.label}</Text>
                    <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
                  </>
                ) : (
                  <>
                    <Ionicons name="ribbon-outline" size={ms(16)} color={C.muted} />
                    <Text style={s.courseSelPlaceholder}>Tap to select qualification</Text>
                    <Ionicons name="chevron-forward" size={ms(16)} color={C.placeholder} />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <FormField label="PASS YEAR" value={passYear} onChangeText={(v) => setPassYear(v.replace(/\D/g, "").slice(0, 4))}
              placeholder="e.g. 2023" keyboardType="number-pad" icon="trophy-outline" />
            <FormField label="BOARD / UNIVERSITY" value={board} onChangeText={setBoard}
              placeholder="e.g. CBSE, UP Board" icon="business-outline" maxLength={100} />
          </View>
        );

      case 3:
        return (
          <View style={s.stepContent}>
            <SectionHead icon="call-outline" label="Contact Details" sub="WhatsApp & emergency contact" />
            <FormField label="WHATSAPP NUMBER" value={whatsapp} onChangeText={(v) => setWhatsapp(v.replace(/\D/g, ""))}
              placeholder="WhatsApp number (if different)" keyboardType="phone-pad" icon="logo-whatsapp" hint="Leave blank if same as phone" />
            <FormField label="GUARDIAN PHONE" value={guardianPhone} onChangeText={(v) => setGuardianPhone(v.replace(/\D/g, ""))}
              placeholder="Parent or guardian contact" keyboardType="phone-pad" icon="call-outline" />
          </View>
        );

      case 4:
        return (
          <View style={s.stepContent}>
            <View style={s.officeBadgeWrap}>
              <View style={s.officeBadge}>
                <Ionicons name="business-outline" size={ms(11)} color={C.blue} />
                <Text style={s.officeBadgeT}>FOR OFFICE USE ONLY</Text>
              </View>
            </View>

            <SectionHead icon="time-outline" label="Batch Timing" />
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>PREFERRED BATCH TIMING</Text>
              <TimingPicker value={preferredTiming} onSelect={setPreferredTiming} />
            </View>

            <View style={s.sectionDivider} />

            <SectionHead icon="cash-outline" label="Payment Details" />
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>AMOUNT PAID (₹)</Text>
              <View style={s.amountRow}>
                <Text style={s.amountPrefix}>₹</Text>
                <TextInput
                  style={s.amountInput}
                  value={amountPaid}
                  onChangeText={(v) => setAmountPaid(v.replace(/[^0-9.]/g, ""))}
                  placeholder="0"
                  placeholderTextColor={C.placeholder}
                  keyboardType="decimal-pad"
                />
              </View>
              <Text style={s.amountHint}>Update if additional fee was collected</Text>
            </View>
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>MODE OF PAYMENT</Text>
              <PaymentModePicker value={paymentMode} onSelect={setPaymentMode} />
            </View>

            {errors.submit && (
              <View style={s.submitError}>
                <Text style={s.submitErrorT}>{errors.submit}</Text>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="Edit Student" onBack={handleHeaderBack} />
      <StepBar current={step} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
            <View style={s.card}>
              {renderStep()}
            </View>
          </Animated.View>

          <View style={s.navRow}>
            {step > 0 && (
              <TouchableOpacity style={s.prevBtn} onPress={handlePrev} activeOpacity={0.75}>
                <Ionicons name="chevron-back" size={ms(18)} color={colors.primary} />
                <Text style={s.prevBtnT}>Back</Text>
              </TouchableOpacity>
            )}
            <View style={s.navSpacer} />
            {step < STEPS.length - 1 ? (
              <TouchableOpacity style={[s.nextBtn, s.nextBtnGrad, { backgroundColor: colors.primary }]} onPress={handleNext} activeOpacity={0.85}>
                <Text style={s.nextBtnT}>Next</Text>
                <Ionicons name="chevron-forward" size={ms(18)} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.nextBtn, s.nextBtnGrad, { backgroundColor: colors.primary }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Text style={s.nextBtnT}>Save Changes</Text>
                      <Ionicons name="checkmark-circle-outline" size={ms(18)} color="#fff" />
                    </>
                }
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.stepPill}>Step {step + 1} of {STEPS.length} — {STEPS[step].label}</Text>
          <View style={{ height: ms(24) }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Full-screen loader */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderTitle}>Saving Changes…</Text>
            <Text style={s.loaderSub}>Please wait a moment</Text>
          </View>
        </View>
      )}

      {/* Course picker modal */}
      <CoursePickerModal
        visible={coursePickerOpen}
        courses={courses}
        selectedId={selectedCourseId}
        onClose={() => setCoursePickerOpen(false)}
        onSelect={(course) => {
          setSelectedCourseId(course.id);
          setSelectedCourseName(course.name);
          setCoursePreference((course.examCategories[0]?.key as CoursePreference) ?? null);
          setDurationPreference(monthsToDurationPref(course.durationMonths));
          setCoursePickerOpen(false);
        }}
      />

      {/* Qualification picker modal */}
      <QualPickerModal
        visible={qualPickerOpen}
        value={qualification}
        onClose={() => setQualPickerOpen(false)}
        onSelect={setQualification}
      />

      {/* Photo & Documents view */}
      {docsViewOpen && (
        <DocumentsView
          studentId={student.id}
          initialPhotoUri={photoUri}
          onClose={(uri) => { setPhotoUri(uri); setDocsViewOpen(false); }}
        />
      )}

      {/* Discard changes modal */}
      <Modal visible={discardVisible} transparent animationType="fade" onRequestClose={() => setDiscardVisible(false)}>
        <View style={s.discardOverlay}>
          <View style={s.discardCard}>
            <View style={s.discardIconCircle}>
              <Ionicons name="arrow-undo-outline" size={ms(30)} color={colors.primary} />
            </View>

            <Text style={s.discardTitle}>Discard Changes?</Text>
            <Text style={s.discardBody}>
              The changes you've made to this student's{"\n"}profile will be lost permanently.{"\n"}This action cannot be undone.
            </Text>

            <View style={s.discardDivider} />

            <TouchableOpacity
              style={s.discardDestructiveBtn}
              onPress={() => { setDiscardVisible(false); navigation.goBack(); }}
              activeOpacity={0.82}
            >
              <Ionicons name="arrow-undo-outline" size={ms(16)} color="#fff" />
              <Text style={s.discardDestructiveTxt}>Yes, Discard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.discardCancelBtn}
              onPress={() => setDiscardVisible(false)}
              activeOpacity={0.82}
            >
              <Ionicons name="arrow-back-outline" size={ms(16)} color={colors.primary} />
              <Text style={s.discardCancelTxt}>Continue Editing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full-screen success card */}
      {updated !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <View style={[s.successStatusBarBg, { height: insets.top }]} />
          <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>

            <View style={s.checkStage}>
              <Animated.View
                pointerEvents="none"
                style={[
                  s.pingRing,
                  {
                    opacity: ringOpacity,
                    transform: [{ scale: ringScale.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.55] }) }],
                  },
                ]}
              />
              <View style={s.checkGlow} />
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <View style={[s.checkCircle, { backgroundColor: C.green }]}>
                  <Ionicons name="checkmark" size={ms(34)} color="#fff" />
                </View>
              </Animated.View>
              <Animated.View style={[s.sparkleTL, { opacity: sparkle, transform: [{ scale: sparkle }] }]}>
                <Ionicons name="sparkles" size={ms(14)} color={colors.secondary} />
              </Animated.View>
              <Animated.View style={[s.sparkleBR, { opacity: sparkle, transform: [{ scale: sparkle }] }]}>
                <Ionicons name="sparkles" size={ms(10)} color={colors.accent} />
              </Animated.View>
            </View>

            <Animated.View style={[s.successContent, { opacity: contentOpacity, transform: [{ translateY: contentY }] }]}>
              <Text style={s.successTitle}>Student Updated!</Text>
              <View style={s.regCodeRow}>
                <Ionicons name="id-card-outline" size={ms(14)} color={colors.primary} />
                <Text style={s.regCode}>{updated.studentCode}</Text>
              </View>
              <Text style={s.successSub}>Profile updated successfully</Text>

              <View style={s.detailBox}>
                <DetailRow icon="person-outline" label="Student Name" value={updated.fullName} color={colors.primary} />
                <DetailRow icon="call-outline"   label="Phone"        value={updated.phone}     color={colors.accent} />
                {updated.coursePreference && (
                  <DetailRow icon="book-outline" label="Course Pref." value={updated.coursePreference.toUpperCase()} color={C.blue} />
                )}
                {updated.amountPaid && (
                  <DetailRow icon="cash-outline" label="Amount Paid"  value={`₹ ${Number(updated.amountPaid).toLocaleString("en-IN")}`} color={C.green} />
                )}
                {updated.paymentMode && (
                  <DetailRow icon="card-outline" label="Payment Mode" value={updated.paymentMode === "cash" ? "Cash" : "Online Payment"} color={C.orange} last />
                )}
              </View>

              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
                <View style={[s.doneBtn, { backgroundColor: colors.primary }]}>
                  <Ionicons name="people-outline" size={ms(18)} color="#fff" />
                  <Text style={s.doneBtnT}>View All Students</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>

          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.screenBg },
  flex:        { flex: 1 },
  scroll:      { flex: 1, backgroundColor: colors.screenBg },
  body:        { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(40) },

  stepContent: { gap: ms(2) },
  card:        { backgroundColor: C.card, borderRadius: ms(20), padding: ms(18), marginBottom: ms(14), shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  fieldBlock:  { marginBottom: ms(16), gap: ms(10) },
  fieldLabel:  { fontSize: fs(11), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, letterSpacing: 0.8, textTransform: "uppercase" },
  sectionDivider: { height: 1, backgroundColor: C.border, marginVertical: ms(16) },

  courseSel:            { flexDirection: "row", alignItems: "center", gap: ms(10), backgroundColor: C.inputBg, borderRadius: ms(14), borderWidth: 1.5, borderColor: C.border, paddingHorizontal: ms(14), paddingVertical: ms(14) },
  courseSelDot:         { width: ms(10), height: ms(10), borderRadius: ms(5), flexShrink: 0 },
  courseSelValue:       { flex: 1, fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  courseSelPlaceholder: { flex: 1, fontSize: fs(14), color: C.placeholder },

  officeBadgeWrap: { alignItems: "center", marginBottom: ms(18) },
  officeBadge:     { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: C.blue + "12", borderRadius: ms(20), paddingHorizontal: ms(14), paddingVertical: ms(7), borderWidth: 1, borderColor: C.blue + "30" },
  officeBadgeT:    { fontSize: fs(10.5), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.blue, letterSpacing: 1.2 },

  amountRow:    { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: ms(12), borderWidth: 1.5, borderColor: C.border, paddingHorizontal: ms(14), paddingVertical: ms(12), gap: ms(8) },
  amountPrefix: { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.green },
  amountInput:  { flex: 1, fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, includeFontPadding: false, padding: 0 },
  amountHint:   { fontSize: fs(11.5), color: C.muted, marginTop: ms(5) },

  submitError:   { backgroundColor: C.red + "08", borderRadius: ms(12), borderWidth: 1, borderColor: C.red + "30", padding: ms(14), marginTop: ms(8) },
  submitErrorT:  { fontSize: fs(13), color: C.red, lineHeight: fs(18) },

  navRow:       { flexDirection: "row", alignItems: "center", marginBottom: ms(10) },
  navSpacer:    { flex: 1 },
  prevBtn:      { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(16), paddingVertical: ms(12), borderRadius: ms(14), backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  prevBtnT:     { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: colors.primary },
  nextBtn:      { borderRadius: ms(14) },
  nextBtnGrad:  { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(22), paddingVertical: ms(13), borderRadius: ms(14) },
  nextBtnT:     { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff" },
  stepPill:     { textAlign: "center", fontSize: fs(11), color: C.placeholder, marginTop: ms(2) },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg + "EE", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  loaderSub:     { fontSize: fs(12), color: C.muted },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successStatusBarBg: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: colors.primary },
  successCard:    { width: "100%", backgroundColor: C.card, borderRadius: ms(30), padding: ms(22), alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(10) }, shadowOpacity: 0.14, shadowRadius: ms(28), elevation: 12 },

  checkStage:   { width: ms(104), height: ms(104), justifyContent: "center", alignItems: "center", marginBottom: ms(8) },
  checkGlow:    { position: "absolute", width: ms(90), height: ms(90), borderRadius: ms(45), backgroundColor: C.greenBg },
  pingRing:     { position: "absolute", width: ms(70), height: ms(70), borderRadius: ms(35), borderWidth: 2, borderColor: C.green },
  checkCircle:  { width: ms(70), height: ms(70), borderRadius: ms(35), justifyContent: "center", alignItems: "center" },
  sparkleTL:    { position: "absolute", top: ms(2), left: ms(8) },
  sparkleBR:    { position: "absolute", bottom: ms(6), right: ms(4) },

  successContent: { width: "100%", alignItems: "center" },
  successTitle:   { fontSize: fs(21), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, letterSpacing: 0.1, marginBottom: ms(6) },
  regCodeRow:     { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: colors.primary + "12", borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(5), marginBottom: ms(6) },
  regCode:        { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: colors.primary, letterSpacing: 1 },
  successSub:     { fontSize: fs(12.5), color: C.muted, marginBottom: ms(12), textAlign: "center" },

  detailBox:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(12), borderWidth: 1, borderColor: C.border },
  detailRow:      { flexDirection: "row", alignItems: "center", paddingVertical: ms(9), gap: ms(12) },
  detailRowBorder:{ borderBottomWidth: 1, borderBottomColor: C.border },
  detailIcon:     { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  detailMeta:     { flex: 1 },
  detailLabel:    { fontSize: fs(10.5), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  detailValue:    { fontSize: fs(13.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },

  doneBtnWrap:    { width: "100%" },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(15) },
  doneBtnT:       { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },

  docsEntry:      { flexDirection: "row", alignItems: "center", gap: ms(12), backgroundColor: C.inputBg, borderRadius: ms(16), borderWidth: 1.5, borderColor: C.border, padding: ms(12), marginBottom: ms(18) },
  docsEntryThumb: { width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: colors.primary + "18", borderWidth: 2, borderColor: colors.primary, overflow: "hidden", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  docsEntryThumbImg: { width: ms(52), height: ms(52), borderRadius: ms(26) },
  docsEntryTitle: { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  docsEntrySub:   { fontSize: fs(11.5), color: C.muted, marginTop: ms(1) },

  discardOverlay:        { flex: 1, backgroundColor: "rgba(16,4,8,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: ms(28) },
  discardCard:           { width: "100%", backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(24), paddingTop: ms(32), paddingBottom: ms(24), alignItems: "center", shadowColor: C.text, shadowOffset: { width: 0, height: ms(12) }, shadowOpacity: 0.22, shadowRadius: ms(28), elevation: 18 },
  discardIconCircle:     { width: ms(64), height: ms(64), borderRadius: ms(32), backgroundColor: colors.primary + "17", borderWidth: 2, borderColor: colors.primary + "33", justifyContent: "center", alignItems: "center", marginBottom: ms(18) },
  discardTitle:          { fontSize: fs(18), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, marginBottom: ms(10), letterSpacing: 0.2 },
  discardBody:           { fontSize: fs(13), color: C.muted, textAlign: "center", lineHeight: fs(20), marginBottom: ms(20) },
  discardDivider:        { width: "100%", height: 1, backgroundColor: "#F2EAE8", marginBottom: ms(16) },
  discardDestructiveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), width: "100%", backgroundColor: colors.primary, borderRadius: ms(14), paddingVertical: ms(14), marginBottom: ms(10) },
  discardDestructiveTxt: { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
  discardCancelBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), width: "100%", backgroundColor: colors.primary + "12", borderRadius: ms(14), paddingVertical: ms(13), borderWidth: 1.5, borderColor: colors.primary + "33" },
  discardCancelTxt:      { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: colors.primary },
});

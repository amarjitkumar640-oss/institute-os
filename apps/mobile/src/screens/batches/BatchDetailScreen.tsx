import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput,
} from "react-native";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { listStudents, type StudentItem } from "../../api/students";
import { type BatchItem, type BatchStatus } from "../../api/batches";
import { enrollStudent } from "../../api/enrollments";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Props = NativeStackScreenProps<RootStackParamList, "BatchDetail">;

// ── Maps ──────────────────────────────────────────────────────────────────────


const STATUS_META: Record<BatchStatus, { label: string; color: string; bg: string }> = {
  running:   { label: "Running",   color: C.green,   bg: C.green   + "18" },
  upcoming:  { label: "Upcoming",  color: C.blue,    bg: C.blue    + "18" },
  completed: { label: "Completed", color: C.muted,   bg: C.muted   + "18" },
};

const CP_COLOR: Record<string, string> = {
  ssc: C.blue, banking: C.green, railway: C.orange, foundation: C.purple, others: C.muted,
};
const CP_LABEL: Record<string, string> = {
  ssc: "SSC", banking: "Banking", railway: "Railway", foundation: "Foundation", others: "Others",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Add Student Modal ─────────────────────────────────────────────────────────

function AddStudentModal({ visible, batch, enrolledIds, onClose, onEnrolled }: {
  visible: boolean;
  batch: BatchItem;
  enrolledIds: Set<string>;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const colors = useThemeColors();
  const am = useThemedStyles(makeAmStyles);
  const [allStudents, setAllStudents]     = useState<StudentItem[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState("");
  const [submitting, setSubmitting]       = useState<string | null>(null);
  const [result, setResult]               = useState<{ ok: boolean; msg: string } | null>(null);
  const [localEnrolled, setLocalEnrolled] = useState(new Set(enrolledIds));
  const [localCount, setLocalCount]       = useState(batch.enrolledCount);

  React.useEffect(() => {
    if (!visible) return;
    setSearch("");
    setResult(null);
    setLocalEnrolled(new Set(enrolledIds));
    setLocalCount(batch.enrolledCount);
    setLoading(true);
    listStudents().then(setAllStudents).catch(() => {}).finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStudents;
    return allStudents.filter((s) =>
      s.fullName.toLowerCase().includes(q) ||
      s.studentCode.toLowerCase().includes(q) ||
      s.phone.includes(q)
    );
  }, [allStudents, search]);

  const isFull = localCount >= batch.capacity;

  async function handleEnroll(student: StudentItem) {
    if (localEnrolled.has(student.id) || isFull || submitting) return;
    setSubmitting(student.id);
    setResult(null);
    const res = await enrollStudent(student.id, batch.id);
    setSubmitting(null);
    if (res.ok) {
      setLocalEnrolled((prev) => new Set([...prev, student.id]));
      setLocalCount((c) => c + 1);
      setResult({ ok: true, msg: `${student.fullName} enrolled successfully!` });
      onEnrolled();
    } else if ("alreadyEnrolled" in res) {
      setLocalEnrolled((prev) => new Set([...prev, student.id]));
      setResult({ ok: false, msg: "Already enrolled in this batch." });
    } else if ("batchFull" in res) {
      setResult({ ok: false, msg: res.message });
    } else {
      setResult({ ok: false, msg: res.error });
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="80%">
      <View style={am.sheetPad}>
        <View style={am.handle} />

          <View style={am.header}>
            <Text style={am.title}>Add Student</Text>
            <View style={[am.pill, { backgroundColor: isFull ? C.red + "18" : C.green + "18" }]}>
              <Text style={[am.pillT, { color: isFull ? C.red : C.green }]}>
                {localCount}/{batch.capacity} seats
              </Text>
            </View>
            <TouchableOpacity style={am.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>

          {isFull && (
            <View style={am.fullBanner}>
              <Ionicons name="alert-circle-outline" size={ms(15)} color={C.red} />
              <Text style={am.fullT}>This batch is at full capacity</Text>
            </View>
          )}

          {result && (
            <View style={[am.resultBanner, { backgroundColor: result.ok ? C.green + "18" : C.red + "18" }]}>
              <Ionicons name={result.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={ms(15)} color={result.ok ? C.green : C.red} />
              <Text style={[am.resultT, { color: result.ok ? C.green : C.red }]}>{result.msg}</Text>
            </View>
          )}

          <View style={am.searchRow}>
            <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
            <TextInput
              style={am.searchInput}
              placeholder="Search by name, code, or phone…"
              placeholderTextColor={C.placeholder}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={ms(15)} color={C.placeholder} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={am.loaderWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={am.loaderT}>Loading students…</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: ms(8) }}>
              {filtered.length === 0 ? (
                <View style={am.emptyWrap}>
                  <Ionicons name="school-outline" size={ms(36)} color={C.border} />
                  <Text style={am.emptyT}>{search ? "No students match your search" : "No students found"}</Text>
                </View>
              ) : filtered.map((student) => {
                const enrolled  = localEnrolled.has(student.id);
                const busy      = submitting === student.id;
                const disabled  = enrolled || isFull || !!submitting;
                const cp        = student.coursePreference;
                const color     = cp ? (CP_COLOR[cp] ?? C.muted) : C.muted;
                const ini       = initials(student.fullName);

                return (
                  <TouchableOpacity
                    key={student.id}
                    style={[am.row, disabled && !enrolled && { opacity: 0.5 }]}
                    onPress={() => handleEnroll(student)}
                    disabled={disabled}
                    activeOpacity={0.75}
                  >
                    <View style={[am.avatar, { backgroundColor: color + "22" }]}>
                      <Text style={[am.avatarT, { color }]}>{ini}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={am.studentName} numberOfLines={1}>{student.fullName}</Text>
                      <Text style={am.studentSub}>{student.studentCode}{student.phone ? ` · ${student.phone}` : ""}</Text>
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : enrolled ? (
                      <View style={am.enrolledBadge}>
                        <Ionicons name="checkmark-circle" size={ms(14)} color={C.green} />
                        <Text style={am.enrolledT}>Enrolled</Text>
                      </View>
                    ) : !isFull ? (
                      <View style={am.addBtn}>
                        <Ionicons name="add" size={ms(16)} color={colors.primary} />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={am.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={am.doneT}>Done</Text>
          </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const makeAmStyles = (colors: ThemeColors) => StyleSheet.create({
  sheetPad:     { paddingTop: ms(12), paddingHorizontal: ms(16), paddingBottom: ms(8) },
  handle:       { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginBottom: ms(16) },
  header:       { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(8) },
  title:        { flex: 1, fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  closeBtn:     { width: ms(36), height: ms(36), borderRadius: ms(11), backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  pill:         { borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  pillT:        { fontSize: fs(11.5), fontFamily: "Inter_800ExtraBold", fontWeight: "800" },
  fullBanner:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.red + "18", borderRadius: ms(10), padding: ms(10), marginBottom: ms(10) },
  fullT:        { fontSize: fs(12), color: C.red, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  resultBanner: { flexDirection: "row", alignItems: "center", gap: ms(8), borderRadius: ms(10), padding: ms(10), marginBottom: ms(10) },
  resultT:      { fontSize: fs(12.5), fontFamily: "Inter_600SemiBold", fontWeight: "600", flex: 1 },
  searchRow:    { flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: ms(12), borderWidth: 1, borderColor: C.border, paddingHorizontal: ms(12), paddingVertical: ms(10), marginBottom: ms(10), gap: ms(8) },
  searchInput:  { flex: 1, fontSize: fs(13), color: C.text, padding: 0, includeFontPadding: false },
  loaderWrap:   { alignItems: "center", paddingVertical: ms(40), gap: ms(12) },
  loaderT:      { fontSize: fs(13), color: C.muted },
  emptyWrap:    { alignItems: "center", paddingVertical: ms(28), gap: ms(10) },
  emptyT:       { fontSize: fs(13), color: C.placeholder, textAlign: "center" },
  row:          { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), borderBottomWidth: 1, borderBottomColor: C.border, gap: ms(12) },
  avatar:       { width: ms(40), height: ms(40), borderRadius: ms(12), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarT:      { fontSize: fs(13), fontFamily: "Inter_800ExtraBold", fontWeight: "800", includeFontPadding: false },
  studentName:  { fontSize: fs(13.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  studentSub:   { fontSize: fs(11), color: C.muted, marginTop: ms(2) },
  enrolledBadge:{ flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.green + "18", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5) },
  enrolledT:    { fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.green },
  addBtn:       { width: ms(30), height: ms(30), borderRadius: ms(10), backgroundColor: colors.primary + "10", justifyContent: "center", alignItems: "center" },
  doneBtn:      { marginTop: ms(12), marginBottom: ms(24), borderRadius: ms(14), backgroundColor: colors.primary, alignItems: "center", paddingVertical: ms(14) },
  doneT:        { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff" },
});

// ── Student Row ───────────────────────────────────────────────────────────────

function StudentRow({ student, index, onEdit }: {
  student: StudentItem; index: number; onEdit: () => void;
}) {
  const cp    = student.coursePreference;
  const color = cp ? (CP_COLOR[cp] ?? C.muted) : C.muted;
  const label = cp ? (CP_LABEL[cp] ?? cp) : null;
  const ini   = initials(student.fullName);

  return (
    <View style={[sr.row, index > 0 && sr.rowBorder]}>
      <View style={[sr.avatar, { backgroundColor: color + "22" }]}>
        <Text style={[sr.avatarT, { color }]}>{ini}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={sr.name} numberOfLines={1}>{student.fullName}</Text>
        <Text style={sr.sub}>{student.studentCode}{student.phone ? ` · ${student.phone}` : ""}</Text>
      </View>
      <View style={sr.right}>
        {label && (
          <View style={[sr.tag, { backgroundColor: color + "18" }]}>
            <Text style={[sr.tagT, { color }]}>{label}</Text>
          </View>
        )}
        <TouchableOpacity style={sr.editBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="pencil-outline" size={ms(13)} color={C.blue} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), paddingHorizontal: ms(14), gap: ms(12) },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  avatar:    { width: ms(40), height: ms(40), borderRadius: ms(12), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarT:   { fontSize: fs(13), fontFamily: "Inter_800ExtraBold", fontWeight: "800", includeFontPadding: false },
  name:      { fontSize: fs(13.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  sub:       { fontSize: fs(11), color: C.muted, marginTop: ms(2) },
  right:     { flexDirection: "row", alignItems: "center", gap: ms(8), flexShrink: 0 },
  tag:       { borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  tagT:      { fontSize: fs(10.5), fontFamily: "Inter_800ExtraBold", fontWeight: "800" },
  editBtn:   { width: ms(28), height: ms(28), borderRadius: ms(8), backgroundColor: C.blue + "12", justifyContent: "center", alignItems: "center" },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function BatchDetailScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { batch: initialBatch } = route.params;
  const [batch, setBatch]           = useState<BatchItem>(initialBatch);
  const [students, setStudents]     = useState<StudentItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd]       = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await listStudents({ batchId: batch.id });
      setStudents(data);
      setBatch((prev) => ({ ...prev, enrolledCount: data.length }));
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [batch.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRefetchOnReconnect(() => load(true));

  const examColor = batch.course.examCategories[0]?.color ?? C.muted;
  const examLabel = batch.course.examCategories.length
    ? batch.course.examCategories.map((c) => c.label).join(", ")
    : "General";
  const status    = STATUS_META[batch.status];
  const pct       = batch.capacity ? Math.min(batch.enrolledCount / batch.capacity, 1) : 0;
  const isFull    = batch.enrolledCount >= batch.capacity;
  const seatsLeft = batch.capacity - batch.enrolledCount;
  const enrolledIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>

      <ScreenHeader
        title={batch.name}
        onBack={() => navigation.goBack()}
        rightIcon="pencil-outline"
        onRight={() => navigation.navigate("EditBatch", { batch })}
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        {/* ── Combined batch info card ── */}
        <View style={s.infoCard}>
          {/* Badges + course name */}
          <View style={s.infoTop}>
            <View style={s.badgeRow}>
              <View style={[s.examBadge, { backgroundColor: examColor + "18" }]}>
                <View style={[s.examDot, { backgroundColor: examColor }]} />
                <Text style={[s.examBadgeT, { color: examColor }]}>{examLabel}</Text>
              </View>
              <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
                <View style={[s.examDot, { backgroundColor: status.color }]} />
                <Text style={[s.statusBadgeT, { color: status.color }]}>{status.label}</Text>
              </View>
            </View>
            <Text style={s.courseName} numberOfLines={1}>{batch.course.name}</Text>
          </View>

          <View style={s.cardDivider} />

          {/* 2×2 info grid */}
          <View style={s.infoGrid}>
            {[
              { icon: "time-outline",     label: "Duration", value: `${batch.course.durationMonths} months`, color: colors.primary },
              { icon: "cash-outline",     label: "Fee",      value: `₹${Number(batch.course.defaultFee).toLocaleString("en-IN")}`, color: C.green },
              { icon: "calendar-outline", label: "Start",    value: fmtDate(batch.startDate), color: C.blue },
              { icon: "flag-outline",     label: "End",      value: fmtDate(batch.endDate),   color: C.orange },
            ].map((item) => (
              <View key={item.label} style={s.infoTile}>
                <Text style={[s.infoTileLabel, { color: item.color }]}>{item.label}</Text>
                <Text style={s.infoTileValue} numberOfLines={1}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={s.cardDivider} />

          {/* Capacity bar */}
          <View style={s.capSection}>
            <View style={s.capLabelRow}>
              <Text style={s.capLabel}>
                <Ionicons name="people-outline" size={ms(11)} color={C.muted} />
                {"  "}{batch.enrolledCount} enrolled
              </Text>
              <Text style={[s.capFraction, { color: isFull ? C.red : C.green }]}>
                {isFull ? "Full" : `${seatsLeft} seats left`}
              </Text>
            </View>
            <View style={s.capTrack}>
              <View style={[s.capFill, {
                width: `${Math.round(pct * 100)}%` as any,
                backgroundColor: isFull ? C.red : C.green,
              }]} />
            </View>
          </View>
        </View>

        {/* ── Class Schedule shortcut ── */}
        <TouchableOpacity
          style={s.navCard}
          onPress={() => navigation.navigate("BatchSchedule", { batchId: batch.id, batchName: batch.name })}
          activeOpacity={0.78}
        >
          <View style={[s.navIcon, { backgroundColor: colors.primary + "12" }]}>
            <Ionicons name="calendar-outline" size={ms(18)} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.navTitle}>Class Schedule</Text>
            <Text style={s.navSub}>View & manage weekly timetable</Text>
          </View>
          <Ionicons name="chevron-forward" size={ms(16)} color={C.border} />
        </TouchableOpacity>

        {/* ── Enrolled Students ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.cardHeaderIcon, { backgroundColor: colors.primary + "12" }]}>
              <Ionicons name="school-outline" size={ms(15)} color={colors.primary} />
            </View>
            <Text style={s.cardTitle}>Enrolled Students</Text>
            <View style={s.countPill}>
              <Text style={s.countPillT}>{students.length}</Text>
            </View>
          </View>
          <View style={s.cardDivider} />

          {loading ? (
            <View style={s.centerBlock}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={s.centerT}>Loading students…</Text>
            </View>
          ) : students.length === 0 ? (
            <View style={s.emptyBlock}>
              <View style={s.emptyIllus}>
                <Ionicons name="school-outline" size={ms(32)} color={C.border} />
              </View>
              <Text style={s.emptyT}>No students enrolled yet</Text>
              <Text style={s.emptySub}>Tap "Add Student" below to get started</Text>
            </View>
          ) : (
            students.map((student, index) => (
              <StudentRow
                key={student.id}
                student={student}
                index={index}
                onEdit={() => navigation.navigate("EditStudent", { student })}
              />
            ))
          )}

          <View style={s.cardDivider} />
          {!isFull ? (
            <TouchableOpacity style={s.addStudentBtn} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
              <Ionicons name="person-add-outline" size={ms(15)} color={C.green} />
              <Text style={s.addStudentT}>Add Student</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.fullBanner}>
              <Ionicons name="lock-closed-outline" size={ms(13)} color={C.red} />
              <Text style={s.fullBannerT}>Batch is at full capacity</Text>
            </View>
          )}
        </View>

        <View style={{ height: ms(32) }} />
      </ScrollView>

      <AddStudentModal
        visible={showAdd}
        batch={batch}
        enrolledIds={enrolledIds}
        onClose={() => setShowAdd(false)}
        onEnrolled={() => load()}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.screenBg },
  scroll: { flex: 1, backgroundColor: colors.screenBg },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(16), gap: ms(14) },

  // Combined info card
  infoCard: {
    backgroundColor: C.card,
    borderRadius:    ms(18),
    overflow:        "hidden",
    shadowColor:     C.text,
    shadowOffset:    { width: 0, height: ms(2) },
    shadowOpacity:   0.07,
    shadowRadius:    ms(8),
    elevation:       3,
  },
  infoTop:     { paddingHorizontal: ms(14), paddingTop: ms(14), paddingBottom: ms(12) },
  badgeRow:    { flexDirection: "row", gap: ms(8), marginBottom: ms(8) },
  examBadge:   { flexDirection: "row", alignItems: "center", gap: ms(5), borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  examDot:     { width: ms(6), height: ms(6), borderRadius: ms(3) },
  examBadgeT:  { fontSize: fs(11), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: 0.3 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: ms(5), borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  statusBadgeT:{ fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700" },
  courseName:  { fontSize: fs(13), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },

  // 2×2 info grid
  infoGrid:      { flexDirection: "row", flexWrap: "wrap", padding: ms(10), gap: ms(8) },
  infoTile:      { width: "47.5%" as any, backgroundColor: C.inputBg, borderRadius: ms(10), padding: ms(10) },
  infoTileLabel: { fontSize: fs(10), fontFamily: "Inter_700Bold", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: ms(3) },
  infoTileValue: { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },

  // Capacity bar (inside infoCard)
  capSection:  { paddingHorizontal: ms(14), paddingVertical: ms(12), gap: ms(6) },
  capLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  capLabel:    { fontSize: fs(11), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  capFraction: { fontSize: fs(11), fontFamily: "Inter_800ExtraBold", fontWeight: "800" },
  capTrack:    { height: ms(5), backgroundColor: C.border, borderRadius: ms(3), overflow: "hidden" },
  capFill:     { height: "100%", borderRadius: ms(3) },

  // Card (students)
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
  cardHeader:     { flexDirection: "row", alignItems: "center", gap: ms(10), padding: ms(14) },
  cardHeaderIcon: { width: ms(32), height: ms(32), borderRadius: ms(9), alignItems: "center", justifyContent: "center" },
  cardTitle:      { flex: 1, fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  cardDivider:    { height: 1, backgroundColor: C.border },
  countPill:      { backgroundColor: colors.primary + "12", borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  countPillT:     { fontSize: fs(12), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: colors.primary },

  // Nav card (Class Schedule)
  navCard: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             ms(12),
    backgroundColor: C.card,
    borderRadius:    ms(18),
    padding:         ms(14),
    shadowColor:     C.text,
    shadowOffset:    { width: 0, height: ms(2) },
    shadowOpacity:   0.07,
    shadowRadius:    ms(8),
    elevation:       3,
  },
  navIcon:  { width: ms(44), height: ms(44), borderRadius: ms(13), alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  navSub:   { fontSize: fs(11), color: C.muted, marginTop: ms(2) },

  // Empty / loading inside card
  centerBlock: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(10), paddingVertical: ms(24) },
  centerT:     { fontSize: fs(13), color: C.muted },
  emptyBlock:  { alignItems: "center", paddingVertical: ms(28), gap: ms(6) },
  emptyIllus:  { width: ms(64), height: ms(64), borderRadius: ms(20), backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center", marginBottom: ms(4) },
  emptyT:      { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.muted },
  emptySub:    { fontSize: fs(11), color: C.placeholder, textAlign: "center" },

  // Add student / full banner
  addStudentBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), backgroundColor: C.green + "12", paddingVertical: ms(14), margin: ms(12), borderRadius: ms(12) },
  addStudentT:   { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.green },
  fullBanner:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6), backgroundColor: C.red + "12", paddingVertical: ms(12), margin: ms(12), borderRadius: ms(12) },
  fullBannerT:   { fontSize: fs(12), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.red },
});

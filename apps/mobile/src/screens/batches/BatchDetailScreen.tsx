import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl, Modal, TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { listStudents, type StudentItem } from "../../api/students";
import { type BatchItem, type BatchStatus } from "../../api/batches";
import { enrollStudent } from "../../api/enrollments";
import { ms, fs } from "../../utils/responsive";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Props = NativeStackScreenProps<RootStackParamList, "BatchDetail">;

// ── Colour maps ───────────────────────────────────────────────────────────────

const EXAM_COLOR: Record<string, string> = { ssc: "#2563A8", banking: "#1B9C63", railway: "#E8752C" };
const EXAM_LABEL: Record<string, string> = { ssc: "SSC",     banking: "Banking",  railway: "Railway" };

const STATUS_META: Record<BatchStatus, { label: string; color: string; dot: string }> = {
  running:   { label: "Running",   color: "#1B9C63", dot: "#1B9C63" },
  upcoming:  { label: "Upcoming",  color: "#2563A8", dot: "#2563A8" },
  completed: { label: "Completed", color: "#8A7F82", dot: "#B0A9AC" },
};

const CP_COLOR: Record<string, string> = {
  ssc: "#2563A8", banking: "#1B9C63", railway: "#E8752C", foundation: "#7C3AED", others: "#8A7F82",
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

function AddStudentModal({ batch, enrolledIds, onClose, onEnrolled }: {
  batch: BatchItem;
  enrolledIds: Set<string>;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [allStudents, setAllStudents]   = useState<StudentItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [submitting, setSubmitting]     = useState<string | null>(null);
  const [result, setResult]             = useState<{ ok: boolean; msg: string } | null>(null);
  const [localEnrolled, setLocalEnrolled] = useState(new Set(enrolledIds));
  const [localCount, setLocalCount]     = useState(batch.enrolledCount);

  React.useEffect(() => {
    setLoading(true);
    listStudents().then(setAllStudents).catch(() => {}).finally(() => setLoading(false));
  }, []);

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
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={am.overlay}>
        <View style={am.sheet}>
          <View style={am.handle} />

          {/* Header */}
          <View style={am.header}>
            <Text style={am.title}>Add Student</Text>
            <View style={am.pill}>
              <Text style={[am.pillT, { color: isFull ? "#DC2626" : "#1B9C63" }]}>
                {localCount}/{batch.capacity} seats
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={ms(24)} color="#C7BAB4" />
            </TouchableOpacity>
          </View>

          {/* Full warning */}
          {isFull && (
            <View style={am.fullBanner}>
              <Ionicons name="alert-circle-outline" size={ms(15)} color="#DC2626" />
              <Text style={am.fullT}>This batch is at full capacity</Text>
            </View>
          )}

          {/* Result */}
          {result && (
            <View style={[am.resultBanner, { backgroundColor: result.ok ? "#E7F7EF" : "#FEE2E2" }]}>
              <Ionicons name={result.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={ms(15)} color={result.ok ? "#1B9C63" : "#DC2626"} />
              <Text style={[am.resultT, { color: result.ok ? "#1B9C63" : "#DC2626" }]}>{result.msg}</Text>
            </View>
          )}

          {/* Search */}
          <View style={am.searchRow}>
            <Ionicons name="search-outline" size={ms(15)} color="#8A7F82" />
            <TextInput
              style={am.searchInput}
              placeholder="Search by name, code, or phone…"
              placeholderTextColor="#C7BAB4"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={ms(15)} color="#C7BAB4" />
              </TouchableOpacity>
            )}
          </View>

          {/* Student list */}
          {loading ? (
            <View style={am.loaderWrap}>
              <ActivityIndicator size="large" color="#8B1E3F" />
              <Text style={am.loaderT}>Loading students…</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: ms(8) }}>
              {filtered.length === 0 ? (
                <View style={am.emptyWrap}>
                  <Ionicons name="school-outline" size={ms(36)} color="#D5CCC8" />
                  <Text style={am.emptyT}>{search ? "No students match your search" : "No students found"}</Text>
                </View>
              ) : filtered.map((student) => {
                const enrolled  = localEnrolled.has(student.id);
                const busy      = submitting === student.id;
                const disabled  = enrolled || isFull || !!submitting;
                const cp        = student.coursePreference;
                const color     = cp ? (CP_COLOR[cp] ?? "#8A7F82") : "#8A7F82";
                const ini       = initials(student.fullName);

                return (
                  <TouchableOpacity
                    key={student.id}
                    style={[am.row, disabled && !enrolled && { opacity: 0.5 }]}
                    onPress={() => handleEnroll(student)}
                    disabled={disabled}
                    activeOpacity={0.75}
                  >
                    <View style={[am.avatar, { backgroundColor: color }]}>
                      <Text style={am.avatarT}>{ini}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={am.studentName} numberOfLines={1}>{student.fullName}</Text>
                      <Text style={am.studentSub}>{student.studentCode}{student.phone ? ` · ${student.phone}` : ""}</Text>
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color="#8B1E3F" />
                    ) : enrolled ? (
                      <View style={am.enrolledBadge}>
                        <Ionicons name="checkmark-circle" size={ms(14)} color="#1B9C63" />
                        <Text style={am.enrolledT}>Enrolled</Text>
                      </View>
                    ) : !isFull ? (
                      <View style={am.addBtn}>
                        <Ionicons name="add" size={ms(16)} color="#8B1E3F" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={[am.doneBtn, am.doneGrad]} onPress={onClose} activeOpacity={0.85}>
            <Text style={am.doneT}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const am = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: "rgba(16,4,8,0.55)", justifyContent: "flex-end" },
  sheet:        { backgroundColor: "#FFFFFF", borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingTop: ms(12), paddingHorizontal: ms(16), maxHeight: "80%", paddingBottom: ms(8) },
  handle:       { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: "#E0D8D4", alignSelf: "center", marginBottom: ms(16) },
  header:       { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(12) },
  title:        { flex: 1, fontSize: fs(16), fontWeight: "800", color: "#2B1B1F" },
  pill:         { backgroundColor: "#F4F4F4", borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  pillT:        { fontSize: fs(11.5), fontWeight: "800" },
  fullBanner:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: "#FEE2E2", borderRadius: ms(10), padding: ms(10), marginBottom: ms(10) },
  fullT:        { fontSize: fs(12), color: "#DC2626", fontWeight: "600" },
  resultBanner: { flexDirection: "row", alignItems: "center", gap: ms(8), borderRadius: ms(10), padding: ms(10), marginBottom: ms(10) },
  resultT:      { fontSize: fs(12.5), fontWeight: "600", flex: 1 },
  searchRow:    { flexDirection: "row", alignItems: "center", backgroundColor: "#F4F4F4", borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), marginBottom: ms(10), gap: ms(8) },
  searchInput:  { flex: 1, fontSize: fs(13), color: "#2B1B1F", padding: 0, includeFontPadding: false },
  loaderWrap:   { alignItems: "center", paddingVertical: ms(40), gap: ms(12) },
  loaderT:      { fontSize: fs(13), color: "#8A7F82" },
  emptyWrap:    { alignItems: "center", paddingVertical: ms(28), gap: ms(10) },
  emptyT:       { fontSize: fs(13), color: "#B0A9AC", textAlign: "center" },
  row:          { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), borderBottomWidth: 1, borderBottomColor: "#F0EDE8", gap: ms(12) },
  avatar:       { width: ms(38), height: ms(38), borderRadius: ms(19), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarT:      { fontSize: fs(13), fontWeight: "800", color: "#fff", includeFontPadding: false },
  studentName:  { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F" },
  studentSub:   { fontSize: fs(11), color: "#8A7F82", marginTop: ms(2) },
  enrolledBadge:{ flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: "#E7F7EF", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5) },
  enrolledT:    { fontSize: fs(11), fontWeight: "700", color: "#1B9C63" },
  addBtn:       { width: ms(30), height: ms(30), borderRadius: ms(10), backgroundColor: "#FEF4F4", justifyContent: "center", alignItems: "center" },
  doneBtn:      { marginTop: ms(12), marginBottom: ms(24), borderRadius: ms(14) },
  doneGrad:     { alignItems: "center", paddingVertical: ms(14), backgroundColor: "#8B1E3F" },
  doneT:        { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});

// ── Student Row ───────────────────────────────────────────────────────────────

function StudentRow({ student, index, onEdit }: {
  student: StudentItem; index: number; onEdit: () => void;
}) {
  const cp    = student.coursePreference;
  const color = cp ? (CP_COLOR[cp] ?? "#8A7F82") : "#8A7F82";
  const label = cp ? (CP_LABEL[cp] ?? cp)         : null;
  const ini   = initials(student.fullName);

  return (
    <View style={[sr.row, index > 0 && sr.rowBorder]}>
      <View style={[sr.avatar, { backgroundColor: color }]}>
        <Text style={sr.avatarT}>{ini}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={sr.name} numberOfLines={1}>{student.fullName}</Text>
        <Text style={sr.sub}>{student.studentCode}{student.phone ? ` · ${student.phone}` : ""}</Text>
      </View>
      <View style={sr.right}>
        {label && (
          <View style={[sr.tag, { backgroundColor: color + "20" }]}>
            <Text style={[sr.tagT, { color }]}>{label}</Text>
          </View>
        )}
        <TouchableOpacity style={sr.editBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="pencil-outline" size={ms(13)} color="#2563A8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), gap: ms(12) },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#F0EDE8" },
  avatar:    { width: ms(40), height: ms(40), borderRadius: ms(20), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarT:   { fontSize: fs(13), fontWeight: "800", color: "#fff", includeFontPadding: false },
  name:      { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F" },
  sub:       { fontSize: fs(11), color: "#8A7F82", marginTop: ms(2) },
  right:     { flexDirection: "row", alignItems: "center", gap: ms(8), flexShrink: 0 },
  tag:       { borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  tagT:      { fontSize: fs(10.5), fontWeight: "800" },
  editBtn:   { width: ms(28), height: ms(28), borderRadius: ms(8), backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function BatchDetailScreen({ navigation, route }: Props) {
  const { batch: initialBatch } = route.params;
  const insets = useSafeAreaInsets();
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
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [batch.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useRefetchOnReconnect(() => load(true));

  const examColor = EXAM_COLOR[batch.course.examCategory] ?? "#8A7F82";
  const examLabel = EXAM_LABEL[batch.course.examCategory] ?? batch.course.examCategory.toUpperCase();
  const status    = STATUS_META[batch.status];
  const pct       = batch.capacity ? Math.min(batch.enrolledCount / batch.capacity, 1) : 0;
  const isFull    = batch.enrolledCount >= batch.capacity;
  const seatsLeft = batch.capacity - batch.enrolledCount;

  const enrolledIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── Maroon hero ── */}
      <View style={[s.hero, { paddingTop: insets.top + ms(52), backgroundColor: "#8B1E3F" }]}>
        <View style={[s.heroTop, { top: insets.top + ms(10) }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={ms(20)} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.editHeroBtn}
            onPress={() => navigation.navigate("EditBatch", { batch })}
          >
            <Ionicons name="pencil-outline" size={ms(16)} color="#fff" />
            <Text style={s.editHeroBtnT}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={s.heroBadges}>
          <View style={[s.examTag, { backgroundColor: examColor }]}>
            <Text style={s.examTagT}>{examLabel}</Text>
          </View>
          <View style={s.statusBadge}>
            <View style={[s.statusDot, { backgroundColor: status.dot }]} />
            <Text style={s.statusT}>{status.label}</Text>
          </View>
        </View>

        <Text style={s.heroName} numberOfLines={2}>{batch.name}</Text>
        <Text style={s.heroSub} numberOfLines={1}>{batch.course.name}</Text>

        <View style={s.capRow}>
          <View style={s.capBar}>
            <View style={[s.capFill, {
              width: `${Math.round(pct * 100)}%` as any,
              backgroundColor: isFull ? "#FCA5A5" : "#fff",
            }]} />
          </View>
          <Text style={[s.capT, { color: isFull ? "#FCA5A5" : "rgba(255,255,255,0.9)" }]}>
            {batch.enrolledCount}/{batch.capacity}
          </Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#8B1E3F"]} tintColor="#8B1E3F" />
        }
      >
        {/* ── 3-stat row ── */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Ionicons name="people-outline" size={ms(18)} color="#8B1E3F" />
            <Text style={s.statNum}>{batch.enrolledCount}</Text>
            <Text style={s.statLbl}>Enrolled</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Ionicons name="layers-outline" size={ms(18)} color="#8A7F82" />
            <Text style={s.statNum}>{batch.capacity}</Text>
            <Text style={s.statLbl}>Capacity</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Ionicons
              name={isFull ? "lock-closed-outline" : "add-circle-outline"}
              size={ms(18)}
              color={isFull ? "#DC2626" : "#1B9C63"}
            />
            <Text style={[s.statNum, { color: isFull ? "#DC2626" : "#1B9C63" }]}>
              {isFull ? "Full" : String(seatsLeft)}
            </Text>
            <Text style={s.statLbl}>{isFull ? "Batch Full" : "Seats Left"}</Text>
          </View>
        </View>

        {/* ── Course & Schedule ── */}
        <View style={s.card}>
          {[
            { icon: "book-outline",     label: "Course",   value: batch.course.name,                                    color: examColor,  extra: <View style={[s.examPill, { backgroundColor: examColor + "20" }]}><Text style={[s.examPillT, { color: examColor }]}>{examLabel}</Text></View> },
            { icon: "time-outline",     label: "Duration", value: `${batch.course.durationMonths} months`,              color: "#8B1E3F",  extra: null },
            { icon: "cash-outline",     label: "Course Fee", value: `₹${Number(batch.course.defaultFee).toLocaleString("en-IN")}`, color: "#1B9C63", extra: null },
            { icon: "calendar-outline", label: "Schedule", value: `${fmtDate(batch.startDate)}  →  ${fmtDate(batch.endDate)}`,   color: "#E8752C",  extra: null },
          ].map((row, i, arr) => (
            <React.Fragment key={row.label}>
              <View style={s.detailRow}>
                <View style={[s.detailIcon, { backgroundColor: row.color + "18" }]}>
                  <Ionicons name={row.icon as any} size={ms(15)} color={row.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.detailLabel}>{row.label}</Text>
                  <Text style={s.detailValue}>{row.value}</Text>
                </View>
                {row.extra}
              </View>
              {i < arr.length - 1 && <View style={s.cardDivider} />}
            </React.Fragment>
          ))}
        </View>

        {/* ── Enrolled Students ── */}
        <View style={s.card}>
          <View style={s.secHead}>
            <View style={s.secLeft}>
              <View style={[s.secIcon, { backgroundColor: "#8B1E3F18" }]}>
                <Ionicons name="school-outline" size={ms(15)} color="#8B1E3F" />
              </View>
              <Text style={s.secTitle}>Enrolled Students</Text>
            </View>
            <View style={s.countPill}>
              <Text style={s.countPillT}>{students.length}</Text>
            </View>
          </View>

          {loading ? (
            <View style={s.studLoading}>
              <ActivityIndicator size="small" color="#8B1E3F" />
              <Text style={s.studLoadingT}>Loading students…</Text>
            </View>
          ) : students.length === 0 ? (
            <View style={s.noStudents}>
              <Ionicons name="school-outline" size={ms(40)} color="#D5CCC8" />
              <Text style={s.noStudentsT}>No students enrolled yet</Text>
              <Text style={s.noStudentsSub}>Tap "Add Student" to enroll the first student</Text>
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

          {/* Bottom action */}
          {!isFull ? (
            <TouchableOpacity style={s.addStudentBtn} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
              <Ionicons name="person-add-outline" size={ms(15)} color="#1B9C63" />
              <Text style={s.addStudentT}>Add Student</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.fullBanner}>
              <Ionicons name="lock-closed-outline" size={ms(13)} color="#DC2626" />
              <Text style={s.fullBannerT}>Batch is at full capacity</Text>
            </View>
          )}
        </View>

        <View style={{ height: ms(32) }} />
      </ScrollView>

      {showAdd && (
        <AddStudentModal
          batch={batch}
          enrolledIds={enrolledIds}
          onClose={() => setShowAdd(false)}
          onEnrolled={() => load()}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#8B1E3F" },
  scroll: { flex: 1, backgroundColor: "#FFFBF0" },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(16), paddingBottom: ms(16) },

  // Hero
  hero:        { paddingHorizontal: ms(20), paddingBottom: ms(28) },
  heroTop:     { position: "absolute", left: ms(16), right: ms(16), flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn:     { width: ms(36), height: ms(36), borderRadius: ms(12), backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center" },
  editHeroBtn: { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: "rgba(255,255,255,0.18)", borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(7) },
  editHeroBtnT:{ fontSize: fs(13), fontWeight: "700", color: "#fff" },
  heroBadges:  { flexDirection: "row", gap: ms(8), marginBottom: ms(12) },
  examTag:     { borderRadius: ms(20), paddingHorizontal: ms(12), paddingVertical: ms(5) },
  examTagT:    { fontSize: fs(11), fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: ms(5), backgroundColor: "rgba(255,255,255,0.18)", borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(5) },
  statusDot:   { width: ms(6), height: ms(6), borderRadius: ms(3) },
  statusT:     { fontSize: fs(11), fontWeight: "700", color: "#fff" },
  heroName:    { fontSize: fs(22), fontWeight: "800", color: "#fff", marginBottom: ms(4), lineHeight: fs(28) },
  heroSub:     { fontSize: fs(13), color: "rgba(255,255,255,0.8)", marginBottom: ms(16) },
  capRow:      { flexDirection: "row", alignItems: "center", gap: ms(10) },
  capBar:      { flex: 1, height: ms(5), backgroundColor: "rgba(255,255,255,0.25)", borderRadius: ms(3), overflow: "hidden" },
  capFill:     { height: "100%", borderRadius: ms(3) },
  capT:        { fontSize: fs(12), fontWeight: "800" },

  // Stats row
  statsRow:    { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: ms(18), paddingVertical: ms(16), marginBottom: ms(14), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  statItem:    { flex: 1, alignItems: "center", gap: ms(4) },
  statDivider: { width: 1, backgroundColor: "#F0EDE8", marginVertical: ms(4) },
  statNum:     { fontSize: fs(20), fontWeight: "800", color: "#2B1B1F" },
  statLbl:     { fontSize: fs(10), color: "#8A7F82", fontWeight: "600" },

  // Card
  card:        { backgroundColor: "#FFFFFF", borderRadius: ms(18), padding: ms(16), marginBottom: ms(14), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  detailRow:   { flexDirection: "row", alignItems: "center", gap: ms(12), paddingVertical: ms(6) },
  detailIcon:  { width: ms(34), height: ms(34), borderRadius: ms(10), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  detailLabel: { fontSize: fs(10.5), color: "#8A7F82", fontWeight: "600", marginBottom: ms(2) },
  detailValue: { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F" },
  cardDivider: { height: 1, backgroundColor: "#F0EDE8", marginVertical: ms(8) },
  examPill:    { borderRadius: ms(10), paddingHorizontal: ms(10), paddingVertical: ms(5), flexShrink: 0 },
  examPillT:   { fontSize: fs(11), fontWeight: "800" },

  // Section header
  secHead:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(12) },
  secLeft:    { flexDirection: "row", alignItems: "center", gap: ms(10) },
  secIcon:    { width: ms(32), height: ms(32), borderRadius: ms(9), justifyContent: "center", alignItems: "center" },
  secTitle:   { fontSize: fs(14), fontWeight: "800", color: "#2B1B1F" },
  countPill:  { backgroundColor: "#FEF4F4", borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  countPillT: { fontSize: fs(12), fontWeight: "800", color: "#8B1E3F" },

  // Students
  studLoading:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(10), paddingVertical: ms(24) },
  studLoadingT: { fontSize: fs(13), color: "#8A7F82" },
  noStudents:   { alignItems: "center", paddingVertical: ms(28), gap: ms(6) },
  noStudentsT:  { fontSize: fs(13), fontWeight: "700", color: "#B0A9AC" },
  noStudentsSub:{ fontSize: fs(11), color: "#C7BAB4", textAlign: "center" },

  addStudentBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), backgroundColor: "#E7F7EF", borderRadius: ms(12), paddingVertical: ms(12), marginTop: ms(14) },
  addStudentT:   { fontSize: fs(13), fontWeight: "700", color: "#1B9C63" },
  fullBanner:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6), backgroundColor: "#FEE2E2", borderRadius: ms(12), paddingVertical: ms(10), marginTop: ms(14) },
  fullBannerT:   { fontSize: fs(12), fontWeight: "600", color: "#DC2626" },
});

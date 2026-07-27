import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, StatusBar, ScrollView, ActivityIndicator, RefreshControl, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import type { RootStackParamList } from "../../navigation/types";
import { listBatches, deleteBatch, type BatchItem, type BatchStatus } from "../../api/batches";
import { listStudents, type StudentItem } from "../../api/students";
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { enrollStudent } from "../../api/enrollments";
import { ms, fs } from "../../utils/responsive";
import { useAuth } from "../../context/AuthContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "BatchList">;

// ── Theme ─────────────────────────────────────────────────────────────────────

function examMeta(cs: ExamCategoryItem[]): { label: string; color: string; bg: string } {
  if (cs.length === 0) return { label: "General", color: "#8A7F82", bg: "#F4F4F4" };
  const label = cs.length === 1 ? cs[0].label : `${cs[0].label} +${cs.length - 1}`;
  return { label, color: cs[0].color, bg: cs[0].color + "18" };
}

const STATUS_META: Record<BatchStatus, { label: string; color: string; bg: string; dot: string }> = {
  running:   { label: "Running",   color: "#1B9C63", bg: "#E7F7EF", dot: "#1B9C63" },
  upcoming:  { label: "Upcoming",  color: "#2563A8", bg: "#EFF6FF", dot: "#2563A8" },
  completed: { label: "Completed", color: "#8A7F82", bg: "#F4F4F4", dot: "#B0A9AC" },
};

const COURSE_COLOR: Record<string, string> = {
  ssc: "#2563A8", banking: "#1B9C63", railway: "#E8752C", foundation: "#7C3AED", others: "#8A7F82",
};
const COURSE_LABEL: Record<string, string> = {
  ssc: "SSC", banking: "Banking", railway: "Railway", foundation: "Foundation", others: "Others",
};

type FilterKey = "All" | BatchStatus | string; // status key or an ExamCategoryItem id

const STATUS_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "All",       label: "All"       },
  { key: "running",   label: "Running"   },
  { key: "upcoming",  label: "Upcoming"  },
  { key: "completed", label: "Completed" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function capacityFill(enrolled: number, capacity: number) {
  if (!capacity) return 0;
  return Math.min(enrolled / capacity, 1);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Student Picker Modal ──────────────────────────────────────────────────────

function StudentPickerModal({ batch, onClose, onEnrolled }: {
  batch: BatchItem;
  onClose: () => void;
  onEnrolled: (updatedBatch: BatchItem) => void;
}) {
  const [allStudents, setAllStudents]         = useState<StudentItem[]>([]);
  const [enrolledIds, setEnrolledIds]         = useState<Set<string>>(new Set());
  const [loading, setLoading]                 = useState(true);
  const [search, setSearch]                   = useState("");
  const [submitting, setSubmitting]           = useState<string | null>(null);
  const [result, setResult]                   = useState<{ ok: boolean; msg: string } | null>(null);
  const [localCount, setLocalCount]           = useState(batch.enrolledCount);
  const colors = useThemeColors();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listStudents(),
      listStudents({ batchId: batch.id }),
    ]).then(([all, enrolled]) => {
      setAllStudents(all);
      setEnrolledIds(new Set(enrolled.map((s) => s.id)));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [batch.id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allStudents;
    const q = search.toLowerCase();
    return allStudents.filter(
      (s) => s.fullName.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q) || s.phone.includes(q)
    );
  }, [allStudents, search]);

  const isFull = localCount >= batch.capacity;

  async function handleEnroll(student: StudentItem) {
    if (enrolledIds.has(student.id) || isFull) return;
    setSubmitting(student.id);
    setResult(null);
    const res = await enrollStudent(student.id, batch.id);
    setSubmitting(null);
    if (res.ok) {
      setEnrolledIds((prev) => new Set([...prev, student.id]));
      const newCount = localCount + 1;
      setLocalCount(newCount);
      setResult({ ok: true, msg: `${student.fullName} enrolled successfully!` });
      onEnrolled({ ...batch, enrolledCount: newCount });
    } else if ("alreadyEnrolled" in res) {
      setEnrolledIds((prev) => new Set([...prev, student.id]));
      setResult({ ok: false, msg: "Student is already enrolled in this batch." });
    } else if ("batchFull" in res) {
      setResult({ ok: false, msg: res.message });
    } else {
      setResult({ ok: false, msg: res.error });
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={sm.overlay}>
        <View style={sm.sheet}>
          <View style={sm.handle} />

          {/* Header */}
          <View style={sm.header}>
            <View style={{ flex: 1 }}>
              <Text style={sm.title}>Add Student to Batch</Text>
              <Text style={sm.sub} numberOfLines={1}>{batch.name}</Text>
            </View>
            <View style={sm.capacityPill}>
              <Text style={[sm.capacityT, { color: isFull ? "#DC2626" : "#1B9C63" }]}>
                {localCount}/{batch.capacity} seats
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: ms(8) }}>
              <Ionicons name="close-circle" size={ms(24)} color="#C7BAB4" />
            </TouchableOpacity>
          </View>

          {/* Batch full warning */}
          {isFull && (
            <View style={sm.fullBanner}>
              <Ionicons name="alert-circle-outline" size={ms(15)} color="#DC2626" />
              <Text style={sm.fullBannerT}>This batch is at full capacity</Text>
            </View>
          )}

          {/* Result banner */}
          {result && (
            <View style={[sm.resultBanner, { backgroundColor: result.ok ? "#E7F7EF" : "#FEE2E2" }]}>
              <Ionicons name={result.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={ms(15)} color={result.ok ? "#1B9C63" : "#DC2626"} />
              <Text style={[sm.resultT, { color: result.ok ? "#1B9C63" : "#DC2626" }]}>{result.msg}</Text>
            </View>
          )}

          {/* Search */}
          <View style={sm.searchRow}>
            <Ionicons name="search-outline" size={ms(15)} color="#8A7F82" />
            <TextInput
              style={sm.searchInput}
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

          {loading ? (
            <View style={sm.loaderWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={sm.loaderT}>Loading students…</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ paddingBottom: ms(24) }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={sm.emptyWrap}>
                  <Ionicons name="school-outline" size={ms(36)} color="#D5CCC8" />
                  <Text style={sm.emptyT}>{search ? "No students match your search" : "No students found"}</Text>
                </View>
              }
              renderItem={({ item: student }) => {
                const enrolled  = enrolledIds.has(student.id);
                const busy      = submitting === student.id;
                const disabled  = enrolled || isFull || !!submitting;
                const courseColor = student.coursePreference ? (COURSE_COLOR[student.coursePreference] ?? "#8A7F82") : "#8A7F82";
                const courseLabel = student.coursePreference ? (COURSE_LABEL[student.coursePreference] ?? student.coursePreference) : null;
                const ini = initials(student.fullName);

                return (
                  <TouchableOpacity
                    style={[sm.studentRow, disabled && !enrolled && { opacity: 0.5 }]}
                    onPress={() => handleEnroll(student)}
                    activeOpacity={enrolled ? 1 : 0.75}
                    disabled={disabled && !enrolled}
                  >
                    <View style={[sm.avatar, { backgroundColor: courseColor }]}>
                      <Text style={sm.avatarT}>{ini}</Text>
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={sm.studentName} numberOfLines={1}>{student.fullName}</Text>
                      <Text style={sm.studentSub}>{student.studentCode}{student.phone ? ` · ${student.phone}` : ""}</Text>
                    </View>

                    {courseLabel && (
                      <View style={[sm.courseTag, { backgroundColor: courseColor + "20" }]}>
                        <Text style={[sm.courseTagT, { color: courseColor }]}>{courseLabel}</Text>
                      </View>
                    )}

                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: ms(4) }} />
                    ) : enrolled ? (
                      <View style={sm.enrolledBadge}>
                        <Ionicons name="checkmark-circle" size={ms(14)} color="#1B9C63" />
                        <Text style={sm.enrolledT}>Enrolled</Text>
                      </View>
                    ) : !isFull ? (
                      <View style={sm.addBtn}>
                        <Ionicons name="add" size={ms(16)} color={colors.primary} />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity style={sm.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <LinearGradient colors={[colors.primary, "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sm.doneGrad}>
              <Text style={sm.doneT}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: "rgba(16,4,8,0.55)", justifyContent: "flex-end" },
  sheet:        { backgroundColor: "#FFFFFF", borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingTop: ms(12), paddingHorizontal: ms(16), maxHeight: "85%" },
  handle:       { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: "#E0D8D4", alignSelf: "center", marginBottom: ms(16) },
  header:       { flexDirection: "row", alignItems: "center", marginBottom: ms(8), gap: ms(10) },
  title:        { fontSize: fs(15), fontWeight: "800", color: "#2B1B1F" },
  sub:          { fontSize: fs(11.5), color: "#8A7F82", marginTop: ms(2) },
  capacityPill: { backgroundColor: "#F4F4F4", borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(5) },
  capacityT:    { fontSize: fs(11.5), fontWeight: "800" },
  fullBanner:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: "#FEE2E2", borderRadius: ms(10), padding: ms(10), marginBottom: ms(10) },
  fullBannerT:  { fontSize: fs(12), color: "#DC2626", fontWeight: "600" },
  resultBanner: { flexDirection: "row", alignItems: "center", gap: ms(8), borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(10), marginBottom: ms(10) },
  resultT:      { fontSize: fs(12.5), fontWeight: "600", flex: 1 },
  searchRow:    { flexDirection: "row", alignItems: "center", backgroundColor: "#F4F4F4", borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), marginBottom: ms(10), gap: ms(8) },
  searchInput:  { flex: 1, fontSize: fs(13), color: "#2B1B1F", padding: 0, includeFontPadding: false },
  loaderWrap:   { alignItems: "center", paddingVertical: ms(40), gap: ms(12) },
  loaderT:      { fontSize: fs(13), color: "#8A7F82" },
  emptyWrap:    { alignItems: "center", paddingVertical: ms(32), gap: ms(10) },
  emptyT:       { fontSize: fs(13), color: "#B0A9AC", textAlign: "center" },
  studentRow:   { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), borderBottomWidth: 1, borderBottomColor: "#F0EDE8", gap: ms(12) },
  avatar:       { width: ms(38), height: ms(38), borderRadius: ms(19), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarT:      { fontSize: fs(13), fontWeight: "800", color: "#fff", includeFontPadding: false },
  studentName:  { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F" },
  studentSub:   { fontSize: fs(11), color: "#8A7F82", marginTop: ms(2) },
  courseTag:    { borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(4), flexShrink: 0 },
  courseTagT:   { fontSize: fs(10.5), fontWeight: "800" },
  enrolledBadge:{ flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: "#E7F7EF", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5), marginLeft: ms(4) },
  enrolledT:    { fontSize: fs(11), fontWeight: "700", color: "#1B9C63" },
  addBtn:       { width: ms(30), height: ms(30), borderRadius: ms(10), backgroundColor: "#FEF4F4", justifyContent: "center", alignItems: "center", marginLeft: ms(4) },
  doneBtn:      { marginTop: ms(12), marginBottom: ms(24), borderRadius: ms(14), overflow: "hidden" },
  doneGrad:     { alignItems: "center", paddingVertical: ms(14) },
  doneT:        { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});

// ── Batch Card ────────────────────────────────────────────────────────────────

function BatchCard({ batch, onPress, onEdit, onDelete, onViewStudents, onAddStudent, isAllCenters }: {
  batch: BatchItem;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewStudents: () => void;
  onAddStudent: () => void;
  isAllCenters?: boolean;
}) {
  const exam   = examMeta(batch.course.examCategories);
  const status = STATUS_META[batch.status];
  const fill   = capacityFill(batch.enrolledCount, batch.capacity);
  const isFull = batch.enrolledCount >= batch.capacity;
  const cs = useThemedStyles(makeCsStyles);

  return (
    <TouchableOpacity style={cs.card} onPress={onPress} activeOpacity={0.92}>
      {/* Top row */}
      <View style={cs.cardTop}>
        <View style={cs.cardMid}>
          <Text style={cs.batchName} numberOfLines={1}>{batch.name}</Text>
          <Text style={cs.courseName} numberOfLines={1}>{batch.course.name}</Text>
        </View>
        <View style={[cs.statusBadge, { backgroundColor: status.bg }]}>
          <View style={[cs.statusDot, { backgroundColor: status.dot }]} />
          <Text style={[cs.statusT, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      {/* Center chip — only visible in all-centers mode */}
      {isAllCenters && batch.center && (
        <View style={cs.centerChip}>
          <Ionicons name="business-outline" size={ms(10)} color="#5B2D8E" />
          <Text style={cs.centerChipT}>{batch.center.name}</Text>
        </View>
      )}

      <View style={cs.divider} />

      {/* Date row */}
      <View style={cs.metaRow}>
        <View style={cs.metaItem}>
          <Ionicons name="calendar-outline" size={ms(12)} color="#8A7F82" />
          <Text style={cs.metaT}>{fmtDate(batch.startDate)}</Text>
        </View>
        <Ionicons name="arrow-forward-outline" size={ms(11)} color="#C7BAB4" />
        <View style={cs.metaItem}>
          <Text style={cs.metaT}>{fmtDate(batch.endDate)}</Text>
        </View>
      </View>

      {/* Capacity bar */}
      <TouchableOpacity style={cs.capacityRow} onPress={onViewStudents} activeOpacity={0.75}>
        <View style={cs.capacityBar}>
          <View style={[cs.capacityFill, { width: `${Math.round(fill * 100)}%` as any, backgroundColor: isFull ? "#DC2626" : exam.color }]} />
        </View>
        <View style={cs.capacityRight}>
          <Text style={[cs.capacityT, { color: isFull ? "#DC2626" : "#8A7F82" }]}>
            {batch.enrolledCount}/{batch.capacity}{isFull ? " · Full" : ""}
          </Text>
          {batch.enrolledCount > 0 && (
            <View style={cs.viewStudentsBadge}>
              <Ionicons name="people-outline" size={ms(10)} color={exam.color} />
              <Text style={[cs.viewStudentsT, { color: exam.color }]}>View</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Action buttons */}
      <View style={cs.cardActions}>
        {!isFull && (
          <TouchableOpacity style={cs.addStudentBtn} onPress={(e) => { e.stopPropagation?.(); onAddStudent(); }} activeOpacity={0.8}>
            <Ionicons name="person-add-outline" size={ms(14)} color="#1B9C63" />
            <Text style={cs.addStudentT}>Add Student</Text>
          </TouchableOpacity>
        )}
        <View style={cs.editDeleteRow}>
          <TouchableOpacity style={cs.editBtn} onPress={(e) => { e.stopPropagation?.(); onEdit(); }} activeOpacity={0.8}>
            <Ionicons name="pencil-outline" size={ms(14)} color="#2563A8" />
            <Text style={cs.editBtnT}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cs.deleteBtn} onPress={(e) => { e.stopPropagation?.(); onDelete(); }} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={ms(14)} color="#DC2626" />
            <Text style={cs.deleteBtnT}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

function Banner({ batches }: { batches: BatchItem[] }) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  const total     = batches.length;
  const running   = batches.filter((b) => b.status === "running").length;
  const upcoming  = batches.filter((b) => b.status === "upcoming").length;
  const completed = batches.filter((b) => b.status === "completed").length;

  const stats = [
    { label: "Total",     value: total,     color: colors.primary },
    { label: "Running",   value: running,   color: "#1B9C63" },
    { label: "Upcoming",  value: upcoming,  color: "#2563A8" },
    { label: "Completed", value: completed, color: "#8A7F82" },
  ];

  return (
    <View style={cs.banner}>
      {stats.map((s, i) => (
        <React.Fragment key={s.label}>
          <View style={cs.bannerItem}>
            <Text style={[cs.bannerNum, { color: s.color }]}>{s.value}</Text>
            <Text style={cs.bannerLbl}>{s.label}</Text>
          </View>
          {i < stats.length - 1 && <View style={cs.bannerDiv} />}
        </React.Fragment>
      ))}
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function BatchEmpty({ search }: { search: string }) {
  const colors = useThemeColors();
  return (
    <EmptyState
      scene="batches"
      color={colors.primary}
      title={search ? "No batches match your search" : "No batches yet"}
      subtitle={search ? "Try a different keyword" : "Create your first batch to get started"}
    />
  );
}


// ── Main Screen ───────────────────────────────────────────────────────────────

export function BatchListScreen({ route, navigation }: Props) {
  const initialStatus = route.params?.initialFilter === "active" ? "running" : "All";
  const { isAllCenters } = useAuth();
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);

  const [batches, setBatches]           = useState<BatchItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState(false);
  const [search, setSearch]             = useState("");
  const [filter, setFilter]             = useState<FilterKey>(initialStatus as FilterKey);
  const [deleteTarget, setDeleteTarget] = useState<BatchItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]   = useState("");
  const [addStudentTarget, setAddStudentTarget] = useState<BatchItem | null>(null);
  const [categories, setCategories] = useState<ExamCategoryItem[]>([]);

  useEffect(() => {
    listExamCategories().then(setCategories).catch(() => {});
  }, []);

  const EXAM_FILTERS = useMemo(
    () => categories.map((c) => ({ key: c.id as FilterKey, label: c.label })),
    [categories]
  );

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const data = await listBatches();
      setBatches(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useRefetchOnReconnect(() => load(true));

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError("");
    const res = await deleteBatch(deleteTarget.id);
    setDeleteLoading(false);
    if (res.ok) {
      setBatches((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    } else if ("hasEnrollments" in res) {
      setDeleteError(res.message);
    } else {
      setDeleteError(res.error);
    }
  }

  // Update a single batch's enrolledCount in state (optimistic after enrollment)
  function handleEnrolled(updated: BatchItem) {
    setBatches((prev) => prev.map((b) => b.id === updated.id ? updated : b));
    // also update the modal's target so capacity pill refreshes
    setAddStudentTarget((prev) => prev?.id === updated.id ? updated : prev);
  }

  const filtered = useMemo(() => {
    const STATUS_KEYS: string[] = ["running", "upcoming", "completed"];
    return batches.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch = !q || b.name.toLowerCase().includes(q) || b.course.name.toLowerCase().includes(q) || b.course.examCategories.some((ec) => ec.label.toLowerCase().includes(q));
      if (!matchSearch) return false;
      if (filter === "All")             return true;
      if (STATUS_KEYS.includes(filter)) return b.status === filter;
      return b.course.examCategories.some((ec) => ec.id === filter);
    });
  }, [batches, search, filter]);

  const allFilters = [...STATUS_FILTERS, ...EXAM_FILTERS];

  return (
    <SafeAreaView style={cs.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader
        title="Batches"
        count={batches.length}
        countLabel="total"
        onBack={() => navigation.goBack()}
      />

      <View style={cs.content}>
        {loading ? (
          <View style={cs.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={cs.loaderT}>Loading batches…</Text>
          </View>
        ) : error ? (
          <ListErrorState title="Failed to load batches" onRetry={() => load()} />
        ) : (
          <>
            <Banner batches={batches} />

            {/* Search */}
            <View style={cs.searchWrap}>
              <View style={cs.searchRow}>
                <Ionicons name="search-outline" size={ms(16)} color="#8A7F82" />
                <TextInput
                  style={cs.searchInput}
                  placeholder="Search by batch name or course…"
                  placeholderTextColor="#C7BAB4"
                  value={search}
                  onChangeText={setSearch}
                />
                {!!search && (
                  <TouchableOpacity onPress={() => setSearch("")}>
                    <Ionicons name="close-circle" size={ms(16)} color="#8A7F82" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.filterScroll} contentContainerStyle={cs.filterRow}>
              {allFilters.map((f, i) => {
                const isExamStart = i === STATUS_FILTERS.length;
                return (
                  <React.Fragment key={f.key}>
                    {isExamStart && <View style={cs.filterDivider} />}
                    <TouchableOpacity style={[cs.chip, filter === f.key && cs.chipOn]} onPress={() => setFilter(f.key)}>
                      <Text style={[cs.chipT, filter === f.key && cs.chipTOn]}>{f.label}</Text>
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </ScrollView>

            <Text style={cs.resultT}>{filtered.length} of {batches.length} batch{batches.length !== 1 ? "es" : ""}</Text>

            <FlatList
              data={filtered}
              keyExtractor={(b) => b.id}
              renderItem={({ item }) => (
                <BatchCard
                  batch={item}
                  onPress={() => navigation.navigate("BatchDetail", { batch: item })}
                  onEdit={() => navigation.navigate("EditBatch", { batch: item })}
                  onDelete={() => { setDeleteTarget(item); setDeleteError(""); }}
                  onViewStudents={() => navigation.navigate("StudentList", { batchId: item.id, batchName: item.name })}
                  onAddStudent={() => setAddStudentTarget(item)}
                  isAllCenters={isAllCenters}
                />
              )}
              contentContainerStyle={cs.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<BatchEmpty search={search} />}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} />
              }
            />
          </>
        )}
        <TouchableOpacity style={cs.fab} onPress={() => navigation.navigate("CreateBatch")} activeOpacity={0.85}>
          <Ionicons name="add" size={ms(26)} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Delete confirm modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={cs.modalOverlay}>
          <View style={cs.modalCard}>
            <View style={cs.modalIconCircle}>
              <Ionicons name="trash-outline" size={ms(30)} color="#DC2626" />
            </View>
            <Text style={cs.modalTitle}>Delete Batch?</Text>
            <Text style={cs.modalBody}>
              <Text style={{ fontWeight: "700", color: "#2B1B1F" }}>{deleteTarget?.name}</Text>
              {"\n"}will be permanently removed. This cannot be undone.
            </Text>

            {deleteError ? (
              <View style={cs.modalErr}>
                <Ionicons name="lock-closed-outline" size={ms(14)} color="#DC2626" />
                <Text style={cs.modalErrT}>{deleteError}</Text>
              </View>
            ) : null}

            <View style={cs.modalBtnRow}>
              <TouchableOpacity style={cs.modalCancelBtn} onPress={() => { setDeleteTarget(null); setDeleteError(""); }} activeOpacity={0.8}>
                <Text style={cs.modalCancelT}>Keep It</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cs.modalDeleteBtn} onPress={handleDelete} disabled={deleteLoading} activeOpacity={0.8}>
                {deleteLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={cs.modalDeleteT}>Yes, Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Student Picker Modal */}
      {addStudentTarget && (
        <StudentPickerModal
          batch={addStudentTarget}
          onClose={() => setAddStudentTarget(null)}
          onEnrolled={handleEnrolled}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeCsStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.primary },
  content: { flex: 1, backgroundColor: "#FFFBF0" },

  loader:  { flex: 1, justifyContent: "center", alignItems: "center", gap: ms(14) },
  loaderT: { fontSize: fs(14), color: "#8A7F82" },


  banner:    { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  bannerItem:{ flex: 1, alignItems: "center" },
  bannerNum: { fontSize: fs(18), fontWeight: "800" },
  bannerLbl: { fontSize: fs(9.5), color: "#8A7F82", fontWeight: "600", marginTop: ms(2) },
  bannerDiv: { width: 1, height: ms(28), backgroundColor: "#EDE8E3" },

  searchWrap:  { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow:   { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8) },
  searchInput: { flex: 1, fontSize: fs(13.5), color: "#2B1B1F", padding: 0, includeFontPadding: false },

  filterScroll:  { height: ms(38), flexGrow: 0, flexShrink: 0 },
  filterRow:     { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  filterDivider: { width: 1, height: ms(20), backgroundColor: "#EDE8E3", marginRight: ms(8) },
  chip:          { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EDE8E3", marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipOn:        { backgroundColor: colors.primary, borderColor: colors.primary },
  chipT:         { fontSize: fs(12), fontWeight: "600", color: "#8A7F82", includeFontPadding: false, lineHeight: fs(16) },
  chipTOn:       { color: "#FFFFFF" },
  resultT:       { paddingHorizontal: ms(16), paddingTop: ms(4), paddingBottom: ms(4), fontSize: fs(11.5), color: "#8A7F82" },
  listContent:   { paddingHorizontal: ms(16), paddingBottom: ms(40) },

  // Card
  card:        { backgroundColor: "#FFFFFF", borderRadius: ms(16), padding: ms(14), marginBottom: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  cardTop:     { flexDirection: "row", alignItems: "flex-start", gap: ms(10), marginBottom: ms(10) },
  examTag:     { borderRadius: ms(6), paddingHorizontal: ms(7), paddingVertical: ms(3), flexShrink: 0 },
  examTagT:    { fontSize: fs(10), fontWeight: "800", letterSpacing: 0.4 },
  cardMid:     { flex: 1, minWidth: 0 },
  batchName:   { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F", marginBottom: ms(5) },
  batchSubRow: { flexDirection: "row", alignItems: "center", gap: ms(6), flexWrap: "wrap" },
  courseName:  { fontSize: fs(11.5), color: "#8A7F82", flex: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(4), gap: ms(4), flexShrink: 0 },
  statusDot:   { width: ms(6), height: ms(6), borderRadius: ms(3) },
  statusT:     { fontSize: fs(10.5), fontWeight: "700" },
  divider:     { height: 1, backgroundColor: "#F0EDE8", marginBottom: ms(10) },
  centerChip:  { flexDirection: "row", alignItems: "center", gap: ms(4), alignSelf: "flex-start", backgroundColor: "#F3EDFF", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3), marginBottom: ms(8) },
  centerChipT: { fontSize: fs(11), color: "#5B2D8E", fontWeight: "600" },
  metaRow:     { flexDirection: "row", alignItems: "center", gap: ms(6), marginBottom: ms(10) },
  metaItem:    { flexDirection: "row", alignItems: "center", gap: ms(4) },
  metaT:       { fontSize: fs(11), color: "#8A7F82" },

  // Capacity bar
  capacityRow:       { flexDirection: "row", alignItems: "center", gap: ms(8) },
  capacityBar:       { flex: 1, height: ms(5), backgroundColor: "#F0EDE8", borderRadius: ms(3), overflow: "hidden" },
  capacityFill:      { height: "100%", borderRadius: ms(3) },
  capacityRight:     { flexDirection: "row", alignItems: "center", gap: ms(6) },
  capacityT:         { fontSize: fs(10.5), fontWeight: "700" },
  viewStudentsBadge: { flexDirection: "row", alignItems: "center", gap: ms(3), paddingHorizontal: ms(7), paddingVertical: ms(3), borderRadius: ms(8), backgroundColor: "#F0EDE8" },
  viewStudentsT:     { fontSize: fs(10), fontWeight: "700" },

  // Card actions
  cardActions:   { marginTop: ms(10), paddingTop: ms(10), borderTopWidth: 1, borderTopColor: "#F0EDE8", gap: ms(8) },
  addStudentBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6), backgroundColor: "#E7F7EF", borderRadius: ms(10), paddingVertical: ms(9) },
  addStudentT:   { fontSize: fs(12.5), fontWeight: "700", color: "#1B9C63" },
  editDeleteRow: { flexDirection: "row", gap: ms(8) },
  editBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), backgroundColor: "#EFF6FF", borderRadius: ms(10), paddingVertical: ms(8) },
  editBtnT:      { fontSize: fs(12), fontWeight: "700", color: "#2563A8" },
  deleteBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), backgroundColor: "#FEF2F2", borderRadius: ms(10), paddingVertical: ms(8) },
  deleteBtnT:    { fontSize: fs(12), fontWeight: "700", color: "#DC2626" },

  // FAB
  fab: { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },

  // Delete modal
  modalOverlay:    { flex: 1, backgroundColor: "rgba(16,4,8,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: ms(28) },
  modalCard:       { width: "100%", backgroundColor: "#FFFFFF", borderRadius: ms(24), paddingHorizontal: ms(24), paddingTop: ms(32), paddingBottom: ms(24), alignItems: "center", shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(12) }, shadowOpacity: 0.22, shadowRadius: ms(28), elevation: 18 },
  modalIconCircle: { width: ms(64), height: ms(64), borderRadius: ms(32), backgroundColor: "#FEF2F2", borderWidth: 2, borderColor: "#FECACA", justifyContent: "center", alignItems: "center", marginBottom: ms(18) },
  modalTitle:      { fontSize: fs(18), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(10) },
  modalBody:       { fontSize: fs(13), color: "#6B5B5F", textAlign: "center", lineHeight: fs(20), marginBottom: ms(16) },
  modalErr:        { flexDirection: "row", alignItems: "flex-start", gap: ms(8), backgroundColor: "#FEF2F2", borderRadius: ms(10), padding: ms(12), marginBottom: ms(12), width: "100%" },
  modalErrT:       { fontSize: fs(12), color: "#DC2626", flex: 1, lineHeight: fs(18) },
  modalBtnRow:     { flexDirection: "row", gap: ms(10), width: "100%" },
  modalCancelBtn:  { flex: 1, alignItems: "center", paddingVertical: ms(13), borderRadius: ms(14), backgroundColor: "#F4F4F4" },
  modalCancelT:    { fontSize: fs(14), fontWeight: "700", color: "#6B5B5F" },
  modalDeleteBtn:  { flex: 1, alignItems: "center", paddingVertical: ms(13), borderRadius: ms(14), backgroundColor: "#DC2626" },
  modalDeleteT:    { fontSize: fs(14), fontWeight: "800", color: "#fff" },

  // Empty
  empty:      { alignItems: "center", paddingTop: ms(60), gap: ms(8), paddingHorizontal: ms(32) },
  emptyTitle: { fontSize: fs(15), fontWeight: "700", color: "#B0A9AC", textAlign: "center" },
  emptySub:   { fontSize: fs(12), color: "#C7BAB4", textAlign: "center" },
});

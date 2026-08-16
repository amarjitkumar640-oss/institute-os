import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  TextInput, ScrollView, ActivityIndicator, RefreshControl, Modal, StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { T } from "../../components/ui/typography";
import type { RootStackParamList } from "../../navigation/types";
import { listBatches, deleteBatch, type BatchItem, type BatchStatus } from "../../api/batches";
import { listStudents, type StudentItem } from "../../api/students";
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { enrollStudent } from "../../api/enrollments";
import { ms, fs } from "../../utils/responsive";
import { useAuth } from "../../context/AuthContext";
import { usePermission } from "../../hooks/usePermission";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import { useThemeColors, useThemedStyles, contrastColor, type ThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";
import { AVATAR_SIZE, AVATAR_RADIUS, getAvatarFill } from "../../components/ui/avatarStyle";

type Props = NativeStackScreenProps<RootStackParamList, "BatchList">;

// ── Theme ─────────────────────────────────────────────────────────────────────

function examMeta(cs: ExamCategoryItem[]): { label: string; color: string; bg: string } {
  if (cs.length === 0) return { label: "General", color: C.muted, bg: C.inputBg };
  const label = cs.length === 1 ? cs[0].label : `${cs[0].label} +${cs.length - 1}`;
  return { label, color: cs[0].color, bg: cs[0].color + "18" };
}

const STATUS_META: Record<BatchStatus, { label: string; color: string; bg: string; dot: string }> = {
  running: { label: "Running", color: C.green, bg: C.greenBg, dot: C.green },
  upcoming: { label: "Upcoming", color: C.blue, bg: C.blue + "18", dot: C.blue },
  completed: { label: "Completed", color: C.muted, bg: C.inputBg, dot: C.placeholder },
};

const COURSE_COLOR: Record<string, string> = {
  ssc: C.blue, banking: C.green, railway: C.orange, foundation: C.purple, others: C.muted,
};
const COURSE_LABEL: Record<string, string> = {
  ssc: "SSC", banking: "Banking", railway: "Railway", foundation: "Foundation", others: "Others",
};

type FilterKey = "All" | BatchStatus | string; // status key or an ExamCategoryItem id

const STATUS_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "All", label: "All" },
  { key: "running", label: "Running" },
  { key: "upcoming", label: "Upcoming" },
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
  const [allStudents, setAllStudents] = useState<StudentItem[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [localCount, setLocalCount] = useState(batch.enrolledCount);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      // Scoped to the batch's own center — in all-centers mode, without
      // this, every center's students would show up as candidates for a
      // batch that only belongs to one specific branch.
      listStudents(batch.centerId ? { centerId: batch.centerId } : undefined),
      listStudents({ batchId: batch.id }),
    ]).then(([all, enrolled]) => {
      setAllStudents(all);
      setEnrolledIds(new Set(enrolled.map((s) => s.id)));
    }).catch(() => { }).finally(() => setLoading(false));
  }, [batch.id, batch.centerId]);

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
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <StatusBar
        translucent
        barStyle={contrastColor(colors.primary) === "#FFFFFF" ? "light-content" : "dark-content"}
        backgroundColor={colors.primary}
      />
      {/* Paints the area behind the transparent status bar directly, the same
          way ScreenHeader's own header View does — StatusBar.setBackgroundColor
          doesn't reliably repaint the bar on its own here, so this strip is what
          actually makes the status bar read as primary-colored. */}
      <View style={{ height: insets.top, backgroundColor: colors.primary }} />
      <SafeAreaView style={sm.sheet} edges={["bottom"]}>
          {/* Header — icon badge + boxed close button, matching Manage Center
              Access's header shape. */}
          <View style={sm.header}>
            <View style={[sm.headerIcon, { backgroundColor: colors.primary + "17" }]}>
              <Ionicons name="person-add-outline" size={ms(21)} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={sm.title}>Add Student to Batch</Text>
              <View style={sm.subRow}>
                <View style={[sm.headChip, { backgroundColor: colors.primary + "14" }]}>
                  <Ionicons name="layers-outline" size={ms(10)} color={colors.primary} style={sm.headChipIcon} />
                  <Text style={[sm.headChipT, { color: colors.primary }]} numberOfLines={1}>{batch.name}</Text>
                </View>
                <View style={[sm.headChip, { backgroundColor: isFull ? C.redBg : C.greenBg }]}>
                  <Ionicons name="people-outline" size={ms(10)} color={isFull ? C.red : C.green} style={sm.headChipIcon} />
                  <Text style={[sm.headChipT, { color: isFull ? C.red : C.green }]} numberOfLines={1}>
                    {localCount}/{batch.capacity} seats
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={sm.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Batch full warning */}
          {isFull && (
            <View style={sm.fullBanner}>
              <Ionicons name="alert-circle-outline" size={ms(15)} color={C.red} />
              <Text style={sm.fullBannerT}>This batch is at full capacity</Text>
            </View>
          )}

          {/* Result banner */}
          {result && (
            <View style={[sm.resultBanner, { backgroundColor: result.ok ? C.greenBg : C.red + "18" }]}>
              <Ionicons name={result.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={ms(15)} color={result.ok ? C.green : C.red} />
              <Text style={[sm.resultT, { color: result.ok ? C.green : C.red }]}>{result.msg}</Text>
            </View>
          )}

          {/* Search */}
          <View style={sm.searchRow}>
            <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
            <TextInput
              style={sm.searchInput}
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
            <View style={sm.loaderWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={sm.loaderT}>Loading students…</Text>
            </View>
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={filtered}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ paddingBottom: ms(24) }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={sm.emptyWrap}>
                  <Ionicons name="school-outline" size={ms(36)} color={C.border} />
                  <Text style={sm.emptyT}>{search ? "No students match your search" : "No students found"}</Text>
                </View>
              }
              renderItem={({ item: student }) => {
                const enrolled = enrolledIds.has(student.id);
                const busy = submitting === student.id;
                const disabled = enrolled || isFull || !!submitting;
                const courseColor = student.coursePreference ? (COURSE_COLOR[student.coursePreference] ?? C.muted) : C.muted;
                // Prefer the student's actual assigned course over their intake-time
                // preference — otherwise this always shows the generic preference
                // (e.g. "SSC") even for students who've since been assigned a real course.
                const courseLabel = student.course?.name ?? (student.coursePreference ? (COURSE_LABEL[student.coursePreference] ?? student.coursePreference) : null);
                const ini = initials(student.fullName);
                const fill = getAvatarFill(courseColor);

                return (
                  <TouchableOpacity
                    style={[sm.studentRow, disabled && !enrolled && { opacity: 0.5 }]}
                    onPress={() => handleEnroll(student)}
                    activeOpacity={enrolled ? 1 : 0.75}
                    disabled={disabled && !enrolled}
                  >
                    <View style={[
                      sm.avatar,
                      student.photoUrl
                        ? { backgroundColor: C.border }
                        : { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor },
                    ]}>
                      {student.photoUrl
                        ? <Image source={{ uri: student.photoUrl }} style={sm.avatarImg} />
                        : <Text style={[sm.avatarT, { color: fill.color }]}>{ini}</Text>
                      }
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={sm.studentName} numberOfLines={1}>{student.fullName}</Text>
                      <View style={[sm.courseChip, { backgroundColor: courseColor + "14" }]}>
                        <Ionicons name="book-outline" size={ms(10)} color={courseColor} style={sm.courseChipIcon} />
                        <Text style={[sm.courseChipT, { color: courseColor }]} numberOfLines={1}>{courseLabel ?? "No course assigned"}</Text>
                      </View>
                    </View>

                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: ms(4) }} />
                    ) : enrolled ? (
                      <View style={sm.enrolledBadge}>
                        <Ionicons name="checkmark-circle" size={ms(14)} color={C.green} />
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
            <View style={[sm.doneGrad, { backgroundColor: colors.primary }]}>
              <Text style={sm.doneT}>Done</Text>
            </View>
          </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const sm = StyleSheet.create({
  // Full screen, not a bottom sheet — a batch's roster can run into the
  // hundreds, and a capped-height sheet made that list feel cramped. Same
  // header/search/row chrome as before, just given the whole screen to work with.
  sheet: { flex: 1, backgroundColor: C.card, paddingTop: ms(12), paddingHorizontal: ms(16) },
  header: { flexDirection: "row", alignItems: "center", marginBottom: ms(8), gap: ms(10) },
  headerIcon: { width: ms(44), height: ms(44), borderRadius: ms(12), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  title: { ...T.cardTitle, color: C.text },
  closeBtn: { width: ms(34), height: ms(34), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  subRow: { flexDirection: "row", alignItems: "center", gap: ms(6), marginTop: ms(4) },
  headChip: { flexDirection: "row", alignItems: "center", borderRadius: ms(8), paddingHorizontal: ms(7), paddingVertical: ms(3), flexShrink: 1 },
  headChipIcon: { marginRight: ms(4) },
  headChipT: { ...T.chipText },
  fullBanner: { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.red + "18", borderRadius: ms(10), padding: ms(10), marginBottom: ms(10) },
  fullBannerT: { ...T.bodySmall, color: C.red },
  resultBanner: { flexDirection: "row", alignItems: "center", gap: ms(8), borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(10), marginBottom: ms(10) },
  resultT: { ...T.chipText, flex: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), marginBottom: ms(10), gap: ms(8) },
  searchInput: { flex: 1, ...T.body, color: C.text, padding: 0, includeFontPadding: false },
  loaderWrap: { alignItems: "center", paddingVertical: ms(40), gap: ms(12) },
  loaderT: { ...T.body, color: C.muted },
  emptyWrap: { alignItems: "center", paddingVertical: ms(32), gap: ms(10) },
  emptyT: { ...T.body, color: C.placeholder, textAlign: "center" },
  studentRow: { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), borderBottomWidth: 1, borderBottomColor: C.border, gap: ms(12) },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, justifyContent: "center", alignItems: "center", flexShrink: 0, overflow: "hidden" },
  avatarImg: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  avatarT: { ...T.listItemTitle, includeFontPadding: false },
  studentName: { ...T.listItemTitle, color: C.text },
  courseChip: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    borderRadius: ms(8), paddingHorizontal: ms(7), paddingVertical: ms(3), marginTop: ms(4),
  },
  courseChipIcon: { marginRight: ms(4) },
  courseChipT: { ...T.chipText },
  enrolledBadge: { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.greenBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5), marginLeft: ms(4) },
  enrolledT: { ...T.chipText, color: C.green },
  addBtn: { width: ms(30), height: ms(30), borderRadius: ms(10), backgroundColor: C.inputBg, justifyContent: "center", alignItems: "center", marginLeft: ms(4) },
  doneBtn: { marginTop: ms(12), marginBottom: ms(24), borderRadius: ms(14), overflow: "hidden" },
  doneGrad: { alignItems: "center", paddingVertical: ms(14) },
  doneT: { ...T.buttonText, color: "#fff" },
});

// ── Batch Card ────────────────────────────────────────────────────────────────

function BatchCard({
  batch, onPress, onEdit, onDelete, onViewStudents, onAddStudent, isAllCenters,
  canEdit, canDelete, canAddStudent,
}: {
  batch: BatchItem;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewStudents: () => void;
  onAddStudent: () => void;
  isAllCenters?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAddStudent: boolean;
}) {
  const exam = examMeta(batch.course.examCategories);
  const status = STATUS_META[batch.status];
  const fill = capacityFill(batch.enrolledCount, batch.capacity);
  const isFull = batch.enrolledCount >= batch.capacity;
  const cs = useThemedStyles(makeCsStyles);

  return (
    <TouchableOpacity style={cs.card} onPress={onPress} activeOpacity={0.92}>
      {/* Center chip — only visible in all-centers mode */}
      {isAllCenters && batch.center && (
        <View style={cs.centerChip}>
          <Ionicons name="business-outline" size={ms(10)} color={C.purple} />
          <Text style={cs.centerChipT}>{batch.center.name}</Text>
        </View>
      )}

      {/* Top row */}
      <View style={cs.cardTop}>
        <View style={cs.cardMid}>
          <Text style={cs.batchName} numberOfLines={1}>{batch.name}</Text>
          <View style={cs.batchSubRow}>
            <View style={[cs.statusBadge, { backgroundColor: status.bg }]}>
              <View style={[cs.statusDot, { backgroundColor: status.dot }]} />
              <Text style={[cs.statusT, { color: status.color }]}>{status.label}</Text>
            </View>
            <Text style={cs.courseName} numberOfLines={1}>{batch.course.name}</Text>
          </View>
        </View>
        {(canEdit || canDelete) && (
          <View style={cs.cardIconActions}>
            {canEdit && (
              <TouchableOpacity style={cs.iconBtn} onPress={(e) => { e.stopPropagation?.(); onEdit(); }} activeOpacity={0.8}>
                <Ionicons name="pencil-outline" size={ms(15)} color={C.blue} />
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity style={[cs.iconBtn, cs.iconBtnDanger]} onPress={(e) => { e.stopPropagation?.(); onDelete(); }} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={ms(15)} color={C.red} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={cs.divider} />

      {/* Date row */}
      <View style={cs.metaRow}>
        <View style={cs.metaItem}>
          <Ionicons name="calendar-outline" size={ms(12)} color={C.muted} />
          <Text style={cs.metaT}>{fmtDate(batch.startDate)}</Text>
        </View>
        <Ionicons name="arrow-forward-outline" size={ms(11)} color={C.placeholder} />
        <View style={cs.metaItem}>
          <Text style={cs.metaT}>{fmtDate(batch.endDate)}</Text>
        </View>
      </View>

      {/* Capacity bar */}
      <TouchableOpacity style={cs.capacityRow} onPress={onViewStudents} activeOpacity={0.75}>
        <View style={cs.capacityBar}>
          <View style={[cs.capacityFill, { width: `${Math.round(fill * 100)}%` as any, backgroundColor: isFull ? C.red : exam.color }]} />
        </View>
        <View style={cs.capacityRight}>
          <Text style={[cs.capacityT, { color: isFull ? C.red : C.muted }]}>
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
      {!isFull && canAddStudent && (
        <View style={cs.cardActions}>
          <TouchableOpacity style={cs.addStudentBtn} onPress={(e) => { e.stopPropagation?.(); onAddStudent(); }} activeOpacity={0.8}>
            <Ionicons name="person-add-outline" size={ms(14)} color={C.green} />
            <Text style={cs.addStudentT}>Add Student</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

function Banner({ batches }: { batches: BatchItem[] }) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  const total = batches.length;
  const running = batches.filter((b) => b.status === "running").length;
  const upcoming = batches.filter((b) => b.status === "upcoming").length;
  const completed = batches.filter((b) => b.status === "completed").length;

  const stats = [
    { label: "Total", value: total, color: colors.primary },
    { label: "Running", value: running, color: C.green },
    { label: "Upcoming", value: upcoming, color: C.blue },
    { label: "Completed", value: completed, color: C.muted },
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
  const { canWrite, canEdit, canDelete } = usePermission("batches");
  // Enrolling a student is gated by the "students" screen's edit permission
  // server-side (POST /api/enrollments requires students.edit), not batches
  // — matching the API's own requirePermission call, not a batches action.
  const { canEdit: canEditStudents } = usePermission("students");
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);

  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>(initialStatus as FilterKey);
  const [deleteTarget, setDeleteTarget] = useState<BatchItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [addStudentTarget, setAddStudentTarget] = useState<BatchItem | null>(null);
  const [categories, setCategories] = useState<ExamCategoryItem[]>([]);

  useEffect(() => {
    listExamCategories().then(setCategories).catch(() => { });
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
      if (filter === "All") return true;
      if (STATUS_KEYS.includes(filter)) return b.status === filter;
      return b.course.examCategories.some((ec) => ec.id === filter);
    });
  }, [batches, search, filter]);

  const allFilters = [...STATUS_FILTERS, ...EXAM_FILTERS];

  return (
    <SafeAreaView style={cs.safe} edges={["bottom"]}>
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
                <Ionicons name="search-outline" size={ms(16)} color={C.muted} />
                <TextInput
                  style={cs.searchInput}
                  placeholder="Search by batch name or course…"
                  placeholderTextColor={C.placeholder}
                  value={search}
                  onChangeText={setSearch}
                />
                {!!search && (
                  <TouchableOpacity onPress={() => setSearch("")}>
                    <Ionicons name="close-circle" size={ms(16)} color={C.muted} />
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
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canAddStudent={canEditStudents}
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
        {canWrite && (
          <TouchableOpacity style={cs.fab} onPress={() => navigation.navigate("CreateBatch")} activeOpacity={0.85}>
            <Ionicons name="add" size={ms(26)} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Delete confirm modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={cs.modalOverlay}>
          <View style={cs.modalCard}>
            <View style={cs.modalIconCircle}>
              <Ionicons name="trash-outline" size={ms(30)} color={C.red} />
            </View>
            <Text style={cs.modalTitle}>Delete Batch?</Text>
            <Text style={cs.modalBody}>
              <Text style={{ fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text }}>{deleteTarget?.name}</Text>
              {"\n"}will be permanently removed. This cannot be undone.
            </Text>

            {deleteError ? (
              <View style={cs.modalErr}>
                <Ionicons name="lock-closed-outline" size={ms(14)} color={C.red} />
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
  safe: { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, backgroundColor: colors.screenBg },

  loader: { flex: 1, justifyContent: "center", alignItems: "center", gap: ms(14) },
  loaderT: { ...T.body, color: C.muted },


  banner: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  bannerItem: { flex: 1, alignItems: "center" },
  bannerNum: { ...T.cardTitle },
  bannerLbl: { ...T.caption, color: C.muted, marginTop: ms(2) },
  bannerDiv: { width: 1, height: ms(28), backgroundColor: C.border },

  searchWrap: { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8) },
  searchInput: { flex: 1, ...T.body, color: C.text, padding: 0, includeFontPadding: false },

  filterScroll: { height: ms(38), flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  filterDivider: { width: 1, height: ms(20), backgroundColor: C.border, marginRight: ms(8) },
  chip: { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipT: { ...T.chipText, color: C.muted, includeFontPadding: false },
  chipTOn: { color: "#fff" },
  listContent: { paddingHorizontal: ms(16), paddingTop: ms(12), paddingBottom: ms(40) },

  // Card
  card: { backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: ms(10), marginBottom: ms(10) },
  examTag: { borderRadius: ms(6), paddingHorizontal: ms(7), paddingVertical: ms(3), flexShrink: 0 },
  examTagT: { ...T.badgeText },
  cardMid: { flex: 1, minWidth: 0 },
  batchName: { ...T.listItemTitle, color: C.text, marginBottom: ms(5) },
  batchSubRow: { flexDirection: "row", alignItems: "center", gap: ms(6), flexWrap: "wrap" },
  courseName: { ...T.caption, color: C.muted, flex: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(4), gap: ms(4), flexShrink: 0 },
  statusDot: { width: ms(6), height: ms(6), borderRadius: ms(3) },
  statusT: { ...T.badgeText },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(10) },
  centerChip: { flexDirection: "row", alignItems: "center", gap: ms(4), alignSelf: "flex-start", backgroundColor: C.purpleBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3), marginBottom: ms(8) },
  centerChipT: { ...T.chipText, color: C.purple },
  metaRow: { flexDirection: "row", alignItems: "center", gap: ms(6), marginBottom: ms(10) },
  metaItem: { flexDirection: "row", alignItems: "center", gap: ms(4) },
  metaT: { ...T.caption, color: C.muted },

  // Capacity bar
  capacityRow: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  capacityBar: { flex: 1, height: ms(5), backgroundColor: C.border, borderRadius: ms(3), overflow: "hidden" },
  capacityFill: { height: "100%", borderRadius: ms(3) },
  capacityRight: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  capacityT: { ...T.chipText },
  viewStudentsBadge: { flexDirection: "row", alignItems: "center", gap: ms(3), paddingHorizontal: ms(7), paddingVertical: ms(3), borderRadius: ms(8), backgroundColor: C.inputBg },
  viewStudentsT: { ...T.badgeText },

  // Card actions
  cardActions: { marginTop: ms(10), paddingTop: ms(10), borderTopWidth: 1, borderTopColor: C.border, gap: ms(8) },
  addStudentBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6), backgroundColor: C.greenBg, borderRadius: ms(10), paddingVertical: ms(9) },
  addStudentT: { ...T.chipText, color: C.green },

  // Per-row edit/delete — small icon-only tinted squares (DESIGN_SYSTEM.md's
  // convention for a repeated per-row action), not full-width buttons.
  cardIconActions: { flexDirection: "row", gap: ms(6), flexShrink: 0 },
  iconBtn: { width: ms(30), height: ms(30), borderRadius: ms(10), backgroundColor: C.blue + "18", justifyContent: "center", alignItems: "center" },
  iconBtnDanger: { backgroundColor: C.red + "18" },

  // FAB
  fab: { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },

  // Delete modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(16,4,8,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: ms(28) },
  modalCard: { width: "100%", backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(24), paddingTop: ms(32), paddingBottom: ms(24), alignItems: "center", shadowColor: C.text, shadowOffset: { width: 0, height: ms(12) }, shadowOpacity: 0.22, shadowRadius: ms(28), elevation: 18 },
  modalIconCircle: { width: ms(64), height: ms(64), borderRadius: ms(32), backgroundColor: C.red + "18", borderWidth: 2, borderColor: C.red + "30", justifyContent: "center", alignItems: "center", marginBottom: ms(18) },
  modalTitle: { ...T.displayMedium, color: C.text, marginBottom: ms(10) },
  modalBody: { ...T.body, color: C.muted, textAlign: "center", marginBottom: ms(16) },
  modalErr: { flexDirection: "row", alignItems: "flex-start", gap: ms(8), backgroundColor: C.red + "18", borderRadius: ms(10), padding: ms(12), marginBottom: ms(12), width: "100%" },
  modalErrT: { ...T.bodySmall, color: C.red, flex: 1 },
  modalBtnRow: { flexDirection: "row", gap: ms(10), width: "100%" },
  modalCancelBtn: { flex: 1, alignItems: "center", paddingVertical: ms(13), borderRadius: ms(14), backgroundColor: C.inputBg },
  modalCancelT: { ...T.buttonText, color: C.muted },
  modalDeleteBtn: { flex: 1, alignItems: "center", paddingVertical: ms(13), borderRadius: ms(14), backgroundColor: C.red },
  modalDeleteT: { ...T.buttonText, color: "#fff" },

  // Empty
  empty: { alignItems: "center", paddingTop: ms(60), gap: ms(8), paddingHorizontal: ms(32) },
  emptyTitle: { ...T.cardTitle, color: C.placeholder, textAlign: "center" },
  emptySub: { ...T.bodySmall, color: C.placeholder, textAlign: "center" },
});

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator, RefreshControl, Modal, Image, Linking,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import type { RootStackParamList } from "../../navigation/types";
import { listStudents, type StudentItem } from "../../api/students";
import { listBatches, type BatchItem } from "../../api/batches";
import { listCourseNames, type CourseNameItem } from "../../api/courses";
import { listStudentEnrollments, enrollStudent } from "../../api/enrollments";
import { ms, fs } from "../../utils/responsive";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import { usePermission } from "../../hooks/usePermission";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { AVATAR_SIZE, AVATAR_RADIUS, getAvatarFill } from "../../components/ui/avatarStyle";
import { T } from "../../components/ui/typography";
import { COURSE_META } from "../../constants/courseMeta";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Props = NativeStackScreenProps<RootStackParamList, "StudentList">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_META: Record<string, { label: string; color: string }> = {
  running: { label: "Running", color: C.green },
  upcoming: { label: "Upcoming", color: C.blue },
  completed: { label: "Completed", color: C.muted },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Batch Picker Modal ────────────────────────────────────────────────────────

function BatchPickerModal({ student, onClose, onSuccess }: {
  student: StudentItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const colors = useThemeColors();
  const bm = useThemedStyles(makeBmStyles);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [enrolledBatchIds, setEnrolledBatchIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null); // batchId being submitted
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listBatches(),
      listStudentEnrollments(student.id),
    ]).then(([bs, enrs]) => {
      setBatches(bs);
      setEnrolledBatchIds(new Set(enrs.map((e) => e.batch.id)));
    }).catch(() => { }).finally(() => setLoading(false));
  }, [student.id]);

  async function handleEnroll(batch: BatchItem) {
    if (enrolledBatchIds.has(batch.id)) return;
    setSubmitting(batch.id);
    setResult(null);
    const res = await enrollStudent(student.id, batch.id);
    setSubmitting(null);
    if (res.ok) {
      setEnrolledBatchIds((prev) => new Set([...prev, batch.id]));
      setResult({ ok: true, msg: `Enrolled in "${batch.name}" successfully!` });
      onSuccess();
    } else if ("alreadyEnrolled" in res) {
      setResult({ ok: false, msg: "Student is already enrolled in this batch." });
    } else if ("batchFull" in res) {
      setResult({ ok: false, msg: res.message });
    } else {
      setResult({ ok: false, msg: res.error });
    }
  }

  const slots = (b: BatchItem) => b.capacity - b.enrolledCount;
  const isFull = (b: BatchItem) => slots(b) <= 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={bm.overlay}>
        <View style={bm.sheet}>
          <View style={bm.handle} />

          {/* Header */}
          <View style={bm.header}>
            <View>
              <Text style={bm.title}>Enroll in Batch</Text>
              <Text style={bm.sub}>{student.fullName}</Text>
            </View>
            <TouchableOpacity style={bm.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Result banner */}
          {result && (
            <View style={[bm.resultBanner, { backgroundColor: result.ok ? C.greenBg : C.redBg }]}>
              <Ionicons name={result.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={ms(15)} color={result.ok ? C.green : C.red} />
              <Text style={[bm.resultT, { color: result.ok ? C.green : C.red }]}>{result.msg}</Text>
            </View>
          )}

          {loading ? (
            <View style={bm.loaderWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={bm.loaderT}>Loading batches…</Text>
            </View>
          ) : (
            <FlatList
              data={batches}
              keyExtractor={(b) => b.id}
              contentContainerStyle={{ paddingBottom: ms(24) }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={bm.emptyWrap}>
                  <Ionicons name="layers-outline" size={ms(40)} color={C.border} />
                  <Text style={bm.emptyT}>No batches available</Text>
                </View>
              }
              renderItem={({ item: b }) => {
                const color = b.course.examCategories[0]?.color ?? C.muted;
                const sm = STATUS_META[b.status] ?? { label: b.status, color: C.muted };
                const enrolled = enrolledBatchIds.has(b.id);
                const full = isFull(b);
                const disabled = enrolled || full || !!submitting;
                const loading = submitting === b.id;

                return (
                  <TouchableOpacity
                    style={[bm.batchRow, disabled && { opacity: 0.55 }]}
                    onPress={() => handleEnroll(b)}
                    activeOpacity={0.75}
                    disabled={disabled}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={bm.batchName} numberOfLines={1}>{b.name}</Text>
                      <View style={bm.batchMeta}>
                        <View style={[bm.courseBadge, { backgroundColor: color + "20" }]}>
                          <Text style={[bm.courseBadgeT, { color }]} numberOfLines={1}>{b.course.name}</Text>
                        </View>
                        <Text style={bm.sep}>·</Text>
                        <View style={[bm.statusDot, { backgroundColor: sm.color }]} />
                        <Text style={bm.batchMetaT}>{sm.label}</Text>
                        <Text style={bm.sep}>·</Text>
                        <Text style={[bm.batchMetaT, { color: full ? C.red : C.muted }]}>
                          {b.enrolledCount}/{b.capacity} seats
                        </Text>
                      </View>
                    </View>

                    {loading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : enrolled ? (
                      <View style={bm.enrolledBadge}>
                        <Ionicons name="checkmark-circle" size={ms(14)} color={C.green} />
                        <Text style={bm.enrolledT}>Enrolled</Text>
                      </View>
                    ) : full ? (
                      <View style={bm.fullBadge}>
                        <Text style={bm.fullT}>Full</Text>
                      </View>
                    ) : (
                      <View style={bm.addBtn}>
                        <Ionicons name="add" size={ms(16)} color={colors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity style={[bm.doneBtn, bm.doneGrad]} onPress={onClose} activeOpacity={0.85}>
            <Text style={bm.doneT}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeBmStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,4,8,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingTop: ms(12), paddingHorizontal: ms(16), maxHeight: SHEET_HEIGHT.standard },
  handle: { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginBottom: ms(16) },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: ms(14) },
  closeBtn: { width: ms(36), height: ms(36), borderRadius: ms(11), backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  title: { ...T.cardTitle, color: C.text },
  sub: { ...T.bodySmall, color: C.muted, marginTop: ms(2) },
  resultBanner: { flexDirection: "row", alignItems: "center", gap: ms(8), borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(10), marginBottom: ms(10) },
  resultT: { ...T.body, flex: 1 },
  loaderWrap: { alignItems: "center", paddingVertical: ms(40), gap: ms(12) },
  loaderT: { ...T.body, color: C.muted },
  emptyWrap: { alignItems: "center", paddingVertical: ms(32), gap: ms(10) },
  emptyT: { ...T.body, color: C.placeholder },
  batchRow: { flexDirection: "row", alignItems: "center", paddingVertical: ms(14), borderBottomWidth: 1, borderBottomColor: C.border, gap: ms(12) },
  batchName: { ...T.listItemTitle, color: C.text },
  batchMeta: { flexDirection: "row", alignItems: "center", gap: ms(5), marginTop: ms(5), flexWrap: "wrap", rowGap: ms(4) },
  courseBadge: { borderRadius: ms(7), paddingHorizontal: ms(7), paddingVertical: ms(2.5), flexShrink: 1, maxWidth: ms(140) },
  courseBadgeT: { ...T.badgeText },
  statusDot: { width: ms(6), height: ms(6), borderRadius: ms(3) },
  batchMetaT: { ...T.caption, color: C.muted },
  sep: { ...T.caption, color: C.placeholder },
  enrolledBadge: { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.greenBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5) },
  enrolledT: { ...T.chipText, color: C.green },
  fullBadge: { backgroundColor: C.redBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5) },
  fullT: { ...T.chipText, color: C.red },
  // Was a stray reddish literal that didn't match its own colors.primary icon — paired
  // correctly now (same recipe as BatchDetailScreen's AddStudentModal addBtn).
  addBtn: { width: ms(30), height: ms(30), borderRadius: ms(10), backgroundColor: colors.primary + "10", justifyContent: "center", alignItems: "center" },
  doneBtn: { marginTop: ms(12), marginBottom: ms(24), borderRadius: ms(14) },
  doneGrad: { alignItems: "center", paddingVertical: ms(14), backgroundColor: colors.primary },
  doneT: { ...T.buttonText, color: "#fff" },
});

// ── Student Card ──────────────────────────────────────────────────────────────

function StudentCard({ student, showEnroll, canEdit, onPress, onEdit, onEnroll, isAllCenters }: {
  student: StudentItem;
  showEnroll: boolean;
  canEdit: boolean;
  onPress: () => void;
  onEdit: () => void;
  onEnroll: () => void;
  isAllCenters?: boolean;
}) {
  const cs = useThemedStyles(makeCsStyles);
  const meta = (student.coursePreference ? COURSE_META[student.coursePreference] : null) ?? { label: "—", color: C.muted };
  const courseLabel = student.course?.name ?? meta.label;
  const ini = initials(student.fullName);
  const accentColor = meta.color !== C.muted ? meta.color : C.muted;
  const fill = getAvatarFill(accentColor);
  const isEnrolled = !!student.activeEnrollment;

  const genderColor = student.gender === "female" ? "#D96AAC" : student.gender === "male" ? C.blue : C.muted;
  const genderIcon = student.gender === "female" ? "female-outline" : student.gender === "male" ? "male-outline" : "person-outline";
  const genderLabel = student.gender === "female" ? "Female" : student.gender === "male" ? "Male" : "—";

  const showCenterChip = isAllCenters && !!student.center;

  return (
    <TouchableOpacity style={cs.card} onPress={onPress} activeOpacity={0.8}>
      {(showCenterChip || canEdit) && (
        <View style={cs.cardHeaderRow}>
          {showCenterChip ? (
            <View style={cs.centerChip}>
              <Ionicons name="business-outline" size={ms(10)} color={C.purple} />
              <Text style={cs.centerChipT}>{student.center!.name}</Text>
            </View>
          ) : <View />}
          {canEdit && (
            <View style={cs.cardTopActions}>
              {showEnroll && (
                <TouchableOpacity style={[cs.topActionBtn, { backgroundColor: C.greenBg }]} onPress={onEnroll} activeOpacity={0.75}>
                  <Ionicons name="link-outline" size={ms(15)} color={C.green} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[cs.topActionBtn, { backgroundColor: "#EEF3FB" }]} onPress={onEdit} activeOpacity={0.75}>
                <Ionicons name="pencil-outline" size={ms(15)} color={C.blue} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Top row */}
      <View style={cs.cardTop}>
        <View style={[
          cs.iconBox,
          student.photoUrl
            ? { backgroundColor: C.border }
            : { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor },
        ]}>
          {student.photoUrl
            ? <Image source={{ uri: student.photoUrl }} style={cs.iconImg} />
            : <Text style={[cs.iconCode, { color: fill.color }]}>{ini}</Text>
          }
        </View>
        <View style={cs.cardInfo}>
          <Text style={cs.studentName} numberOfLines={1}>{student.fullName}</Text>
          <View style={cs.rollRow}>
            <Text style={cs.rollT} numberOfLines={1}>{student.studentCode}</Text>
            {student.phone && (
              <View style={cs.rollPhone}>
                <Text style={cs.rollT}>·</Text>
                {/* Calling is only ever offered where the real number is
                    visible (canEdit already tracks the same admin/frontdesk-only
                    gate the API uses to decide whether to mask the phone in
                    the first place), so a teacher never sees this even though
                    their phone field is already masked server-side anyway. */}
                {canEdit ? (
                  <TouchableOpacity
                    style={cs.rollPhoneTap}
                    onPress={() => Linking.openURL(`tel:${student.phone}`)}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                  >
                    <View style={cs.callBtn}>
                      <Ionicons name="call" size={ms(11)} color={C.green} />
                    </View>
                    <Text style={cs.rollT} numberOfLines={1}>{student.phone}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={cs.rollT} numberOfLines={1}>{student.phone}</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Stats row */}
      <View style={cs.divider} />
      <View style={cs.statsRow}>
        <View style={cs.statItem}>
          <Ionicons name="book-outline" size={ms(13)} color={accentColor} />
          <Text style={cs.statLabel}>{courseLabel}</Text>
        </View>
        <View style={cs.statDivider} />
        <View style={cs.statItem}>
          <Ionicons name="calendar-outline" size={ms(13)} color={accentColor} />
          <Text style={cs.statLabel}>{formatDate(student.createdAt)}</Text>
        </View>
        <View style={cs.statDivider} />
        <View style={cs.statItem}>
          <Ionicons name={genderIcon as any} size={ms(13)} color={genderColor} />
          <Text style={cs.statLabel}>{genderLabel}</Text>
        </View>
      </View>

      {/* Active batch hint (only when enrolled) */}
      {isEnrolled && (
        <>
          <View style={cs.divider} />
          <View style={cs.batchHint}>
            <Ionicons name="layers-outline" size={ms(12)} color={C.green} />
            <Text style={cs.batchHintT} numberOfLines={1}>
              {`Enrolled to ${student.activeEnrollment?.batchName ?? ""}`}
            </Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

function Banner({ students }: { students: StudentItem[] }) {
  const cs = useThemedStyles(makeCsStyles);
  const enrolled = useMemo(() => students.filter((s) => !!s.activeEnrollment).length, [students]);
  const notEnrolled = students.length - enrolled;

  return (
    <View style={cs.banner}>
      <View style={cs.bannerItem}>
        <Text style={cs.bannerNum}>{students.length}</Text>
        <Text style={cs.bannerLbl}>Total</Text>
      </View>
      <View style={cs.bannerDiv} />
      <View style={cs.bannerItem}>
        <Text style={[cs.bannerNum, { color: C.green }]}>{enrolled}</Text>
        <Text style={cs.bannerLbl}>Enrolled</Text>
      </View>
      <View style={cs.bannerDiv} />
      <View style={cs.bannerItem}>
        <Text style={[cs.bannerNum, { color: C.red }]}>{notEnrolled}</Text>
        <Text style={cs.bannerLbl}>No Batch</Text>
      </View>
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function StudentEmpty({ search }: { search: string }) {
  const colors = useThemeColors();
  return (
    <EmptyState
      scene="students"
      color={colors.primary}
      title={search ? "No students match your search" : "No students yet"}
      subtitle={search ? "Try a different name or roll number" : "Add the first student via the + button"}
    />
  );
}


// ── Batch filter bottom sheet (mirrors FeesScreen's BatchSheet) ───────────────

function BatchSheet({
  visible, batches, selected, onSelect, onClose, colors,
}: {
  visible:  boolean;
  batches:  BatchItem[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onClose:  () => void;
  colors:   ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={bs.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[bs.panel, { paddingBottom: insets.bottom + ms(8) }]}>
        <View style={bs.handle} />
        <Text style={bs.title}>Filter by Batch</Text>

        <ScrollView showsVerticalScrollIndicator={false} style={bs.scroll}>
          <TouchableOpacity
            style={[bs.row, selected === null && { backgroundColor: colors.primary + "0F" }]}
            onPress={() => { onSelect(null); onClose(); }}
            activeOpacity={0.7}
          >
            <View style={[bs.rowIcon, { backgroundColor: colors.primary + "16" }]}>
              <Ionicons name="layers-outline" size={ms(17)} color={colors.primary} />
            </View>
            <Text style={[bs.rowLabel, selected === null && { color: colors.primary, fontFamily: "Inter_700Bold", fontWeight: "700" }]}>
              All Batches
            </Text>
            {selected === null && <Ionicons name="checkmark-circle" size={ms(18)} color={colors.primary} />}
          </TouchableOpacity>

          <View style={bs.divider} />

          {batches.map((b) => {
            const active = selected === b.id;
            return (
              <TouchableOpacity
                key={b.id}
                style={[bs.row, active && { backgroundColor: colors.primary + "0F" }]}
                onPress={() => { onSelect(b.id); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={[bs.rowIcon, { backgroundColor: active ? colors.primary + "16" : C.inputBg }]}>
                  <Ionicons name="layers-outline" size={ms(17)} color={active ? colors.primary : C.muted} />
                </View>
                <Text style={[bs.rowLabel, active && { color: colors.primary, fontFamily: "Inter_700Bold", fontWeight: "700" }]} numberOfLines={1}>
                  {b.name}
                </Text>
                {active && <Ionicons name="checkmark-circle" size={ms(18)} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const bs = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  panel: {
    backgroundColor:      C.card,
    borderTopLeftRadius:  ms(24),
    borderTopRightRadius: ms(24),
    maxHeight:            SHEET_HEIGHT.short,
    paddingTop:           ms(10),
    paddingHorizontal:    ms(0),
  },
  handle: { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginBottom: ms(14) },
  title: { ...T.cardTitle, color: C.text, paddingHorizontal: ms(20), marginBottom: ms(8) },
  scroll:  { flexGrow: 0 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: ms(20), marginVertical: ms(4) },
  row: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: ms(20), paddingVertical: ms(13) },
  rowIcon: { width: ms(38), height: ms(38), borderRadius: ms(11), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rowLabel: { flex: 1, ...T.listItemTitle, color: C.text },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function StudentListScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  const nav = useNavigation<Nav>();
  const { isAllCenters } = useAuth();
  const { showAlert } = useAlert();
  const { canWrite, canEdit } = usePermission("students");
  const batchId = route?.params?.batchId;
  const batchName = route?.params?.batchName;

  // A card's own tap goes straight to that student's fee schedule — the
  // richer per-student detail view (profile/academic/documents) doesn't
  // exist yet on mobile, so this is the one thing there's actually
  // somewhere to navigate to. No active enrollment means no fee schedule
  // exists at all, so there's nowhere useful to send the tap.
  function handleCardPress(student: StudentItem) {
    if (!student.activeEnrollment) {
      showAlert("No Active Enrollment", `${student.fullName} isn't enrolled in a batch yet, so there's no fee schedule to show.`, "info");
      return;
    }
    navigation.navigate("FeeScheduleDetail", { enrollmentId: student.activeEnrollment.id, studentName: student.fullName });
  }

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("All");
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [enrollTarget, setEnrollTarget] = useState<StudentItem | null>(null);

  // Course/batch filter chips reflect this tenant's actual catalog — not a
  // fixed list, since every institute's courses and batches differ.
  const [courses, setCourses] = useState<CourseNameItem[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const data = await listStudents(batchId ? { batchId } : undefined);
      setStudents(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [batchId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useRefetchOnReconnect(() => load(true));

  useEffect(() => {
    listCourseNames().then(setCourses).catch(() => {});
  }, []);

  useEffect(() => {
    // Already scoped to one batch via navigation (e.g. from a batch's own
    // roster) — no need to also offer an in-screen batch filter there.
    if (batchId) return;
    listBatches().then(setBatches).catch(() => {});
  }, [batchId]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const q = search.toLowerCase();
      const matchSearch = !q || s.fullName.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q) || s.phone.includes(q);
      if (!matchSearch) return false;
      if (courseFilter !== "All" && s.courseId !== courseFilter) return false;
      if (batchFilter && s.activeEnrollment?.batchId !== batchFilter) return false;
      return true;
    });
  }, [students, search, courseFilter, batchFilter]);

  const selectedBatch = batches.find((b) => b.id === batchFilter) ?? null;

  return (
    <SafeAreaView style={cs.safe} edges={["bottom"]}>
      <ScreenHeader
        title={batchName ? batchName : "Students"}
        count={students.length}
        countLabel="enrolled"
        onBack={() => navigation.goBack()}
      />

      <View style={cs.content}>
        {loading ? (
          <View style={cs.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={cs.loaderT}>Loading students…</Text>
          </View>
        ) : error ? (
          <ListErrorState title="Failed to load students" onRetry={() => load()} />
        ) : (
          <>
            <Banner students={students} />

            <View style={cs.searchWrap}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: ms(10) }}>
                <View style={[cs.searchRow, { flex: 1 }]}>
                  <Ionicons name="search-outline" size={ms(16)} color={C.muted} />
                  <TextInput
                    style={cs.searchInput}
                    placeholder="Search by name, roll, or phone…"
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

                {!batchId && batches.length > 0 && (
                  <TouchableOpacity
                    style={cs.batchBtn}
                    onPress={() => setBatchSheetOpen(true)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="layers-outline" size={ms(15)} color={C.muted} />
                    {!!batchFilter && <View style={[cs.batchDot, { backgroundColor: colors.primary }]} />}
                    <Ionicons name="chevron-down" size={ms(12)} color={C.muted} />
                  </TouchableOpacity>
                )}
              </View>

              {selectedBatch && (
                <View style={cs.activeBatchRow}>
                  <View style={[cs.activeBatchChip, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
                    <Ionicons name="layers-outline" size={ms(11)} color={colors.primary} />
                    <Text style={[cs.activeBatchT, { color: colors.primary }]} numberOfLines={1}>{selectedBatch.name}</Text>
                    <TouchableOpacity onPress={() => setBatchFilter(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name="close-circle" size={ms(14)} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.filterScroll} contentContainerStyle={cs.filterRow}>
              {[{ id: "All", name: "All" }, ...courses].map((c) => (
                <TouchableOpacity key={c.id} style={[cs.chip, courseFilter === c.id && cs.chipOn]} onPress={() => setCourseFilter(c.id)}>
                  <Text style={[cs.chipT, courseFilter === c.id && cs.chipTOn]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <FlatList
              data={filtered}
              keyExtractor={(s) => s.id}
              renderItem={({ item }) => (
                <StudentCard
                  student={item}
                  showEnroll={!batchId}
                  canEdit={canEdit}
                  onPress={() => handleCardPress(item)}
                  onEdit={() => navigation.navigate("EditStudent", { student: item })}
                  onEnroll={() => setEnrollTarget(item)}
                  isAllCenters={isAllCenters}
                />
              )}
              contentContainerStyle={cs.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<StudentEmpty search={search} />}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} />
              }
            />
          </>
        )}

        {canWrite && (
          <TouchableOpacity style={cs.fab} onPress={() => nav.navigate("NewAdmission")} activeOpacity={0.85}>
            <Ionicons name="add" size={ms(26)} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Batch Picker Modal */}
      {enrollTarget && (
        <BatchPickerModal
          student={enrollTarget}
          onClose={() => setEnrollTarget(null)}
          onSuccess={() => load()}
        />
      )}

      {/* Batch Filter Sheet */}
      <BatchSheet
        visible={batchSheetOpen}
        batches={batches}
        selected={batchFilter}
        onSelect={setBatchFilter}
        onClose={() => setBatchSheetOpen(false)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeCsStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, backgroundColor: colors.screenBg, position: "relative" },
  fab: { position: "absolute", bottom: ms(24), right: ms(20), width: ms(56), height: ms(56), borderRadius: ms(28), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(12), elevation: 10 },

  loader: { flex: 1, justifyContent: "center", alignItems: "center", gap: ms(14) },
  loaderT: { ...T.body, color: C.muted },

  // Banner
  banner: { flexDirection: "row", backgroundColor: C.card, marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(10), paddingHorizontal: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  bannerItem: { flex: 1, alignItems: "center" },
  bannerNum: { ...T.displayMedium, color: colors.primary },
  bannerLbl: { ...T.caption, color: C.muted, marginTop: ms(1) },
  bannerDiv: { width: 1, backgroundColor: C.border, marginHorizontal: ms(6) },

  // Search + filter
  searchWrap: { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8) },
  searchInput: { flex: 1, ...T.body, color: C.text, padding: 0, includeFontPadding: false },

  batchBtn: {
    flexDirection: "row", alignItems: "center", gap: ms(5),
    paddingHorizontal: ms(13), paddingVertical: ms(10),
    backgroundColor: C.card, borderRadius: ms(12), borderWidth: 1, borderColor: C.border,
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(1) }, shadowOpacity: 0.06, shadowRadius: ms(6), elevation: 2,
    position: "relative",
  },
  // Sits right on the button's border line at the corner — a slight
  // overlap, not floating past it and not tucked away inside it.
  batchDot: { position: "absolute", top: -ms(2), right: -ms(2), width: ms(8), height: ms(8), borderRadius: ms(4) },

  activeBatchRow: { marginTop: ms(8) },
  activeBatchChip: { flexDirection: "row", alignItems: "center", gap: ms(6), alignSelf: "flex-start", borderRadius: ms(20), paddingHorizontal: ms(12), paddingVertical: ms(6), borderWidth: 1 },
  activeBatchT: { ...T.chipText, maxWidth: ms(180) },

  filterScroll: { height: ms(38), flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  chip: { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipT: { ...T.chipText, color: C.muted, includeFontPadding: false },
  chipTOn: { color: "#FFFFFF" },
  listContent: { paddingTop: ms(12), paddingBottom: ms(96) },

  // Card (matches CourseCard pattern)
  card: { backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginHorizontal: ms(16), marginBottom: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(8) },
  centerChip: { flexDirection: "row", alignItems: "center", gap: ms(4), alignSelf: "flex-start", backgroundColor: C.purpleBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  centerChipT: { ...T.chipText, color: C.purple },

  // Top row
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: ms(10), marginBottom: ms(10) },
  iconBox: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, justifyContent: "center", alignItems: "center", flexShrink: 0, overflow: "hidden" },
  iconImg: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  iconCode: { ...T.listItemTitle, includeFontPadding: false },
  cardInfo: { flex: 1, minWidth: 0 },
  studentName: { ...T.listItemTitle, color: C.text, marginBottom: ms(3) },
  rollRow: { flexDirection: "row", alignItems: "center", gap: ms(4) },
  rollPhone: { flexDirection: "row", alignItems: "center", gap: ms(4), flexShrink: 1, minWidth: 0 },
  rollPhoneTap: { flexDirection: "row", alignItems: "center", gap: ms(4), flexShrink: 1, minWidth: 0 },
  rollT: { ...T.caption, color: C.muted, flexShrink: 1 },
  callBtn: { width: ms(20), height: ms(20), borderRadius: ms(6), backgroundColor: C.greenBg, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  cardTopActions: { flexDirection: "row", alignItems: "center", gap: ms(6), flexShrink: 0 },
  topActionBtn: { width: ms(30), height: ms(30), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },

  // Stats row
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(10) },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: ms(10) },
  statItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(4) },
  statLabel: { ...T.chipText, color: C.text },
  statDivider: { width: 1, height: ms(16), backgroundColor: C.border },

  // Batch hint row (enrolled only)
  batchHint: { flexDirection: "row", alignItems: "center", gap: ms(5), paddingHorizontal: ms(2), paddingBottom: ms(10), marginTop: ms(-2) },
  batchHintT: { ...T.caption, color: C.green, flex: 1 },

  empty: { alignItems: "center", paddingTop: ms(60), gap: ms(8), paddingHorizontal: ms(32) },
  emptyTitle: { ...T.cardTitle, color: C.placeholder, textAlign: "center" },
  emptySubT: { ...T.bodySmall, color: C.placeholder, textAlign: "center" },
});

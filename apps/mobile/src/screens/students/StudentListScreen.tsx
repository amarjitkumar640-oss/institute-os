import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator, RefreshControl, Modal, Image,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import type { RootStackParamList } from "../../navigation/types";
import { listStudents, type StudentItem, type CoursePreference } from "../../api/students";
import { listBatches, type BatchItem } from "../../api/batches";
import { listStudentEnrollments, enrollStudent } from "../../api/enrollments";
import { ms, fs } from "../../utils/responsive";
import { useAuth } from "../../context/AuthContext";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { COURSE_META } from "../../constants/courseMeta";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Props = NativeStackScreenProps<RootStackParamList, "StudentList">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_META: Record<string, { label: string; color: string }> = {
  running: { label: "Running", color: C.green },
  upcoming: { label: "Upcoming", color: C.blue },
  completed: { label: "Completed", color: C.muted },
};

type FilterKey = "All" | CoursePreference;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "All", label: "All" },
  { key: "ssc", label: "SSC" },
  { key: "banking", label: "Banking" },
  { key: "railway", label: "Railway" },
  { key: "foundation", label: "Foundation" },
  { key: "others", label: "Others" },
];

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
            <View style={[bm.resultBanner, { backgroundColor: result.ok ? C.greenBg : "#FEE2E2" }]}>
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
  sheet: { backgroundColor: C.card, borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingTop: ms(12), paddingHorizontal: ms(16), maxHeight: "80%" },
  handle: { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginBottom: ms(16) },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: ms(14) },
  closeBtn: { width: ms(36), height: ms(36), borderRadius: ms(11), backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  title: { fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  sub: { fontSize: fs(12), color: C.muted, marginTop: ms(2) },
  resultBanner: { flexDirection: "row", alignItems: "center", gap: ms(8), borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(10), marginBottom: ms(10) },
  resultT: { fontSize: fs(12.5), fontFamily: "Inter_600SemiBold", fontWeight: "600", flex: 1 },
  loaderWrap: { alignItems: "center", paddingVertical: ms(40), gap: ms(12) },
  loaderT: { fontSize: fs(13), color: C.muted },
  emptyWrap: { alignItems: "center", paddingVertical: ms(32), gap: ms(10) },
  emptyT: { fontSize: fs(13), color: C.placeholder },
  batchRow: { flexDirection: "row", alignItems: "center", paddingVertical: ms(14), borderBottomWidth: 1, borderBottomColor: C.border, gap: ms(12) },
  batchName: { fontSize: fs(13.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  batchMeta: { flexDirection: "row", alignItems: "center", gap: ms(5), marginTop: ms(5), flexWrap: "wrap", rowGap: ms(4) },
  courseBadge: { borderRadius: ms(7), paddingHorizontal: ms(7), paddingVertical: ms(2.5), flexShrink: 1, maxWidth: ms(140) },
  courseBadgeT: { fontSize: fs(10.5), fontFamily: "Inter_800ExtraBold", fontWeight: "800" },
  statusDot: { width: ms(6), height: ms(6), borderRadius: ms(3) },
  batchMetaT: { fontSize: fs(11), color: C.muted },
  sep: { fontSize: fs(11), color: C.placeholder },
  enrolledBadge: { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.greenBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5) },
  enrolledT: { fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.green },
  fullBadge: { backgroundColor: "#FEE2E2", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5) },
  fullT: { fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.red },
  addBtn: { width: ms(30), height: ms(30), borderRadius: ms(10), backgroundColor: "#FEF4F4", justifyContent: "center", alignItems: "center" },
  doneBtn: { marginTop: ms(12), marginBottom: ms(24), borderRadius: ms(14) },
  doneGrad: { alignItems: "center", paddingVertical: ms(14), backgroundColor: colors.primary },
  doneT: { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff" },
});

// ── Student Card ──────────────────────────────────────────────────────────────

function StudentCard({ student, showEnroll, onEdit, onEnroll, isAllCenters }: {
  student: StudentItem;
  showEnroll: boolean;
  onEdit: () => void;
  onEnroll: () => void;
  isAllCenters?: boolean;
}) {
  const cs = useThemedStyles(makeCsStyles);
  const meta = (student.coursePreference ? COURSE_META[student.coursePreference] : null) ?? { label: "—", color: C.muted };
  const courseLabel = student.course?.name ?? meta.label;
  const ini = initials(student.fullName);
  const accentColor = meta.color !== C.muted ? meta.color : C.muted;
  const isEnrolled = !!student.activeEnrollment;

  const genderColor = student.gender === "female" ? "#D96AAC" : student.gender === "male" ? C.blue : C.muted;
  const genderIcon = student.gender === "female" ? "female-outline" : student.gender === "male" ? "male-outline" : "person-outline";
  const genderLabel = student.gender === "female" ? "Female" : student.gender === "male" ? "Male" : "—";

  return (
    <View style={cs.card}>
      {isAllCenters && student.center && (
        <View style={cs.centerChip}>
          <Ionicons name="business-outline" size={ms(10)} color={C.purple} />
          <Text style={cs.centerChipT}>{student.center.name}</Text>
        </View>
      )}

      {/* Top row */}
      <View style={cs.cardTop}>
        <View style={[cs.iconBox, { backgroundColor: student.photoUrl ? C.border : accentColor }]}>
          {student.photoUrl
            ? <Image source={{ uri: student.photoUrl }} style={cs.iconImg} />
            : <Text style={cs.iconCode}>{ini}</Text>
          }
        </View>
        <View style={cs.cardInfo}>
          <Text style={cs.studentName} numberOfLines={1}>{student.fullName}</Text>
          <Text style={cs.rollT} numberOfLines={1}>
            {student.studentCode}{student.phone ? ` · ${student.phone}` : ""}
          </Text>
        </View>
        <View style={[cs.statusBadge, { backgroundColor: isEnrolled ? C.greenBg : C.inputBg }]}>
          <View style={[cs.statusDot, { backgroundColor: isEnrolled ? C.green : C.placeholder }]} />
          <Text style={[cs.statusT, { color: isEnrolled ? C.green : C.muted }]}>
            {isEnrolled ? "Enrolled" : "No batch"}
          </Text>
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

      {/* Action row */}
      <View style={cs.divider} />
      <View style={cs.actionBtns}>
        {showEnroll && (
          <>
            <TouchableOpacity style={[cs.actionBtn, cs.enrollActionBtn]} onPress={onEnroll} activeOpacity={0.75}>
              <Ionicons name="link-outline" size={ms(13)} color={C.green} />
              <Text style={[cs.actionBtnT, { color: C.green }]}>Enroll</Text>
            </TouchableOpacity>
            <View style={cs.actionDivider} />
          </>
        )}
        <TouchableOpacity style={[cs.actionBtn, cs.editActionBtn]} onPress={onEdit} activeOpacity={0.75}>
          <Ionicons name="pencil-outline" size={ms(13)} color={C.blue} />
          <Text style={[cs.actionBtnT, { color: C.blue }]}>Edit</Text>
        </TouchableOpacity>
      </View>
    </View>
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


// ── Main Screen ───────────────────────────────────────────────────────────────

export function StudentListScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  const nav = useNavigation<Nav>();
  const { isAllCenters } = useAuth();
  const batchId = route?.params?.batchId;
  const batchName = route?.params?.batchName;

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("All");
  const [enrollTarget, setEnrollTarget] = useState<StudentItem | null>(null);

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

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const q = search.toLowerCase();
      const matchSearch = !q || s.fullName.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q) || s.phone.includes(q);
      if (!matchSearch) return false;
      if (filter !== "All") return s.coursePreference === filter;
      return true;
    });
  }, [students, search, filter]);

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
              <View style={cs.searchRow}>
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
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.filterScroll} contentContainerStyle={cs.filterRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity key={f.key} style={[cs.chip, filter === f.key && cs.chipOn]} onPress={() => setFilter(f.key)}>
                  <Text style={[cs.chipT, filter === f.key && cs.chipTOn]}>{f.label}</Text>
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

        <TouchableOpacity style={cs.fab} onPress={() => nav.navigate("NewAdmission")} activeOpacity={0.85}>
          <Ionicons name="add" size={ms(26)} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Batch Picker Modal */}
      {enrollTarget && (
        <BatchPickerModal
          student={enrollTarget}
          onClose={() => setEnrollTarget(null)}
          onSuccess={() => load()}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeCsStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, backgroundColor: colors.screenBg, position: "relative" },
  fab: { position: "absolute", bottom: ms(24), right: ms(20), width: ms(56), height: ms(56), borderRadius: ms(28), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(12), elevation: 10 },

  loader: { flex: 1, justifyContent: "center", alignItems: "center", gap: ms(14) },
  loaderT: { fontSize: fs(14), color: C.muted },

  // Banner
  banner: { flexDirection: "row", backgroundColor: C.card, marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(10), paddingHorizontal: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  bannerItem: { flex: 1, alignItems: "center" },
  bannerNum: { fontSize: fs(18), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: colors.primary },
  bannerLbl: { fontSize: fs(10), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600", marginTop: ms(1) },
  bannerDiv: { width: 1, backgroundColor: C.border, marginHorizontal: ms(6) },

  // Search + filter
  searchWrap: { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8) },
  searchInput: { flex: 1, fontSize: fs(13.5), color: C.text, padding: 0, includeFontPadding: false },
  filterScroll: { height: ms(38), flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  chip: { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipT: { fontSize: fs(12), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.muted, includeFontPadding: false, lineHeight: fs(16) },
  chipTOn: { color: "#FFFFFF" },
  listContent: { paddingTop: ms(12), paddingBottom: ms(96) },

  // Card (matches CourseCard pattern)
  card: { backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginHorizontal: ms(16), marginBottom: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  centerChip: { flexDirection: "row", alignItems: "center", gap: ms(4), alignSelf: "flex-start", backgroundColor: C.purpleBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3), marginBottom: ms(8) },
  centerChipT: { fontSize: fs(11), color: C.purple, fontFamily: "Inter_600SemiBold", fontWeight: "600" },

  // Top row
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: ms(10), marginBottom: ms(10) },
  iconBox: { width: ms(46), height: ms(46), borderRadius: ms(12), justifyContent: "center", alignItems: "center", flexShrink: 0, overflow: "hidden" },
  iconImg: { width: ms(46), height: ms(46) },
  iconCode: { fontSize: fs(13), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff", letterSpacing: 0.3, includeFontPadding: false },
  cardInfo: { flex: 1, minWidth: 0 },
  studentName: { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text, marginBottom: ms(3) },
  rollT: { fontSize: fs(11), color: C.muted },
  statusBadge: { flexDirection: "row", alignItems: "center", borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(4), gap: ms(4), flexShrink: 0 },
  statusDot: { width: ms(6), height: ms(6), borderRadius: ms(3) },
  statusT: { fontSize: fs(10.5), fontFamily: "Inter_700Bold", fontWeight: "700" },

  // Stats row
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(10) },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: ms(10) },
  statItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(4) },
  statLabel: { fontSize: fs(11), color: C.text, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  statDivider: { width: 1, height: ms(16), backgroundColor: C.border },

  // Batch hint row (enrolled only)
  batchHint: { flexDirection: "row", alignItems: "center", gap: ms(5), paddingHorizontal: ms(2), paddingBottom: ms(10), marginTop: ms(-2) },
  batchHintT: { fontSize: fs(11), color: C.green, fontFamily: "Inter_600SemiBold", fontWeight: "600", flex: 1 },

  // Action row
  actionBtns: { flexDirection: "row", alignItems: "center" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingHorizontal: ms(8), paddingVertical: ms(7), borderRadius: ms(8) },
  enrollActionBtn: { backgroundColor: C.greenBg },
  editActionBtn: { backgroundColor: "#EEF3FB" },
  actionBtnT: { fontSize: fs(12), fontFamily: "Inter_700Bold", fontWeight: "700" },
  actionDivider: { width: ms(8) },

  empty: { alignItems: "center", paddingTop: ms(60), gap: ms(8), paddingHorizontal: ms(32) },
  emptyTitle: { fontSize: fs(15), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.placeholder, textAlign: "center" },
  emptySubT: { fontSize: fs(12), color: C.placeholder, textAlign: "center" },
});

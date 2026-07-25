import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, StatusBar, ScrollView, ActivityIndicator, RefreshControl, Modal, Image,
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
import { COURSE_META } from "../../constants/courseMeta";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Props = NativeStackScreenProps<RootStackParamList, "StudentList">;
type Nav   = NativeStackNavigationProp<RootStackParamList>;

const STATUS_META: Record<string, { label: string; color: string }> = {
  running:   { label: "Running",   color: "#1B9C63" },
  upcoming:  { label: "Upcoming",  color: "#2563A8" },
  completed: { label: "Completed", color: "#8A7F82" },
};

type FilterKey = "All" | CoursePreference;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "All",        label: "All"        },
  { key: "ssc",        label: "SSC"        },
  { key: "banking",    label: "Banking"    },
  { key: "railway",    label: "Railway"    },
  { key: "foundation", label: "Foundation" },
  { key: "others",     label: "Others"     },
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
  const [batches, setBatches]                 = useState<BatchItem[]>([]);
  const [enrolledBatchIds, setEnrolledBatchIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]                 = useState(true);
  const [submitting, setSubmitting]           = useState<string | null>(null); // batchId being submitted
  const [result, setResult]                   = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listBatches(),
      listStudentEnrollments(student.id),
    ]).then(([bs, enrs]) => {
      setBatches(bs);
      setEnrolledBatchIds(new Set(enrs.map((e) => e.batch.id)));
    }).catch(() => {}).finally(() => setLoading(false));
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
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={ms(24)} color="#C7BAB4" />
            </TouchableOpacity>
          </View>

          {/* Result banner */}
          {result && (
            <View style={[bm.resultBanner, { backgroundColor: result.ok ? "#E7F7EF" : "#FEE2E2" }]}>
              <Ionicons name={result.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={ms(15)} color={result.ok ? "#1B9C63" : "#DC2626"} />
              <Text style={[bm.resultT, { color: result.ok ? "#1B9C63" : "#DC2626" }]}>{result.msg}</Text>
            </View>
          )}

          {loading ? (
            <View style={bm.loaderWrap}>
              <ActivityIndicator size="large" color="#8B1E3F" />
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
                  <Ionicons name="layers-outline" size={ms(40)} color="#D5CCC8" />
                  <Text style={bm.emptyT}>No batches available</Text>
                </View>
              }
              renderItem={({ item: b }) => {
                const color     = b.course.examCategory?.color ?? "#8A7F82";
                const sm        = STATUS_META[b.status] ?? { label: b.status, color: "#8A7F82" };
                const enrolled  = enrolledBatchIds.has(b.id);
                const full      = isFull(b);
                const disabled  = enrolled || full || !!submitting;
                const loading   = submitting === b.id;

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
                        <Text style={[bm.batchMetaT, { color: full ? "#DC2626" : C.muted }]}>
                          {b.enrolledCount}/{b.capacity} seats
                        </Text>
                      </View>
                    </View>

                    {loading ? (
                      <ActivityIndicator size="small" color="#8B1E3F" />
                    ) : enrolled ? (
                      <View style={bm.enrolledBadge}>
                        <Ionicons name="checkmark-circle" size={ms(14)} color="#1B9C63" />
                        <Text style={bm.enrolledT}>Enrolled</Text>
                      </View>
                    ) : full ? (
                      <View style={bm.fullBadge}>
                        <Text style={bm.fullT}>Full</Text>
                      </View>
                    ) : (
                      <View style={bm.addBtn}>
                        <Ionicons name="add" size={ms(16)} color="#8B1E3F" />
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

const bm = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: "rgba(16,4,8,0.55)", justifyContent: "flex-end" },
  sheet:        { backgroundColor: "#FFFFFF", borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingTop: ms(12), paddingHorizontal: ms(16), maxHeight: "80%" },
  handle:       { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: "#E0D8D4", alignSelf: "center", marginBottom: ms(16) },
  header:       { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: ms(14) },
  title:        { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F" },
  sub:          { fontSize: fs(12), color: "#8A7F82", marginTop: ms(2) },
  resultBanner: { flexDirection: "row", alignItems: "center", gap: ms(8), borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(10), marginBottom: ms(10) },
  resultT:      { fontSize: fs(12.5), fontWeight: "600", flex: 1 },
  loaderWrap:   { alignItems: "center", paddingVertical: ms(40), gap: ms(12) },
  loaderT:      { fontSize: fs(13), color: "#8A7F82" },
  emptyWrap:    { alignItems: "center", paddingVertical: ms(32), gap: ms(10) },
  emptyT:       { fontSize: fs(13), color: "#B0A9AC" },
  batchRow:     { flexDirection: "row", alignItems: "center", paddingVertical: ms(14), borderBottomWidth: 1, borderBottomColor: "#F0EDE8", gap: ms(12) },
  batchName:    { fontSize: fs(13.5), fontWeight: "700", color: "#2B1B1F" },
  batchMeta:    { flexDirection: "row", alignItems: "center", gap: ms(5), marginTop: ms(5), flexWrap: "wrap", rowGap: ms(4) },
  courseBadge:  { borderRadius: ms(7), paddingHorizontal: ms(7), paddingVertical: ms(2.5), flexShrink: 1, maxWidth: ms(140) },
  courseBadgeT: { fontSize: fs(10.5), fontWeight: "800" },
  statusDot:    { width: ms(6), height: ms(6), borderRadius: ms(3) },
  batchMetaT:   { fontSize: fs(11), color: "#8A7F82" },
  sep:          { fontSize: fs(11), color: "#C7BAB4" },
  enrolledBadge:{ flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: "#E7F7EF", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5) },
  enrolledT:    { fontSize: fs(11), fontWeight: "700", color: "#1B9C63" },
  fullBadge:    { backgroundColor: "#FEE2E2", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5) },
  fullT:        { fontSize: fs(11), fontWeight: "700", color: "#DC2626" },
  addBtn:       { width: ms(30), height: ms(30), borderRadius: ms(10), backgroundColor: "#FEF4F4", justifyContent: "center", alignItems: "center" },
  doneBtn:      { marginTop: ms(12), marginBottom: ms(24), borderRadius: ms(14) },
  doneGrad:     { alignItems: "center", paddingVertical: ms(14), backgroundColor: "#8B1E3F" },
  doneT:        { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});

// ── Student Card ──────────────────────────────────────────────────────────────

function StudentCard({ student, showEnroll, onEdit, onEnroll, isAllCenters }: {
  student: StudentItem;
  showEnroll: boolean;
  onEdit: () => void;
  onEnroll: () => void;
  isAllCenters?: boolean;
}) {
  const meta = (student.coursePreference ? COURSE_META[student.coursePreference] : null) ?? { label: "—", color: C.muted };
  const ini  = initials(student.fullName);

  return (
    <View style={[cs.card, { borderLeftColor: C.primary }]}>
      {isAllCenters && student.center && (
        <View style={cs.centerChip}>
          <Ionicons name="business-outline" size={ms(10)} color="#5B2D8E" />
          <Text style={cs.centerChipT}>{student.center.name}</Text>
        </View>
      )}
      <View style={cs.cardTop}>
        <View style={cs.avatar}>
          {student.photoUrl
            ? <Image source={{ uri: student.photoUrl }} style={cs.avatarImg} />
            : <Text style={cs.avatarT}>{ini}</Text>
          }
        </View>
        <View style={cs.cardInfo}>
          <Text style={cs.studentName} numberOfLines={1}>{student.fullName}</Text>
          <Text style={cs.rollT} numberOfLines={1}>
            {student.studentCode}{student.phone ? ` · ${student.phone}` : ""}
          </Text>
        </View>
        {showEnroll && (
          <TouchableOpacity style={cs.enrollBtn} onPress={onEnroll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="link-outline" size={ms(15)} color="#1B9C63" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={cs.editBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="pencil-outline" size={ms(15)} color="#2563A8" />
        </TouchableOpacity>
      </View>

      <View style={cs.divider} />

      <View style={student.activeEnrollment ? cs.enrollStatusOn : cs.enrollStatusOff}>
        <Ionicons
          name={student.activeEnrollment ? "checkmark-circle" : "alert-circle-outline"}
          size={ms(13)}
          color={student.activeEnrollment ? "#1B9C63" : "#C0392B"}
        />
        <Text
          style={[cs.enrollStatusT, { color: student.activeEnrollment ? "#1B9C63" : "#C0392B" }]}
          numberOfLines={1}
        >
          {student.activeEnrollment ? `Enrolled in ${student.activeEnrollment.batchName}` : "Not enrolled in any batch"}
        </Text>
      </View>

      <View style={cs.cardBottom}>
        {student.coursePreference ? (
          <View style={cs.courseBadge}>
            <Ionicons name="book-outline" size={ms(11)} color={C.primary} />
            <Text style={cs.courseT}>{meta.label}</Text>
          </View>
        ) : null}
        <View style={cs.metaItem}>
          <Ionicons name="calendar-outline" size={ms(11)} color={C.muted} />
          <Text style={cs.metaT}>Joined {formatDate(student.createdAt)}</Text>
        </View>
        {student.gender ? (
          <View style={cs.genderBadge}>
            <Ionicons
              name={student.gender === "female" ? "female-outline" : "male-outline"}
              size={ms(11)}
              color={student.gender === "female" ? "#D96AAC" : "#2563A8"}
            />
            <Text style={[cs.genderT, { color: student.gender === "female" ? "#D96AAC" : "#2563A8" }]}>
              {student.gender === "female" ? "Female" : "Male"}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

function Banner({ students }: { students: StudentItem[] }) {
  const counts = useMemo(() => {
    const acc: Record<string, number> = { ssc: 0, banking: 0, railway: 0, foundation: 0 };
    students.forEach((s) => { if (s.coursePreference && acc[s.coursePreference] !== undefined) acc[s.coursePreference]++; });
    return acc;
  }, [students]);

  return (
    <View style={cs.banner}>
      {(["ssc", "banking", "railway", "foundation"] as CoursePreference[]).map((key) => (
        <View key={key} style={cs.bannerItem}>
          <Text style={[cs.bannerNum, { color: COURSE_META[key].color }]}>{counts[key]}</Text>
          <Text style={cs.bannerLbl}>{COURSE_META[key].label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function StudentEmpty({ search }: { search: string }) {
  return (
    <EmptyState
      scene="students"
      color="#2563A8"
      title={search ? "No students match your search" : "No students yet"}
      subtitle={search ? "Try a different name or roll number" : "Add the first student via the + button"}
    />
  );
}


// ── Main Screen ───────────────────────────────────────────────────────────────

export function StudentListScreen({ navigation, route }: Props) {
  const nav = useNavigation<Nav>();
  const { isAllCenters } = useAuth();
  const batchId   = route?.params?.batchId;
  const batchName = route?.params?.batchName;

  const [students, setStudents]     = useState<StudentItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(false);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<FilterKey>("All");
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
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader
        title={batchName ? batchName : "Students"}
        count={students.length}
        countLabel="enrolled"
        onBack={() => navigation.goBack()}
      />

      <View style={cs.content}>
        {loading ? (
          <View style={cs.loader}>
            <ActivityIndicator size="large" color="#8B1E3F" />
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
                  placeholderTextColor="#C7BAB4"
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

            <Text style={cs.resultT}>
              {filtered.length} of {students.length} student{students.length !== 1 ? "s" : ""}
              {filter !== "All" ? ` · ${COURSE_META[filter as CoursePreference]?.label ?? filter}` : ""}
            </Text>

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
                <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#8B1E3F"]} tintColor="#8B1E3F" />
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

const cs = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: "#8B1E3F" },
  content: { flex: 1, backgroundColor: "#FFFBF0", position: "relative" },
  fab:     { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: "#8B1E3F", justifyContent: "center", alignItems: "center", shadowColor: "#8B1E3F", shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },

  loader:  { flex: 1, justifyContent: "center", alignItems: "center", gap: ms(14) },
  loaderT: { fontSize: fs(14), color: C.muted },


  banner:     { flexDirection: "row", backgroundColor: "#FFFFFF", marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(10), paddingHorizontal: ms(8), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  bannerItem: { flex: 1, alignItems: "center" },
  bannerNum:  { fontSize: fs(18), fontWeight: "800" },
  bannerLbl:  { fontSize: fs(9.5), color: "#8A7F82", fontWeight: "600", marginTop: ms(2) },

  searchWrap:  { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow:   { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8) },
  searchInput: { flex: 1, fontSize: fs(13.5), color: "#2B1B1F", padding: 0, includeFontPadding: false },

  filterScroll: { height: ms(38), flexGrow: 0, flexShrink: 0 },
  filterRow:    { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  chip:         { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EDE8E3", marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipOn:       { backgroundColor: "#8B1E3F", borderColor: "#8B1E3F" },
  chipT:        { fontSize: fs(12), fontWeight: "600", color: "#8A7F82", includeFontPadding: false, lineHeight: fs(16) },
  chipTOn:      { color: "#FFFFFF" },
  resultT:      { paddingHorizontal: ms(16), paddingTop: ms(4), paddingBottom: ms(4), fontSize: fs(11.5), color: "#8A7F82" },
  listContent:  { paddingHorizontal: ms(16), paddingBottom: ms(100) },

  card:        { backgroundColor: "#FFFFFF", borderRadius: ms(16), borderLeftWidth: 3, padding: ms(14), marginBottom: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  centerChip:  { flexDirection: "row", alignItems: "center", gap: ms(4), alignSelf: "flex-start", backgroundColor: C.purpleBg, borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3), marginBottom: ms(6) },
  centerChipT: { fontSize: fs(11), color: "#5B2D8E", fontWeight: "600" },
  cardTop:     { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(10) },
  avatar:      { width: ms(48), height: ms(48), borderRadius: ms(24), borderWidth: 1.5, borderColor: C.primary + "40", backgroundColor: C.primary + "1C", justifyContent: "center", alignItems: "center", flexShrink: 0, overflow: "hidden" },
  avatarImg:   { width: ms(48), height: ms(48), borderRadius: ms(24) },
  avatarT:     { fontSize: fs(15), fontWeight: "800", includeFontPadding: false, color: C.primary },
  cardInfo:    { flex: 1, minWidth: 0 },
  studentName: { fontSize: fs(14), fontWeight: "700", color: "#2B1B1F", marginBottom: ms(3) },
  rollT:       { fontSize: fs(11), color: "#8A7F82" },
  courseBadge: { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.primary + "18", borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  enrollBtn:   { width: ms(30), height: ms(30), borderRadius: ms(15), backgroundColor: C.greenBg, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  editBtn:     { width: ms(30), height: ms(30), borderRadius: ms(15), backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  courseT:     { fontSize: fs(10.5), fontWeight: "800", color: C.primary },
  divider:     { height: 1, backgroundColor: "#F0EDE8", marginBottom: ms(10) },
  enrollStatusOn:  { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: C.greenBg, borderRadius: ms(10), paddingHorizontal: ms(10), paddingVertical: ms(6), marginBottom: ms(10) },
  enrollStatusOff: { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: "#FEF0EE", borderRadius: ms(10), paddingHorizontal: ms(10), paddingVertical: ms(6), marginBottom: ms(10) },
  enrollStatusT:   { fontSize: fs(11.5), fontWeight: "700", flex: 1 },
  cardBottom:  { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: ms(8) },
  metaItem:    { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: "#F5F1EE", borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  metaT:       { fontSize: fs(10.5), fontWeight: "700", color: "#8A7F82" },
  genderBadge: { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.purpleBg, borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  genderT:     { fontSize: fs(10.5), fontWeight: "700" },

  empty:      { alignItems: "center", paddingTop: ms(60), gap: ms(8), paddingHorizontal: ms(32) },
  emptyTitle: { fontSize: fs(15), fontWeight: "700", color: "#B0A9AC", textAlign: "center" },
  emptySubT:  { fontSize: fs(12), color: "#C7BAB4", textAlign: "center" },
});

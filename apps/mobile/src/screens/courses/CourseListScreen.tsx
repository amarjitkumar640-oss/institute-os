import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, StatusBar, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import type { RootStackParamList } from "../../navigation/types";
import { ms, fs } from "../../utils/responsive";
import { listCourses, deleteCourse, type CourseItem, type ExamCategory } from "../../api/courses";
import { C } from "../../theme";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = NativeStackScreenProps<RootStackParamList, "CourseList">;

const CATEGORY_META: Record<ExamCategory, { label: string; code: string; color: string }> = {
  ssc:        { label: "SSC",        code: "SSC",  color: C.primary },
  banking:    { label: "Banking",    code: "BANK", color: C.blue },
  railway:    { label: "Railway",    code: "RAIL", color: C.accent },
  foundation: { label: "Foundation", code: "FOUND", color: "#7B3FA0" },
};

type Filter = "All" | "SSC" | "Banking" | "Railway" | "Foundation";
const FILTERS: Filter[] = ["All", "SSC", "Banking", "Railway", "Foundation"];

const FILTER_TO_CATEGORY: Record<Filter, ExamCategory | undefined> = {
  All:        undefined,
  SSC:        "ssc",
  Banking:    "banking",
  Railway:    "railway",
  Foundation: "foundation",
};

// ─── Course Card ─────────────────────────────────────────────────────────────

function CourseCard({
  course,
  deleting,
  onEdit,
  onDelete,
  onFeeStructure,
}: {
  course: CourseItem;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onFeeStructure: () => void;
}) {
  const { showAlert } = useAlert();
  const meta = CATEGORY_META[course.examCategory];
  const isActive = course.activeBatches > 0;
  const locked = course.batchCount > 0;

  function handleEdit() {
    if (locked) {
      showAlert("Cannot Edit Course", `This course has ${course.batchCount} batch${course.batchCount > 1 ? "es" : ""} linked to it. Remove all associated batches before editing.`, "warning");
      return;
    }
    onEdit();
  }

  function handleDelete() {
    if (locked) {
      showAlert("Cannot Delete Course", `This course has ${course.batchCount} batch${course.batchCount > 1 ? "es" : ""} linked to it. Remove all associated batches before deleting.`, "warning");
      return;
    }
    onDelete();
  }

  return (
    <View style={cs.card}>
      {/* Top row */}
      <View style={cs.cardTop}>
        <View style={[cs.iconBox, { backgroundColor: meta.color }]}>
          <Text style={cs.iconCode}>{meta.code}</Text>
        </View>
        <View style={cs.cardInfo}>
          <Text style={cs.courseName} numberOfLines={2}>{course.name}</Text>
          <Text style={cs.categoryT}>{meta.label} · {course.durationMonths} months</Text>
        </View>
        <View style={[cs.statusBadge, { backgroundColor: isActive ? "#E7F7EF" : "#F4F4F4" }]}>
          <View style={[cs.statusDot, { backgroundColor: isActive ? "#1B9C63" : "#B0A9AC" }]} />
          <Text style={[cs.statusT, { color: isActive ? "#1B9C63" : "#8A7F82" }]}>
            {isActive ? "Active" : "No batch"}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={cs.divider} />
      <View style={cs.statsRow}>
        <View style={cs.statItem}>
          <Ionicons name="layers-outline" size={ms(13)} color={meta.color} />
          <Text style={cs.statLabel}>{course.activeBatches}/{course.batchCount} batches</Text>
        </View>
        <View style={cs.statDivider} />
        <View style={cs.statItem}>
          <Ionicons name="wallet-outline" size={ms(13)} color={meta.color} />
          <Text style={cs.statLabel}>₹{course.defaultFee.toLocaleString("en-IN")}</Text>
        </View>
        <View style={cs.statDivider} />
        <View style={cs.statItem}>
          <Ionicons name="time-outline" size={ms(13)} color={meta.color} />
          <Text style={cs.statLabel}>{course.durationMonths} months</Text>
        </View>
      </View>

      {/* Action row */}
      <View style={cs.divider} />
      {locked && (
        <View style={cs.lockHint}>
          <Ionicons name="lock-closed-outline" size={ms(11)} color="#B0A9AC" />
          <Text style={cs.lockHintT}>{course.batchCount} batch{course.batchCount > 1 ? "es" : ""} linked — edit/delete disabled</Text>
        </View>
      )}
      <View style={cs.actionRow}>
        <View style={cs.actionBtns}>
          {/* Fee Structure button */}
          <TouchableOpacity
            style={[cs.actionBtn, cs.feeBtn]}
            onPress={onFeeStructure}
            activeOpacity={0.75}
          >
            <Ionicons name="cash-outline" size={ms(13)} color="#1B9C63" />
            <Text style={[cs.actionBtnT, { color: "#1B9C63" }]}>Fee Structure</Text>
          </TouchableOpacity>

          <View style={cs.actionDivider} />

          {/* Edit button */}
          <TouchableOpacity
            style={[cs.actionBtn, cs.editBtn, locked && cs.actionBtnLocked]}
            onPress={handleEdit}
            activeOpacity={locked ? 0.6 : 0.75}
          >
            <Ionicons
              name="pencil-outline"
              size={ms(13)}
              color={locked ? "#B0A9AC" : "#2563A8"}
            />
            <Text style={[cs.actionBtnT, { color: locked ? "#B0A9AC" : "#2563A8" }]}>Edit</Text>
          </TouchableOpacity>

          <View style={cs.actionDivider} />

          {/* Delete button */}
          <TouchableOpacity
            style={[cs.actionBtn, cs.deleteBtn, locked && cs.actionBtnLocked]}
            onPress={handleDelete}
            activeOpacity={locked ? 0.6 : 0.75}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#C0392B" />
            ) : (
              <>
                <Ionicons
                  name="trash-outline"
                  size={ms(13)}
                  color={locked ? "#B0A9AC" : "#C0392B"}
                />
                <Text style={[cs.actionBtnT, { color: locked ? "#B0A9AC" : "#C0392B" }]}>Delete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function CourseEmpty({ search }: { search: string }) {
  return (
    <EmptyState
      scene="courses"
      color="#2CA6A4"
      title={search ? "No courses match your search" : "No courses yet"}
      subtitle={search ? "Try a different keyword" : "Create your first course to get started"}
    />
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function CourseListScreen({ navigation }: Props) {
  const nav = useNavigation<Nav>();
  const { showAlert, showConfirm } = useAlert();
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCourses = useCallback(async (q: string, f: Filter, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await listCourses({
        search: q || undefined,
        examCategory: FILTER_TO_CATEGORY[f],
        limit: 100,
      });
      setCourses(result.data);
      setTotal(result.total);
    } catch {
      setError("Failed to load courses. Pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCourses(search, filter, true);
  }, [search, filter, fetchCourses]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCourses(search, filter), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, filter, fetchCourses]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) { isFirstFocus.current = false; return; }
      fetchCourses(search, filter, true);
    }, [search, filter, fetchCourses])
  );

  useRefetchOnReconnect(() => fetchCourses(search, filter, true));

  // ── Delete handler ─────────────────────────────────────────────────────────
  function confirmDelete(course: CourseItem) {
    showConfirm(
      "Delete Course?",
      `"${course.name}" will be permanently deleted. This cannot be undone.`,
      () => handleDelete(course),
      { confirmLabel: "Delete", destructive: true },
    );
  }

  async function handleDelete(course: CourseItem) {
    setDeletingId(course.id);
    try {
      const result = await deleteCourse(course.id);
      if (!result.ok) {
        if ("hasData" in result) {
          showAlert("Cannot Delete", result.message, "warning");
        } else if ("notFound" in result) {
          showAlert("Not Found", "This course was already deleted.", "info");
        }
        return;
      }
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
      setTotal((prev) => prev - 1);
    } catch {
      showAlert("Error", "Network error — could not delete course. Please try again.", "error");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalBatches = courses.reduce((s, c) => s + c.batchCount, 0);
  const activeBatches = courses.reduce((s, c) => s + c.activeBatches, 0);
  const activeCount = courses.filter((c) => c.activeBatches > 0).length;

  // ── List header (banner + search + filter chips) ───────────────────────────
  const ListHeader = (
    <View>
      <View style={cs.banner}>
        <View style={cs.bannerItem}>
          <Text style={cs.bannerNum}>{activeCount}</Text>
          <Text style={cs.bannerLbl}>Active</Text>
        </View>
        <View style={cs.bannerDiv} />
        <View style={cs.bannerItem}>
          <Text style={cs.bannerNum}>{totalBatches}</Text>
          <Text style={cs.bannerLbl}>Batches</Text>
        </View>
        <View style={cs.bannerDiv} />
        <View style={cs.bannerItem}>
          <Text style={cs.bannerNum}>{activeBatches}</Text>
          <Text style={cs.bannerLbl}>Running</Text>
        </View>
      </View>

      <View style={cs.searchWrap}>
        <View style={cs.searchRow}>
          <Ionicons name="search-outline" size={ms(16)} color={C.muted} />
          <TextInput
            style={cs.searchInput}
            placeholder="Search courses…"
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
          <TouchableOpacity key={f} style={[cs.chip, filter === f && cs.chipOn]} onPress={() => setFilter(f)}>
            <Text style={[cs.chipT, filter === f && cs.chipTOn]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!loading && !error && (
        <Text style={cs.resultT}>Showing {courses.length} of {total} courses</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={cs.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader
        title="Courses"
        count={total}
        countLabel="courses"
        onBack={() => navigation.goBack()}
      />
      <View style={cs.content}>
        <FlatList
          data={loading || !!error ? [] : courses}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CourseCard
              course={item}
              deleting={deletingId === item.id}
              onEdit={() => nav.navigate("EditCourse", { course: item })}
              onDelete={() => confirmDelete(item)}
              onFeeStructure={() => nav.navigate("FeeStructure", {
                courseId:   item.id,
                courseName: item.name,
                defaultFee: item.defaultFee,
              })}
            />
          )}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={cs.listContent}
          showsVerticalScrollIndicator={false}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          ListEmptyComponent={!loading && !error ? <CourseEmpty search={search} /> : null}
        />

        {/* Centered loader overlay */}
        {loading && (
          <View style={cs.loaderOverlay}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        )}

        {!!error && (
          <View style={cs.loaderOverlay}>
            <ListErrorState title="Failed to load courses" onRetry={() => fetchCourses(search, filter)} />
          </View>
        )}

        <TouchableOpacity
          style={cs.fab}
          onPress={() => nav.navigate("CreateCourse")}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={ms(26)} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#8B1E3F" },
  content: { flex: 1, backgroundColor: "#FFFBF0" },
  banner: { flexDirection: "row", backgroundColor: "#FFFFFF", marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(10), paddingHorizontal: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  bannerItem: { flex: 1, alignItems: "center" },
  bannerNum: { fontSize: fs(18), fontWeight: "800", color: "#8B1E3F" },
  bannerLbl: { fontSize: fs(10), color: "#8A7F82", fontWeight: "600", marginTop: ms(1) },
  bannerDiv: { width: 1, backgroundColor: "#F0EDE8", marginHorizontal: ms(6) },
  searchWrap: { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8) },
  searchInput: { flex: 1, fontSize: fs(13.5), color: "#2B1B1F", padding: 0, includeFontPadding: false },
  filterScroll: { height: ms(38), flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  chip: { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EDE8E3", marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: "#8B1E3F", borderColor: "#8B1E3F" },
  chipT: { fontSize: fs(12), fontWeight: "600", color: "#8A7F82", includeFontPadding: false, lineHeight: fs(16) },
  chipTOn: { color: "#FFFFFF" },
  resultT: { paddingHorizontal: ms(16), paddingBottom: ms(4), fontSize: fs(11.5), color: "#8A7F82" },
  listContent: { paddingBottom: ms(96) },
  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", gap: ms(12), backgroundColor: "rgba(255,251,240,0.92)" },

  fab: {
    position: "absolute", bottom: ms(24), right: ms(20),
    width: ms(56), height: ms(56), borderRadius: ms(28),
    backgroundColor: "#8B1E3F",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#8B1E3F", shadowOffset: { width: 0, height: ms(6) },
    shadowOpacity: 0.45, shadowRadius: ms(12), elevation: 10,
  },

  // Card
  card: { backgroundColor: "#FFFFFF", borderRadius: ms(16), padding: ms(14), marginHorizontal: ms(16), marginBottom: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: ms(10), marginBottom: ms(10) },
  iconBox: { width: ms(46), height: ms(46), borderRadius: ms(12), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  iconCode: { fontSize: fs(10), fontWeight: "800", color: "#fff", letterSpacing: 0.5, includeFontPadding: false },
  cardInfo: { flex: 1, minWidth: 0 },
  courseName: { fontSize: fs(14), fontWeight: "700", color: "#2B1B1F", marginBottom: ms(3) },
  categoryT: { fontSize: fs(11), color: "#8A7F82" },
  statusBadge: { flexDirection: "row", alignItems: "center", borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(4), gap: ms(4), flexShrink: 0 },
  statusDot: { width: ms(6), height: ms(6), borderRadius: ms(3) },
  statusT: { fontSize: fs(10.5), fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#F0EDE8", marginBottom: ms(10) },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: ms(10) },
  statItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(4) },
  statLabel: { fontSize: fs(11), color: "#2B1B1F", fontWeight: "600" },
  statDivider: { width: 1, height: ms(16), backgroundColor: "#F0EDE8" },

  // Action row
  lockHint:   { flexDirection: "row", alignItems: "center", gap: ms(5), paddingHorizontal: ms(2), paddingBottom: ms(8) },
  lockHintT:  { fontSize: fs(10.5), color: "#B0A9AC", fontWeight: "600" },
  actionRow:  { flexDirection: "row", alignItems: "center" },
  actionBtns: { flexDirection: "row", alignItems: "center", flex: 1 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingHorizontal: ms(8), paddingVertical: ms(7), borderRadius: ms(8) },
  feeBtn:   { backgroundColor: "#E7F7EF" },
  editBtn:  { backgroundColor: "#EEF3FB" },
  deleteBtn:{ backgroundColor: "#FEF0EE" },
  actionBtnLocked: { backgroundColor: "#F5F5F5", opacity: 0.7 },
  actionBtnT: { fontSize: fs(12), fontWeight: "700" },
  actionDivider: { width: ms(8) },

  // Empty / error
  empty: { alignItems: "center", paddingTop: ms(60), paddingHorizontal: ms(16), gap: ms(12) },
  emptyT: { fontSize: fs(14), color: "#B0A9AC", textAlign: "center" },
});

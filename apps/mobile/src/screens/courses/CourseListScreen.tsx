import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator, RefreshControl,
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
import { listCourses, deleteCourse, type CourseItem } from "../../api/courses";
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { AVATAR_SIZE, AVATAR_RADIUS, getAvatarFill } from "../../components/ui/avatarStyle";
import { T } from "../../components/ui/typography";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = NativeStackScreenProps<RootStackParamList, "CourseList">;

const GENERAL_META = { label: "General", code: "ALL", color: C.muted };

function courseMeta(course: CourseItem): { label: string; code: string; color: string } {
  if (course.examCategories.length === 0) return GENERAL_META;
  const [first, ...rest] = course.examCategories;
  return {
    label: rest.length ? `${first.label} +${rest.length}` : first.label,
    code:  first.key.slice(0, 4).toUpperCase(),
    color: first.color,
  };
}

type Filter = "All" | string; // "All" or an ExamCategoryItem id

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
  const cs = useThemedStyles(makeCsStyles);
  const meta = courseMeta(course);
  const fill = getAvatarFill(meta.color);
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
        <View style={[cs.iconBox, { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor }]}>
          <Text style={[cs.iconCode, { color: fill.color }]}>{meta.code}</Text>
        </View>
        <View style={cs.cardInfo}>
          <Text style={cs.courseName} numberOfLines={2}>{course.name}</Text>
          <View style={cs.categoryRow}>
            <Text style={cs.categoryT}>{meta.label} · {course.durationMonths} months</Text>
            <View style={[cs.statusBadge, { backgroundColor: isActive ? C.greenBg : C.inputBg }]}>
              <View style={[cs.statusDot, { backgroundColor: isActive ? C.green : C.placeholder }]} />
              <Text style={[cs.statusT, { color: isActive ? C.green : C.muted }]}>
                {isActive ? "Active" : "No batch"}
              </Text>
            </View>
          </View>
        </View>
        <View style={cs.topActions}>
          <TouchableOpacity
            style={[cs.iconActionBtn, cs.editBtn, locked && cs.actionBtnLocked]}
            onPress={handleEdit}
            activeOpacity={locked ? 0.6 : 0.75}
          >
            <Ionicons name="pencil-outline" size={ms(15)} color={locked ? C.placeholder : C.blue} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[cs.iconActionBtn, cs.deleteBtn, locked && cs.actionBtnLocked]}
            onPress={handleDelete}
            activeOpacity={locked ? 0.6 : 0.75}
            disabled={deleting}
          >
            {deleting
              ? <ActivityIndicator size="small" color={C.red} />
              : <Ionicons name="trash-outline" size={ms(15)} color={locked ? C.placeholder : C.red} />}
          </TouchableOpacity>
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
          <Ionicons name={course.discountAmount > 0 ? "pricetag-outline" : "wallet-outline"} size={ms(13)} color={course.discountAmount > 0 ? C.orange : meta.color} />
          <Text style={cs.statLabel}>₹{(course.defaultFee - course.discountAmount).toLocaleString("en-IN")}</Text>
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
          <Ionicons name="lock-closed-outline" size={ms(11)} color={C.placeholder} />
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
            <Ionicons name="cash-outline" size={ms(13)} color={C.green} />
            <Text style={[cs.actionBtnT, { color: C.green }]}>Fee Structure</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function CourseEmpty({ search }: { search: string }) {
  const colors = useThemeColors();
  return (
    <EmptyState
      scene="courses"
      color={colors.accent}
      title={search ? "No courses match your search" : "No courses yet"}
      subtitle={search ? "Try a different keyword" : "Create your first course to get started"}
    />
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function CourseListScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
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
  const [categories, setCategories] = useState<ExamCategoryItem[]>([]);

  useEffect(() => {
    listExamCategories().then(setCategories).catch(() => {});
  }, []);

  const fetchCourses = useCallback(async (q: string, f: Filter, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await listCourses({
        search: q || undefined,
        examCategoryId: f === "All" ? undefined : f,
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
        <TouchableOpacity style={[cs.chip, filter === "All" && cs.chipOn]} onPress={() => setFilter("All")}>
          <Text style={[cs.chipT, filter === "All" && cs.chipTOn]}>All</Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity key={cat.id} style={[cs.chip, filter === cat.id && cs.chipOn]} onPress={() => setFilter(cat.id)}>
            <Text style={[cs.chipT, filter === cat.id && cs.chipTOn]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

    </View>
  );

  return (
    <SafeAreaView style={cs.safe} edges={["bottom"]}>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          ListEmptyComponent={!loading && !error ? <CourseEmpty search={search} /> : null}
        />

        {/* Centered loader overlay */}
        {loading && (
          <View style={cs.loaderOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
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

const makeCsStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, backgroundColor: colors.screenBg },
  banner: { flexDirection: "row", backgroundColor: C.card, marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(10), paddingHorizontal: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  bannerItem: { flex: 1, alignItems: "center" },
  bannerNum: { ...T.cardTitle, color: colors.primary },
  bannerLbl: { ...T.caption, color: C.muted, marginTop: ms(1) },
  bannerDiv: { width: 1, backgroundColor: C.border, marginHorizontal: ms(6) },
  searchWrap: { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8) },
  searchInput: { flex: 1, ...T.body, color: C.text, padding: 0, includeFontPadding: false },
  filterScroll: { height: ms(38), flexGrow: 0, flexShrink: 0, marginBottom: ms(12) },
  filterRow: { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  chip: { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipT: { ...T.chipText, color: C.muted, includeFontPadding: false },
  chipTOn: { color: "#FFFFFF" },
  listContent: { paddingBottom: ms(96) },
  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", gap: ms(12), backgroundColor: colors.screenBg },

  fab: {
    position: "absolute", bottom: ms(24), right: ms(20),
    width: ms(56), height: ms(56), borderRadius: ms(28),
    backgroundColor: colors.primary,
    justifyContent: "center", alignItems: "center",
    shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) },
    shadowOpacity: 0.45, shadowRadius: ms(12), elevation: 10,
  },

  // Card
  card: { backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginHorizontal: ms(16), marginBottom: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: ms(10), marginBottom: ms(10) },
  iconBox: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  iconCode: { ...T.badgeText, letterSpacing: 0.5, includeFontPadding: false },
  cardInfo: { flex: 1, minWidth: 0 },
  courseName: { ...T.listItemTitle, color: C.text, marginBottom: ms(3) },
  categoryRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: ms(6) },
  categoryT: { ...T.caption, color: C.muted, flexShrink: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(4), gap: ms(4), flexShrink: 0 },
  statusDot: { width: ms(6), height: ms(6), borderRadius: ms(3) },
  statusT: { ...T.badgeText },
  topActions: { flexDirection: "row", alignItems: "center", gap: ms(6), flexShrink: 0 },
  iconActionBtn: { width: ms(30), height: ms(30), borderRadius: ms(9), justifyContent: "center", alignItems: "center" },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(10) },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: ms(10) },
  statItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(4) },
  statLabel: { ...T.caption, color: C.text },
  statDivider: { width: 1, height: ms(16), backgroundColor: C.border },

  // Action row
  lockHint:   { flexDirection: "row", alignItems: "center", gap: ms(5), paddingHorizontal: ms(2), paddingBottom: ms(8) },
  lockHintT:  { ...T.caption, color: C.placeholder },
  actionRow:  { flexDirection: "row", alignItems: "center" },
  actionBtns: { flexDirection: "row", alignItems: "center", flex: 1 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingHorizontal: ms(8), paddingVertical: ms(7), borderRadius: ms(8) },
  feeBtn:   { backgroundColor: C.greenBg },
  editBtn:  { backgroundColor: "#EEF3FB" },
  deleteBtn:{ backgroundColor: "#FEF0EE" },
  actionBtnLocked: { backgroundColor: C.inputBg, opacity: 0.7 },
  actionBtnT: { ...T.chipText },

  // Empty / error
  empty: { alignItems: "center", paddingTop: ms(60), paddingHorizontal: ms(16), gap: ms(12) },
  emptyT: { ...T.body, color: C.placeholder, textAlign: "center" },
});

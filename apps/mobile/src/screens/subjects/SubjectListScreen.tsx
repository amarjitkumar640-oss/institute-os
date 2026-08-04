import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState as UIEmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import type { RootStackParamList } from "../../navigation/types";
import { ms, fs } from "../../utils/responsive";
import {
  listSubjects, deleteSubject,
  type SubjectItem,
} from "../../api/subjects";
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Nav  = NativeStackNavigationProp<RootStackParamList>;
type Props = NativeStackScreenProps<RootStackParamList, "SubjectList">;

// ── Constants ──────────────────────────────────────────────────────────────────

function isShared(cs: ExamCategoryItem[], totalCats: number): boolean {
  return cs.length === 0 || (totalCats > 0 && cs.length === totalCats);
}
function catColor(cs: ExamCategoryItem[], totalCats: number): string {
  return isShared(cs, totalCats) ? C.orange : (cs[0]?.color ?? C.orange);
}
function catLabel(cs: ExamCategoryItem[], totalCats: number): string {
  if (isShared(cs, totalCats)) return "Shared";
  return cs.length === 1 ? cs[0].label : `${cs[0].label} +${cs.length - 1}`;
}

// ── Filter chips ──────────────────────────────────────────────────────────────

type Filter = "all" | "shared" | string; // "all", "shared", or an ExamCategoryItem id

// ── Subject card ──────────────────────────────────────────────────────────────

function SubjectCard({
  subject, totalCats, onEdit, onDelete, deleting,
}: {
  subject: SubjectItem;
  totalCats: number;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const color  = catColor(subject.examCategories, totalCats);
  const locked = subject.facultyCount > 0;

  return (
    <View style={sc.card}>
      {/* Category icon */}
      <View style={[sc.iconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name="book-outline" size={ms(19)} color={color} />
      </View>

      {/* Name + meta */}
      <View style={sc.body}>
        <Text style={sc.name} numberOfLines={2}>{subject.name}</Text>
        <View style={sc.metaRow}>
          <View style={[sc.catDot, { backgroundColor: color }]} />
          <Text style={[sc.catT, { color }]}>{catLabel(subject.examCategories, totalCats)}</Text>
          {locked && (
            <>
              <Text style={sc.metaSep}>·</Text>
              <Ionicons name="people-outline" size={ms(11)} color={C.muted} />
              <Text style={sc.metaT}>{subject.facultyCount} faculty</Text>
            </>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={sc.actions}>
        <TouchableOpacity
          style={sc.iconBtn}
          onPress={onEdit}
          activeOpacity={0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="pencil-outline" size={ms(16)} color={C.blue} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[sc.iconBtn, sc.delIconBtn, locked && sc.iconBtnDisabled]}
          onPress={locked ? undefined : onDelete}
          activeOpacity={locked ? 1 : 0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={locked ? C.placeholder : C.red} />
          ) : (
            <Ionicons
              name={locked ? "lock-closed-outline" : "trash-outline"}
              size={ms(16)}
              color={locked ? C.placeholder : C.red}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  card:         { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: ms(16), marginHorizontal: ms(16), marginBottom: ms(10), padding: ms(12), gap: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: ms(3) }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2 },
  iconWrap:     { width: ms(42), height: ms(42), borderRadius: ms(13), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  body:         { flex: 1, gap: ms(4) },
  name:         { fontSize: fs(14.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text, lineHeight: fs(19) },
  metaRow:      { flexDirection: "row", alignItems: "center", gap: ms(5) },
  catDot:       { width: ms(5), height: ms(5), borderRadius: ms(2.5) },
  catT:         { fontSize: fs(11), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
  metaSep:      { fontSize: fs(11), color: C.placeholder },
  metaT:        { fontSize: fs(11), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  actions:      { flexDirection: "row", gap: ms(6), flexShrink: 0 },
  iconBtn:      { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center", backgroundColor: C.blue + "14", borderWidth: 1, borderColor: C.blue + "30" },
  delIconBtn:   { backgroundColor: C.red + "0F", borderColor: C.red + "30" },
  iconBtnDisabled: { backgroundColor: C.inputBg, borderColor: C.border },
});

// ── Empty state ────────────────────────────────────────────────────────────────

function SubjectEmpty({ search, filter, filterLabel }: { search: string; filter: Filter; filterLabel: string }) {
  const title = search
    ? `No subjects match "${search}"`
    : filter !== "all"
      ? `No ${filterLabel} subjects yet`
      : "No subjects yet";
  return (
    <UIEmptyState
      scene="subjects"
      color={C.purple}
      title={title}
      subtitle={search ? "Try a different keyword or category" : "Add subjects to your curriculum"}
    />
  );
}

// ── Banner stats ───────────────────────────────────────────────────────────────

function Banner({ subjects, categories }: { subjects: SubjectItem[]; categories: ExamCategoryItem[] }) {
  const colors = useThemeColors();
  const totalCats = categories.length;
  const total  = subjects.length;
  const shared = subjects.filter((s) => isShared(s.examCategories, totalCats)).length;
  const catStats = categories.map((c) => ({
    id:    c.id,
    label: c.label,
    color: c.color,
    count: subjects.filter((s) => s.examCategories.some((ec) => ec.id === c.id)).length,
  }));

  return (
    <View style={bn.wrap}>
      <BannerStat label="Total"  value={total}  color={colors.primary} />
      <View style={bn.div} />
      <BannerStat label="Shared" value={shared} color={C.orange} />
      {catStats.map((c) => (
        <React.Fragment key={c.id}>
          <View style={bn.div} />
          <BannerStat label={c.label} value={c.count} color={c.color} />
        </React.Fragment>
      ))}
    </View>
  );
}

function BannerStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={bn.stat}>
      <Text style={[bn.val, { color }]}>{value}</Text>
      <Text style={bn.lbl}>{label}</Text>
    </View>
  );
}

const bn = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(10), paddingHorizontal: ms(8), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  stat: { flex: 1, alignItems: "center" },
  val:  { fontSize: fs(18), fontFamily: "Inter_800ExtraBold", fontWeight: "800" },
  lbl:  { fontSize: fs(10), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600", marginTop: ms(2) },
  div:  { width: 1, backgroundColor: C.border },
});

// ── Screen ─────────────────────────────────────────────────────────────────────

export function SubjectListScreen(_: Props) {
  const colors = useThemeColors();
  const ls = useThemedStyles(makeLsStyles);
  const nav = useNavigation<Nav>();
  const { showAlert, showConfirm } = useAlert();

  const [subjects, setSubjects]   = useState<SubjectItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState<Filter>("all");
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [categories, setCategories] = useState<ExamCategoryItem[]>([]);

  useEffect(() => {
    listExamCategories().then(setCategories).catch(() => {});
  }, []);

  const FILTERS = useMemo(() => [
    { key: "all" as Filter,    label: "All",    color: colors.primary },
    { key: "shared" as Filter, label: "Shared", color: C.orange },
    ...categories.map((c) => ({ key: c.id as Filter, label: c.label, color: c.color })),
  ], [categories, colors.primary]);

  const isFirstFocus = useRef(true);

  async function fetchSubjects(silent = false) {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const data = await listSubjects();
      setSubjects(data);
      setError(null);
    } catch {
      if (!silent) setError("Failed to load subjects. Please check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchSubjects(); }, []);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) { isFirstFocus.current = false; return; }
      fetchSubjects(true);
    }, [])
  );

  useRefetchOnReconnect(() => fetchSubjects(true));

  async function handleDelete(subject: SubjectItem) {
    showConfirm(
      "Delete Subject",
      `Delete "${subject.name}"? This cannot be undone.`,
      async () => {
        setDeleting(subject.id);
        try {
          const result = await deleteSubject(subject.id);
          if (result.ok) {
            setSubjects((prev) => prev.filter((s) => s.id !== subject.id));
          } else if ("hasData" in result) {
            showAlert("Cannot Delete", result.message, "warning");
          } else {
            showAlert("Not Found", "This subject may have already been deleted.", "info");
            fetchSubjects(true);
          }
        } catch {
          showAlert("Error", "Network error — could not delete subject. Please try again.", "error");
        } finally {
          setDeleting(null);
        }
      },
      { confirmLabel: "Delete", destructive: true },
    );
  }

  // Client-side filter + search on already-fetched list
  const totalCats = categories.length;
  const visible = subjects.filter((s) => {
    const matchFilter =
      filter === "all" ||
      (filter === "shared" && isShared(s.examCategories, totalCats)) ||
      s.examCategories.some((ec) => ec.id === filter);
    const matchSearch = search.trim() === "" ||
      s.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchFilter && matchSearch;
  });

  const ListHeader = (
    <View>
      {/* Banner */}
      {!loading && !error && subjects.length > 0 && (
        <Banner subjects={subjects} categories={categories} />
      )}

      {/* Search */}
      <View style={ls.searchWrap}>
        <View style={ls.searchRow}>
          <Ionicons name="search-outline" size={ms(16)} color={C.placeholder} />
          <TextInput
            style={ls.searchInput}
            placeholder="Search subjects…"
            placeholderTextColor={C.placeholder}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={ms(16)} color={C.placeholder} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={ls.filterScroll}
        contentContainerStyle={ls.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[ls.chip, active && { backgroundColor: f.color, borderColor: f.color }]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.75}
            >
              <Text style={[ls.chipT, active && ls.chipTActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={ls.safe} edges={["bottom"]}>
      <ScreenHeader
        title="Subjects"
        count={!loading && !error ? subjects.length : undefined}
        countLabel="subjects"
        onBack={() => nav.goBack()}
      />

      <View style={ls.root}>
        <FlatList
          data={loading || !!error ? [] : visible}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <SubjectCard
              subject={item}
              totalCats={totalCats}
              onEdit={() => nav.navigate("EditSubject", { subject: item })}
              onDelete={() => handleDelete(item)}
              deleting={deleting === item.id}
            />
          )}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            !loading && !error ? (
              <SubjectEmpty search={search} filter={filter} filterLabel={FILTERS.find((f) => f.key === filter)?.label ?? ""} />
            ) : null
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSubjects(true); }} colors={[colors.primary]} tintColor={colors.primary} />}
          contentContainerStyle={ls.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* Loading overlay */}
        {loading && (
          <View style={ls.overlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {!!error && (
          <View style={ls.overlay}>
            <ListErrorState title="Failed to load subjects" onRetry={() => fetchSubjects()} />
          </View>
        )}

        {/* FAB */}
        <TouchableOpacity
          style={ls.fab}
          onPress={() => nav.navigate("CreateSubject")}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={ms(26)} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeLsStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.screenBg },
  root:        { flex: 1, backgroundColor: colors.screenBg },
  listContent: { paddingBottom: ms(100) },

  searchWrap:  { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow:   { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), gap: ms(8), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2 },
  searchInput: { flex: 1, fontSize: fs(13.5), color: C.text, padding: 0, includeFontPadding: false },

  filterScroll: { height: ms(38), flexGrow: 0, flexShrink: 0, marginBottom: ms(12) },
  filterRow:    { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  chip:        { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipT:       { fontSize: fs(12), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.muted, includeFontPadding: false, lineHeight: fs(16) },
  chipTActive: { color: "#FFFFFF" },

  overlay:     { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", gap: ms(16), backgroundColor: colors.bg + "EE" },

  fab:         { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },
});

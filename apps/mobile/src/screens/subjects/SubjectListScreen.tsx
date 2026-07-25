import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, StatusBar, ActivityIndicator, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Nav  = NativeStackNavigationProp<RootStackParamList>;
type Props = NativeStackScreenProps<RootStackParamList, "SubjectList">;

// ── Constants ──────────────────────────────────────────────────────────────────

function catColor(c: ExamCategoryItem | null): string {
  return c?.color ?? "#E8752C";
}
function catLabel(c: ExamCategoryItem | null): string {
  return c?.label ?? "Shared";
}

// ── Filter chips ──────────────────────────────────────────────────────────────

type Filter = "all" | "shared" | string; // "all", "shared", or an ExamCategoryItem id

// ── Subject card ──────────────────────────────────────────────────────────────

function SubjectCard({
  subject, onEdit, onDelete, deleting,
}: {
  subject: SubjectItem;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const color  = catColor(subject.examCategory);
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
          <Text style={[sc.catT, { color }]}>{catLabel(subject.examCategory)}</Text>
          {locked && (
            <>
              <Text style={sc.metaSep}>·</Text>
              <Ionicons name="people-outline" size={ms(11)} color="#8A7F82" />
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
          <Ionicons name="pencil-outline" size={ms(16)} color="#2563A8" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[sc.iconBtn, sc.delIconBtn, locked && sc.iconBtnDisabled]}
          onPress={locked ? undefined : onDelete}
          activeOpacity={locked ? 1 : 0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={locked ? "#C7BAB4" : "#C0392B"} />
          ) : (
            <Ionicons
              name={locked ? "lock-closed-outline" : "trash-outline"}
              size={ms(16)}
              color={locked ? "#C7BAB4" : "#C0392B"}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  card:         { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: ms(16), marginHorizontal: ms(16), marginBottom: ms(10), padding: ms(12), gap: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(3) }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2 },
  iconWrap:     { width: ms(42), height: ms(42), borderRadius: ms(13), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  body:         { flex: 1, gap: ms(4) },
  name:         { fontSize: fs(14.5), fontWeight: "700", color: "#2B1B1F", lineHeight: fs(19) },
  metaRow:      { flexDirection: "row", alignItems: "center", gap: ms(5) },
  catDot:       { width: ms(5), height: ms(5), borderRadius: ms(2.5) },
  catT:         { fontSize: fs(11), fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
  metaSep:      { fontSize: fs(11), color: "#C7BAB4" },
  metaT:        { fontSize: fs(11), color: "#8A7F82", fontWeight: "600" },
  actions:      { flexDirection: "row", gap: ms(6), flexShrink: 0 },
  iconBtn:      { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center", backgroundColor: "#EFF4FF", borderWidth: 1, borderColor: "#BFD0F5" },
  delIconBtn:   { backgroundColor: "#FEF0EE", borderColor: "#F5C6C0" },
  iconBtnDisabled: { backgroundColor: "#F7F4F2", borderColor: "#E8E0DC" },
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
      color="#5B2D8E"
      title={title}
      subtitle={search ? "Try a different keyword or category" : "Add subjects to your curriculum"}
    />
  );
}

// ── Banner stats ───────────────────────────────────────────────────────────────

function Banner({ subjects }: { subjects: SubjectItem[] }) {
  const total   = subjects.length;
  const shared  = subjects.filter((s) => s.examCategory === null).length;
  const ssc     = subjects.filter((s) => s.examCategory?.key === "ssc").length;
  const banking = subjects.filter((s) => s.examCategory?.key === "banking").length;
  const railway = subjects.filter((s) => s.examCategory?.key === "railway").length;

  return (
    <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={bn.wrap}>
      <BannerStat label="Total" value={total} color="#FFD180" />
      <View style={bn.div} />
      <BannerStat label="Shared" value={shared} color="#FFB74D" />
      <View style={bn.div} />
      <BannerStat label="SSC" value={ssc} color="#EF9A9A" />
      <View style={bn.div} />
      <BannerStat label="Banking" value={banking} color="#90CAF9" />
      <View style={bn.div} />
      <BannerStat label="Railway" value={railway} color="#80CBC4" />
    </LinearGradient>
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
  wrap: { marginHorizontal: ms(16), marginBottom: ms(12), borderRadius: ms(16), paddingVertical: ms(14), paddingHorizontal: ms(8), flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, alignItems: "center" },
  val:  { fontSize: fs(18), fontWeight: "800" },
  lbl:  { fontSize: fs(10), color: "rgba(255,255,255,0.7)", fontWeight: "600", marginTop: ms(2) },
  div:  { width: 1, height: ms(28), backgroundColor: "rgba(255,255,255,0.2)" },
});

// ── Screen ─────────────────────────────────────────────────────────────────────

export function SubjectListScreen(_: Props) {
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
    { key: "all" as Filter,    label: "All",    color: C.primary },
    { key: "shared" as Filter, label: "Shared", color: "#E8752C" },
    ...categories.map((c) => ({ key: c.id as Filter, label: c.label, color: c.color })),
  ], [categories]);

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
  const visible = subjects.filter((s) => {
    const matchFilter =
      filter === "all" ||
      (filter === "shared" && s.examCategory === null) ||
      s.examCategory?.id === filter;
    const matchSearch = search.trim() === "" ||
      s.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchFilter && matchSearch;
  });

  const ListHeader = (
    <View>
      {/* Search */}
      <View style={ls.searchWrap}>
        <View style={ls.searchRow}>
          <Ionicons name="search-outline" size={ms(16)} color="#B0A9AC" />
          <TextInput
            style={ls.searchInput}
            placeholder="Search subjects…"
            placeholderTextColor="#B0A9AC"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={ms(16)} color="#B0A9AC" />
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

      {/* Banner — only when data loaded & no filter search */}
      {!loading && !error && subjects.length > 0 && (
        <Banner subjects={subjects} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={ls.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
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
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchSubjects(true); }}
          contentContainerStyle={ls.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* Loading overlay */}
        {loading && (
          <View style={ls.overlay}>
            <ActivityIndicator size="large" color={C.primary} />
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

const ls = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: "#8B1E3F" },
  root:        { flex: 1, backgroundColor: "#FFFBF0" },
  listContent: { paddingBottom: ms(100) },

  searchWrap:  { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow:   { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), gap: ms(8), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2 },
  searchInput: { flex: 1, fontSize: fs(13.5), color: "#2B1B1F", padding: 0, includeFontPadding: false },

  filterScroll: { height: ms(38), flexGrow: 0, flexShrink: 0 },
  filterRow:    { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  chip:        { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EDE8E3", marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipT:       { fontSize: fs(12), fontWeight: "600", color: "#8A7F82", includeFontPadding: false, lineHeight: fs(16) },
  chipTActive: { color: "#FFFFFF" },

  overlay:     { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", gap: ms(16), backgroundColor: "#FFFBF0" },

  fab:         { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: "#8B1E3F", justifyContent: "center", alignItems: "center", shadowColor: "#8B1E3F", shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },
});

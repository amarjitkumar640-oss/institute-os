import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, StatusBar, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { ListErrorState } from "../../components/ui/ListErrorState";
import type { RootStackParamList } from "../../navigation/types";
import { ms, fs } from "../../utils/responsive";
import {
  listSubjects, deleteSubject,
  type SubjectItem, type ExamCategory,
} from "../../api/subjects";
import { C } from "../../theme";
import { CAT_COLOR, CAT_LABEL } from "../../constants/courseMeta";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Nav  = NativeStackNavigationProp<RootStackParamList>;
type Props = NativeStackScreenProps<RootStackParamList, "SubjectList">;

// ── Constants ──────────────────────────────────────────────────────────────────

function catKey(c: ExamCategory | null): string {
  return c ?? "shared";
}
function catColor(c: ExamCategory | null): string {
  return CAT_COLOR[catKey(c)] ?? "#8A7F82";
}
function catLabel(c: ExamCategory | null): string {
  return CAT_LABEL[catKey(c)] ?? "—";
}

// ── Filter chips ──────────────────────────────────────────────────────────────

type Filter = "all" | "shared" | "ssc" | "banking" | "railway";

const FILTERS: { key: Filter; label: string; color: string }[] = [
  { key: "all",     label: "All",     color: C.primary  },
  { key: "shared",  label: "Shared",  color: "#E8752C"  },
  { key: "ssc",     label: "SSC",     color: "#8B1E3F"  },
  { key: "banking", label: "Banking", color: "#2563A8"  },
  { key: "railway", label: "Railway", color: "#2CA6A4"  },
];

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
      {/* Left accent bar */}
      <View style={[sc.accent, { backgroundColor: color }]} />

      <View style={sc.body}>
        {/* Top row */}
        <View style={sc.topRow}>
          <View style={[sc.catPill, { backgroundColor: color + "18", borderColor: color + "40" }]}>
            <View style={[sc.catDot, { backgroundColor: color }]} />
            <Text style={[sc.catT, { color }]}>{catLabel(subject.examCategory)}</Text>
          </View>
          {locked && (
            <View style={sc.lockedPill}>
              <Ionicons name="people-outline" size={ms(10)} color="#2563A8" />
              <Text style={sc.lockedT}>
                {subject.facultyCount} faculty
              </Text>
            </View>
          )}
        </View>

        {/* Subject name */}
        <Text style={sc.name} numberOfLines={2}>{subject.name}</Text>

        {/* Action row */}
        <View style={sc.actionRow}>
          {locked && (
            <View style={sc.lockHint}>
              <Ionicons name="lock-closed-outline" size={ms(10)} color="#B0A9AC" />
              <Text style={sc.lockHintT}>Unassign faculty before deleting</Text>
            </View>
          )}
          <View style={sc.buttons}>
            <TouchableOpacity
              style={sc.editBtn}
              onPress={onEdit}
              activeOpacity={0.75}
            >
              <Ionicons name="pencil-outline" size={ms(13)} color="#2563A8" />
              <Text style={sc.editT}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sc.delBtn, locked && sc.delBtnDisabled]}
              onPress={locked ? undefined : onDelete}
              activeOpacity={locked ? 1 : 0.75}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={locked ? "#C7BAB4" : "#C0392B"} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={ms(13)} color={locked ? "#C7BAB4" : "#C0392B"} />
                  <Text style={[sc.delT, locked && sc.delTDisabled]}>Delete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  card:         { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: ms(16), marginHorizontal: ms(16), marginBottom: ms(10), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(3) }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, overflow: "hidden" },
  accent:       { width: ms(4) },
  body:         { flex: 1, padding: ms(14), gap: ms(8) },
  topRow:       { flexDirection: "row", alignItems: "center", gap: ms(8) },
  catPill:      { flexDirection: "row", alignItems: "center", gap: ms(5), paddingHorizontal: ms(8), paddingVertical: ms(3), borderRadius: ms(6), borderWidth: 1 },
  catDot:       { width: ms(5), height: ms(5), borderRadius: ms(2.5) },
  catT:         { fontSize: fs(10), fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  lockedPill:   { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(7), paddingVertical: ms(3), borderRadius: ms(6), backgroundColor: "#EFF4FF", borderWidth: 1, borderColor: "#BFD0F5" },
  lockedT:      { fontSize: fs(10), fontWeight: "700", color: "#2563A8" },
  name:         { fontSize: fs(15), fontWeight: "700", color: "#2B1B1F", lineHeight: fs(21) },
  actionRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ms(8) },
  lockHint:     { flexDirection: "row", alignItems: "center", gap: ms(4), flex: 1 },
  lockHintT:    { fontSize: fs(10), color: "#B0A9AC" },
  buttons:      { flexDirection: "row", gap: ms(8), marginLeft: "auto" },
  editBtn:      { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(10), paddingVertical: ms(6), borderRadius: ms(8), backgroundColor: "#EFF4FF", borderWidth: 1, borderColor: "#BFD0F5" },
  editT:        { fontSize: fs(11), fontWeight: "700", color: "#2563A8" },
  delBtn:       { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(10), paddingVertical: ms(6), borderRadius: ms(8), backgroundColor: "#FEF0EE", borderWidth: 1, borderColor: "#F5C6C0" },
  delBtnDisabled: { backgroundColor: "#F7F4F2", borderColor: "#E8E0DC" },
  delT:         { fontSize: fs(11), fontWeight: "700", color: "#C0392B" },
  delTDisabled: { color: "#C7BAB4" },
});

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ search, filter }: { search: string; filter: Filter }) {
  const msg = search
    ? `No subjects match "${search}"`
    : filter !== "all"
      ? `No ${CAT_LABEL[filter] ?? filter} subjects yet`
      : "No subjects yet";
  return (
    <View style={es.wrap}>
      <Ionicons name="book-outline" size={ms(48)} color="#D5CCC8" />
      <Text style={es.t}>{msg}</Text>
    </View>
  );
}
const es = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: ms(48), gap: ms(10) },
  t:    { fontSize: fs(14), color: "#B0A9AC", textAlign: "center" },
});

// ── Banner stats ───────────────────────────────────────────────────────────────

function Banner({ subjects }: { subjects: SubjectItem[] }) {
  const total   = subjects.length;
  const shared  = subjects.filter((s) => s.examCategory === null).length;
  const ssc     = subjects.filter((s) => s.examCategory === "ssc").length;
  const banking = subjects.filter((s) => s.examCategory === "banking").length;
  const railway = subjects.filter((s) => s.examCategory === "railway").length;

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
      (filter === "shared"  && s.examCategory === null) ||
      s.examCategory === filter;
    const matchSearch = search.trim() === "" ||
      s.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchFilter && matchSearch;
  });

  const ListHeader = (
    <View>
      {/* Search */}
      <View style={ls.searchRow}>
        <View style={ls.searchBox}>
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
      <View style={ls.chipRow}>
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
      </View>

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
              <EmptyState search={search} filter={filter} />
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
  listContent: { paddingTop: ms(16), paddingBottom: ms(100) },

  searchRow:   { paddingHorizontal: ms(16), marginBottom: ms(12) },
  searchBox:   { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: ms(14), paddingHorizontal: ms(14), paddingVertical: ms(10), gap: ms(8), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: ms(6), elevation: 2 },
  searchInput: { flex: 1, fontSize: fs(14), color: "#2B1B1F" },

  chipRow:     { flexDirection: "row", paddingHorizontal: ms(16), gap: ms(8), marginBottom: ms(14), flexWrap: "wrap" },
  chip:        { paddingHorizontal: ms(14), paddingVertical: ms(7), borderRadius: ms(20), backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#E0D8D4" },
  chipT:       { fontSize: fs(12), fontWeight: "700", color: "#8A7F82" },
  chipTActive: { color: "#FFFFFF" },

  overlay:     { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", gap: ms(16), backgroundColor: "#FFFBF0" },

  fab:         { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: "#8B1E3F", justifyContent: "center", alignItems: "center", shadowColor: "#8B1E3F", shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },
});

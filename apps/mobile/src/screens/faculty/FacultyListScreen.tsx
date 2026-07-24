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
import {
  listFaculty, deleteFaculty,
  type FacultyItem, type ExamCategory,
} from "../../api/faculty";
import { C } from "../../theme";
import { CAT_COLOR } from "../../constants/courseMeta";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Nav  = NativeStackNavigationProp<RootStackParamList>;
type Props = NativeStackScreenProps<RootStackParamList, "FacultyList">;



type Filter = "All" | "SSC" | "Banking" | "Railway";
const FILTERS: Filter[] = ["All", "SSC", "Banking", "Railway"];
const FILTER_TO_CAT: Record<Filter, ExamCategory | undefined> = {
  All: undefined, SSC: "ssc", Banking: "banking", Railway: "railway",
};

// Palette cycles through 6 distinct colors — adjacent cards always differ
const CARD_PALETTE = [
  "#8B1E3F", // maroon
  "#2CA6A4", // teal
  "#E8752C", // orange
  "#2563A8", // blue
  "#5B2D8E", // purple
  "#1B9C63", // green
];

function cardColor(index: number): string {
  return CARD_PALETTE[index % CARD_PALETTE.length];
}

// Format "YYYY-MM-DD" → "Jun 2022"
function fmtMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

// ─── Faculty Card ─────────────────────────────────────────────────────────────

function FacultyCard({
  faculty, index, deleting, onEdit, onDelete,
}: {
  faculty: FacultyItem;
  index:   number;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color       = cardColor(index);
  const initials    = faculty.fullName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const visibleSubs = faculty.subjects.slice(0, 3);
  const extraCount  = faculty.subjects.length - visibleSubs.length;
  const expYrs      = faculty.experienceYears;

  return (
    <View style={cs.card}>
      {/* Left accent stripe */}
      <View style={[cs.stripe, { backgroundColor: color }]} />

      <View style={cs.cardBody}>

        {/* ── Top: Avatar · Info · Status ── */}
        <View style={cs.topRow}>

          {/* Avatar with ring */}
          <View style={[cs.avatarRing, { borderColor: color + "55" }]}>
            <View style={[cs.avatar, { backgroundColor: color + "18" }]}>
              <Text style={[cs.avatarT, { color }]}>{initials}</Text>
            </View>
          </View>

          {/* Name + meta */}
          <View style={cs.info}>
            <Text style={cs.name} numberOfLines={1}>{faculty.fullName}</Text>
            <View style={cs.metaRow}>
              <View style={[cs.codePill, { borderColor: color + "40" }]}>
                <Text style={[cs.codeT, { color }]}>{faculty.employeeCode}</Text>
              </View>
              <Text style={cs.metaDot}>·</Text>
              <Ionicons name="briefcase-outline" size={ms(10)} color={C.muted} />
              <Text style={cs.metaT}>{expYrs} yr{expYrs !== 1 ? "s" : ""} exp</Text>
            </View>
            <Text style={cs.qualT} numberOfLines={1}>{faculty.qualification}</Text>
          </View>

          {/* Active / Inactive badge */}
          <View style={[cs.statusBadge, {
            backgroundColor: faculty.isActive ? "#E6F7EF" : "#F2F2F2",
          }]}>
            <View style={[cs.statusDot, {
              backgroundColor: faculty.isActive ? C.green : "#B0A9AC",
            }]} />
            <Text style={[cs.statusT, { color: faculty.isActive ? C.green : C.muted }]}>
              {faculty.isActive ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>

        {/* ── Subject chips ── */}
        {faculty.subjects.length > 0 && (
          <View style={cs.subRow}>
            {visibleSubs.map((s) => {
              const sc = s.examCategory ? CAT_COLOR[s.examCategory] : C.orange;
              return (
                <View key={s.id} style={[cs.subChip, { backgroundColor: sc + "14", borderColor: sc + "35" }]}>
                  <View style={[cs.subDot, { backgroundColor: sc }]} />
                  <Text style={[cs.subChipT, { color: sc }]} numberOfLines={1}>{s.name}</Text>
                </View>
              );
            })}
            {extraCount > 0 && (
              <View style={cs.subMore}>
                <Text style={cs.subMoreT}>+{extraCount}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Divider ── */}
        <View style={cs.divider} />

        {/* ── Row 1: Email · Phone ── */}
        <View style={cs.contactRow}>
          <Ionicons name="mail-outline" size={ms(11)} color={C.muted} />
          <Text style={cs.contactT} numberOfLines={1}>{faculty.email}</Text>
          <Text style={cs.contactSep}>·</Text>
          <Ionicons name="call-outline" size={ms(11)} color={C.muted} />
          <Text style={cs.contactPhone}>{faculty.phone}</Text>
        </View>

        {/* ── Row 2: Joined date · Actions ── */}
        <View style={cs.actionRow}>
          <View style={cs.joinedWrap}>
            <Ionicons name="calendar-outline" size={ms(11)} color={C.muted} />
            <Text style={cs.joinedT}>Joined {fmtMonth(faculty.joiningDate)}</Text>
          </View>
          <View style={cs.actionBtns}>
            <TouchableOpacity style={cs.editBtn} onPress={onEdit} activeOpacity={0.75}>
              <Ionicons name="pencil-outline" size={ms(13)} color={C.blue} />
              <Text style={[cs.actionBtnT, { color: C.blue }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={cs.delBtn}
              onPress={onDelete}
              activeOpacity={0.75}
              disabled={deleting}
            >
              {deleting
                ? <ActivityIndicator size="small" color="#C0392B" />
                : <>
                    <Ionicons name="trash-outline" size={ms(13)} color="#C0392B" />
                    <Text style={[cs.actionBtnT, { color: "#C0392B" }]}>Delete</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function FacultyEmpty({ search }: { search: string }) {
  return (
    <EmptyState
      scene="faculty"
      color="#E8752C"
      title={search ? "No faculty match your search" : "No faculty yet"}
      subtitle={search ? "Try a different name or category" : "Add faculty members to get started"}
    />
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function FacultyListScreen({ navigation }: Props) {
  const nav = useNavigation<Nav>();
  const { showAlert, showConfirm } = useAlert();

  const [faculty, setFaculty]         = useState<FacultyItem[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [filter, setFilter]           = useState<Filter>("All");
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  const fetchFaculty = useCallback(async (q: string, f: Filter, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await listFaculty({
        search:       q || undefined,
        examCategory: FILTER_TO_CAT[f],
        limit:        100,
      });
      setFaculty(result.data);
      setTotal(result.total);
    } catch {
      setError("Failed to load faculty. Pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchFaculty(search, filter), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, filter, fetchFaculty]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) { isFirstFocus.current = false; return; }
      fetchFaculty(search, filter, true);
    }, [search, filter, fetchFaculty])
  );

  useRefetchOnReconnect(() => fetchFaculty(search, filter, true));

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFaculty(search, filter, true);
  }, [search, filter, fetchFaculty]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  function confirmDelete(f: FacultyItem) {
    showConfirm(
      "Delete Faculty?",
      `"${f.fullName}" will be permanently removed. This cannot be undone.`,
      () => doDelete(f),
      { confirmLabel: "Delete", destructive: true },
    );
  }

  async function doDelete(f: FacultyItem) {
    setDeletingId(f.id);
    try {
      const result = await deleteFaculty(f.id);
      if (!result.ok) {
        if ("notFound" in result)
          showAlert("Not Found", "This faculty member was already deleted.", "info");
        return;
      }
      setFaculty((prev) => prev.filter((x) => x.id !== f.id));
      setTotal((prev) => prev - 1);
    } catch {
      showAlert("Error", "Could not delete faculty. Please try again.", "error");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Banner stats ───────────────────────────────────────────────────────────
  const activeCount = faculty.filter((f) => f.isActive).length;
  const avgExp      = faculty.length
    ? Math.round(faculty.reduce((s, f) => s + f.experienceYears, 0) / faculty.length)
    : 0;
  const uniqueSubjects = new Set(faculty.flatMap((f) => f.subjects.map((s) => s.id))).size;

  // ── List header ────────────────────────────────────────────────────────────
  const ListHeader = (
    <View>
      {/* Banner */}
      <View style={cs.banner}>
        <View style={cs.bannerItem}>
          <Text style={cs.bannerNum}>{activeCount}</Text>
          <Text style={cs.bannerLbl}>Active</Text>
        </View>
        <View style={cs.bannerDiv} />
        <View style={cs.bannerItem}>
          <Text style={cs.bannerNum}>{total}</Text>
          <Text style={cs.bannerLbl}>Total</Text>
        </View>
        <View style={cs.bannerDiv} />
        <View style={cs.bannerItem}>
          <Text style={cs.bannerNum}>{avgExp}</Text>
          <Text style={cs.bannerLbl}>Avg Exp</Text>
        </View>
        <View style={cs.bannerDiv} />
        <View style={cs.bannerItem}>
          <Text style={cs.bannerNum}>{uniqueSubjects}</Text>
          <Text style={cs.bannerLbl}>Subjects</Text>
        </View>
      </View>

      {/* Search */}
      <View style={cs.searchWrap}>
        <View style={cs.searchRow}>
          <Ionicons name="search-outline" size={ms(16)} color={C.muted} />
          <TextInput
            style={cs.searchInput}
            placeholder="Search name, code, email…"
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

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.filterScroll} contentContainerStyle={cs.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} style={[cs.chip, filter === f && cs.chipOn]} onPress={() => setFilter(f)}>
            <Text style={[cs.chipT, filter === f && cs.chipTOn]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!loading && !error && (
        <Text style={cs.resultT}>Showing {faculty.length} of {total} faculty</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={cs.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader
        title="Faculty"
        count={total}
        countLabel="faculty"
        onBack={() => navigation.goBack()}
      />

      <View style={cs.content}>
        <FlatList
          data={loading || !!error ? [] : faculty}
          keyExtractor={(f) => f.id}
          renderItem={({ item, index }) => (
            <FacultyCard
              faculty={item}
              index={index}
              deleting={deletingId === item.id}
              onEdit={() => nav.navigate("EditFaculty", { faculty: item })}
              onDelete={() => confirmDelete(item)}
            />
          )}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={cs.listContent}
          showsVerticalScrollIndicator={false}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          ListEmptyComponent={!loading && !error ? <FacultyEmpty search={search} /> : null}
        />

        {loading && (
          <View style={cs.overlay}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        )}

        {!!error && (
          <View style={cs.overlay}>
            <ListErrorState title="Failed to load faculty" onRetry={() => fetchFaculty(search, filter)} />
          </View>
        )}

        <TouchableOpacity
          style={cs.fab}
          onPress={() => nav.navigate("CreateFaculty")}
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
  safe:    { flex: 1, backgroundColor: C.primary },
  content: { flex: 1, backgroundColor: C.bg },

  banner:     { flexDirection: "row", backgroundColor: "#FFFFFF", marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(10), paddingHorizontal: ms(8), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  bannerItem: { flex: 1, alignItems: "center" },
  bannerNum:  { fontSize: fs(17), fontWeight: "800", color: C.primary },
  bannerLbl:  { fontSize: fs(9.5), color: C.muted, fontWeight: "600", marginTop: ms(1) },
  bannerDiv:  { width: 1, backgroundColor: "#F0EDE8", marginHorizontal: ms(4) },

  searchWrap:  { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(2) },
  searchRow:   { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8) },
  searchInput: { flex: 1, fontSize: fs(13.5), color: C.text, padding: 0, includeFontPadding: false },

  filterScroll: { height: ms(38), flexGrow: 0, flexShrink: 0 },
  filterRow:    { paddingHorizontal: ms(16), alignItems: "center", flexDirection: "row", height: ms(38) },
  chip:         { paddingHorizontal: ms(12), paddingVertical: ms(5), borderRadius: ms(20), backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EDE8E3", marginRight: ms(8), flexShrink: 0, alignItems: "center", justifyContent: "center" },
  chipOn:       { backgroundColor: C.primary, borderColor: C.primary },
  chipT:        { fontSize: fs(12), fontWeight: "600", color: C.muted, includeFontPadding: false, lineHeight: fs(16) },
  chipTOn:      { color: "#FFFFFF" },

  resultT:    { paddingHorizontal: ms(16), paddingBottom: ms(4), fontSize: fs(11.5), color: C.muted },
  listContent: { paddingBottom: ms(96) },
  overlay:    { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", gap: ms(12), backgroundColor: "rgba(255,251,240,0.92)" },

  fab: {
    position: "absolute", bottom: ms(24), right: ms(20),
    width: ms(56), height: ms(56), borderRadius: ms(28),
    backgroundColor: C.primary,
    justifyContent: "center", alignItems: "center",
    shadowColor: C.primary, shadowOffset: { width: 0, height: ms(6) },
    shadowOpacity: 0.45, shadowRadius: ms(12), elevation: 10,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    flexDirection:   "row",
    backgroundColor: "#FFFFFF",
    borderRadius:    ms(18),
    marginHorizontal: ms(16),
    marginBottom:    ms(12),
    shadowColor:     "#2B1B1F",
    shadowOffset:    { width: 0, height: ms(3) },
    shadowOpacity:   0.09,
    shadowRadius:    ms(10),
    elevation:       3,
    overflow:        "hidden",
  },
  stripe: {
    width:     ms(4),
    alignSelf: "stretch",
    flexShrink: 0,
  },
  cardBody: {
    flex:    1,
    padding: ms(14),
    gap:     ms(10),
  },

  // Top row
  topRow: {
    flexDirection: "row",
    alignItems:    "flex-start",
    gap:           ms(10),
  },
  avatarRing: {
    width:          ms(52),
    height:         ms(52),
    borderRadius:   ms(26),
    borderWidth:    2,
    justifyContent: "center",
    alignItems:     "center",
    flexShrink:     0,
  },
  avatar: {
    width:          ms(46),
    height:         ms(46),
    borderRadius:   ms(23),
    justifyContent: "center",
    alignItems:     "center",
  },
  avatarT: {
    fontSize:          fs(15),
    fontWeight:        "800",
    includeFontPadding: false,
  },
  info: {
    flex:   1,
    minWidth: 0,
    gap:    ms(3),
  },
  name: {
    fontSize:      fs(15),
    fontWeight:    "800",
    color:         C.text,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           ms(5),
    flexWrap:      "wrap",
  },
  codePill: {
    borderWidth:      1,
    borderRadius:     ms(6),
    paddingHorizontal: ms(6),
    paddingVertical:  ms(2),
  },
  codeT: {
    fontSize:   fs(10),
    fontWeight: "700",
  },
  metaDot: {
    fontSize: fs(11),
    color:    "#C7BAB4",
  },
  metaT: {
    fontSize: fs(11),
    color:    C.muted,
    fontWeight: "600",
  },
  qualT: {
    fontSize: fs(11.5),
    color:    C.muted,
  },
  statusBadge: {
    flexDirection:  "row",
    alignItems:     "center",
    borderRadius:   ms(20),
    paddingHorizontal: ms(8),
    paddingVertical: ms(4),
    gap:            ms(4),
    flexShrink:     0,
  },
  statusDot: {
    width:        ms(5),
    height:       ms(5),
    borderRadius: ms(2.5),
  },
  statusT: {
    fontSize:   fs(10),
    fontWeight: "700",
  },

  // Subjects
  subRow: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           ms(6),
  },
  subChip: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              ms(4),
    paddingHorizontal: ms(8),
    paddingVertical:  ms(4),
    borderRadius:     ms(8),
    borderWidth:      1,
  },
  subDot: {
    width:        ms(5),
    height:       ms(5),
    borderRadius: ms(2.5),
    flexShrink:   0,
  },
  subChipT: {
    fontSize:   fs(11),
    fontWeight: "700",
  },
  subMore: {
    paddingHorizontal: ms(8),
    paddingVertical:  ms(4),
    borderRadius:     ms(8),
    backgroundColor:  "#F0EDE8",
    justifyContent:   "center",
  },
  subMoreT: {
    fontSize:   fs(11),
    fontWeight: "600",
    color:      C.muted,
  },

  // Divider
  divider: {
    height:          1,
    backgroundColor: "#F0EDE8",
  },

  // Contact row (email · phone)
  contactRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           ms(5),
  },
  contactT: {
    fontSize:   fs(11),
    color:      C.muted,
    flex:       1,
    minWidth:   0,
  },
  contactPhone: {
    fontSize:   fs(11),
    color:      C.muted,
    flexShrink: 0,
  },
  contactSep: {
    fontSize:   fs(11),
    color:      "#C7BAB4",
    flexShrink: 0,
  },

  // Action row (joined · Edit · Delete)
  actionRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  joinedWrap: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           ms(4),
  },
  joinedT: {
    fontSize:   fs(11),
    color:      C.muted,
    fontWeight: "600",
  },
  actionBtns: {
    flexDirection: "row",
    gap:           ms(6),
  },
  editBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    paddingHorizontal: ms(10),
    paddingVertical:   ms(6),
    borderRadius:      ms(10),
    backgroundColor:   "#EEF3FB",
  },
  delBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    paddingHorizontal: ms(10),
    paddingVertical:   ms(6),
    borderRadius:      ms(10),
    backgroundColor:   "#FEF0EE",
  },
  actionBtnT: {
    fontSize:   fs(11.5),
    fontWeight: "700",
  },
});

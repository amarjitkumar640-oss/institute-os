import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
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
  type FacultyItem,
} from "../../api/faculty";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

type Nav  = NativeStackNavigationProp<RootStackParamList>;
type Props = NativeStackScreenProps<RootStackParamList, "FacultyList">;

// Palette cycles through 6 distinct colors — adjacent cards always differ
function cardPalette(colors: ThemeColors): string[] {
  return [
    colors.primary, // brand
    colors.accent,  // brand
    C.orange, // orange
    C.blue, // blue
    C.purple, // purple
    C.green, // green
  ];
}

function cardColor(index: number, colors: ThemeColors): string {
  const palette = cardPalette(colors);
  return palette[index % palette.length];
}

// Format "YYYY-MM-DD" → "28 Jul 2022"
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  const color       = cardColor(index, colors);
  const ini         = faculty.fullName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const visibleSubs = faculty.subjects.slice(0, 3);
  const extraCount  = faculty.subjects.length - visibleSubs.length;
  const expYrs      = faculty.experienceYears;
  const isActive    = faculty.isActive;

  return (
    <View style={cs.card}>

      {/* ── Top: icon box · name + code · status badge ── */}
      <View style={cs.cardTop}>
        <View style={[cs.iconBox, { backgroundColor: color }]}>
          <Text style={cs.iconCode}>{ini}</Text>
        </View>
        <View style={cs.cardInfo}>
          <Text style={cs.name} numberOfLines={1}>{faculty.fullName}</Text>
          <View style={cs.codeRow}>
            <View style={[cs.codePill, { backgroundColor: color + "14", borderColor: color + "35" }]}>
              <Text style={[cs.codeT, { color }]}>{faculty.employeeCode}</Text>
            </View>
            <Text style={cs.qualT} numberOfLines={1}>{faculty.qualification}</Text>
          </View>
        </View>
        <View style={[cs.statusBadge, { backgroundColor: isActive ? C.greenBg : C.inputBg }]}>
          <View style={[cs.statusDot, { backgroundColor: isActive ? C.green : C.placeholder }]} />
          <Text style={[cs.statusT, { color: isActive ? C.green : C.muted }]}>
            {isActive ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>

      {/* ── Stats: experience · subjects · joined ── */}
      <View style={cs.divider} />
      <View style={cs.statsRow}>
        <View style={cs.statItem}>
          <Ionicons name="briefcase-outline" size={ms(13)} color={color} />
          <Text style={cs.statLabel}>{expYrs} yr{expYrs !== 1 ? "s" : ""} exp</Text>
        </View>
        <View style={cs.statDivider} />
        <View style={cs.statItem}>
          <Ionicons name="book-outline" size={ms(13)} color={color} />
          <Text style={cs.statLabel}>{faculty.subjects.length} subject{faculty.subjects.length !== 1 ? "s" : ""}</Text>
        </View>
        <View style={cs.statDivider} />
        <View style={cs.statItem}>
          <Ionicons name="calendar-outline" size={ms(13)} color={color} />
          <Text style={cs.statLabel}>{fmtDate(faculty.joiningDate)}</Text>
        </View>
      </View>

      {/* ── Subject chips (optional) ── */}
      {faculty.subjects.length > 0 && (
        <>
          <View style={cs.divider} />
          <View style={cs.subRow}>
            {visibleSubs.map((s) => {
              const sc = s.examCategories[0]?.color ?? C.orange;
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
        </>
      )}

      {/* ── Contact: email · phone ── */}
      <View style={cs.divider} />
      <View style={cs.contactRow}>
        <Ionicons name="mail-outline" size={ms(11)} color={C.muted} />
        <Text style={cs.contactT} numberOfLines={1}>{faculty.email}</Text>
        <Text style={cs.contactSep}>·</Text>
        <Ionicons name="call-outline" size={ms(11)} color={C.muted} />
        <Text style={cs.contactPhone}>{faculty.phone}</Text>
      </View>

      {/* ── Actions: Edit · Delete ── */}
      <View style={cs.divider} />
      <View style={cs.actionBtns}>
        <TouchableOpacity style={[cs.actionBtn, cs.editBtn]} onPress={onEdit} activeOpacity={0.75}>
          <Ionicons name="pencil-outline" size={ms(13)} color={C.blue} />
          <Text style={[cs.actionBtnT, { color: C.blue }]}>Edit</Text>
        </TouchableOpacity>
        <View style={cs.actionDivider} />
        <TouchableOpacity
          style={[cs.actionBtn, cs.delBtn]}
          onPress={onDelete}
          activeOpacity={0.75}
          disabled={deleting}
        >
          {deleting
            ? <ActivityIndicator size="small" color={C.red} />
            : <>
                <Ionicons name="trash-outline" size={ms(13)} color={C.red} />
                <Text style={[cs.actionBtnT, { color: C.red }]}>Delete</Text>
              </>
          }
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function FacultyEmpty({ search }: { search: string }) {
  return (
    <EmptyState
      scene="faculty"
      color={C.orange}
      title={search ? "No faculty match your search" : "No faculty yet"}
      subtitle={search ? "Try a different name or category" : "Add faculty members to get started"}
    />
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function FacultyListScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  const nav = useNavigation<Nav>();
  const { showAlert, showConfirm } = useAlert();

  const [faculty, setFaculty]         = useState<FacultyItem[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  const fetchFaculty = useCallback(async (q: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await listFaculty({ search: q || undefined, limit: 100 });
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
    const t = setTimeout(() => fetchFaculty(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, fetchFaculty]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) { isFirstFocus.current = false; return; }
      fetchFaculty(search, true);
    }, [search, fetchFaculty])
  );

  useRefetchOnReconnect(() => fetchFaculty(search, true));

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFaculty(search, true);
  }, [search, fetchFaculty]);

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

    </View>
  );

  return (
    <SafeAreaView style={cs.safe} edges={["bottom"]}>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          ListEmptyComponent={!loading && !error ? <FacultyEmpty search={search} /> : null}
        />

        {loading && (
          <View style={cs.overlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {!!error && (
          <View style={cs.overlay}>
            <ListErrorState title="Failed to load faculty" onRetry={() => fetchFaculty(search)} />
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

const makeCsStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, backgroundColor: colors.screenBg },

  // Banner
  banner:     { flexDirection: "row", backgroundColor: C.card, marginHorizontal: ms(16), marginTop: ms(8), borderRadius: ms(14), paddingVertical: ms(10), paddingHorizontal: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(6), elevation: 2 },
  bannerItem: { flex: 1, alignItems: "center" },
  bannerNum:  { fontSize: fs(18), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: colors.primary },
  bannerLbl:  { fontSize: fs(10), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600", marginTop: ms(1) },
  bannerDiv:  { width: 1, backgroundColor: C.border, marginHorizontal: ms(6) },

  // Search + filter
  searchWrap:  { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(12) },
  searchRow:   { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8) },
  searchInput: { flex: 1, fontSize: fs(13.5), color: C.text, padding: 0, includeFontPadding: false },
  listContent:  { paddingTop: ms(12), paddingBottom: ms(96) },
  overlay:      { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", gap: ms(12), backgroundColor: colors.bg + "EE" },

  fab: {
    position: "absolute", bottom: ms(24), right: ms(20),
    width: ms(56), height: ms(56), borderRadius: ms(28),
    backgroundColor: colors.primary,
    justifyContent: "center", alignItems: "center",
    shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) },
    shadowOpacity: 0.45, shadowRadius: ms(12), elevation: 10,
  },

  // Card (matches CourseCard pattern)
  card:     { backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginHorizontal: ms(16), marginBottom: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },

  // Top row
  cardTop:  { flexDirection: "row", alignItems: "flex-start", gap: ms(10), marginBottom: ms(10) },
  iconBox:  { width: ms(46), height: ms(46), borderRadius: ms(12), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  iconCode: { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff", letterSpacing: 0.3, includeFontPadding: false },
  cardInfo: { flex: 1, minWidth: 0 },
  name:     { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, letterSpacing: -0.2, marginBottom: ms(4) },
  codeRow:  { flexDirection: "row", alignItems: "center", gap: ms(6), flexWrap: "wrap" },
  codePill: { borderWidth: 1, borderRadius: ms(6), paddingHorizontal: ms(6), paddingVertical: ms(2) },
  codeT:    { fontSize: fs(10), fontFamily: "Inter_700Bold", fontWeight: "700" },
  qualT:    { fontSize: fs(11), color: C.muted, flexShrink: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(4), gap: ms(4), flexShrink: 0 },
  statusDot:   { width: ms(5), height: ms(5), borderRadius: ms(2.5) },
  statusT:     { fontSize: fs(10.5), fontFamily: "Inter_700Bold", fontWeight: "700" },

  // Stats row
  divider:     { height: 1, backgroundColor: C.border, marginBottom: ms(10) },
  statsRow:    { flexDirection: "row", alignItems: "center", marginBottom: ms(10) },
  statItem:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(4) },
  statLabel:   { fontSize: fs(11), color: C.text, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  statDivider: { width: 1, height: ms(16), backgroundColor: C.border },

  // Subject chips
  subRow:  { flexDirection: "row", flexWrap: "wrap", gap: ms(6), marginBottom: ms(10) },
  subChip: { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(8), paddingVertical: ms(4), borderRadius: ms(8), borderWidth: 1 },
  subDot:  { width: ms(5), height: ms(5), borderRadius: ms(2.5), flexShrink: 0 },
  subChipT:{ fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700" },
  subMore: { paddingHorizontal: ms(8), paddingVertical: ms(4), borderRadius: ms(8), backgroundColor: C.border, justifyContent: "center" },
  subMoreT:{ fontSize: fs(11), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.muted },

  // Contact row
  contactRow:   { flexDirection: "row", alignItems: "center", gap: ms(5), marginBottom: ms(10) },
  contactT:     { fontSize: fs(11), color: C.muted, flex: 1, minWidth: 0 },
  contactPhone: { fontSize: fs(11), color: C.muted, flexShrink: 0 },
  contactSep:   { fontSize: fs(11), color: C.placeholder, flexShrink: 0 },

  // Action row
  actionBtns:  { flexDirection: "row", alignItems: "center" },
  actionBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingHorizontal: ms(8), paddingVertical: ms(7), borderRadius: ms(8) },
  editBtn:     { backgroundColor: "#EEF3FB" },
  delBtn:      { backgroundColor: "#FEF0EE" },
  actionDivider: { width: ms(8) },
  actionBtnT:  { fontSize: fs(12), fontFamily: "Inter_700Bold", fontWeight: "700" },
});

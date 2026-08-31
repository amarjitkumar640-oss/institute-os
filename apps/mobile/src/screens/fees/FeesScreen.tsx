import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Modal,
  ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { AVATAR_SIZE, AVATAR_RADIUS, getAvatarFill } from "../../components/ui/avatarStyle";
import { T } from "../../components/ui/typography";
import type { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import {
  listSchedules, getFeeSummary,
  scheduleTotalOutstanding, scheduleHasOverdue,
  type StudentFeeSchedule, type FeeSummary,
} from "../../api/fees";
import { listBatches, type BatchItem } from "../../api/batches";
import { CollectionView } from "./CollectionView";

type Props = NativeStackScreenProps<RootStackParamList, "FeesList">;

// ── Types / constants ─────────────────────────────────────────────────────────

type ScheduleFilter = "all" | "active" | "overdue" | "partial" | "completed";

function getFilters(colors: ThemeColors): { key: ScheduleFilter; label: string; icon: string; color: string }[] {
  return [
    { key: "all",       label: "All",     icon: "list-outline",             color: colors.primary },
    { key: "active",    label: "Due",     icon: "calendar-outline",         color: C.blue         },
    { key: "partial",   label: "Partial", icon: "time-outline",             color: "#946200"      },
    { key: "overdue",   label: "Overdue", icon: "warning-outline",          color: C.red          },
    { key: "completed", label: "Paid",    icon: "checkmark-circle-outline", color: C.green        },
  ];
}

type DisplayStatus = "overdue" | "partial" | "due" | "paid";

const STATUS_META: Record<DisplayStatus, { label: string; color: string; bg: string; icon: string }> = {
  overdue: { label: "OVERDUE", color: C.red,     bg: "#FBE9E7", icon: "warning-outline"          },
  partial: { label: "PARTIAL", color: "#946200", bg: "#FFF3D6", icon: "time-outline"              },
  due:     { label: "DUE",     color: C.blue,    bg: "#EBF3FD", icon: "calendar-outline"          },
  paid:    { label: "PAID",    color: C.green,   bg: C.greenBg, icon: "checkmark-circle-outline"  },
};

function getAvatarPalette(colors: ThemeColors): string[] {
  return [colors.primary, C.orange, colors.accent, C.blue, "#B3273F", C.purple];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function fmtAmount(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtAmountFull(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function deriveDisplayStatus(s: StudentFeeSchedule): DisplayStatus {
  if (s.status === "completed") return "paid";
  if (scheduleHasOverdue(s))    return "overdue";
  if ((s.installments ?? []).some((i) => i.status === "partial")) return "partial";
  return "due";
}

function nextDueInstallment(s: StudentFeeSchedule) {
  return (s.installments ?? []).find((i) => i.status === "pending" || i.status === "partial" || i.status === "overdue");
}

function fmtDate(iso: string): string {
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Schedule card ─────────────────────────────────────────────────────────────

function ScheduleCard({
  schedule, index, onPress,
}: {
  schedule: StudentFeeSchedule;
  index:    number;
  onPress:  () => void;
}) {
  const colors = useThemeColors();
  const avatarColor   = getAvatarPalette(colors)[index % getAvatarPalette(colors).length];
  const fill          = getAvatarFill(avatarColor);
  const displayStatus = deriveDisplayStatus(schedule);
  const sm            = STATUS_META[displayStatus];
  const outstanding   = scheduleTotalOutstanding(schedule);
  const student       = schedule.student ?? schedule.enrollment?.student;
  const batch         = schedule.batch   ?? schedule.enrollment?.batch;
  const nextDue       = nextDueInstallment(schedule);
  const metaText      = batch?.name ?? "—";
  const dueLine       = nextDue
    ? `Next due: ${nextDue.label} · ${fmtDate(nextDue.dueDate)}`
    : displayStatus === "paid" ? "All installments paid" : "No pending installments";

  const dueDate   = nextDue ? new Date(nextDue.dueDate.slice(0, 10) + "T00:00:00") : null;
  const daysUntil = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000) : null;
  const dueColor  =
    displayStatus === "paid"    ? C.green  :
    displayStatus === "overdue" ? C.red    :
    daysUntil !== null && daysUntil <= 7 ? C.orange : C.muted;
  const dueIcon =
    displayStatus === "paid"    ? "checkmark-circle-outline" :
    displayStatus === "overdue" ? "alarm-outline" :
    daysUntil !== null && daysUntil <= 7 ? "time-outline" : "calendar-outline";

  return (
    <TouchableOpacity
      style={[fc.card, displayStatus === "overdue" && fc.cardOverdue]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={fc.topRow}>
        <View style={[fc.avatar, { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor }]}>
          <Text style={[fc.avatarT, { color: fill.color }]}>{initials(student?.fullName ?? "?")}</Text>
        </View>
        <View style={fc.nameBlock}>
          <Text style={fc.name} numberOfLines={1}>{student?.fullName ?? "Unknown"}</Text>
          <Text style={fc.code} numberOfLines={1}>{student?.studentCode}</Text>
        </View>
        <View style={fc.amountBlock}>
          {outstanding > 0
            ? <Text style={[fc.amount, displayStatus === "overdue" && { color: sm.color }]}>{fmtAmountFull(outstanding)}</Text>
            : <Text style={[fc.amount, { color: sm.color }]}>{fmtAmountFull(Number(schedule.effectiveFee))}</Text>
          }
          <Ionicons name="chevron-forward" size={ms(14)} color={C.placeholder} />
        </View>
      </View>

      <View style={fc.midRow}>
        <View style={fc.batchPill}>
          <Ionicons name="layers-outline" size={ms(10)} color={C.blue} />
          <Text style={fc.batchPillT} numberOfLines={1}>{metaText}</Text>
        </View>
        <View style={[fc.badge, { backgroundColor: sm.bg }]}>
          <Ionicons name={sm.icon as any} size={ms(8)} color={sm.color} />
          <Text style={[fc.badgeT, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>

      <View style={fc.dueRow}>
        <Ionicons name={dueIcon as any} size={ms(11)} color={dueColor} />
        <Text style={[fc.due, { color: dueColor }]} numberOfLines={1}>{dueLine}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Batch bottom sheet ────────────────────────────────────────────────────────

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
          {/* All batches option */}
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
  backdrop: {
    flex:            1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  panel: {
    backgroundColor:    C.card,
    borderTopLeftRadius:  ms(24),
    borderTopRightRadius: ms(24),
    maxHeight:          SHEET_HEIGHT.short,
    paddingTop:         ms(10),
    paddingHorizontal:  ms(0),
  },
  handle: {
    width:           ms(36),
    height:          ms(4),
    borderRadius:    ms(2),
    backgroundColor: C.border,
    alignSelf:       "center",
    marginBottom:    ms(14),
  },
  title: {
    ...T.cardTitle,
    color:             C.text,
    paddingHorizontal: ms(20),
    marginBottom:      ms(8),
  },
  scroll:   { flexGrow: 0 },
  divider:  { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: ms(20), marginVertical: ms(4) },
  row: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(12),
    paddingHorizontal: ms(20),
    paddingVertical:   ms(13),
  },
  rowIcon: {
    width:          ms(38),
    height:         ms(38),
    borderRadius:   ms(11),
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
  rowLabel: {
    flex: 1,
    ...T.listItemTitle,
    color: C.text,
  },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export function FeesScreen({ navigation, route }: Props) {
  const colors  = useThemeColors();
  const ls      = useThemedStyles(makeLsStyles);
  const { currentCenter } = useAuth();

  const [schedules,      setSchedules]      = useState<StudentFeeSchedule[]>([]);
  const [summary,        setSummary]        = useState<FeeSummary | null>(null);
  const [batches,        setBatches]        = useState<BatchItem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [search,         setSearch]         = useState("");
  const [filter,         setFilter]         = useState<ScheduleFilter>(route.params?.initialFilter ?? "all");
  const [batchFilter,    setBatchFilter]    = useState<string | null>(null);
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [screenTab,      setScreenTab]      = useState<"schedules" | "collection">("schedules");

  // Only the very first load should show the full-screen loading overlay —
  // every reload after that is triggered by changing a filter, which should
  // update quietly instead of flashing the whole screen grey again.
  const didLoadOnce = useRef(false);

  useEffect(() => {
    listBatches().then(setBatches).catch(() => {});
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const [schList, sum] = await Promise.all([
        listSchedules({
          status:  filter === "all" ? undefined : filter,
          search:  search || undefined,
          batchId: batchFilter ?? undefined,
        }),
        getFeeSummary(),
      ]);
      setSchedules(schList);
      setSummary(sum);
      setError(null);
    } catch {
      if (!silent) setError("Failed to load fee records.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search, batchFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      load(didLoadOnce.current);
      didLoadOnce.current = true;
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load]);

  useRefetchOnReconnect(() => load(true));

  const visible = schedules.filter((s) => {
    if (!search.trim()) return true;
    const q       = search.trim().toLowerCase();
    const student = s.student ?? s.enrollment?.student;
    const batch   = s.batch   ?? s.enrollment?.batch;
    return (
      (student?.fullName    ?? "").toLowerCase().includes(q) ||
      (student?.studentCode ?? "").toLowerCase().includes(q) ||
      (batch?.name          ?? "").toLowerCase().includes(q)
    );
  });

  const FILTERS          = getFilters(colors);
  const selectedBatch    = batches.find((b) => b.id === batchFilter) ?? null;

  const ListHeader = (
    <View>
      {/* ── Summary card ─────────────────────────────────────────────────── */}
      <View style={ls.summaryCard}>
        <View style={ls.summaryCol}>
          <View style={ls.summaryLblRow}>
            <View style={[ls.summaryIco, { backgroundColor: C.green + "16" }]}>
              <Ionicons name="trending-up-outline" size={ms(14)} color={C.green} />
            </View>
            <Text style={ls.summaryLbl}>Collected this month</Text>
          </View>
          <Text style={[ls.summaryVal, { color: C.green }]}>{fmtAmount(summary?.totalCollected ?? 0)}</Text>
        </View>

        <View style={ls.summaryDivider} />

        <View style={ls.summaryCol}>
          <View style={ls.summaryLblRow}>
            <View style={[ls.summaryIco, { backgroundColor: C.orange + "16" }]}>
              <Ionicons name="alert-circle-outline" size={ms(14)} color={C.orange} />
            </View>
            <Text style={ls.summaryLbl}>Pending</Text>
          </View>
          <Text style={[ls.summaryVal, { color: C.orange }]}>{fmtAmount(summary?.totalPending ?? 0)}</Text>
          {(summary?.overdueCount ?? 0) > 0 && (
            <View style={ls.overduePill}>
              <Ionicons name="warning-outline" size={ms(9)} color={C.red} />
              <Text style={ls.overduePillT}>{summary?.overdueCount} overdue</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Search + Batch filter ─────────────────────────────────────────── */}
      <View style={ls.filterRow}>
        <View style={ls.searchBox}>
          <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
          <TextInput
            style={ls.searchInput}
            placeholder="Search student, code…"
            placeholderTextColor={C.placeholder}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={ms(15)} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Batch filter button — background/icons stay static; the corner
            badge below is the only "a filter is active" signal. */}
        <TouchableOpacity
          style={ls.batchBtn}
          onPress={() => setBatchSheetOpen(true)}
          activeOpacity={0.75}
        >
          <Ionicons name="layers-outline" size={ms(15)} color={C.muted} />
          {!!batchFilter && <View style={[ls.batchDot, { backgroundColor: colors.primary }]} />}
          <Ionicons name="chevron-down" size={ms(12)} color={C.muted} />
        </TouchableOpacity>
      </View>

      {/* Active batch chip (shown when a batch is selected) */}
      {selectedBatch && (
        <View style={ls.activeBatchRow}>
          <View style={[ls.activeBatchChip, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
            <Ionicons name="layers-outline" size={ms(11)} color={colors.primary} />
            <Text style={[ls.activeBatchT, { color: colors.primary }]} numberOfLines={1}>{selectedBatch.name}</Text>
            <TouchableOpacity
              onPress={() => setBatchFilter(null)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close-circle" size={ms(14)} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Status filter chips ───────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={ls.chipScroll}
        contentContainerStyle={ls.chipRow}
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
              <Ionicons name={f.icon as any} size={ms(12)} color={active ? "#fff" : C.muted} />
              <Text style={[ls.chipT, active && ls.chipTOn]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

    </View>
  );

  return (
    <SafeAreaView style={ls.safe} edges={["bottom"]}>

      <ScreenHeader
        title="Fees & Payments"
        count={screenTab === "schedules" && !loading && !error ? visible.length : undefined}
        countLabel="students"
        onBack={() => navigation.goBack()}
      />

      <View style={ls.tabBar}>
        {(["schedules", "collection"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[ls.tab, screenTab === tab && ls.tabActive]}
            onPress={() => setScreenTab(tab)}
          >
            <Ionicons
              name={tab === "schedules" ? "list-outline" : "bar-chart-outline"}
              size={ms(14)}
              color={screenTab === tab ? colors.primary : C.muted}
            />
            <Text style={[ls.tabT, screenTab === tab && ls.tabTActive]}>
              {tab === "schedules" ? "Schedules" : "Collection"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {screenTab === "collection" ? (
        <CollectionView />
      ) : (
        <View style={ls.body}>
          <FlatList
            data={loading || !!error ? [] : visible}
            keyExtractor={(s) => s.id}
            renderItem={({ item, index }) => (
              <ScheduleCard
                schedule={item}
                index={index}
                onPress={() => navigation.navigate("FeeScheduleDetail", {
                  enrollmentId: item.enrollmentId,
                  studentName:  item.enrollment?.student.fullName ?? "Student",
                })}
              />
            )}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={
              !loading && !error ? (
                <EmptyState
                  scene="students"
                  color={FILTERS.find((f) => f.key === filter)?.color ?? colors.primary}
                  title={search ? "No records match" : "No fee schedules yet"}
                  subtitle={search ? "Try a different name" : "Fee schedules will appear here after admission"}
                />
              ) : null
            }
            contentContainerStyle={ls.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(true); }}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          />

          {loading && (
            <View style={ls.overlay}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
          {!!error && (
            <View style={ls.overlay}>
              <ListErrorState title="Failed to load fees" onRetry={() => load()} />
            </View>
          )}
        </View>
      )}

      {/* Batch bottom sheet */}
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

// ── Card styles ───────────────────────────────────────────────────────────────

const fc = StyleSheet.create({
  card: {
    flexDirection:     "column",
    backgroundColor:   C.card,
    borderRadius:      ms(16),
    paddingVertical:   ms(14),
    paddingHorizontal: ms(16),
    marginHorizontal:  ms(16),
    marginBottom:      ms(12),
    overflow:          "hidden",
    shadowColor:       C.text,
    shadowOffset:      { width: 0, height: ms(5) },
    shadowOpacity:     0.10,
    shadowRadius:      ms(11),
    elevation:         3,
  },
  cardOverdue: { backgroundColor: "#FFF5F4" },
  topRow:     { flexDirection: "row", alignItems: "center", gap: ms(10) },
  avatar: {
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  avatarT:     { ...T.listItemTitle, includeFontPadding: false },
  nameBlock:   { flex: 1, minWidth: 0, gap: ms(2) },
  name:        { ...T.listItemTitle, color: C.text },
  code:        { ...T.caption, color: C.muted },
  amountBlock: { flexDirection: "row", alignItems: "center", gap: ms(4), flexShrink: 0 },
  amount:      { ...T.listItemTitle, color: C.text },
  midRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginTop: ms(10),
  },
  batchPill: {
    flexDirection: "row", alignItems: "center", gap: ms(3),
    backgroundColor: "#EEF4FF", borderRadius: ms(5),
    paddingHorizontal: ms(6), paddingVertical: ms(2),
    flexShrink: 1, maxWidth: "70%",
  },
  batchPillT: { ...T.chipText, color: C.blue, flexShrink: 1 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: ms(3),
    borderRadius: ms(7), paddingHorizontal: ms(8), paddingVertical: ms(2),
  },
  badgeT:  { ...T.badgeText, letterSpacing: 0.2 },
  dueRow:  { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(8) },
  due:     { ...T.caption, flex: 1 },
});

// ── Screen styles ─────────────────────────────────────────────────────────────

const makeLsStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  body: { flex: 1, backgroundColor: colors.screenBg },

  // Schedules / Collection tab bar
  tabBar: {
    flexDirection:     "row",
    backgroundColor:   C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex:              1,
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "center",
    gap:               ms(5),
    paddingVertical:   ms(12),
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive:  { borderBottomColor: colors.primary },
  tabT:       { ...T.chipText, color: C.muted },
  tabTActive: { ...T.chipText, color: colors.primary },

  // Summary card
  summaryCard: {
    flexDirection:     "row",
    alignItems:        "flex-start",
    backgroundColor:   C.card,
    borderRadius:      ms(18),
    marginHorizontal:  ms(16),
    marginTop:         ms(8),
    marginBottom:      ms(8),
    padding:           ms(16),
    shadowColor:       C.text,
    shadowOffset:      { width: 0, height: ms(4) },
    shadowOpacity:     0.07,
    shadowRadius:      ms(12),
    elevation:         3,
  },
  summaryCol:     { flex: 1, gap: ms(6) },
  summaryLblRow:  { flexDirection: "row", alignItems: "center", gap: ms(8) },
  summaryIco: {
    width:          ms(28),
    height:         ms(28),
    borderRadius:   ms(8),
    alignItems:     "center",
    justifyContent: "center",
  },
  summaryLbl:     { ...T.caption, color: C.muted },
  summaryVal:     { ...T.displayMedium, paddingLeft: ms(36) },
  summaryDivider: { width: ms(1), backgroundColor: C.border, marginHorizontal: ms(16), alignSelf: "stretch" },
  overduePill: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(3),
    marginTop:         ms(4),
    paddingHorizontal: ms(7),
    paddingVertical:   ms(3),
    backgroundColor:   C.red + "16",
    borderRadius:      ms(8),
    alignSelf:         "flex-start",
    marginLeft:        ms(36),
  },
  overduePillT: { ...T.badgeText, color: C.red },

  // Status chips.
  // Student List's chip row is a fixed-height container (38) around a
  // shorter chip (paddingVertical 5) — the ~6px of vertical centering
  // "buffer" inside that fixed box is what actually sets the visible gap
  // above/below the pill, not just the margin between rows. This chip is
  // taller (paddingVertical 8, plus an icon), so its own fixed height needs
  // to be taller too, to keep that same ~6px buffer on each side.
  // FlatList's contentContainerStyle padding (listContent) wraps
  // ListHeaderComponent too, not just the data rows — so the "gap before the
  // first card" has to live here, on the header's last element, as a margin
  // on the fixed-height outer scroll container (padding on the inner
  // content would get clipped — this ScrollView doesn't scroll vertically).
  // No fixed height here — a fixed height taller than the chip would center
  // it inside an invisible buffer, inflating the visible gap above beyond
  // whatever margin is set. Letting it size to content keeps marginBottom
  // the exact, only source of that gap.
  chipScroll: { flexGrow: 0, flexShrink: 0, marginBottom: ms(12) },
  chipRow: {
    alignItems:        "center",
    paddingHorizontal: ms(16),
    flexDirection:     "row",
    gap:               ms(8),
  },
  chip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(5),
    paddingHorizontal: ms(13),
    paddingVertical:   ms(8),
    borderRadius:      ms(20),
    backgroundColor:   C.card,
    borderWidth:       1,
    borderColor:       C.border,
  },
  chipT:   { ...T.chipText, color: C.muted },
  chipTOn: { color: "#fff" },

  // Search + batch filter row
  filterRow: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(10),
    paddingHorizontal: ms(16),
    // Same gap as summaryCard.marginBottom, so search→chips matches
    // stats-card→search exactly.
    marginBottom:      ms(8),
  },
  searchBox: {
    flex:              1,
    flexDirection:     "row",
    alignItems:        "center",
    backgroundColor:   C.inputBg,
    borderRadius:      ms(12),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(10),
    gap:               ms(8),
    shadowColor:       C.text,
    shadowOffset:      { width: 0, height: ms(1) },
    shadowOpacity:     0.06,
    shadowRadius:      ms(6),
    elevation:         2,
    borderWidth:       StyleSheet.hairlineWidth,
    borderColor:       C.border,
  },
  searchInput: {
    flex:               1,
    ...T.body,
    color:              C.text,
    padding:            0,
    includeFontPadding: false,
  },
  batchBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            ms(5),
    paddingHorizontal: ms(13),
    paddingVertical:   ms(10),
    backgroundColor:   C.card,
    borderRadius:      ms(12),
    borderWidth:       1,
    borderColor:       C.border,
    shadowColor:       C.text,
    shadowOffset:      { width: 0, height: ms(1) },
    shadowOpacity:     0.06,
    shadowRadius:      ms(6),
    elevation:         2,
    position:          "relative",
  },
  batchDot: {
    // Sits right on the button's border line at the corner — a slight
    // overlap, not floating past it and not tucked away inside it.
    position:     "absolute",
    top:          -ms(2),
    right:        -ms(2),
    width:        ms(8),
    height:       ms(8),
    borderRadius: ms(4),
  },

  // Active batch chip (visible below filter row when a batch is selected).
  // marginTop(6) + filterRow's own marginBottom(2) = 8, matching Student
  // List's gap from search row to its active-filter chip; marginBottom(2)
  // matches Student List's trailing gap into the next filter row.
  activeBatchRow: {
    paddingHorizontal: ms(16),
    // filterRow's own marginBottom(8) already provides the gap above this,
    // so no extra marginTop here — and marginBottom matches that same 8 for
    // the gap below, keeping every gap in this section equal.
    marginBottom:      ms(8),
  },
  activeBatchChip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(6),
    alignSelf:         "flex-start",
    borderRadius:      ms(20),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(6),
    borderWidth:       1,
  },
  activeBatchT: {
    ...T.chipText,
    maxWidth: ms(180),
  },

  listContent: { paddingBottom: ms(40) },
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent:  "center",
    alignItems:      "center",
    backgroundColor: colors.bg + "EE",
  },
});

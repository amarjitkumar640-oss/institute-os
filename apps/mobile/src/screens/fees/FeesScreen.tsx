import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, StatusBar, ActivityIndicator,
  ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import type { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { ms, fs, sw } from "../../utils/responsive";
import { C } from "../../theme";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import {
  listSchedules, getFeeSummary,
  scheduleTotalOutstanding, scheduleHasOverdue,
  type StudentFeeSchedule, type FeeSummary,
} from "../../api/fees";
import { listBatches, type BatchItem } from "../../api/batches";

type Props = NativeStackScreenProps<RootStackParamList, "FeesList">;

// ── Types / constants ─────────────────────────────────────────────────────────

type ScheduleFilter = "all" | "active" | "overdue" | "partial" | "completed";

const FILTERS: { key: ScheduleFilter; label: string; icon: string; color: string }[] = [
  { key: "all",       label: "All",     icon: "list-outline",             color: "#8B1E3F" },
  { key: "active",    label: "Due",     icon: "calendar-outline",         color: "#2563A8" },
  { key: "partial",   label: "Partial", icon: "time-outline",             color: "#946200" },
  { key: "overdue",   label: "Overdue", icon: "warning-outline",          color: "#C0392B" },
  { key: "completed", label: "Paid",    icon: "checkmark-circle-outline", color: "#1B9C63" },
];

type DisplayStatus = "overdue" | "partial" | "due" | "paid";

const STATUS_META: Record<DisplayStatus, { label: string; color: string; bg: string; icon: string }> = {
  overdue: { label: "OVERDUE",  color: "#C0392B", bg: "#FBE9E7", icon: "warning-outline"          },
  partial: { label: "PARTIAL",  color: "#946200", bg: "#FFF3D6", icon: "time-outline"              },
  due:     { label: "DUE",      color: "#2563A8", bg: "#EBF3FD", icon: "calendar-outline"          },
  paid:    { label: "PAID",     color: "#1B9C63", bg: "#E7F7EF", icon: "checkmark-circle-outline"  },
};

const AVATAR_PALETTE = ["#8B1E3F", "#E8752C", "#2CA6A4", "#2563A8", "#B3273F", "#5B2D8E"];

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
  if (s.installments.some((i) => i.status === "partial")) return "partial";
  return "due";
}

function nextDueInstallment(s: StudentFeeSchedule) {
  return s.installments.find((i) => i.status === "pending" || i.status === "partial" || i.status === "overdue");
}

function fmtDate(iso: string): string {
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Wave ──────────────────────────────────────────────────────────────────────

const WAVE_H = Math.round(ms(34));

function Wave() {
  return (
    <Svg width={sw} height={WAVE_H} viewBox={`0 0 ${sw} 34`} preserveAspectRatio="none">
      <Path
        d={`M0 18 C${sw * 0.25} 36,${sw * 0.75} 2,${sw} 18 L${sw} 34 L0 34 Z`}
        fill="#FFFBF0"
      />
    </Svg>
  );
}

// ── Schedule card ─────────────────────────────────────────────────────────────

function ScheduleCard({
  schedule,
  index,
  onPress,
}: {
  schedule: StudentFeeSchedule;
  index:    number;
  onPress:  () => void;
}) {
  const avatarColor = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
  const displayStatus = deriveDisplayStatus(schedule);
  const sm  = STATUS_META[displayStatus];
  const outstanding = scheduleTotalOutstanding(schedule);

  const student = schedule.enrollment?.student;
  const batch   = schedule.enrollment?.batch;

  const nextDue = nextDueInstallment(schedule);
  const metaText = batch?.name ?? "—";
  const dueLine  = nextDue
    ? `Next due: ${nextDue.label} · ${fmtDate(nextDue.dueDate)}`
    : displayStatus === "paid" ? "All installments paid" : "No pending installments";

  const dueDate = nextDue ? new Date(nextDue.dueDate.slice(0, 10) + "T00:00:00") : null;
  const daysUntil = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000) : null;
  const dueColor =
    displayStatus === "paid"    ? "#1B9C63" :
    displayStatus === "overdue" ? "#DC2626" :
    daysUntil !== null && daysUntil <= 7 ? "#E8752C" :
    "#8A7F82";
  const dueIcon =
    displayStatus === "paid"    ? "checkmark-circle-outline" :
    displayStatus === "overdue" ? "alarm-outline" :
    daysUntil !== null && daysUntil <= 7 ? "time-outline" :
    "calendar-outline";

  return (
    <TouchableOpacity
      style={[fc.card, displayStatus === "overdue" && fc.cardOverdue]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={[fc.stripe, { backgroundColor: sm.color }]} />

      {/* Row 1: avatar · name/code · amount + chevron */}
      <View style={fc.topRow}>
        <View style={[fc.avatar, { backgroundColor: avatarColor }]}>
          <Text style={fc.avatarT}>{initials(student?.fullName ?? "?")}</Text>
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
          <Ionicons name="chevron-forward" size={ms(14)} color="#C9BDB8" />
        </View>
      </View>

      {/* Row 2: batch pill · status badge */}
      <View style={fc.midRow}>
        <View style={fc.batchPill}>
          <Ionicons name="layers-outline" size={ms(10)} color="#2563A8" />
          <Text style={fc.batchPillT} numberOfLines={1}>{metaText}</Text>
        </View>
        <View style={[fc.badge, { backgroundColor: sm.bg }]}>
          <Ionicons name={sm.icon as any} size={ms(8)} color={sm.color} />
          <Text style={[fc.badgeT, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>

      {/* Row 3: full-width due date */}
      <View style={fc.dueRow}>
        <Ionicons name={dueIcon as any} size={ms(11)} color={dueColor} />
        <Text style={[fc.due, { color: dueColor }]} numberOfLines={1}>{dueLine}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function FeesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { currentCenter } = useAuth();

  const [schedules,   setSchedules]   = useState<StudentFeeSchedule[]>([]);
  const [summary,     setSummary]     = useState<FeeSummary | null>(null);
  const [batches,     setBatches]     = useState<BatchItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState<ScheduleFilter>("all");
  const [batchFilter, setBatchFilter] = useState<string | null>(null);

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
    const t = setTimeout(() => load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load]);

  useRefetchOnReconnect(() => load(true));

  const visible = schedules.filter((s) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const student = s.enrollment?.student;
    const batch   = s.enrollment?.batch;
    return (
      (student?.fullName    ?? "").toLowerCase().includes(q) ||
      (student?.studentCode ?? "").toLowerCase().includes(q) ||
      (batch?.name          ?? "").toLowerCase().includes(q)
    );
  });

  const totalOutstanding = visible
    .filter((s) => s.status !== "completed")
    .reduce((sum, s) => sum + scheduleTotalOutstanding(s), 0);

  const centerLabel = currentCenter?.name ?? "All Centers";

  const ListHeader = (
    <View style={ls.listHeader}>
      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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
              <Ionicons name={f.icon as any} size={ms(11)} color={active ? "#fff" : "#8A7F82"} />
              <Text style={[ls.chipT, active && ls.chipTOn]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Batch filter */}
      {batches.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={ls.chipRow}
        >
          <TouchableOpacity
            style={[ls.chip, ls.chipBatch, batchFilter === null && ls.chipBatchOn]}
            onPress={() => setBatchFilter(null)}
            activeOpacity={0.75}
          >
            <Ionicons name="layers-outline" size={ms(11)} color={batchFilter === null ? "#fff" : "#8A7F82"} />
            <Text style={[ls.chipT, batchFilter === null && ls.chipTOn]}>All Batches</Text>
          </TouchableOpacity>
          {batches.map((b) => {
            const active = batchFilter === b.id;
            return (
              <TouchableOpacity
                key={b.id}
                style={[ls.chip, ls.chipBatch, active && ls.chipBatchOn]}
                onPress={() => setBatchFilter(active ? null : b.id)}
                activeOpacity={0.75}
              >
                <Text style={[ls.chipT, active && ls.chipTOn]} numberOfLines={1}>{b.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={ls.searchRow}>
        <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
        <TextInput
          style={ls.searchInput}
          placeholder="Search student, code, batch…"
          placeholderTextColor={C.placeholder}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {!!search && (
          <TouchableOpacity
            onPress={() => setSearch("")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={ms(15)} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {!loading && !error && (
        <View style={ls.sectionRow}>
          <Text style={ls.sectionTitle}>{visible.length} {visible.length === 1 ? "student" : "students"}</Text>
          {totalOutstanding > 0 && (
            <Text style={ls.sectionCount}>{fmtAmount(totalOutstanding)} outstanding</Text>
          )}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={ls.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <LinearGradient
        colors={["#8B1E3F", "#A8264A", "#C64A3E", "#E8752C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={ls.header}
      >
        <Svg width={sw} height={ms(130)} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 8 }).map((_, row) =>
            Array.from({ length: 20 }).map((_, col) => (
              <Circle
                key={`${row}-${col}`}
                cx={col * ms(22) + (row % 2 ? ms(11) : 0)}
                cy={row * ms(22) + ms(8)}
                r={ms(1.5)}
                fill="rgba(255,255,255,0.12)"
              />
            ))
          )}
        </Svg>

        <View style={[ls.hTop, { paddingTop: insets.top + ms(10) }]}>
          <TouchableOpacity
            style={ls.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={ms(20)} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={ls.hTitle}>Fees &amp; Payments</Text>
            <Text style={ls.hSub}>{centerLabel}</Text>
          </View>
        </View>

        <View style={ls.summaryRow}>
          <View style={[ls.summaryItem, ls.summaryItemLeft]}>
            <View style={ls.summaryLblRow}>
              <Ionicons name="trending-up-outline" size={ms(12)} color="rgba(255,255,255,0.75)" />
              <Text style={ls.summaryLbl} numberOfLines={1}>Collected this month</Text>
            </View>
            <Text style={ls.summaryVal}>{fmtAmount(summary?.collectedThisMonth ?? 0)}</Text>
          </View>
          <View style={ls.summaryDivider} />
          <View style={ls.summaryItem}>
            <View style={ls.summaryLblRow}>
              <Ionicons name="alert-circle-outline" size={ms(12)} color="rgba(255,255,255,0.75)" />
              <Text style={ls.summaryLbl}>Pending</Text>
            </View>
            <Text style={ls.summaryVal}>{fmtAmount(summary?.pending ?? 0)}</Text>
            {(summary?.overdueCount ?? 0) > 0 && (
              <View style={ls.overduePill}>
                <Ionicons name="warning-outline" size={ms(9)} color="#fff" />
                <Text style={ls.overduePillT}>{summary?.overdueCount} overdue</Text>
              </View>
            )}
          </View>
        </View>

        <Wave />
      </LinearGradient>

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
                color={FILTERS.find((f) => f.key === filter)?.color ?? C.primary}
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
              colors={[C.primary]}
              tintColor={C.primary}
            />
          }
        />

        {loading && (
          <View style={ls.overlay}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        )}

        {!!error && (
          <View style={ls.overlay}>
            <ListErrorState title="Failed to load fees" onRetry={() => load()} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const fc = StyleSheet.create({
  card: {
    flexDirection:     "column",
    backgroundColor:   "#FFFFFF",
    borderRadius:      ms(16),
    paddingVertical:   ms(14),
    paddingHorizontal: ms(16),
    marginHorizontal:  ms(16),
    marginBottom:      ms(10),
    overflow:          "hidden",
    shadowColor:       "#2B1B1F",
    shadowOffset:      { width: 0, height: ms(5) },
    shadowOpacity:     0.10,
    shadowRadius:      ms(11),
    elevation:         3,
  },
  cardOverdue: { backgroundColor: "#FFF5F4" },
  stripe: {
    position: "absolute",
    left:     0,
    top:      0,
    bottom:   0,
    width:    ms(4),
  },
  // Row 1
  topRow: { flexDirection: "row", alignItems: "center", gap: ms(10) },
  avatar: {
    width:          ms(40),
    height:         ms(40),
    borderRadius:   ms(12),
    justifyContent: "center",
    alignItems:     "center",
    flexShrink:     0,
  },
  avatarT:   { fontSize: fs(13), fontWeight: "700", color: "#fff", includeFontPadding: false },
  nameBlock: { flex: 1, minWidth: 0, gap: ms(2) },
  name:      { fontSize: fs(13.5), fontWeight: "600", color: "#2B1B1F" },
  code:      { fontSize: fs(11), color: "#8A7F82" },
  amountBlock: { flexDirection: "row", alignItems: "center", gap: ms(4), flexShrink: 0 },
  amount:    { fontSize: fs(14), fontWeight: "700", color: "#2B1B1F" },
  // Row 2
  midRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginTop:      ms(10),
  },
  batchPill: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(3),
    backgroundColor:   "#EEF4FF",
    borderRadius:      ms(5),
    paddingHorizontal: ms(6),
    paddingVertical:   ms(2),
    flexShrink:        1,
    maxWidth:          "70%",
  },
  batchPillT: { fontSize: fs(11), fontWeight: "600", color: "#2563A8", flexShrink: 1 },
  badge: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(3),
    borderRadius:      ms(7),
    paddingHorizontal: ms(8),
    paddingVertical:   ms(2),
  },
  badgeT: { fontSize: fs(9.5), fontWeight: "700", letterSpacing: 0.2 },
  // Row 3
  dueRow: { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(8) },
  due:    { fontSize: fs(10.5), flex: 1 },
});

const ls = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#8B1E3F" },
  header: { overflow: "hidden" },
  body:   { flex: 1, backgroundColor: "#FFFBF0" },

  hTop: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(12),
    paddingHorizontal: ms(16),
    paddingBottom:     ms(14),
  },
  backBtn: {
    width:           ms(36),
    height:          ms(36),
    borderRadius:    ms(10),
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent:  "center",
    alignItems:      "center",
    flexShrink:      0,
  },
  hTitle: { fontSize: fs(17), fontWeight: "700", color: "#fff" },
  hSub:   { fontSize: fs(11.5), color: "rgba(255,255,255,0.78)", marginTop: ms(1) },

  summaryRow: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: ms(20),
    paddingTop:        ms(10),
    paddingBottom:     ms(28),
  },
  summaryItem:     { flex: 1 },
  summaryItemLeft: { flex: 1.5 },
  summaryLblRow:   { flexDirection: "row", alignItems: "center", gap: ms(4), marginBottom: ms(6) },
  summaryLbl: {
    flex:          1,
    fontSize:      fs(11),
    color:         "rgba(255,255,255,0.75)",
    fontWeight:    "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  summaryVal:  { fontSize: fs(24), fontWeight: "800", color: "#fff" },
  overduePill: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(3),
    marginTop:         ms(5),
    paddingHorizontal: ms(6),
    paddingVertical:   ms(2),
    backgroundColor:   "rgba(255,255,255,0.18)",
    borderRadius:      ms(8),
    alignSelf:         "flex-start",
  },
  overduePillT: { fontSize: fs(9), fontWeight: "700", color: "#fff", letterSpacing: 0.3 },
  summaryDivider: {
    width:            ms(1),
    height:           ms(44),
    backgroundColor:  "rgba(255,255,255,0.25)",
    marginHorizontal: ms(20),
  },

  listHeader: { paddingTop: ms(10) },
  chipRow: {
    paddingHorizontal: ms(16),
    paddingBottom:     ms(2),
    flexDirection:     "row",
    gap:               ms(8),
  },
  chip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(7),
    borderRadius:      ms(20),
    backgroundColor:   "#FFFFFF",
    borderWidth:       1,
    borderColor:       "#F1E7DD",
  },
  chipOn:      { backgroundColor: "#8B1E3F", borderColor: "#8B1E3F" },
  chipBatch:   { borderColor: "#D0E8FF" },
  chipBatchOn: { backgroundColor: "#2CA6A4", borderColor: "#2CA6A4" },
  chipT:       { fontSize: fs(12), fontWeight: "600", color: "#8A7F82" },
  chipTOn:     { color: "#fff" },

  searchRow: {
    flexDirection:     "row",
    alignItems:        "center",
    backgroundColor:   "#FFFFFF",
    borderRadius:      ms(12),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(10),
    marginHorizontal:  ms(16),
    marginTop:         ms(12),
    marginBottom:      ms(2),
    gap:               ms(8),
    shadowColor:       "#2B1B1F",
    shadowOffset:      { width: 0, height: 2 },
    shadowOpacity:     0.07,
    shadowRadius:      ms(8),
    elevation:         2,
  },
  searchInput: {
    flex:               1,
    fontSize:           fs(13.5),
    color:              "#2B1B1F",
    padding:            0,
    includeFontPadding: false,
  },

  sectionRow: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: ms(16),
    paddingTop:        ms(14),
    paddingBottom:     ms(10),
  },
  sectionTitle: { fontSize: fs(14.5), fontWeight: "700", color: "#2B1B1F" },
  sectionCount: { fontSize: fs(11.5), color: "#8A7F82" },

  listContent: { paddingBottom: ms(40) },
  overlay: {
    position:        "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent:  "center",
    alignItems:      "center",
    backgroundColor: "rgba(255,251,240,0.92)",
  },
});

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { T } from "../../components/ui/typography";
import { ms } from "../../utils/responsive";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import {
  getCollectionSummary, getCollectionByBatch,
  type CollectionSummary, type BatchCollectionRow, type CollectionPeriod,
} from "../../api/fees";

const PERIODS: { key: CollectionPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week",  label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year",  label: "This Year" },
];

function fmtAmount(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtAmountFull(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function BatchRow({ row }: { row: BatchCollectionRow }) {
  const colors = useThemeColors();
  const br = useThemedStyles(makeBrStyles);
  return (
    <View style={br.card}>
      <View style={br.topRow}>
        <View style={[br.icon, { backgroundColor: colors.primary + "14" }]}>
          <Ionicons name="layers-outline" size={ms(15)} color={colors.primary} />
        </View>
        <Text style={br.name} numberOfLines={1}>{row.batchName}</Text>
      </View>
      <View style={br.statsRow}>
        <View style={br.stat}>
          <Text style={br.statLbl}>Collected</Text>
          <Text style={[br.statVal, { color: colors.green }]}>{fmtAmountFull(row.collectedAmount)}</Text>
        </View>
        <View style={br.stat}>
          <Text style={br.statLbl}>Pending</Text>
          <Text style={[br.statVal, { color: row.pendingAmount > 0 ? colors.red : colors.muted }]}>{fmtAmountFull(row.pendingAmount)}</Text>
        </View>
        <View style={br.stat}>
          <Text style={br.statLbl}>Students Pending</Text>
          <Text style={br.statVal}>{row.pendingStudentCount}</Text>
        </View>
      </View>
    </View>
  );
}

const makeBrStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor:   colors.card,
    borderRadius:      ms(14),
    paddingVertical:   ms(12),
    paddingHorizontal: ms(14),
    marginHorizontal:  ms(16),
    marginBottom:      ms(10),
    shadowColor:       colors.text,
    shadowOffset:      { width: 0, height: ms(3) },
    shadowOpacity:     0.06,
    shadowRadius:      ms(8),
    elevation:         2,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(10) },
  icon: {
    width: ms(28), height: ms(28), borderRadius: ms(8),
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  name: { flex: 1, ...T.listItemTitle, color: colors.text },
  statsRow: { flexDirection: "row" },
  stat: { flex: 1, gap: ms(2) },
  statLbl: { ...T.caption, color: colors.muted },
  statVal: { ...T.body, fontFamily: "Inter_600SemiBold", fontWeight: "600", color: colors.text },
});

export function CollectionView() {
  const colors = useThemeColors();
  const s = useThemedStyles(makeStyles);

  const [period,     setPeriod]     = useState<CollectionPeriod>("month");
  const [summary,    setSummary]    = useState<CollectionSummary | null>(null);
  const [batches,    setBatches]    = useState<BatchCollectionRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const [sum, byBatch] = await Promise.all([getCollectionSummary(), getCollectionByBatch(period)]);
      setSummary(sum);
      setBatches(byBatch.batches);
      setError(null);
    } catch {
      if (!silent) setError("Failed to load collection data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnReconnect(() => load(true));

  const ListHeader = (
    <View>
      {summary && (
        <View style={s.statsGrid}>
          {[
            { label: "Today",      value: summary.collectedToday,     color: colors.primary },
            { label: "This Week",  value: summary.collectedThisWeek,  color: colors.blue },
            { label: "This Month", value: summary.collectedThisMonth, color: colors.green },
            { label: "This Year",  value: summary.collectedThisYear,  color: colors.purple },
          ].map((item) => (
            <View key={item.label} style={s.statCard}>
              <Text style={s.statCardLbl}>{item.label}</Text>
              <Text style={[s.statCardVal, { color: item.color }]}>{fmtAmount(item.value)}</Text>
            </View>
          ))}
        </View>
      )}

      {summary && (
        <View style={s.pendingRow}>
          <Ionicons name="alert-circle-outline" size={ms(14)} color={colors.orange} />
          <Text style={s.pendingT}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontWeight: "600", color: colors.text }}>{fmtAmountFull(summary.totalPending)}</Text> pending overall
          </Text>
          {summary.overdueCount > 0 && (
            <View style={s.overduePill}>
              <Text style={s.overduePillT}>{summary.overdueCount} overdue</Text>
            </View>
          )}
        </View>
      )}

      <View style={s.periodRow}>
        {PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              style={[s.periodChip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setPeriod(p.key)}
              activeOpacity={0.75}
            >
              <Text style={[s.periodChipT, active && s.periodChipTOn]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={s.sectionTitle}>Collection by Batch ({PERIODS.find((p) => p.key === period)!.label})</Text>
    </View>
  );

  return (
    <View style={s.body}>
      <FlatList
        data={loading || !!error ? [] : batches}
        keyExtractor={(b) => b.batchId}
        renderItem={({ item }) => <BatchRow row={item} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          !loading && !error ? (
            <EmptyState scene="students" color={colors.primary} title="No batches found" />
          ) : null
        }
        contentContainerStyle={s.listContent}
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
        <View style={s.overlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      {!!error && (
        <View style={s.overlay}>
          <ListErrorState title="Failed to load collection data" onRetry={() => load()} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.screenBg },
  listContent: { paddingBottom: ms(40) },

  statsGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: ms(16), paddingTop: ms(8), gap: ms(10),
  },
  statCard: {
    width: "47%",
    backgroundColor: colors.card, borderRadius: ms(14),
    paddingVertical: ms(12), paddingHorizontal: ms(14),
    shadowColor: colors.text, shadowOffset: { width: 0, height: ms(3) },
    shadowOpacity: 0.06, shadowRadius: ms(8), elevation: 2,
  },
  statCardLbl: { ...T.caption, color: colors.muted, marginBottom: ms(4) },
  statCardVal: { ...T.displayMedium },

  pendingRow: {
    flexDirection: "row", alignItems: "center", gap: ms(6),
    paddingHorizontal: ms(16), paddingVertical: ms(10),
  },
  pendingT: { ...T.body, color: colors.muted, flexShrink: 1 },
  overduePill: {
    marginLeft: "auto",
    backgroundColor: colors.redBg, borderRadius: ms(8),
    paddingHorizontal: ms(8), paddingVertical: ms(3),
  },
  overduePillT: { ...T.badgeText, color: colors.red },

  periodRow: {
    flexDirection: "row", gap: ms(8),
    paddingHorizontal: ms(16), paddingBottom: ms(12),
  },
  periodChip: {
    flex: 1, alignItems: "center",
    paddingVertical: ms(8), borderRadius: ms(20),
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  periodChipT: { ...T.chipText, color: colors.muted },
  periodChipTOn: { color: "#fff" },

  sectionTitle: { ...T.sectionHeading, color: colors.muted, paddingHorizontal: ms(16), marginBottom: ms(8) },

  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center", alignItems: "center",
    backgroundColor: colors.bg + "EE",
  },
});

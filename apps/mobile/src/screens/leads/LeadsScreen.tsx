import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { listLeads, type LeadItem, type LeadStatus } from "../../api/leads";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { AVATAR_SIZE, AVATAR_RADIUS, getAvatarFill } from "../../components/ui/avatarStyle";
import { T } from "../../components/ui/typography";

type Props = NativeStackScreenProps<RootStackParamList, "Leads">;

const STATUS_META: Record<LeadStatus, { label: string; color: string }> = {
  new: { label: "New", color: C.blue },
  contacted: { label: "Contacted", color: C.orange },
  visited: { label: "Visited", color: C.purple },
  converted: { label: "Converted", color: C.green },
  lost: { label: "Lost", color: C.red },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function LeadCard({ lead }: { lead: LeadItem }) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const exam = { label: lead.targetExam.label, color: lead.targetExam.color };
  const status = STATUS_META[lead.status] ?? { label: lead.status, color: C.muted };
  const fill = getAvatarFill(colors.primary);

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={[s.avatar, { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor }]}>
          <Text style={[s.avatarT, { color: fill.color }]}>{initials(lead.name)}</Text>
        </View>
        <View style={s.cardInfo}>
          <Text style={s.name} numberOfLines={1}>{lead.name}</Text>
          <Text style={s.phone} numberOfLines={1}>{lead.phone} · {lead.source}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: status.color + "18" }]}>
          <Text style={[s.statusT, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
      <View style={s.divider} />
      <View style={s.cardBottom}>
        <View style={[s.examBadge, { backgroundColor: exam.color + "18" }]}>
          <Ionicons name="book-outline" size={ms(11)} color={exam.color} />
          <Text style={[s.examT, { color: exam.color }]}>{exam.label}</Text>
        </View>
        {lead.notes ? (
          <Text style={s.notes} numberOfLines={1}>{lead.notes}</Text>
        ) : null}
      </View>
    </View>
  );
}

function LeadsEmpty() {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <EmptyState
        scene="leads"
        color={colors.primary}
        title="No leads yet"
        subtitle="Add a lead to start tracking prospective students"
      />
    </View>
  );
}

export function LeadsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const data = await listLeads();
      setLeads(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader
        title="Leads"
        count={leads.length}
        countLabel="total"
        onBack={() => navigation.goBack()}
      />

      <View style={s.content}>
        {loading ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderT}>Loading leads…</Text>
          </View>
        ) : error ? (
          <ListErrorState title="Failed to load leads" onRetry={() => load()} />
        ) : (
          <FlatList
            data={leads}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <LeadCard lead={item} />}
            style={s.list}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} />}
            ListEmptyComponent={<LeadsEmpty />}
          />
        )}

        <TouchableOpacity style={s.fab} onPress={() => navigation.navigate("AddLead")} activeOpacity={0.85}>
          <Ionicons name="add" size={ms(26)} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, backgroundColor: colors.screenBg, position: "relative" },
  fab: { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", gap: ms(14) },
  loaderT: { ...T.body, color: C.muted },
  list:        { flex: 1 },
  listContent: { flexGrow: 1, paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(40) },

  card: { backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(10) },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarT: { ...T.listItemTitle, includeFontPadding: false },
  cardInfo: { flex: 1, minWidth: 0 },
  name: { ...T.listItemTitle, color: C.text, marginBottom: ms(3) },
  phone: { ...T.caption, color: C.muted },
  statusBadge: { borderRadius: ms(20), paddingHorizontal: ms(9), paddingVertical: ms(4), flexShrink: 0 },
  statusT: { ...T.badgeText },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(10) },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  examBadge: { flexDirection: "row", alignItems: "center", gap: ms(4), borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3), flexShrink: 0 },
  examT: { ...T.badgeText },
  notes: { ...T.caption, color: C.muted, flex: 1, fontStyle: "italic" },
});

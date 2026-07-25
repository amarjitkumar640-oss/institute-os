import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { listLeads, type LeadItem, type LeadStatus } from "../../api/leads";
import { COURSE_META } from "../../constants/courseMeta";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Leads">;

const STATUS_META: Record<LeadStatus, { label: string; color: string }> = {
  new:       { label: "New",       color: C.blue    },
  contacted: { label: "Contacted", color: C.orange  },
  visited:   { label: "Visited",   color: C.purple  },
  converted: { label: "Converted", color: C.green   },
  lost:      { label: "Lost",      color: C.red     },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function LeadCard({ lead }: { lead: LeadItem }) {
  const exam = COURSE_META[lead.targetExam as keyof typeof COURSE_META] ?? { label: lead.targetExam, color: C.muted };
  const status = STATUS_META[lead.status] ?? { label: lead.status, color: C.muted };

  return (
    <View style={[s.card, { borderLeftColor: C.primary }]}>
      <View style={s.cardTop}>
        <View style={s.avatar}>
          <Text style={s.avatarT}>{initials(lead.name)}</Text>
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

export function LeadsScreen({ navigation }: Props) {
  const [leads, setLeads]           = useState<LeadItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(false);

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
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader
        title="Leads"
        count={leads.length}
        countLabel="total"
        onBack={() => navigation.goBack()}
      />

      <View style={s.content}>
        {loading ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loaderT}>Loading leads…</Text>
          </View>
        ) : error ? (
          <ListErrorState title="Failed to load leads" onRetry={() => load()} />
        ) : (
          <FlatList
            data={leads}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <LeadCard lead={item} />}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.primary]} tintColor={C.primary} />}
            ListEmptyComponent={
              <EmptyState
                scene="students"
                color={C.blue}
                title="No leads yet"
                subtitle="Add a lead to start tracking prospective students"
                action={{ label: "Add First Lead", onPress: () => navigation.navigate("AddLead") }}
              />
            }
          />
        )}

        <TouchableOpacity style={s.fab} onPress={() => navigation.navigate("AddLead")} activeOpacity={0.85}>
          <Ionicons name="add" size={ms(26)} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.primary },
  content: { flex: 1, backgroundColor: C.bg, position: "relative" },
  fab:     { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: C.primary, justifyContent: "center", alignItems: "center", shadowColor: C.primary, shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },
  loader:  { flex: 1, justifyContent: "center", alignItems: "center", gap: ms(14) },
  loaderT: { fontSize: fs(14), color: C.muted },
  listContent: { paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(40) },

  card:     { backgroundColor: C.card, borderRadius: ms(16), borderLeftWidth: 3, padding: ms(14), marginBottom: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  cardTop:  { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(10) },
  avatar:   { width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: 1.5, borderColor: C.primary + "40", backgroundColor: C.primary + "1C", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarT:  { fontSize: fs(14), fontWeight: "800", color: C.primary, includeFontPadding: false },
  cardInfo: { flex: 1, minWidth: 0 },
  name:     { fontSize: fs(14), fontWeight: "700", color: C.text, marginBottom: ms(3) },
  phone:    { fontSize: fs(11), color: C.muted },
  statusBadge: { borderRadius: ms(20), paddingHorizontal: ms(9), paddingVertical: ms(4), flexShrink: 0 },
  statusT:  { fontSize: fs(10.5), fontWeight: "800" },
  divider:  { height: 1, backgroundColor: "#F0EDE8", marginBottom: ms(10) },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  examBadge: { flexDirection: "row", alignItems: "center", gap: ms(4), borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3), flexShrink: 0 },
  examT:    { fontSize: fs(10.5), fontWeight: "800" },
  notes:    { fontSize: fs(11), color: C.muted, flex: 1, fontStyle: "italic" },
});

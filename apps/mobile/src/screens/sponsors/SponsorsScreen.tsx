import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { T } from "../../components/ui/typography";
import { usePermission } from "../../hooks/usePermission";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { listSponsors, type Sponsor } from "../../api/sponsors";

type Props = NativeStackScreenProps<RootStackParamList, "Sponsors">;

export function SponsorsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { canWrite } = usePermission("sponsors");
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setSponsors(await listSponsors()); } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader
        title="CSR Sponsors"
        onBack={() => navigation.goBack()}
      />

      <View style={s.content}>
      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {sponsors.length === 0 ? (
            <EmptyState
              scene="batches"
              title="No sponsors yet"
              subtitle="Add a company sponsoring a batch's course fee."
            />
          ) : (
            sponsors.map((sp) => (
              <TouchableOpacity key={sp.id} style={s.card} onPress={() => navigation.navigate("SponsorDetail", { sponsorId: sp.id })} activeOpacity={0.78}>
                <View style={s.icon}>
                  <Ionicons name="business-outline" size={ms(17)} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{sp.name}</Text>
                  <Text style={s.sub} numberOfLines={1}>{sp.contactPerson || sp.phone || sp.email || "No contact details"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={ms(16)} color={C.border} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {canWrite && (
        <TouchableOpacity style={s.fab} onPress={() => navigation.navigate("CreateSponsor")} activeOpacity={0.85}>
          <Ionicons name="add" size={ms(26)} color="#fff" />
        </TouchableOpacity>
      )}
      </View>
    </SafeAreaView>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, position: "relative" },
  fab: { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(40) },
  card: {
    flexDirection: "row", alignItems: "center", gap: ms(12), backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(10),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(2) }, shadowOpacity: 0.06, shadowRadius: ms(8), elevation: 2,
  },
  icon: { width: ms(38), height: ms(38), borderRadius: ms(12), backgroundColor: colors.primary + "12", justifyContent: "center", alignItems: "center" },
  name: { ...T.listItemTitle, color: C.text },
  sub: { ...T.caption, color: C.muted, marginTop: ms(2) },
});

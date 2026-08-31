import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { T } from "../../components/ui/typography";
import { useAlert } from "../../context/AlertContext";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { downloadAndShare } from "../../utils/shareFile";
import { getSponsor, type SponsorDetail } from "../../api/sponsors";
import { MilestonesPanel } from "./MilestonesPanel";

type Props = NativeStackScreenProps<RootStackParamList, "SponsorDetail">;

function fmt(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function SponsorDetailScreen({ navigation, route }: Props) {
  const { sponsorId } = route.params;
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { showAlert } = useAlert();

  const [sponsor, setSponsor] = useState<SponsorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setSponsor(await getSponsor(sponsorId)); } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [sponsorId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCopyLink(shareToken: string) {
    const url = `https://institute-os.app/invoice/${shareToken}`;
    await Clipboard.setStringAsync(url);
    Alert.alert("Copied", "Share link copied to clipboard.");
  }

  async function handleDownloadShare(downloadUrl: string, invoiceNumber: string) {
    try {
      await downloadAndShare(downloadUrl, `${invoiceNumber}.pdf`);
    } catch {
      showAlert("Error", "Could not download the invoice.", "error");
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title={sponsor?.name ?? "Sponsor"} onBack={() => navigation.goBack()} />

      {loading || !sponsor ? (
        <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          <Text style={s.sub}>
            {[sponsor.contactPerson, sponsor.phone, sponsor.email].filter(Boolean).join(" · ") || "No contact details"}
          </Text>
          {!!sponsor.gstin && <Text style={s.gstin}>GSTIN: {sponsor.gstin}</Text>}

          <Text style={s.sectionTitle}>SPONSORSHIP CONTRACTS</Text>

          {!sponsor.contracts.length ? (
            <EmptyState scene="batches" title="No contracts yet" subtitle="Link this sponsor to a batch from that batch's Sponsorship screen." />
          ) : (
            sponsor.contracts.map((contract) => (
              <View key={contract.id} style={s.contractCard}>
                <Text style={s.batchName}>{contract.batch.name}</Text>
                <Text style={s.contractSub}>
                  {contract.contractedStudentCount} students · {fmt(contract.totalContractAmount)}
                  {contract.gstRate ? ` · ${contract.gstRate}% GST` : " · GST exempt"}
                </Text>
                <View style={{ height: ms(12) }} />
                <MilestonesPanel
                  contractId={contract.id}
                  milestones={contract.milestones}
                  onChanged={() => load(true)}
                  onCopyLink={handleCopyLink}
                  onDownloadShare={handleDownloadShare}
                />
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(40) },
  sub: { ...T.body, color: C.muted },
  gstin: { ...T.caption, color: C.muted, marginTop: ms(4), fontFamily: "monospace" as any },
  sectionTitle: { ...T.sectionHeading, color: C.muted, letterSpacing: 0.5, marginTop: ms(20), marginBottom: ms(10) },
  contractCard: { backgroundColor: C.bg, borderRadius: ms(16), padding: ms(14), marginBottom: ms(16) },
  batchName: { ...T.cardTitle, color: C.text },
  contractSub: { ...T.caption, color: C.muted, marginTop: ms(4) },
});

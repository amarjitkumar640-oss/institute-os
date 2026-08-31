import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput,
  RefreshControl, Alert, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { BottomSheet, SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { T } from "../../components/ui/typography";
import { usePermission } from "../../hooks/usePermission";
import { useAlert } from "../../context/AlertContext";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { downloadAndShare } from "../../utils/shareFile";
import * as Clipboard from "expo-clipboard";
import {
  listSponsors, getContractForBatch, createContract, uploadContractDocument,
  type Sponsor, type ContractWithSponsor,
} from "../../api/sponsors";
import { MilestonesPanel } from "../sponsors/MilestonesPanel";

const SCREEN_H = Dimensions.get("window").height;

type Props = NativeStackScreenProps<RootStackParamList, "SponsorshipDetail">;

function fmt(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function PickSponsorSheet({
  visible, sponsors, onClose, onSelect,
}: { visible: boolean; sponsors: Sponsor[]; onClose: () => void; onSelect: (s: Sponsor) => void }) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={SHEET_HEIGHT.standard}>
      {/* Explicit height, not flex:1 — BottomSheet's own inner container has
          no height of its own (only a maxHeight cap), so a flex:1 child here
          would have nothing to resolve against and collapse to nothing. */}
      <View style={{ height: SCREEN_H * 0.85 }}>
        <View style={cs.sheet}>
          <View style={cs.head}>
            <View style={cs.headIcon}>
              <Ionicons name="business-outline" size={ms(20)} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.headTitle}>Select Sponsor</Text>
            </View>
            <TouchableOpacity style={cs.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>
          <View style={cs.divider} />
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {sponsors.length === 0 ? (
              <Text style={cs.emptyHint}>No sponsors yet — add one from the Sponsors screen first.</Text>
            ) : (
              sponsors.map((sp) => (
                <TouchableOpacity key={sp.id} style={cs.sponsorRow} onPress={() => onSelect(sp)} activeOpacity={0.75}>
                  <Text style={cs.sponsorName}>{sp.name}</Text>
                  {!!(sp.contactPerson || sp.phone) && (
                    <Text style={cs.sponsorSub}>{sp.contactPerson || sp.phone}</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </BottomSheet>
  );
}

function LinkSponsorForm({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeFormStyles);
  const { showAlert } = useAlert();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [contractedStudentCount, setContractedStudentCount] = useState("");
  const [totalContractAmount, setTotalContractAmount] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [gstExempt, setGstExempt] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { listSponsors().then(setSponsors).catch(() => {}); }, []));

  async function submit() {
    if (!sponsor) { showAlert("Select a sponsor", "Choose which company is sponsoring this batch.", "error"); return; }
    const count = parseInt(contractedStudentCount, 10);
    if (isNaN(count) || count <= 0) { showAlert("Invalid count", "Enter a valid number of contracted students.", "error"); return; }
    const amt = parseFloat(totalContractAmount);
    if (isNaN(amt) || amt <= 0) { showAlert("Invalid amount", "Enter a valid total contract amount.", "error"); return; }

    setSaving(true);
    try {
      const result = await createContract({
        sponsorId: sponsor.id, batchId,
        contractedStudentCount: count, totalContractAmount: amt,
        gstRate: gstExempt ? null : Number(gstRate),
        startDate: new Date().toISOString().slice(0, 10),
      });
      if (!result.ok) { showAlert("Error", result.error, "error"); return; }
      onDone();
    } catch {
      showAlert("Error", "Could not link sponsor. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.hint}>
        Link a company sponsoring this batch's course fee in full. Every student admitted here is automatically
        billed nothing — no fee schedule is generated for them.
      </Text>

      <Text style={s.label}>Sponsor</Text>
      <TouchableOpacity style={s.pickerField} onPress={() => setShowPicker(true)} activeOpacity={0.75}>
        <Text style={sponsor ? s.pickerValue : s.pickerPlaceholder}>{sponsor?.name ?? "Select a sponsor"}</Text>
        <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
      </TouchableOpacity>

      <Text style={s.label}>Contracted Students</Text>
      <TextInput style={s.textField} value={contractedStudentCount} onChangeText={setContractedStudentCount} keyboardType="number-pad" placeholder="e.g. 30" placeholderTextColor={C.placeholder} />

      <Text style={s.label}>Total Contract Amount (₹)</Text>
      <TextInput style={s.textField} value={totalContractAmount} onChangeText={setTotalContractAmount} keyboardType="numeric" placeholder="e.g. 300000" placeholderTextColor={C.placeholder} />

      <View style={s.gstRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>GST Rate (%)</Text>
          <TextInput
            style={[s.textField, gstExempt && { opacity: 0.5 }]}
            value={gstRate} onChangeText={setGstRate} keyboardType="numeric"
            editable={!gstExempt} placeholderTextColor={C.placeholder}
          />
        </View>
        <TouchableOpacity style={s.exemptToggle} onPress={() => setGstExempt((v) => !v)} activeOpacity={0.75}>
          <Ionicons name={gstExempt ? "checkbox" : "square-outline"} size={ms(20)} color={gstExempt ? colors.primary : C.muted} />
          <Text style={s.exemptLabel}>GST exempt</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.submitBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.65 }]}
        onPress={submit} disabled={saving} activeOpacity={0.88}
      >
        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitT}>Link Sponsor</Text>}
      </TouchableOpacity>

      <PickSponsorSheet
        visible={showPicker} sponsors={sponsors}
        onClose={() => setShowPicker(false)}
        onSelect={(sp) => { setSponsor(sp); setShowPicker(false); }}
      />
    </View>
  );
}

export function SponsorshipDetailScreen({ navigation, route }: Props) {
  const { batchId, batchName } = route.params;
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { showAlert } = useAlert();
  const { canEdit } = usePermission("sponsors");

  const [contract, setContract] = useState<ContractWithSponsor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getContractForBatch(batchId);
      setContract(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [batchId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleUploadDocument() {
    const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"] });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setUploading(true);
    try {
      const result = await uploadContractDocument(contract!.id, asset.uri, asset.mimeType);
      if (!result.ok) { showAlert("Error", result.error, "error"); return; }
      load(true);
    } finally {
      setUploading(false);
    }
  }

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
      <ScreenHeader title="Sponsorship" onBack={() => navigation.goBack()} />
      <Text style={s.batchNameT} numberOfLines={1}>{batchName}</Text>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {!contract ? (
            canEdit ? (
              <LinkSponsorForm batchId={batchId} onDone={() => load(true)} />
            ) : (
              <EmptyState scene="batches" title="No sponsor linked to this batch" />
            )
          ) : (
            <>
              <View style={s.summaryCard}>
                <View style={s.summaryTop}>
                  <Text style={s.sponsorName}>{contract.sponsor.name}</Text>
                  <View style={[s.statusBadge, contract.status !== "active" && { backgroundColor: C.bg }]}>
                    <Text style={[s.statusT, contract.status !== "active" && { color: C.muted }]}>{contract.status}</Text>
                  </View>
                </View>
                <Text style={s.summarySub}>
                  {contract.contractedStudentCount} students · {fmt(contract.totalContractAmount)}
                  {contract.gstRate ? ` · ${contract.gstRate}% GST` : " · GST exempt"}
                </Text>
                {canEdit && (
                  <TouchableOpacity style={s.uploadBtn} onPress={handleUploadDocument} disabled={uploading} activeOpacity={0.75}>
                    <Ionicons name="cloud-upload-outline" size={ms(14)} color={colors.primary} />
                    <Text style={[s.uploadBtnT, { color: colors.primary }]}>
                      {uploading ? "Uploading…" : contract.documentUrl ? "Replace signed agreement" : "Upload signed agreement"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <MilestonesPanel
                contractId={contract.id}
                milestones={contract.milestones}
                onChanged={() => load(true)}
                onCopyLink={handleCopyLink}
                onDownloadShare={handleDownloadShare}
              />
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  batchNameT: { ...T.cardTitle, color: C.text, marginHorizontal: ms(16), marginTop: ms(10), marginBottom: ms(8) },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { paddingHorizontal: ms(16), paddingTop: ms(4), paddingBottom: ms(40) },
  summaryCard: {
    backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(16),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(2) }, shadowOpacity: 0.06, shadowRadius: ms(8), elevation: 2,
  },
  summaryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sponsorName: { ...T.cardTitle, color: C.text },
  summarySub: { ...T.caption, color: C.muted, marginTop: ms(4) },
  statusBadge: { borderRadius: ms(6), paddingHorizontal: ms(8), paddingVertical: ms(3), backgroundColor: C.green + "22" },
  statusT: { ...T.badgeText, color: C.green },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: ms(6), marginTop: ms(10) },
  uploadBtnT: { ...T.chipText },
});

const makeCsStyles = (colors: ThemeColors) => StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: ms(20), paddingTop: ms(20), paddingBottom: ms(8) },
  head: { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(14) },
  headIcon: { width: ms(42), height: ms(42), borderRadius: ms(13), backgroundColor: colors.primary + "12", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  headTitle: { ...T.cardTitle, color: C.text },
  closeBtn: { width: ms(32), height: ms(32), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(8) },
  emptyHint: { ...T.body, color: C.muted, textAlign: "center", paddingVertical: ms(24) },
  sponsorRow: { paddingVertical: ms(12), borderBottomWidth: 1, borderBottomColor: C.border },
  sponsorName: { ...T.listItemTitle, color: C.text },
  sponsorSub: { ...T.caption, color: C.muted, marginTop: ms(2) },
});

const makeFormStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { paddingBottom: ms(20) },
  hint: { ...T.caption, color: C.muted, marginBottom: ms(16), lineHeight: ms(17) },
  label: { ...T.sectionHeading, color: C.muted, marginBottom: ms(8) },
  pickerField: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.inputBg, borderRadius: ms(12), padding: ms(12), marginBottom: ms(16),
  },
  pickerValue: { ...T.body, color: C.text },
  pickerPlaceholder: { ...T.body, color: C.placeholder },
  textField: { backgroundColor: C.inputBg, borderRadius: ms(12), padding: ms(12), ...T.body, color: C.text, marginBottom: ms(16) },
  gstRow: { flexDirection: "row", alignItems: "flex-end", gap: ms(12) },
  exemptToggle: { flexDirection: "row", alignItems: "center", gap: ms(6), paddingBottom: ms(16) },
  exemptLabel: { ...T.chipText, color: C.text },
  submitBtn: { borderRadius: ms(14), paddingVertical: ms(15), alignItems: "center", marginTop: ms(4) },
  submitT: { ...T.buttonText, color: "#fff" },
});

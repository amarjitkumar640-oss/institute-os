import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet, SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { T } from "../../components/ui/typography";
import { usePermission } from "../../hooks/usePermission";
import { useAlert } from "../../context/AlertContext";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import {
  createMilestone, markMilestoneReceived, generateInvoice, getInvoiceDownloadUrl,
  type MilestoneWithInvoice,
} from "../../api/sponsors";

function fmt(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function AddMilestoneSheet({ visible, contractId, onClose, onDone }: {
  visible: boolean; contractId: string; onClose: () => void; onDone: () => void;
}) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  const { showAlert } = useAlert();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!label.trim()) { showAlert("Missing label", "Enter a label, e.g. Advance or On completion.", "error"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { showAlert("Invalid amount", "Enter a valid amount.", "error"); return; }
    setSaving(true);
    try {
      const result = await createMilestone(contractId, { label: label.trim(), amount: amt });
      if (!result.ok) { showAlert("Error", result.error, "error"); return; }
      setLabel(""); setAmount("");
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={SHEET_HEIGHT.short}>
      <View style={cs.sheet}>
        <View style={cs.head}>
          <View style={cs.headIcon}>
            <Ionicons name="flag-outline" size={ms(20)} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cs.headTitle}>Add Payment Milestone</Text>
          </View>
          <TouchableOpacity style={cs.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>
        <View style={cs.divider} />
        <Text style={cs.label}>Label</Text>
        <TextInput style={cs.textField} value={label} onChangeText={setLabel} placeholder="e.g. Advance, On completion" placeholderTextColor={C.placeholder} />
        <Text style={cs.label}>Amount (₹)</Text>
        <TextInput style={cs.textField} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="e.g. 50000" placeholderTextColor={C.placeholder} />
        <TouchableOpacity style={[cs.submitBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.65 }]} onPress={submit} disabled={saving} activeOpacity={0.88}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={cs.submitT}>Add Milestone</Text>}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

function ReceiveMilestoneSheet({ visible, milestone, onClose, onDone }: {
  visible: boolean; milestone: MilestoneWithInvoice | null; onClose: () => void; onDone: () => void;
}) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  const { showAlert } = useAlert();
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => { if (milestone) setAmount(String(milestone.amount)); }, [milestone]);

  async function submit() {
    if (!milestone) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { showAlert("Invalid amount", "Enter a valid amount received.", "error"); return; }
    setSaving(true);
    try {
      const result = await markMilestoneReceived(milestone.id, { receivedAmount: amt });
      if (!result.ok) { showAlert("Error", result.error, "error"); return; }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={SHEET_HEIGHT.short}>
      <View style={cs.sheet}>
        <View style={cs.head}>
          <View style={cs.headIcon}>
            <Ionicons name="checkmark-circle-outline" size={ms(20)} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cs.headTitle}>Mark "{milestone?.label}" Received</Text>
          </View>
          <TouchableOpacity style={cs.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>
        <View style={cs.divider} />
        <Text style={cs.label}>Amount Received (₹)</Text>
        <TextInput style={cs.textField} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholderTextColor={C.placeholder} />
        <TouchableOpacity style={[cs.submitBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.65 }]} onPress={submit} disabled={saving} activeOpacity={0.88}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={cs.submitT}>Confirm</Text>}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

export function MilestonesPanel({
  contractId, milestones, onChanged, onCopyLink, onDownloadShare,
}: {
  contractId: string;
  milestones: MilestoneWithInvoice[];
  onChanged: () => void;
  onCopyLink: (shareToken: string) => void;
  onDownloadShare: (downloadUrl: string, invoiceNumber: string) => void;
}) {
  const colors = useThemeColors();
  const s = useThemedStyles(makePStyles);
  const { showAlert } = useAlert();
  const { canWrite, canEdit } = usePermission("sponsors");
  const [showAdd, setShowAdd] = useState(false);
  const [receiving, setReceiving] = useState<MilestoneWithInvoice | null>(null);
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleGenerateInvoice(milestoneId: string) {
    setInvoicingId(milestoneId);
    try {
      const result = await generateInvoice(milestoneId);
      if (!result.ok) { showAlert("Error", result.error, "error"); return; }
      onChanged();
    } finally {
      setInvoicingId(null);
    }
  }

  async function handleDownload(invoiceId: string, invoiceNumber: string) {
    setDownloadingId(invoiceId);
    try {
      const { downloadUrl } = await getInvoiceDownloadUrl(invoiceId);
      onDownloadShare(downloadUrl, invoiceNumber);
    } catch {
      showAlert("Error", "Could not fetch the invoice.", "error");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <View>
      <View style={s.headerRow}>
        <Text style={s.sectionTitle}>Payment Milestones</Text>
        {canWrite && (
          <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
            <Ionicons name="add" size={ms(14)} color={colors.primary} />
            <Text style={[s.addBtnT, { color: colors.primary }]}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {!milestones.length ? (
        <Text style={s.emptyHint}>No milestones yet — a lump-sum contract just needs one.</Text>
      ) : (
        milestones.map((m) => (
          <View key={m.id} style={s.card}>
            <View style={s.topRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{m.label}</Text>
                <Text style={s.sub}>{fmt(m.amount)}</Text>
              </View>
              <View style={[s.badge, m.status === "received" ? { backgroundColor: C.green + "22" } : { backgroundColor: C.bg }]}>
                <Text style={[s.badgeT, { color: m.status === "received" ? C.green : C.muted }]}>{m.status}</Text>
              </View>
            </View>

            <View style={s.actionsRow}>
              {m.status === "pending" && canEdit && (
                <TouchableOpacity style={s.actionBtn} onPress={() => setReceiving(m)} activeOpacity={0.8}>
                  <Ionicons name="checkmark-circle-outline" size={ms(14)} color={colors.primary} />
                  <Text style={[s.actionBtnT, { color: colors.primary }]}>Mark Received</Text>
                </TouchableOpacity>
              )}
              {!m.invoice ? (
                canEdit && (
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleGenerateInvoice(m.id)} disabled={invoicingId === m.id} activeOpacity={0.8}>
                    {invoicingId === m.id
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <><Ionicons name="document-text-outline" size={ms(14)} color={colors.primary} /><Text style={[s.actionBtnT, { color: colors.primary }]}>Generate Invoice</Text></>}
                  </TouchableOpacity>
                )
              ) : (
                <>
                  <Text style={s.invoiceNo}>{m.invoice.invoiceNumber}</Text>
                  <TouchableOpacity style={s.iconBtn} onPress={() => handleDownload(m.invoice!.id, m.invoice!.invoiceNumber)} disabled={downloadingId === m.invoice!.id}>
                    {downloadingId === m.invoice!.id
                      ? <ActivityIndicator size="small" color={C.muted} />
                      : <Ionicons name="share-outline" size={ms(16)} color={C.muted} />}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => onCopyLink(m.invoice!.shareToken)}>
                    <Ionicons name="link-outline" size={ms(16)} color={C.muted} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ))
      )}

      <AddMilestoneSheet visible={showAdd} contractId={contractId} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); onChanged(); }} />
      <ReceiveMilestoneSheet visible={!!receiving} milestone={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); onChanged(); }} />
    </View>
  );
}

const makePStyles = (colors: ThemeColors) => StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(10) },
  sectionTitle: { ...T.sectionHeading, color: C.muted, letterSpacing: 0.5 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: colors.primary + "14", borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(6), borderWidth: 1, borderColor: colors.primary + "30" },
  addBtnT: { ...T.chipText },
  emptyHint: { ...T.body, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: ms(14), padding: ms(12), marginBottom: ms(10), shadowColor: C.text, shadowOffset: { width: 0, height: ms(2) }, shadowOpacity: 0.05, shadowRadius: ms(6), elevation: 1 },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: ms(8) },
  label: { ...T.listItemTitle, color: C.text },
  sub: { ...T.caption, color: C.muted, marginTop: ms(2) },
  badge: { borderRadius: ms(6), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  badgeT: { ...T.badgeText },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: ms(10), marginTop: ms(10), flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: ms(5) },
  actionBtnT: { ...T.chipText },
  invoiceNo: { ...T.caption, color: C.muted, fontFamily: "monospace" as any },
  iconBtn: { width: ms(28), height: ms(28), borderRadius: ms(9), backgroundColor: C.inputBg, justifyContent: "center", alignItems: "center" },
});

const makeCsStyles = (colors: ThemeColors) => StyleSheet.create({
  sheet: { paddingHorizontal: ms(20), paddingTop: ms(20), paddingBottom: ms(8) },
  head: { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(14) },
  headIcon: { width: ms(42), height: ms(42), borderRadius: ms(13), backgroundColor: colors.primary + "12", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  headTitle: { ...T.cardTitle, color: C.text },
  closeBtn: { width: ms(32), height: ms(32), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(16) },
  label: { ...T.sectionHeading, color: C.muted, marginBottom: ms(8) },
  textField: { backgroundColor: C.inputBg, borderRadius: ms(12), padding: ms(12), ...T.body, color: C.text, marginBottom: ms(16) },
  submitBtn: { borderRadius: ms(14), paddingVertical: ms(15), alignItems: "center", marginBottom: ms(8) },
  submitT: { ...T.buttonText, color: "#fff" },
});

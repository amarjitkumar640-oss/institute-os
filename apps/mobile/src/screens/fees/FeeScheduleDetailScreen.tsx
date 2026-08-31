import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal,
  KeyboardAvoidingView, Platform, RefreshControl, Dimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { usePermission } from "../../hooks/usePermission";
import { useAlert } from "../../context/AlertContext";
import { useKeyboardScrollIntoView } from "../../hooks/useKeyboardScrollIntoView";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { BottomSheet, SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { T } from "../../components/ui/typography";
import {
  getScheduleDetail, recordPayment, applyDiscount,
  installmentOutstanding, scheduleTotalPaid, scheduleTotalOutstanding,
  type StudentFeeSchedule, type ScheduleInstallment, type TxnMode,
} from "../../api/fees";

type Props = NativeStackScreenProps<RootStackParamList, "FeeScheduleDetail">;

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_MODES: { key: TxnMode; label: string; icon: string }[] = [
  { key: "cash",          label: "Cash",         icon: "cash-outline"           },
  { key: "upi",           label: "UPI",          icon: "phone-portrait-outline" },
  { key: "card",          label: "Card",         icon: "card-outline"           },
  { key: "bank_transfer", label: "Bank",         icon: "business-outline"       },
  { key: "cheque",        label: "Cheque",       icon: "document-text-outline"  },
];

type InstallmentStatus = ScheduleInstallment["status"];

const INST_META: Record<InstallmentStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending:  { label: "Pending",  color: C.blue,    bg: "#EBF3FD", icon: "calendar-outline"          },
  partial:  { label: "Partial",  color: "#946200", bg: "#FFF3D6", icon: "time-outline"              },
  overdue:  { label: "Overdue",  color: C.red,     bg: "#FBE9E7", icon: "warning-outline"           },
  paid:     { label: "Paid",     color: C.green,   bg: C.greenBg, icon: "checkmark-circle-outline"  },
  waived:   { label: "Waived",   color: C.muted,   bg: C.bg, icon: "shield-checkmark-outline"  },
  deferred: { label: "Deferred", color: "#946200", bg: "#FFF3D6", icon: "arrow-forward-circle-outline" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmountFull(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(iso: string): string {
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const MODE_LABEL: Record<string, string> = {
  cash: "Cash", upi: "UPI", card: "Card", bank_transfer: "Bank Transfer", cheque: "Cheque",
};

const SCREEN_H = Dimensions.get("window").height;

// ── Wave ──────────────────────────────────────────────────────────────────────

// ── Record Payment Modal ──────────────────────────────────────────────────────

function RecordPaymentModal({
  visible,
  schedule,
  targetInstallment,
  onClose,
  onDone,
}: {
  visible:           boolean;
  schedule:          StudentFeeSchedule | null;
  targetInstallment: ScheduleInstallment | null;
  onClose:           () => void;
  onDone:            () => void;
}) {
  const { showAlert } = useAlert();
  const colors = useThemeColors();
  const pm = useThemedStyles(makePmStyles);

  const [mode,    setMode]    = useState<TxnMode>("cash");
  const [amount,  setAmount]  = useState("");
  const [notes,   setNotes]   = useState("");
  const [upiRef,  setUpiRef]  = useState("");
  const [cheqNo,  setCheqNo]  = useState("");
  const [saving,  setSaving]  = useState(false);

  const { scrollRef, recordFieldY, scrollFieldIntoView, onScrollViewLayout, onScroll } =
    useKeyboardScrollIntoView({ sheetHeight: SCREEN_H * 0.65 });

  const isGeneral = !targetInstallment;

  useEffect(() => {
    if (!visible) return;
    setMode("cash"); setNotes(""); setUpiRef(""); setCheqNo("");
    if (targetInstallment) {
      const out = installmentOutstanding(targetInstallment);
      setAmount(out > 0 ? String(out) : "");
    } else if (schedule) {
      const out = scheduleTotalOutstanding(schedule);
      setAmount(out > 0 ? String(out) : "");
    } else {
      setAmount("");
    }
  }, [visible, targetInstallment, schedule]);

  // Live allocation preview for general payments
  const allocation = useMemo(() => {
    if (!isGeneral || !schedule) return null;
    const entered = parseFloat(amount) || 0;
    if (entered <= 0) return null;
    let remaining = entered;
    const rows: { label: string; amount: number }[] = [];
    const pending = [...(schedule.installments ?? [])]
      .filter((i) => ["pending", "partial", "overdue"].includes(i.status))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const inst of pending) {
      if (remaining <= 0) break;
      const out = installmentOutstanding(inst);
      if (out <= 0) continue;
      const applying = Math.min(remaining, out);
      remaining -= applying;
      rows.push({ label: inst.label, amount: applying });
    }
    return { rows, leftover: remaining };
  }, [isGeneral, schedule, amount]);

  async function submit() {
    if (!schedule) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      showAlert("Invalid amount", "Please enter a valid payment amount.", "error");
      return;
    }
    setSaving(true);
    try {
      await recordPayment({
        scheduleId:    schedule.id,
        installmentId: targetInstallment?.id,
        amount:        amt,
        mode,
        paidAt:        todayISO(),
        upiRef:        mode === "upi"    ? upiRef.trim()  || undefined : undefined,
        chequeNo:      mode === "cheque" ? cheqNo.trim()  || undefined : undefined,
        notes:         notes.trim() || undefined,
      });
      onDone();
      showAlert("Payment Recorded", `${fmtAmountFull(amt)} recorded successfully.`, "success" as any);
    } catch {
      showAlert("Error", "Could not record payment. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={pm.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={pm.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={pm.sheet}>
          <View style={pm.drag} />

          <View style={pm.head}>
            <View style={pm.headIcon}>
              <Ionicons name="cash-outline" size={ms(20)} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={pm.headTitle}>Record Payment</Text>
              <Text style={pm.headSub} numberOfLines={1}>
                {targetInstallment ? targetInstallment.label : "Auto-allocates to pending installments"}
              </Text>
            </View>
            <TouchableOpacity style={pm.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={ms(18)} color={C.text} />
            </TouchableOpacity>
          </View>

          <View style={pm.divider} />

          <ScrollView
            ref={scrollRef}
            style={{ flexShrink: 1 }}
            onLayout={onScrollViewLayout}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
          {/* Amount field */}
          <View onLayout={recordFieldY("amount")}>
          <Text style={pm.label}>Amount</Text>
          <View style={pm.amtField}>
            <Text style={pm.amtPrefix}>₹</Text>
            <TextInput
              style={pm.amtInput}
              value={amount}
              onChangeText={setAmount}
              onFocus={() => scrollFieldIntoView("amount")}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={C.placeholder}
            />
            {(() => {
              const fullAmt = targetInstallment
                ? installmentOutstanding(targetInstallment)
                : (schedule ? scheduleTotalOutstanding(schedule) : 0);
              return fullAmt > 0 ? (
                <TouchableOpacity
                  style={pm.fullBtn}
                  onPress={() => setAmount(String(fullAmt))}
                  activeOpacity={0.75}
                >
                  <Text style={pm.fullBtnT}>Full</Text>
                </TouchableOpacity>
              ) : null;
            })()}
          </View>
          </View>

          {/* Live allocation preview (general payments only) */}
          {isGeneral && allocation && allocation.rows.length > 0 && (
            <View style={pm.allocBox}>
              <View style={pm.allocHeader}>
                <Ionicons name="git-branch-outline" size={ms(12)} color={C.blue} />
                <Text style={pm.allocTitle}>Will be applied to</Text>
              </View>
              {allocation.rows.map((row, i) => (
                <View key={i} style={pm.allocRow}>
                  <View style={pm.allocDot} />
                  <Text style={pm.allocLabel} numberOfLines={1}>{row.label}</Text>
                  <Text style={pm.allocAmt}>₹{row.amount.toLocaleString("en-IN")}</Text>
                </View>
              ))}
              {allocation.leftover > 0 && (
                <View style={pm.allocRow}>
                  <View style={[pm.allocDot, { backgroundColor: C.green }]} />
                  <Text style={[pm.allocLabel, { color: C.green }]}>Credit balance</Text>
                  <Text style={[pm.allocAmt, { color: C.green }]}>
                    +₹{allocation.leftover.toLocaleString("en-IN")}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Payment mode */}
          <Text style={pm.label}>Payment Mode</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pm.modeRow}>
            {PAYMENT_MODES.map((m) => {
              const active = mode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[pm.modeChip, active && pm.modeChipOn]}
                  onPress={() => setMode(m.key)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={m.icon as any} size={ms(14)} color={active ? colors.primary : C.muted} />
                  <Text style={[pm.modeChipT, active && pm.modeChipTOn]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {mode === "upi" && (
            <View onLayout={recordFieldY("upiRef")}>
              <Text style={pm.label}>UPI Reference <Text style={pm.optional}>(optional)</Text></Text>
              <TextInput
                style={pm.textField}
                value={upiRef}
                onChangeText={setUpiRef}
                onFocus={() => scrollFieldIntoView("upiRef")}
                placeholder="e.g. 123456789012"
                placeholderTextColor={C.placeholder}
              />
            </View>
          )}
          {mode === "cheque" && (
            <View onLayout={recordFieldY("cheqNo")}>
              <Text style={pm.label}>Cheque No. <Text style={pm.optional}>(optional)</Text></Text>
              <TextInput
                style={pm.textField}
                value={cheqNo}
                onChangeText={setCheqNo}
                onFocus={() => scrollFieldIntoView("cheqNo")}
                placeholder="e.g. 000123"
                placeholderTextColor={C.placeholder}
              />
            </View>
          )}

          <View onLayout={recordFieldY("notes")}>
          <Text style={pm.label}>Notes <Text style={pm.optional}>(optional)</Text></Text>
          <TextInput
            style={[pm.textField, { minHeight: ms(64), textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            onFocus={() => scrollFieldIntoView("notes")}
            placeholder="e.g. Cash collected at counter"
            placeholderTextColor={C.placeholder}
            multiline
          />
          </View>
          <View style={{ height: ms(12) }} />
          </ScrollView>

          <TouchableOpacity
            style={[pm.submitBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.65 }]}
            onPress={submit}
            disabled={saving}
            activeOpacity={0.88}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="checkmark-circle-outline" size={ms(18)} color="#fff" />
                  <Text style={pm.submitT}>Confirm Payment</Text>
                </>
            }
          </TouchableOpacity>
          <View style={{ height: ms(12) }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Apply Discount Sheet ─────────────────────────────────────────────────────

function ApplyDiscountSheet({
  visible,
  schedule,
  onClose,
  onDone,
}: {
  visible:  boolean;
  schedule: StudentFeeSchedule | null;
  onClose:  () => void;
  onDone:   () => void;
}) {
  const { showAlert } = useAlert();
  const colors = useThemeColors();
  const ds = useThemedStyles(makeDsStyles);

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount(schedule?.discountAmount ? String(Number(schedule.discountAmount)) : "");
    setReason(schedule?.discountReason ?? "");
  }, [visible, schedule]);

  async function submit() {
    if (!schedule) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) {
      showAlert("Invalid amount", "Please enter a valid discount amount.", "error");
      return;
    }
    setSaving(true);
    try {
      await applyDiscount(schedule.id, { discountAmount: amt, discountReason: reason.trim() || undefined });
      onDone();
      showAlert("Discount Applied", `${fmtAmountFull(amt)} discount applied successfully.`, "success" as any);
    } catch {
      showAlert("Error", "Could not apply discount. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={SHEET_HEIGHT.short}>
      <View style={ds.sheet}>
        <View style={ds.head}>
          <View style={ds.headIcon}>
            <Ionicons name="pricetag-outline" size={ms(20)} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ds.headTitle}>Apply Discount</Text>
            <Text style={ds.headSub} numberOfLines={1}>Reduces the total fee for this student</Text>
          </View>
          <TouchableOpacity style={ds.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>

        <View style={ds.divider} />

        <Text style={ds.label}>Discount Amount</Text>
        <View style={ds.amtField}>
          <Text style={ds.amtPrefix}>₹</Text>
          <TextInput
            style={ds.amtInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={C.placeholder}
          />
        </View>

        <Text style={ds.label}>Reason <Text style={ds.optional}>(optional)</Text></Text>
        <TextInput
          style={ds.textField}
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Sibling discount"
          placeholderTextColor={C.placeholder}
        />

        <TouchableOpacity
          style={[ds.submitBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.65 }]}
          onPress={submit}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={ms(18)} color="#fff" />
                <Text style={ds.submitT}>Apply Discount</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

// ── Installment card ──────────────────────────────────────────────────────────

function InstallmentRow({
  inst,
  onCollect,
}: {
  inst:      ScheduleInstallment;
  onCollect: () => void;
}) {
  const meta        = INST_META[inst.status];
  const outstanding = installmentOutstanding(inst);
  const canCollect  = inst.status === "pending" || inst.status === "partial" || inst.status === "overdue";
  const planned     = Number(inst.plannedAmount);
  const paid        = Number(inst.paidAmount);
  const paidPct     = planned > 0 ? Math.min(1, paid / planned) : 0;

  const subParts = [`Due ${fmtDate(inst.dueDate)}`];
  if (paid > 0 && outstanding > 0) subParts.push(`Paid ${fmtAmountFull(paid)}`);

  return (
    <TouchableOpacity
      style={[ir.card, inst.status === "overdue" && ir.cardOverdue]}
      onPress={canCollect ? onCollect : undefined}
      activeOpacity={canCollect ? 0.76 : 1}
    >
      <View style={ir.row}>
        {/* Left: label + date */}
        <View style={ir.info}>
          <Text style={ir.label} numberOfLines={1}>{inst.label}</Text>
          <Text style={ir.sub} numberOfLines={1}>{subParts.join(" · ")}</Text>
          {Number(inst.lateFee) > 0 && (
            <Text style={ir.lateFeeT}>+{fmtAmountFull(Number(inst.lateFee))} late fee</Text>
          )}
          {Number(inst.waivedAmount) > 0 && (
            <Text style={ir.waivedT}>Waived {fmtAmountFull(Number(inst.waivedAmount))}</Text>
          )}
        </View>

        {/* Right: amount + badge + collect hint */}
        <View style={ir.right}>
          <Text style={[ir.amount, { color: outstanding > 0 ? meta.color : C.muted }]}>
            {outstanding > 0 ? fmtAmountFull(outstanding) : fmtAmountFull(planned)}
          </Text>
          <View style={[ir.badge, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={ms(8)} color={meta.color} />
            <Text style={[ir.badgeT, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {canCollect && (
            <View style={ir.collectHint}>
              <Text style={[ir.collectHintT, { color: meta.color }]}>Collect</Text>
              <Ionicons name="chevron-forward" size={ms(10)} color={meta.color} />
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function FeeScheduleDetailScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const sc = useThemedStyles(makeScStyles);
  const { enrollmentId, studentName } = route.params;
  const insets = useSafeAreaInsets();

  const [schedule,          setSchedule]          = useState<StudentFeeSchedule | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [refreshing,        setRefreshing]        = useState(false);
  const [error,             setError]             = useState<string | null>(null);
  const [payModalVisible,   setPayModalVisible]   = useState(false);
  const [targetInstallment, setTargetInstallment] = useState<ScheduleInstallment | null>(null);
  const [discountVisible,   setDiscountVisible]   = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const s = await getScheduleDetail(enrollmentId);
      setSchedule(s);
      setError(null);
    } catch {
      if (!silent) setError("Failed to load fee details.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enrollmentId]);

  useEffect(() => { load(); }, [load]);

  function openPayModal(inst: ScheduleInstallment | null) {
    setTargetInstallment(inst);
    setPayModalVisible(true);
  }

  function handlePayDone() {
    setPayModalVisible(false);
    load(true);
  }

  function handleDiscountDone() {
    setDiscountVisible(false);
    load(true);
  }

  // Derived summary numbers
  const totalFee    = Number(schedule?.effectiveFee ?? 0);
  const totalPaid   = schedule ? scheduleTotalPaid(schedule) : 0;
  const outstanding = schedule ? scheduleTotalOutstanding(schedule) : 0;
  const credit      = Number(schedule?.creditBalance ?? 0);
  const discountAmt = Number(schedule?.discountAmount ?? 0);

  const student = schedule?.enrollment?.student;
  const batch   = schedule?.enrollment?.batch;

  const feesPermission = usePermission("fees");
  const canRecord = feesPermission.canWrite;
  const canDiscount = feesPermission.canEdit;

  // Separate pending/partial/overdue from done
  const pendingInst  = (schedule?.installments ?? []).filter((i) => i.status !== "paid" && i.status !== "waived");
  const completedInst = (schedule?.installments ?? []).filter((i) => i.status === "paid" || i.status === "waived");

  const txnHistory = schedule?.transactions ?? [];

  return (
    <SafeAreaView style={sc.safe} edges={["bottom"]}>

      <ScreenHeader
        title="Payment Schedule"
        onBack={() => navigation.goBack()}
        right={schedule && (canRecord || canDiscount)
          ? (
              <View style={sc.headerActions}>
                {canDiscount && (
                  <TouchableOpacity style={sc.discountFab} onPress={() => setDiscountVisible(true)} activeOpacity={0.85}>
                    <Ionicons name="pricetag-outline" size={ms(14)} color={C.muted} />
                  </TouchableOpacity>
                )}
                {canRecord && (
                  <TouchableOpacity style={sc.payFab} onPress={() => openPayModal(null)} activeOpacity={0.85}>
                    <Ionicons name="add" size={ms(14)} color={colors.primary} />
                    <Text style={[sc.payFabT, { color: colors.primary }]}>Record</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          : undefined
        }
      />

      {/* Student identity + fee stats card */}
      {schedule && (
        <View style={sc.summaryCard}>
          <View style={sc.studentRow}>
            <View style={[sc.avatar, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[sc.avatarT, { color: colors.primary }]}>{initials(studentName)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={sc.studentName} numberOfLines={1}>{studentName}</Text>
              {batch?.name && (
                <View style={sc.batchPill}>
                  <Ionicons name="layers-outline" size={ms(11)} color={C.muted} />
                  <Text style={sc.batchPillT} numberOfLines={1}>{batch.name}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={sc.divider} />

          <View style={sc.feeStrip}>
            <View style={sc.stripItem}>
              <Text style={sc.stripLbl}>Total Fee</Text>
              <Text style={sc.stripVal}>{fmtAmountFull(totalFee)}</Text>
            </View>
            <View style={sc.stripDivider} />
            <View style={sc.stripItem}>
              <Text style={sc.stripLbl}>Collected</Text>
              <Text style={[sc.stripVal, { color: C.green }]}>{fmtAmountFull(totalPaid)}</Text>
            </View>
            <View style={sc.stripDivider} />
            <View style={sc.stripItem}>
              <Text style={sc.stripLbl}>Outstanding</Text>
              <Text style={[sc.stripVal, outstanding > 0 && { color: C.red }]}>
                {fmtAmountFull(outstanding)}
              </Text>
            </View>
          </View>

          {totalFee > 0 && (
            <View style={sc.progressWrap}>
              <View style={sc.progressTrack}>
                <View
                  style={[
                    sc.progressFill,
                    { width: `${Math.min(100, Math.round((totalPaid / totalFee) * 100))}%` as any, backgroundColor: C.green },
                  ]}
                />
              </View>
              <Text style={sc.progressLbl}>
                {Math.min(100, Math.round((totalPaid / totalFee) * 100))}% collected
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Body ── */}
      <View style={sc.body}>
        {loading && (
          <View style={sc.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {!!error && !loading && (
          <View style={sc.centered}>
            <Text style={sc.errorT}>{error}</Text>
            <TouchableOpacity style={sc.retryBtn} onPress={() => load()}>
              <Text style={sc.retryBtnT}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && schedule && (
          <ScrollView
            contentContainerStyle={sc.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(true); }}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          >
            {/* Discount / credit info chips */}
            {(discountAmt > 0 || credit > 0) && (
              <View style={sc.chipStrip}>
                {discountAmt > 0 && (
                  <View style={sc.infoChip}>
                    <Ionicons name="pricetag-outline" size={ms(11)} color="#946200" />
                    <Text style={[sc.infoChipT, { color: "#946200" }]}>
                      {fmtAmountFull(discountAmt)} discount{schedule.discountReason ? ` · ${schedule.discountReason}` : ""}
                    </Text>
                  </View>
                )}
                {credit > 0 && (
                  <View style={[sc.infoChip, { backgroundColor: C.greenBg }]}>
                    <Ionicons name="wallet-outline" size={ms(11)} color={C.green} />
                    <Text style={[sc.infoChipT, { color: C.green }]}>
                      {fmtAmountFull(credit)} credit balance
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Pending installments */}
            {pendingInst.length > 0 && (
              <>
                <Text style={sc.sectionTitle}>Pending Installments</Text>
                {pendingInst.map((inst) => (
                  <InstallmentRow
                    key={inst.id}
                    inst={inst}
                    onCollect={() => openPayModal(inst)}
                  />
                ))}
              </>
            )}

            {/* Completed installments */}
            {completedInst.length > 0 && (
              <>
                <Text style={sc.sectionTitle}>Completed</Text>
                {completedInst.map((inst) => (
                  <InstallmentRow
                    key={inst.id}
                    inst={inst}
                    onCollect={() => openPayModal(inst)}
                  />
                ))}
              </>
            )}

            {/* Payment history */}
            {txnHistory.length > 0 && (
              <>
                <Text style={sc.sectionTitle}>Payment History</Text>
                <View style={sc.historyCard}>
                  {txnHistory.map((txn, i) => (
                    <React.Fragment key={txn.id}>
                      {i > 0 && <View style={sc.histDivider} />}
                      <View style={sc.histRow}>
                        <View style={[sc.histIcon, { backgroundColor: txn.type === "refund" ? "#FBE9E7" : C.greenBg }]}>
                          <Ionicons
                            name={txn.type === "refund" ? "arrow-undo-outline" : "checkmark-outline"}
                            size={ms(15)}
                            color={txn.type === "refund" ? C.red : C.green}
                          />
                        </View>
                        <View style={sc.histBody}>
                          <Text style={sc.histLabel} numberOfLines={1}>
                            {txn.installment?.label ?? "General Payment"}
                          </Text>
                          <Text style={sc.histMeta} numberOfLines={1}>
                            {MODE_LABEL[txn.mode] ?? txn.mode} · {fmtDateTime(txn.paidAt)}
                            {txn.collectedBy ? ` · ${txn.collectedBy.fullName}` : ""}
                          </Text>
                          {txn.receiptNo && (
                            <Text style={sc.histReceipt}>#{txn.receiptNo}</Text>
                          )}
                        </View>
                        <Text style={[sc.histAmt, txn.type === "refund" && { color: C.red }]}>
                          {txn.type === "refund" ? "−" : "+"}{fmtAmountFull(Number(txn.amount))}
                        </Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </>
            )}

            {pendingInst.length === 0 && completedInst.length === 0 && (
              <View style={sc.centered}>
                <Ionicons name="document-outline" size={ms(40)} color={C.placeholder} />
                <Text style={sc.emptyT}>No installments found</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Record payment modal */}
      <RecordPaymentModal
        visible={payModalVisible}
        schedule={schedule}
        targetInstallment={targetInstallment}
        onClose={() => setPayModalVisible(false)}
        onDone={handlePayDone}
      />

      {/* Apply discount sheet */}
      <ApplyDiscountSheet
        visible={discountVisible}
        schedule={schedule}
        onClose={() => setDiscountVisible(false)}
        onDone={handleDiscountDone}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ir = StyleSheet.create({
  card: {
    backgroundColor:  C.card,
    borderRadius:     ms(12),
    marginHorizontal: ms(16),
    marginBottom:     ms(7),
    overflow:         "hidden",
    shadowColor:      C.text,
    shadowOffset:     { width: 0, height: ms(2) },
    shadowOpacity:    0.07,
    shadowRadius:     ms(6),
    elevation:        2,
  },
  cardOverdue: { backgroundColor: "#FFF8F7" },
  row: {
    flexDirection:  "row",
    alignItems:     "center",
    paddingVertical: ms(11),
    paddingLeft:    ms(16),
    paddingRight:   ms(12),
    gap:            ms(10),
  },
  info:     { flex: 1, minWidth: 0, gap: ms(3) },
  label:    { ...T.listItemTitle, color: C.text },
  sub:      { ...T.caption, color: C.muted },
  lateFeeT: { ...T.caption, color: "#946200" },
  waivedT:  { ...T.caption, color: C.green },
  right:    { alignItems: "flex-end", flexShrink: 0, gap: ms(4) },
  amount:   { ...T.listItemTitle },
  badge: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(3),
    borderRadius:      ms(6),
    paddingHorizontal: ms(7),
    paddingVertical:   ms(2),
  },
  badgeT:      { ...T.badgeText, letterSpacing: 0.2 },
  collectHint: { flexDirection: "row", alignItems: "center", gap: ms(2) },
  collectHintT: { ...T.chipText },
});

const makeScStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.screenBg },
  body:   { flex: 1, backgroundColor: colors.screenBg },

  // ── Header actions (discount + record) ──
  headerActions: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  discountFab: {
    width:           ms(30),
    height:          ms(30),
    borderRadius:     ms(20),
    justifyContent:  "center",
    alignItems:      "center",
    backgroundColor: C.inputBg,
    borderWidth:     1,
    borderColor:     C.border,
  },
  payFab: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    backgroundColor:   colors.primary + "14",
    borderRadius:      ms(20),
    paddingHorizontal: ms(10),
    paddingVertical:   ms(6),
    borderWidth:       1,
    borderColor:       colors.primary + "30",
  },
  payFabT: { ...T.chipText },

  // ── Summary card ──
  summaryCard: {
    marginHorizontal: ms(16),
    marginTop:        ms(10),
    marginBottom:     ms(4),
    backgroundColor:  C.card,
    borderRadius:     ms(18),
    overflow:         "hidden",
    shadowColor:      C.text,
    shadowOffset:     { width: 0, height: 3 },
    shadowOpacity:    0.07,
    shadowRadius:     ms(10),
    elevation:        3,
  },

  // ── Student identity ──
  studentRow: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(12),
    paddingHorizontal: ms(14),
    paddingVertical:   ms(12),
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: ms(14) },
  avatar: {
    width:           ms(44),
    height:          ms(44),
    borderRadius:    ms(13),
    justifyContent:  "center",
    alignItems:      "center",
    flexShrink:      0,
  },
  avatarT:     { ...T.listItemTitle, includeFontPadding: false },
  studentName: { ...T.cardTitle, color: C.text, marginBottom: ms(4) },
  batchPill: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    backgroundColor:   C.inputBg,
    borderRadius:      ms(6),
    paddingHorizontal: ms(7),
    paddingVertical:   ms(3),
    alignSelf:         "flex-start",
    borderWidth:       1,
    borderColor:       C.border,
  },
  batchPillT: { ...T.chipText, color: C.muted },

  // ── 3-stat strip ──
  feeStrip: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: ms(14),
    paddingVertical:   ms(12),
  },
  stripItem:    { flex: 1, alignItems: "center" },
  stripLbl:     {
    ...T.sectionHeading,
    color:         C.muted,
    marginBottom:  ms(4),
  },
  stripVal:     { ...T.cardTitle, color: C.text },
  stripDivider: { width: 1, height: ms(32), backgroundColor: C.border, marginHorizontal: ms(4) },

  // ── Progress bar ──
  progressWrap: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(10),
    paddingHorizontal: ms(14),
    paddingBottom:     ms(12),
  },
  progressTrack: {
    flex:            1,
    height:          ms(5),
    backgroundColor: C.inputBg,
    borderRadius:    ms(4),
    overflow:        "hidden",
  },
  progressFill: {
    height:       ms(5),
    borderRadius: ms(4),
  },
  progressLbl: { ...T.caption, color: C.muted, flexShrink: 0 },

  // ── Body ──
  scroll:       { paddingTop: ms(8), paddingBottom: ms(60) },
  sectionTitle: {
    ...T.sectionHeading,
    color:            C.muted,
    marginHorizontal: ms(16),
    marginBottom:     ms(8),
    marginTop:        ms(18),
  },

  chipStrip: {
    flexDirection:     "row",
    flexWrap:          "wrap",
    gap:               ms(8),
    paddingHorizontal: ms(16),
    marginBottom:      ms(4),
  },
  infoChip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    backgroundColor:   "#FFF3D6",
    borderRadius:      ms(8),
    paddingHorizontal: ms(10),
    paddingVertical:   ms(5),
  },
  infoChipT: { ...T.chipText },

  // ── Payment history ──
  historyCard: {
    backgroundColor:  C.card,
    borderRadius:     ms(16),
    marginHorizontal: ms(16),
    overflow:         "hidden",
    shadowColor:      C.text,
    shadowOffset:     { width: 0, height: ms(3) },
    shadowOpacity:    0.08,
    shadowRadius:     ms(8),
    elevation:        2,
  },
  histRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           ms(12),
    padding:       ms(14),
  },
  histIcon: {
    width:          ms(36),
    height:         ms(36),
    borderRadius:   ms(11),
    justifyContent: "center",
    alignItems:     "center",
    flexShrink:     0,
  },
  histBody:    { flex: 1, minWidth: 0 },
  histLabel:   { ...T.listItemTitle, color: C.text },
  histMeta:    { ...T.caption, color: C.muted, marginTop: ms(2) },
  histReceipt: { ...T.caption, color: C.placeholder, marginTop: ms(2) },
  histAmt:     { ...T.listItemTitle, color: C.green, flexShrink: 0 },
  histDivider: { height: 1, backgroundColor: C.bg, marginHorizontal: ms(14) },

  centered:  { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: ms(60) },
  emptyT:    { ...T.body, color: C.muted, marginTop: ms(12) },
  errorT:    { ...T.body, color: C.red, textAlign: "center", paddingHorizontal: ms(24) },
  retryBtn:  {
    marginTop:         ms(16),
    paddingHorizontal: ms(20),
    paddingVertical:   ms(10),
    backgroundColor:   colors.primary,
    borderRadius:      ms(10),
  },
  retryBtnT: { ...T.buttonText, color: "#fff" },
});

const makePmStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor:      C.card,
    borderTopLeftRadius:  ms(24),
    borderTopRightRadius: ms(24),
    paddingHorizontal:    ms(20),
    paddingTop:           ms(8),
    maxHeight:            SHEET_HEIGHT.short,
  },
  drag: {
    width:           ms(36),
    height:          ms(4),
    borderRadius:    ms(2),
    backgroundColor: C.border,
    alignSelf:       "center",
    marginBottom:    ms(16),
  },
  head: { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(14) },
  headIcon: {
    width:           ms(42),
    height:          ms(42),
    borderRadius:    ms(13),
    backgroundColor: colors.primary + "12",
    justifyContent:  "center",
    alignItems:      "center",
    flexShrink:      0,
  },
  headTitle: { ...T.cardTitle, color: C.text },
  headSub:   { ...T.caption, color: C.muted, marginTop: ms(2) },
  closeBtn: {
    width:           ms(32),
    height:          ms(32),
    borderRadius:    ms(10),
    backgroundColor: C.bg,
    justifyContent:  "center",
    alignItems:      "center",
    flexShrink:      0,
  },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(8) },

  label:    { ...T.sectionHeading, color: C.muted, marginBottom: ms(8) },
  optional: { fontFamily: "Inter_400Regular", fontWeight: "400", textTransform: "none" },

  amtField: {
    flexDirection:     "row",
    alignItems:        "center",
    backgroundColor:   C.inputBg,
    borderRadius:      ms(12),
    paddingHorizontal: ms(14),
    marginBottom:      ms(16),
    gap:               ms(6),
  },
  amtPrefix: { ...T.displayMedium, color: C.text },
  amtInput:  { flex: 1, ...T.displayMedium, color: C.text, padding: ms(12), includeFontPadding: false },
  fullBtn: {
    backgroundColor:   colors.primary,
    borderRadius:      ms(8),
    paddingHorizontal: ms(10),
    paddingVertical:   ms(5),
  },
  fullBtnT: { ...T.chipText, color: "#fff" },

  modeRow: { flexDirection: "row", gap: ms(8), marginBottom: ms(16), paddingBottom: ms(2) },
  modeChip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(6),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(9),
    borderRadius:      ms(10),
    backgroundColor:   C.inputBg,
    borderWidth:       1.5,
    borderColor:       "transparent",
  },
  modeChipOn:  { backgroundColor: colors.primary + "0D", borderColor: colors.primary + "50" },
  modeChipT:   { ...T.chipText, color: C.muted },
  modeChipTOn: { color: colors.primary, fontFamily: "Inter_700Bold", fontWeight: "700" },

  textField: {
    backgroundColor:   C.inputBg,
    borderRadius:      ms(12),
    padding:           ms(12),
    ...T.body,
    color:             C.text,
    marginBottom:      ms(16),
  },

  allocBox: {
    backgroundColor:   C.blueBg,
    borderRadius:      ms(10),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(10),
    marginBottom:      ms(16),
    gap:               ms(6),
  },
  allocHeader: { flexDirection: "row", alignItems: "center", gap: ms(5), marginBottom: ms(4) },
  allocTitle:  { ...T.sectionHeading, color: C.blue },
  allocRow:    { flexDirection: "row", alignItems: "center", gap: ms(8) },
  allocDot:    { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: C.blue, flexShrink: 0 },
  allocLabel:  { flex: 1, ...T.caption, color: C.text },
  allocAmt:    { ...T.chipText, color: C.blue },

  submitBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             ms(8),
    borderRadius:    ms(14),
    paddingVertical: ms(15),
    marginBottom:    ms(8),
  },
  submitT: { ...T.buttonText, color: "#fff" },
});

const makeDsStyles = (colors: ThemeColors) => StyleSheet.create({
  sheet: { paddingHorizontal: ms(20), paddingTop: ms(20), paddingBottom: ms(8) },
  head: { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(14) },
  headIcon: {
    width:           ms(42),
    height:          ms(42),
    borderRadius:    ms(13),
    backgroundColor: colors.primary + "12",
    justifyContent:  "center",
    alignItems:      "center",
    flexShrink:      0,
  },
  headTitle: { ...T.cardTitle, color: C.text },
  headSub:   { ...T.caption, color: C.muted, marginTop: ms(2) },
  closeBtn: {
    width:           ms(32),
    height:          ms(32),
    borderRadius:    ms(10),
    backgroundColor: C.inputBg,
    borderWidth:     1,
    borderColor:     C.border,
    justifyContent:  "center",
    alignItems:      "center",
    flexShrink:      0,
  },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(16) },

  label:    { ...T.sectionHeading, color: C.muted, marginBottom: ms(8) },
  optional: { fontFamily: "Inter_400Regular", fontWeight: "400", textTransform: "none" },

  amtField: {
    flexDirection:     "row",
    alignItems:        "center",
    backgroundColor:   C.inputBg,
    borderRadius:      ms(12),
    paddingHorizontal: ms(14),
    marginBottom:      ms(16),
    gap:               ms(6),
  },
  amtPrefix: { ...T.displayMedium, color: C.text },
  amtInput:  { flex: 1, ...T.displayMedium, color: C.text, padding: ms(12), includeFontPadding: false },

  textField: {
    backgroundColor: C.inputBg,
    borderRadius:    ms(12),
    padding:         ms(12),
    ...T.body,
    color:           C.text,
    marginBottom:    ms(20),
  },

  submitBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             ms(8),
    borderRadius:    ms(14),
    paddingVertical: ms(15),
    marginBottom:    ms(8),
  },
  submitT: { ...T.buttonText, color: "#fff" },
});

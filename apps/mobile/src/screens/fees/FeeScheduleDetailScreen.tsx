import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, TextInput, Modal,
  KeyboardAvoidingView, Platform, RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Path } from "react-native-svg";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import { ms, fs, sw } from "../../utils/responsive";
import { C } from "../../theme";
import {
  getScheduleDetail, recordPayment,
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
  pending:  { label: "Pending",  color: "#2563A8", bg: "#EBF3FD", icon: "calendar-outline"          },
  partial:  { label: "Partial",  color: "#946200", bg: "#FFF3D6", icon: "time-outline"              },
  overdue:  { label: "Overdue",  color: "#C0392B", bg: "#FBE9E7", icon: "warning-outline"           },
  paid:     { label: "Paid",     color: "#1B9C63", bg: "#E7F7EF", icon: "checkmark-circle-outline"  },
  waived:   { label: "Waived",   color: "#8A7F82", bg: "#F5F1EE", icon: "shield-checkmark-outline"  },
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

  const [mode,    setMode]    = useState<TxnMode>("cash");
  const [amount,  setAmount]  = useState("");
  const [notes,   setNotes]   = useState("");
  const [upiRef,  setUpiRef]  = useState("");
  const [cheqNo,  setCheqNo]  = useState("");
  const [saving,  setSaving]  = useState(false);

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
    const pending = [...schedule.installments]
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
              <Ionicons name="cash-outline" size={ms(20)} color={C.primary} />
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

          {/* Amount field */}
          <Text style={pm.label}>Amount</Text>
          <View style={pm.amtField}>
            <Text style={pm.amtPrefix}>₹</Text>
            <TextInput
              style={pm.amtInput}
              value={amount}
              onChangeText={setAmount}
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

          {/* Live allocation preview (general payments only) */}
          {isGeneral && allocation && allocation.rows.length > 0 && (
            <View style={pm.allocBox}>
              <View style={pm.allocHeader}>
                <Ionicons name="git-branch-outline" size={ms(12)} color="#2563A8" />
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
                  <View style={[pm.allocDot, { backgroundColor: "#1B9C63" }]} />
                  <Text style={[pm.allocLabel, { color: "#1B9C63" }]}>Credit balance</Text>
                  <Text style={[pm.allocAmt, { color: "#1B9C63" }]}>
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
                  <Ionicons name={m.icon as any} size={ms(14)} color={active ? C.primary : "#8A7F82"} />
                  <Text style={[pm.modeChipT, active && pm.modeChipTOn]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {mode === "upi" && (
            <>
              <Text style={pm.label}>UPI Reference <Text style={pm.optional}>(optional)</Text></Text>
              <TextInput
                style={pm.textField}
                value={upiRef}
                onChangeText={setUpiRef}
                placeholder="e.g. 123456789012"
                placeholderTextColor={C.placeholder}
              />
            </>
          )}
          {mode === "cheque" && (
            <>
              <Text style={pm.label}>Cheque No. <Text style={pm.optional}>(optional)</Text></Text>
              <TextInput
                style={pm.textField}
                value={cheqNo}
                onChangeText={setCheqNo}
                placeholder="e.g. 000123"
                placeholderTextColor={C.placeholder}
              />
            </>
          )}

          <Text style={pm.label}>Notes <Text style={pm.optional}>(optional)</Text></Text>
          <TextInput
            style={[pm.textField, { minHeight: ms(64), textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Cash collected at counter"
            placeholderTextColor={C.placeholder}
            multiline
          />

          <TouchableOpacity
            style={[pm.submitBtn, saving && { opacity: 0.65 }]}
            onPress={submit}
            disabled={saving}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={["#8B1E3F", "#C0422E", "#E87830"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={pm.submitGrad}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={ms(18)} color="#fff" />
                    <Text style={pm.submitT}>Confirm Payment</Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
          <View style={{ height: ms(12) }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
      <View style={[ir.stripe, { backgroundColor: meta.color }]} />

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
          <Text style={[ir.amount, { color: outstanding > 0 ? meta.color : "#8A7F82" }]}>
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
  const { enrollmentId, studentName } = route.params;
  const insets = useSafeAreaInsets();
  const { staff } = useAuth();

  const [schedule,          setSchedule]          = useState<StudentFeeSchedule | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [refreshing,        setRefreshing]        = useState(false);
  const [error,             setError]             = useState<string | null>(null);
  const [payModalVisible,   setPayModalVisible]   = useState(false);
  const [targetInstallment, setTargetInstallment] = useState<ScheduleInstallment | null>(null);

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

  // Derived summary numbers
  const totalFee    = Number(schedule?.effectiveFee ?? 0);
  const totalPaid   = schedule ? scheduleTotalPaid(schedule) : 0;
  const outstanding = schedule ? scheduleTotalOutstanding(schedule) : 0;
  const credit      = Number(schedule?.creditBalance ?? 0);
  const discountAmt = Number(schedule?.discountAmount ?? 0);

  const student = schedule?.enrollment?.student;
  const batch   = schedule?.enrollment?.batch;

  const canRecord = staff?.role === "admin" || staff?.role === "frontdesk";

  // Separate pending/partial/overdue from done
  const pendingInst  = schedule?.installments.filter((i) => i.status !== "paid" && i.status !== "waived") ?? [];
  const completedInst = schedule?.installments.filter((i) => i.status === "paid" || i.status === "waived") ?? [];

  const txnHistory = schedule?.transactions ?? [];

  return (
    <SafeAreaView style={sc.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── Gradient header ── */}
      <LinearGradient
        colors={["#8B1E3F", "#A8264A", "#C64A3E", "#E8752C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={sc.header}
      >
        <Svg width={sw} height={ms(220)} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 10 }).map((_, row) =>
            Array.from({ length: 20 }).map((_, col) => (
              <Circle
                key={`${row}-${col}`}
                cx={col * ms(22) + (row % 2 ? ms(11) : 0)}
                cy={row * ms(22) + ms(8)}
                r={ms(1.5)}
                fill="rgba(255,255,255,0.10)"
              />
            ))
          )}
        </Svg>

        {/* Top bar: back + title + record */}
        <View style={[sc.hTop, { paddingTop: insets.top + ms(10) }]}>
          <TouchableOpacity
            style={sc.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={ms(20)} color="#fff" />
          </TouchableOpacity>
          <Text style={sc.hTitle}>Payment Schedule</Text>
          {canRecord && schedule && (
            <TouchableOpacity style={sc.payFab} onPress={() => openPayModal(null)} activeOpacity={0.85}>
              <Ionicons name="add" size={ms(16)} color="#fff" />
              <Text style={sc.payFabT}>Record</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Student identity */}
        <View style={sc.studentRow}>
          <View style={sc.avatar}>
            <Text style={sc.avatarT}>{initials(studentName)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={sc.studentName} numberOfLines={1}>{studentName}</Text>
            {batch?.name && (
              <View style={sc.batchPill}>
                <Ionicons name="layers-outline" size={ms(11)} color="rgba(255,255,255,0.80)" />
                <Text style={sc.batchPillT} numberOfLines={1}>{batch.name}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 3-stat strip */}
        {schedule && (
          <>
            <View style={sc.feeStrip}>
              <View style={sc.stripItem}>
                <Text style={sc.stripLbl}>Total Fee</Text>
                <Text style={sc.stripVal}>{fmtAmountFull(totalFee)}</Text>
              </View>
              <View style={sc.stripDivider} />
              <View style={sc.stripItem}>
                <Text style={sc.stripLbl}>Collected</Text>
                <Text style={[sc.stripVal, { color: "#A8F0CE" }]}>{fmtAmountFull(totalPaid)}</Text>
              </View>
              <View style={sc.stripDivider} />
              <View style={sc.stripItem}>
                <Text style={sc.stripLbl}>Outstanding</Text>
                <Text style={[sc.stripVal, outstanding > 0 && { color: "#FFD0CC" }]}>
                  {fmtAmountFull(outstanding)}
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            {totalFee > 0 && (
              <View style={sc.progressWrap}>
                <View style={sc.progressTrack}>
                  <View
                    style={[
                      sc.progressFill,
                      { width: `${Math.min(100, Math.round((totalPaid / totalFee) * 100))}%` as any },
                    ]}
                  />
                </View>
                <Text style={sc.progressLbl}>
                  {Math.min(100, Math.round((totalPaid / totalFee) * 100))}% collected
                </Text>
              </View>
            )}
          </>
        )}

        <Wave />
      </LinearGradient>

      {/* ── Body ── */}
      <View style={sc.body}>
        {loading && (
          <View style={sc.centered}>
            <ActivityIndicator size="large" color={C.primary} />
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
                colors={[C.primary]}
                tintColor={C.primary}
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
                  <View style={[sc.infoChip, { backgroundColor: "#E7F7EF" }]}>
                    <Ionicons name="wallet-outline" size={ms(11)} color="#1B9C63" />
                    <Text style={[sc.infoChipT, { color: "#1B9C63" }]}>
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
                        <View style={[sc.histIcon, { backgroundColor: txn.type === "refund" ? "#FBE9E7" : "#E7F7EF" }]}>
                          <Ionicons
                            name={txn.type === "refund" ? "arrow-undo-outline" : "checkmark-outline"}
                            size={ms(15)}
                            color={txn.type === "refund" ? "#C0392B" : "#1B9C63"}
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
                        <Text style={[sc.histAmt, txn.type === "refund" && { color: "#C0392B" }]}>
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
                <Ionicons name="document-outline" size={ms(40)} color="#C9BDB8" />
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
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ir = StyleSheet.create({
  card: {
    backgroundColor:  "#FFF",
    borderRadius:     ms(12),
    marginHorizontal: ms(16),
    marginBottom:     ms(7),
    overflow:         "hidden",
    shadowColor:      "#2B1B1F",
    shadowOffset:     { width: 0, height: ms(2) },
    shadowOpacity:    0.07,
    shadowRadius:     ms(6),
    elevation:        2,
  },
  cardOverdue: { backgroundColor: "#FFF8F7" },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: ms(3) },
  row: {
    flexDirection:  "row",
    alignItems:     "center",
    paddingVertical: ms(11),
    paddingLeft:    ms(16),
    paddingRight:   ms(12),
    gap:            ms(10),
  },
  info:     { flex: 1, minWidth: 0, gap: ms(3) },
  label:    { fontSize: fs(13.5), fontWeight: "600", color: "#2B1B1F" },
  sub:      { fontSize: fs(11), color: "#8A7F82" },
  lateFeeT: { fontSize: fs(10.5), color: "#946200", fontWeight: "600" },
  waivedT:  { fontSize: fs(10.5), color: "#1B9C63", fontWeight: "600" },
  right:    { alignItems: "flex-end", flexShrink: 0, gap: ms(4) },
  amount:   { fontSize: fs(14), fontWeight: "700" },
  badge: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(3),
    borderRadius:      ms(6),
    paddingHorizontal: ms(7),
    paddingVertical:   ms(2),
  },
  badgeT:      { fontSize: fs(9.5), fontWeight: "700", letterSpacing: 0.2 },
  collectHint: { flexDirection: "row", alignItems: "center", gap: ms(2) },
  collectHintT: { fontSize: fs(10.5), fontWeight: "700" },
});

const sc = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#8B1E3F" },
  header: { overflow: "hidden" },
  body:   { flex: 1, backgroundColor: "#FFFBF0" },

  // ── Top bar ──
  hTop: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(12),
    paddingHorizontal: ms(16),
    paddingBottom:     ms(10),
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
  hTitle:  { flex: 1, fontSize: fs(16), fontWeight: "700", color: "#fff" },
  payFab: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    backgroundColor:   "rgba(255,255,255,0.20)",
    borderRadius:      ms(20),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(7),
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.30)",
  },
  payFabT: { fontSize: fs(12.5), fontWeight: "700", color: "#fff" },

  // ── Student identity ──
  studentRow: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(12),
    paddingHorizontal: ms(16),
    paddingBottom:     ms(12),
  },
  avatar: {
    width:           ms(48),
    height:          ms(48),
    borderRadius:    ms(14),
    backgroundColor: "rgba(255,255,255,0.22)",
    justifyContent:  "center",
    alignItems:      "center",
    flexShrink:      0,
    borderWidth:     1.5,
    borderColor:     "rgba(255,255,255,0.35)",
  },
  avatarT:     { fontSize: fs(17), fontWeight: "800", color: "#fff", includeFontPadding: false },
  studentName: { fontSize: fs(17), fontWeight: "700", color: "#fff", marginBottom: ms(5) },
  batchPill: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    backgroundColor:   "rgba(255,255,255,0.16)",
    borderRadius:      ms(6),
    paddingHorizontal: ms(8),
    paddingVertical:   ms(3),
    alignSelf:         "flex-start",
  },
  batchPillT: { fontSize: fs(11.5), color: "rgba(255,255,255,0.90)", fontWeight: "600" },

  // ── 3-stat strip ──
  feeStrip: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: ms(16),
    paddingBottom:     ms(10),
  },
  stripItem:    { flex: 1, alignItems: "center" },
  stripLbl:     {
    fontSize:      fs(9.5),
    color:         "rgba(255,255,255,0.65)",
    fontWeight:    "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom:  ms(5),
  },
  stripVal:     { fontSize: fs(15), fontWeight: "800", color: "#fff" },
  stripDivider: { width: 1, height: ms(34), backgroundColor: "rgba(255,255,255,0.22)", marginHorizontal: ms(4) },

  // ── Progress bar ──
  progressWrap: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(10),
    paddingHorizontal: ms(16),
    paddingBottom:     ms(14),
  },
  progressTrack: {
    flex:            1,
    height:          ms(5),
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius:    ms(4),
    overflow:        "hidden",
  },
  progressFill: {
    height:          ms(5),
    backgroundColor: "#A8F0CE",
    borderRadius:    ms(4),
  },
  progressLbl: { fontSize: fs(11), color: "rgba(255,255,255,0.80)", fontWeight: "700", flexShrink: 0 },

  // ── Body ──
  scroll:       { paddingTop: ms(16), paddingBottom: ms(60) },
  sectionTitle: {
    fontSize:         fs(12),
    fontWeight:       "700",
    color:            "#8A7F82",
    textTransform:    "uppercase",
    letterSpacing:    0.7,
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
  infoChipT: { fontSize: fs(11), fontWeight: "600" },

  // ── Payment history ──
  historyCard: {
    backgroundColor:  "#FFF",
    borderRadius:     ms(16),
    marginHorizontal: ms(16),
    overflow:         "hidden",
    shadowColor:      "#2B1B1F",
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
  histLabel:   { fontSize: fs(13), fontWeight: "600", color: "#2B1B1F" },
  histMeta:    { fontSize: fs(10.5), color: "#8A7F82", marginTop: ms(2) },
  histReceipt: { fontSize: fs(10), color: "#B8B0AA", marginTop: ms(2) },
  histAmt:     { fontSize: fs(14), fontWeight: "800", color: "#1B9C63", flexShrink: 0 },
  histDivider: { height: 1, backgroundColor: "#F5F1EE", marginHorizontal: ms(14) },

  centered:  { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: ms(60) },
  emptyT:    { fontSize: fs(14), color: "#8A7F82", marginTop: ms(12) },
  errorT:    { fontSize: fs(14), color: "#C0392B", textAlign: "center", paddingHorizontal: ms(24) },
  retryBtn:  {
    marginTop:         ms(16),
    paddingHorizontal: ms(20),
    paddingVertical:   ms(10),
    backgroundColor:   C.primary,
    borderRadius:      ms(10),
  },
  retryBtnT: { color: "#fff", fontWeight: "700", fontSize: fs(14) },
});

const pm = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor:      "#fff",
    borderTopLeftRadius:  ms(24),
    borderTopRightRadius: ms(24),
    paddingHorizontal:    ms(20),
    paddingTop:           ms(8),
  },
  drag: {
    width:           ms(36),
    height:          ms(4),
    borderRadius:    ms(2),
    backgroundColor: "#DDD6D0",
    alignSelf:       "center",
    marginBottom:    ms(16),
  },
  head: { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(14) },
  headIcon: {
    width:           ms(42),
    height:          ms(42),
    borderRadius:    ms(13),
    backgroundColor: C.primary + "12",
    justifyContent:  "center",
    alignItems:      "center",
    flexShrink:      0,
  },
  headTitle: { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F" },
  headSub:   { fontSize: fs(12), color: "#8A7F82", marginTop: ms(2) },
  closeBtn: {
    width:           ms(32),
    height:          ms(32),
    borderRadius:    ms(10),
    backgroundColor: "#F5F1EE",
    justifyContent:  "center",
    alignItems:      "center",
    flexShrink:      0,
  },
  divider: { height: 1, backgroundColor: "#F0EDE8", marginBottom: ms(16) },

  label:    { fontSize: fs(12), fontWeight: "700", color: "#8A7F82", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: ms(8) },
  optional: { fontWeight: "400", textTransform: "none" },

  amtField: {
    flexDirection:     "row",
    alignItems:        "center",
    backgroundColor:   "#FAF6F3",
    borderRadius:      ms(12),
    paddingHorizontal: ms(14),
    marginBottom:      ms(16),
    gap:               ms(6),
  },
  amtPrefix: { fontSize: fs(18), fontWeight: "700", color: "#2B1B1F" },
  amtInput:  { flex: 1, fontSize: fs(22), fontWeight: "800", color: "#2B1B1F", padding: ms(12), includeFontPadding: false },
  fullBtn: {
    backgroundColor:   "#8B1E3F",
    borderRadius:      ms(8),
    paddingHorizontal: ms(10),
    paddingVertical:   ms(5),
  },
  fullBtnT: { fontSize: fs(11), fontWeight: "700", color: "#fff" },

  modeRow: { flexDirection: "row", gap: ms(8), marginBottom: ms(16), paddingBottom: ms(2) },
  modeChip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(6),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(9),
    borderRadius:      ms(10),
    backgroundColor:   "#FAF6F3",
    borderWidth:       1.5,
    borderColor:       "transparent",
  },
  modeChipOn:  { backgroundColor: C.primary + "0D", borderColor: C.primary + "50" },
  modeChipT:   { fontSize: fs(13), fontWeight: "600", color: "#8A7F82" },
  modeChipTOn: { color: C.primary, fontWeight: "700" },

  textField: {
    backgroundColor:   "#FAF6F3",
    borderRadius:      ms(12),
    padding:           ms(12),
    fontSize:          fs(13.5),
    color:             "#2B1B1F",
    marginBottom:      ms(16),
  },

  allocBox: {
    backgroundColor:   "#EEF4FF",
    borderRadius:      ms(10),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(10),
    marginBottom:      ms(16),
    gap:               ms(6),
  },
  allocHeader: { flexDirection: "row", alignItems: "center", gap: ms(5), marginBottom: ms(4) },
  allocTitle:  { fontSize: fs(11), fontWeight: "700", color: "#2563A8", textTransform: "uppercase", letterSpacing: 0.4 },
  allocRow:    { flexDirection: "row", alignItems: "center", gap: ms(8) },
  allocDot:    { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: "#2563A8", flexShrink: 0 },
  allocLabel:  { flex: 1, fontSize: fs(12), color: "#2B1B1F", fontWeight: "500" },
  allocAmt:    { fontSize: fs(12), fontWeight: "700", color: "#2563A8" },

  submitBtn:  { borderRadius: ms(14), overflow: "hidden", marginBottom: ms(8) },
  submitGrad: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             ms(8),
    paddingVertical: ms(15),
  },
  submitT: { fontSize: fs(15), fontWeight: "700", color: "#fff" },
});

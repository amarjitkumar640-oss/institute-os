import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, TextInput, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import type { RootStackParamList } from "../../navigation/types";
import { getFeeTemplate, upsertFeeTemplate } from "../../api/fees";
import { ms, fs } from "../../utils/responsive";
import { useAlert } from "../../context/AlertContext";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";
import { T } from "../../components/ui/typography";

type Props = NativeStackScreenProps<RootStackParamList, "FeeStructure">;

// ── Draft types ───────────────────────────────────────────────────────────────

type DueTrigger = "on_admission" | "after_days" | "monthly";

interface DraftLine {
  key:        string;
  label:      string;
  amount:     string;   // per-month amount when trigger=monthly, else total
  trigger:    DueTrigger;
  offsetDays: string;
  dayOfMonth: string;
  months:     string;   // only used when trigger=monthly
}

let _counter = 0;
function newLine(defaults: Partial<DraftLine> = {}): DraftLine {
  return {
    key:        `line-${Date.now()}-${++_counter}`,
    label:      "",
    amount:     "",
    trigger:    "on_admission",
    offsetDays: "30",
    dayOfMonth: "1",
    months:     "4",
    ...defaults,
  };
}

// ── Line card ─────────────────────────────────────────────────────────────────

const TRIGGERS: { key: DueTrigger; label: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap }[] = [
  { key: "on_admission", label: "On Admission", icon: "enter-outline"    },
  { key: "after_days",   label: "After Days",    icon: "time-outline"     },
  { key: "monthly",      label: "Monthly",       icon: "calendar-outline" },
];

function LineCard({ line, index, total, onChange, onRemove, onMoveUp, onMoveDown }: {
  line:       DraftLine;
  index:      number;
  total:      number;
  onChange:   (u: DraftLine) => void;
  onRemove:   () => void;
  onMoveUp:   () => void;
  onMoveDown: () => void;
}) {
  const colors = useThemeColors();
  const lc = useThemedStyles(makeLcStyles);
  return (
    <View style={lc.card}>
      {/* Card header */}
      <View style={lc.header}>
        <View style={lc.badge}>
          <Text style={lc.badgeNum}>{index + 1}</Text>
        </View>
        <View style={lc.moveRow}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={index === 0}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-up" size={ms(17)} color={index === 0 ? C.border : C.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={index === total - 1}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-down" size={ms(17)} color={index === total - 1 ? C.border : C.muted} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={lc.removeBtn}>
          <Ionicons name="trash-outline" size={ms(16)} color={C.red} />
        </TouchableOpacity>
      </View>

      {/* Label */}
      <View style={lc.field}>
        <Text style={lc.label}>LABEL</Text>
        <TextInput
          style={lc.input}
          value={line.label}
          onChangeText={(v) => onChange({ ...line, label: v })}
          placeholder="e.g. Admission Fee, 1st Installment"
          placeholderTextColor={C.placeholder}
          returnKeyType="next"
        />
      </View>

      {/* Amount */}
      <View style={lc.field}>
        <Text style={lc.label}>
          {line.trigger === "monthly" ? "AMOUNT PER MONTH (₹)" : "AMOUNT (₹)"}
        </Text>
        <View style={lc.amountWrap}>
          <Text style={lc.amountSym}>₹</Text>
          <TextInput
            style={lc.amountInput}
            value={line.amount}
            onChangeText={(v) => onChange({ ...line, amount: v.replace(/[^0-9.]/g, "") })}
            placeholder="0"
            placeholderTextColor={C.placeholder}
            keyboardType="decimal-pad"
          />
          {line.trigger === "monthly" && !!line.amount && !!line.months && (
            <Text style={lc.amountTotal}>
              = ₹{((parseFloat(line.amount) || 0) * (parseInt(line.months) || 0)).toLocaleString("en-IN")}
            </Text>
          )}
        </View>
      </View>

      {/* Due trigger */}
      <View style={lc.field}>
        <Text style={lc.label}>DUE DATE</Text>
        <View style={lc.chipRow}>
          {TRIGGERS.map(({ key, label, icon }) => {
            const on = line.trigger === key;
            return (
              <TouchableOpacity
                key={key}
                style={[lc.chip, on && lc.chipOn]}
                onPress={() => onChange({ ...line, trigger: key })}
                activeOpacity={0.75}
              >
                <Ionicons name={icon} size={ms(12)} color={on ? colors.primary : C.muted} />
                <Text style={[lc.chipT, on && lc.chipTOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Offset input */}
      {line.trigger === "after_days" && (
        <View style={lc.field}>
          <Text style={lc.label}>DAYS AFTER ADMISSION</Text>
          <TextInput
            style={lc.input}
            value={line.offsetDays}
            onChangeText={(v) => onChange({ ...line, offsetDays: v.replace(/\D/g, "") })}
            placeholder="e.g. 30"
            placeholderTextColor={C.placeholder}
            keyboardType="number-pad"
          />
        </View>
      )}
      {line.trigger === "monthly" && (
        <View style={lc.twoCol}>
          <View style={[lc.field, { flex: 1 }]}>
            <Text style={lc.label}>NUMBER OF MONTHS</Text>
            <TextInput
              style={lc.input}
              value={line.months}
              onChangeText={(v) => onChange({ ...line, months: v.replace(/\D/g, "").slice(0, 2) })}
              placeholder="e.g. 4"
              placeholderTextColor={C.placeholder}
              keyboardType="number-pad"
            />
          </View>
          <View style={[lc.field, { flex: 1 }]}>
            <Text style={lc.label}>DUE DAY OF MONTH</Text>
            <TextInput
              style={lc.input}
              value={line.dayOfMonth}
              onChangeText={(v) => onChange({ ...line, dayOfMonth: v.replace(/\D/g, "").slice(0, 2) })}
              placeholder="e.g. 1"
              placeholderTextColor={C.placeholder}
              keyboardType="number-pad"
            />
          </View>
        </View>
      )}
    </View>
  );
}

const makeLcStyles = (colors: ThemeColors) => StyleSheet.create({
  card:       { backgroundColor: C.card, borderRadius: ms(16), borderWidth: 1.5, borderColor: C.border, padding: ms(14), marginBottom: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: ms(6), elevation: 1 },
  header:     { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(14) },
  badge:      { width: ms(26), height: ms(26), borderRadius: ms(13), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  badgeNum:   { ...T.badgeText, color: "#fff" },
  moveRow:    { flexDirection: "row", gap: ms(10), flex: 1 },
  removeBtn:  { padding: ms(2) },
  field:      { marginBottom: ms(12) },
  // Matches FormField's own per-field label style (components/ui/FormField.tsx)
  // exactly — this screen hand-rolls its inputs instead of using FormField,
  // but the label text should still read identically to every other form.
  label:      { ...T.chipText, color: C.text, marginBottom: ms(7) },
  input:      { backgroundColor: C.inputBg, borderRadius: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, paddingHorizontal: ms(12), paddingVertical: ms(10), ...T.body, color: C.text },
  amountWrap: { flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, paddingHorizontal: ms(12), paddingVertical: ms(10), gap: ms(6) },
  amountSym:  { ...T.cardTitle, color: C.green },
  amountInput:{ flex: 1, ...T.cardTitle, color: C.text, includeFontPadding: false, padding: 0 },
  chipRow:    { flexDirection: "row", gap: ms(6) },
  chip:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingHorizontal: ms(8), paddingVertical: ms(7), borderRadius: ms(8), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border },
  chipOn:     { backgroundColor: colors.primary + "10", borderColor: colors.primary },
  // Matches the dashboard StatTile's label font (T.caption) — same 11px size
  // as chipText but a lighter weight (500 vs 600), so "On Admission"/"After
  // Days"/"Monthly" sit more comfortably within each chip.
  chipT:      { ...T.caption, color: C.muted },
  chipTOn:    { color: colors.primary, fontFamily: "Inter_700Bold", fontWeight: "700" },
  amountTotal:{ ...T.chipText, color: C.muted },
  twoCol:     { flexDirection: "row", gap: ms(10) },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export function FeeStructureScreen({ route, navigation }: Props) {
  const { courseId, courseName, defaultFee } = route.params;
  const { showAlert } = useAlert();
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);

  const [lines,       setLines]       = useState<DraftLine[]>([]);
  const [notes,       setNotes]       = useState("");
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [hasTemplate, setHasTemplate] = useState(false);

  useEffect(() => {
    getFeeTemplate(courseId)
      .then((t) => {
        if (t) {
          setHasTemplate(true);
          setNotes(t.notes ?? "");
          setLines(
            [...t.lines]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((l) => {
                const isMonthly  = l.trigger === "monthly_recurring";
                const splitCount = l.splitCount ?? 1;
                const totalAmt   = parseFloat(l.amount ?? "0");
                const perAmt     = isMonthly && splitCount > 0 ? totalAmt / splitCount : totalAmt;
                return {
                  key:        `line-${l.id}`,
                  label:      l.label,
                  amount:     String(perAmt),
                  trigger:    l.trigger === "days_after_admission" ? "after_days" as const
                            : isMonthly                            ? "monthly"    as const
                            : "on_admission"                       as const,
                  offsetDays: String(l.offsetDays ?? 30),
                  dayOfMonth: String(l.dayOfMonth ?? 1),
                  months:     String(splitCount),
                };
              }),
          );
        } else {
          setLines([newLine({ label: "Admission Fee", amount: String(defaultFee) })]);
        }
      })
      .catch(() => {
        setLines([newLine({ label: "Admission Fee", amount: String(defaultFee) })]);
      })
      .finally(() => setLoading(false));
  }, [courseId, defaultFee]);

  const total = lines.reduce((sum, l) => {
    const amt = parseFloat(l.amount) || 0;
    return sum + (l.trigger === "monthly" ? amt * (parseInt(l.months) || 1) : amt);
  }, 0);

  function updateLine(i: number, updated: DraftLine) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? updated : l)));
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveUp(i: number) {
    if (i === 0) return;
    setLines((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveDown(i: number) {
    setLines((prev) => {
      if (i === prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  async function handleSave() {
    if (lines.length === 0) {
      showAlert("No Installments", "Add at least one installment line.", "warning");
      return;
    }
    for (const l of lines) {
      if (!l.label.trim()) {
        showAlert("Missing Label", "Please enter a label for every installment.", "warning");
        return;
      }
      const amt = parseFloat(l.amount);
      if (!l.amount || isNaN(amt) || amt <= 0) {
        showAlert("Invalid Amount", `Enter a valid amount for "${l.label || "an installment"}".`, "warning");
        return;
      }
    }

    setSaving(true);
    try {
      await upsertFeeTemplate(courseId, {
        notes: notes.trim() || undefined,
        lines: lines.map((l, i) => {
          const isMonthly = l.trigger === "monthly";
          const months    = isMonthly ? (parseInt(l.months) || 1) : 1;
          const perAmt    = parseFloat(l.amount);
          return {
            sortOrder:  i,
            label:      l.label.trim(),
            lineType:   isMonthly ? "equal_split" as const : "fixed" as const,
            amount:     isMonthly ? perAmt * months : perAmt,
            splitCount: isMonthly ? months : undefined,
            trigger:    l.trigger === "after_days" ? "days_after_admission" as const
                      : isMonthly                  ? "monthly_recurring"    as const
                      : "on_admission"             as const,
            ...(l.trigger === "after_days" ? { offsetDays: parseInt(l.offsetDays) || 0 } : {}),
            ...(isMonthly                  ? { dayOfMonth: parseInt(l.dayOfMonth) || 1 } : {}),
          };
        }),
      });
      showAlert("Saved!", `Fee structure for ${courseName} has been ${hasTemplate ? "updated" : "created"}.`, "success");
      setHasTemplate(true);
    } catch {
      showAlert("Save Failed", "Could not save the fee structure. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="Fee Structure" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loaderT}>Loading template…</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Course summary card */}
            <View style={s.courseCard}>
              <View style={s.courseLeft}>
                <View style={s.courseIcon}>
                  <Ionicons name="book-outline" size={ms(16)} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.courseName} numberOfLines={2}>{courseName}</Text>
                  <Text style={s.courseDefaultFee}>Default fee · ₹{defaultFee.toLocaleString("en-IN")}</Text>
                </View>
              </View>
              {hasTemplate && (
                <View style={s.savedBadge}>
                  <Ionicons name="checkmark-circle" size={ms(13)} color={C.green} />
                  <Text style={s.savedBadgeT}>Template saved</Text>
                </View>
              )}
            </View>

            {/* Section header + running total */}
            <View style={s.sectionRow}>
              <View style={s.sectionHead}>
                <View style={s.sectionIconWrap}>
                  <Ionicons name="list-outline" size={ms(14)} color={colors.primary} />
                </View>
                <Text style={s.sectionTitle}>INSTALLMENT PLAN</Text>
              </View>
              <View style={s.totalPill}>
                <Text style={s.totalLabel}>Total  </Text>
                <Text style={s.totalAmt}>₹{total.toLocaleString("en-IN")}</Text>
              </View>
            </View>

            {/* Empty hint */}
            {lines.length === 0 && (
              <View style={s.emptyHint}>
                <Ionicons name="information-circle-outline" size={ms(18)} color={C.placeholder} />
                <Text style={s.emptyHintT}>No installments yet — tap "Add Installment" to start</Text>
              </View>
            )}

            {/* Line cards */}
            {lines.map((line, i) => (
              <LineCard
                key={line.key}
                line={line}
                index={i}
                total={lines.length}
                onChange={(u) => updateLine(i, u)}
                onRemove={() => removeLine(i)}
                onMoveUp={() => moveUp(i)}
                onMoveDown={() => moveDown(i)}
              />
            ))}

            {/* Add installment */}
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => setLines((p) => [...p, newLine()])}
              activeOpacity={0.75}
            >
              <Ionicons name="add-circle-outline" size={ms(18)} color={colors.primary} />
              <Text style={s.addBtnT}>Add Installment</Text>
            </TouchableOpacity>

            {/* Notes */}
            <View style={s.notesBlock}>
              <Text style={s.notesLabel}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Late fee ₹50/day after due date. Fees non-refundable."
                placeholderTextColor={C.placeholder}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Save */}
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.65 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={ms(18)} color="#fff" />
                  <Text style={s.saveBtnT}>
                    {hasTemplate ? "Update Structure" : "Save Structure"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: ms(32) }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.screenBg },
  flex:    { flex: 1 },
  loader:  { flex: 1, backgroundColor: colors.screenBg, justifyContent: "center", alignItems: "center", gap: ms(14) },
  loaderT: { ...T.body, color: C.muted },
  scroll:  { flex: 1, backgroundColor: colors.screenBg },
  body:    { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(48) },

  // Course card
  courseCard:       { backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(20), borderWidth: 1, borderColor: C.border, shadowColor: C.text, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: ms(8), elevation: 2 },
  courseLeft:       { flexDirection: "row", alignItems: "center", gap: ms(10) },
  courseIcon:       { width: ms(36), height: ms(36), borderRadius: ms(10), backgroundColor: colors.primary + "12", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  courseName:       { ...T.cardTitle, color: C.text, marginBottom: ms(3) },
  courseDefaultFee: { ...T.caption, color: C.muted },
  savedBadge:       { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.greenBg, borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(5), marginTop: ms(10) },
  savedBadgeT:      { ...T.chipText, color: C.green },

  // Section header
  sectionRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(14) },
  sectionHead:   { flexDirection: "row", alignItems: "center", gap: ms(8) },
  sectionIconWrap:{ width: ms(28), height: ms(28), borderRadius: ms(8), backgroundColor: colors.primary + "12", justifyContent: "center", alignItems: "center" },
  sectionTitle:  { ...T.sectionHeading, color: colors.primary, letterSpacing: 0.8 },
  totalPill:     { flexDirection: "row", alignItems: "center", backgroundColor: C.greenBg, borderRadius: ms(20), paddingHorizontal: ms(12), paddingVertical: ms(5) },
  totalLabel:    { ...T.caption, color: C.muted },
  totalAmt:      { ...T.chipText, color: C.green },

  // Empty
  emptyHint:  { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.bg, borderRadius: ms(12), padding: ms(14), marginBottom: ms(14) },
  emptyHintT: { flex: 1, ...T.bodySmall, color: C.muted },

  // Add button
  addBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(14), borderWidth: 1.5, borderColor: C.border, borderStyle: "dashed", paddingVertical: ms(14), marginBottom: ms(20), backgroundColor: C.card },
  addBtnT: { ...T.buttonText, color: colors.primary },

  // Notes
  notesBlock: { marginBottom: ms(24) },
  // Matches FormField's own per-field label style, same as lc.label above.
  notesLabel: { ...T.chipText, color: C.text, marginBottom: ms(7) },
  notesInput: { backgroundColor: C.inputBg, borderRadius: ms(12), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, paddingHorizontal: ms(14), paddingVertical: ms(12), ...T.body, color: C.text, minHeight: ms(80) },

  // Save button
  saveBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), backgroundColor: colors.primary, borderRadius: ms(16), paddingVertical: ms(16) },
  saveBtnT: { ...T.buttonText, color: "#fff" },
});

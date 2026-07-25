import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, StatusBar, TextInput, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { CenterPickerSheet } from "../../components/ui/CenterPickerSheet";
import { createLead, type LeadItem } from "../../api/leads";
import type { ExamCategory } from "../../api/courses";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AddLead">;

const EXAM_OPTIONS: { key: ExamCategory; label: string; color: string; icon: string }[] = [
  { key: "ssc",        label: "SSC",        color: C.primary, icon: "document-text-outline" },
  { key: "banking",    label: "Banking",    color: C.blue,    icon: "card-outline"           },
  { key: "railway",    label: "Railway",    color: C.accent,  icon: "train-outline"          },
  { key: "foundation", label: "Foundation", color: C.purple,  icon: "school-outline"         },
];

const SOURCE_CHIPS = ["Walk-in", "Referral", "Phone Call", "Social Media"];

export function AddLeadScreen({ navigation }: Props) {
  const [name, setName]           = useState("");
  const [phone, setPhone]         = useState("");
  const [targetExam, setTargetExam] = useState<ExamCategory | null>(null);
  const [source, setSource]       = useState("");
  const [notes, setNotes]         = useState("");

  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState(false);
  const [created, setCreated]     = useState<LeadItem | null>(null);
  const [centerPickerVisible, setCenterPickerVisible] = useState(false);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim())  errs.name  = "Lead's name is required.";
    if (!phone.trim()) errs.phone = "Phone number is required.";
    else if (!/^\d{7,15}$/.test(phone.trim())) errs.phone = "Enter a valid phone number.";
    if (!targetExam)   errs.targetExam = "Select which exam this lead is interested in.";
    if (!source.trim()) errs.source = "Where did this lead come from?";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(overrideCenterId?: string) {
    if (!validate() || !targetExam) return;
    setLoading(true);
    try {
      const response = await createLead({
        ...(overrideCenterId ? { centerId: overrideCenterId } : {}),
        name: name.trim(),
        phone: phone.trim(),
        targetExam,
        source: source.trim(),
        notes: notes.trim() || undefined,
      });
      if (response.ok) {
        setCreated(response.lead);
      } else if (response.error.includes("centerId") && !overrideCenterId) {
        // First attempt only — see the identical pattern in CreateFacultyScreen /
        // StudentAdmissionScreen: retrying again after a centerId was already
        // supplied would loop forever instead of surfacing the real problem.
        setCenterPickerVisible(true);
      } else {
        setErrors({ submit: `Could not save lead: ${response.error}` });
      }
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <SafeAreaView style={s.safe} edges={["bottom"]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <View style={s.successOverlay}>
          <View style={s.successCard}>
            <LinearGradient colors={[C.green, "#16A085"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
              <Ionicons name="checkmark" size={ms(34)} color="#fff" />
            </LinearGradient>
            <Text style={s.successTitle}>Lead Added!</Text>
            <Text style={s.successSub}>{created.name} has been added to your leads list.</Text>

            <TouchableOpacity
              style={s.doneBtnWrap}
              activeOpacity={0.85}
              onPress={() => { setCreated(null); setName(""); setPhone(""); setTargetExam(null); setSource(""); setNotes(""); }}
            >
              <View style={s.outlineBtn}>
                <Ionicons name="add" size={ms(18)} color={C.primary} />
                <Text style={s.outlineBtnT}>Add Another Lead</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.replace("Leads")} activeOpacity={0.85} style={s.doneBtnWrap}>
              <LinearGradient colors={[C.primary, "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.doneBtn}>
                <Ionicons name="list-outline" size={ms(18)} color="#fff" />
                <Text style={s.doneBtnT}>View All Leads</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="New Lead" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            <FormField label="LEAD'S NAME" value={name} onChangeText={(v) => { setName(v); setErrors((p) => ({ ...p, name: "" })); }}
              placeholder="e.g. Priya Sharma" error={errors.name} icon="person-outline" clearable />
            <FormField label="PHONE NUMBER" value={phone} onChangeText={(v) => { setPhone(v.replace(/\D/g, "")); setErrors((p) => ({ ...p, phone: "" })); }}
              placeholder="e.g. 9876543210" keyboardType="phone-pad" error={errors.phone} icon="call-outline" />

            <View style={s.fieldBlock}>
              <Text style={[s.fieldLabel, !!errors.targetExam && { color: C.red }]}>INTERESTED IN</Text>
              <View style={s.examGrid}>
                {EXAM_OPTIONS.map(({ key, label, color, icon }) => {
                  const active = targetExam === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[s.examCard, active && { backgroundColor: color, borderColor: color }]}
                      onPress={() => { setTargetExam(key); setErrors((p) => ({ ...p, targetExam: "" })); }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={icon as any} size={ms(18)} color={active ? "#fff" : color} />
                      <Text style={[s.examCardT, active && { color: "#fff" }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!!errors.targetExam && (
                <View style={s.inlineError}>
                  <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
                  <Text style={s.inlineErrorT}>{errors.targetExam}</Text>
                </View>
              )}
            </View>

            <View style={s.fieldBlock}>
              <Text style={[s.fieldLabel, !!errors.source && { color: C.red }]}>SOURCE</Text>
              <View style={s.chipRow}>
                {SOURCE_CHIPS.map((chip) => {
                  const active = source === chip;
                  return (
                    <TouchableOpacity
                      key={chip}
                      style={[s.chip, active && { backgroundColor: C.primary, borderColor: C.primary }]}
                      onPress={() => { setSource(chip); setErrors((p) => ({ ...p, source: "" })); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.chipT, active && { color: "#fff" }]} numberOfLines={1} adjustsFontSizeToFit>{chip}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!!errors.source && (
                <View style={s.inlineError}>
                  <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
                  <Text style={s.inlineErrorT}>{errors.source}</Text>
                </View>
              )}
            </View>

            <View style={[s.fieldBlock, { marginBottom: 0 }]}>
              <Text style={s.fieldLabel}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything worth remembering about this lead…"
                placeholderTextColor={C.placeholder}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {!!errors.submit && (
              <View style={s.submitError}>
                <Ionicons name="alert-circle" size={ms(16)} color={C.red} />
                <Text style={s.submitErrorT}>{errors.submit}</Text>
              </View>
            )}
          </View>

          <PrimaryButton label="Save Lead" icon="checkmark-circle-outline" onPress={() => handleSubmit()} loading={loading} disabled={loading} />
          <View style={{ height: ms(24) }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <CenterPickerSheet
        visible={centerPickerVisible}
        onClose={() => setCenterPickerVisible(false)}
        onSelect={(centerId) => { setCenterPickerVisible(false); handleSubmit(centerId); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  flex:   { flex: 1 },
  scroll: { flex: 1, backgroundColor: C.bg },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(16) },

  card: { backgroundColor: C.card, borderRadius: ms(20), padding: ms(18), marginBottom: ms(16), shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  fieldBlock: { marginBottom: ms(20) },
  fieldLabel: { fontSize: fs(12.5), fontWeight: "700", color: C.text, marginBottom: ms(9), letterSpacing: 0.3 },

  examGrid: { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  examCard: { flexBasis: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6), paddingVertical: ms(12), borderRadius: ms(12), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border },
  examCardT: { fontSize: fs(13), fontWeight: "700", color: C.text },

  chipRow: { flexDirection: "row", gap: ms(6) },
  chip:    { flex: 1, alignItems: "center", paddingHorizontal: ms(4), paddingVertical: ms(9), borderRadius: ms(12), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border },
  chipT:   { fontSize: fs(11), fontWeight: "700", color: C.muted },

  notesInput: { minHeight: ms(80), backgroundColor: C.card, borderRadius: ms(12), borderWidth: 1.5, borderColor: C.border, paddingHorizontal: ms(14), paddingVertical: ms(12), fontSize: fs(14), color: C.text },

  inlineError:  { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(6) },
  inlineErrorT: { fontSize: fs(11.5), color: C.red, flex: 1 },

  submitError:  { flexDirection: "row", alignItems: "flex-start", gap: ms(8), backgroundColor: "#FEF0EE", borderRadius: ms(12), borderWidth: 1, borderColor: "#F5C6C0", padding: ms(14), marginTop: ms(4) },
  submitErrorT: { fontSize: fs(13), color: C.red, lineHeight: fs(18), flex: 1 },

  successOverlay: { flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successCard:    { width: "100%", backgroundColor: C.card, borderRadius: ms(28), padding: ms(26), alignItems: "center", shadowColor: C.primary, shadowOffset: { width: 0, height: ms(10) }, shadowOpacity: 0.14, shadowRadius: ms(28), elevation: 12 },
  checkCircle:    { width: ms(76), height: ms(76), borderRadius: ms(38), justifyContent: "center", alignItems: "center", marginBottom: ms(16) },
  successTitle:   { fontSize: fs(21), fontWeight: "800", color: C.text, marginBottom: ms(6) },
  successSub:     { fontSize: fs(13), color: C.muted, textAlign: "center", marginBottom: ms(22) },
  doneBtnWrap:    { width: "100%", marginBottom: ms(10) },
  outlineBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(14), borderWidth: 1.5, borderColor: C.primary },
  outlineBtnT:    { fontSize: fs(14), fontWeight: "700", color: C.primary },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(15) },
  doneBtnT:       { fontSize: fs(15), fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
});

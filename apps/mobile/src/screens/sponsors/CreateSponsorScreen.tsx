import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Animated,
  ActivityIndicator, TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { KeyboardAvoidingScroll } from "../../components/ui/KeyboardAvoidingScroll";
import { FormField } from "../../components/ui/FormField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { T } from "../../components/ui/typography";
import { createSponsor, type Sponsor } from "../../api/sponsors";
import { ms } from "../../utils/responsive";
import { useAlert } from "../../context/AlertContext";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "CreateSponsor">;

// ─── Form types ───────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  contactPerson: string;
  phone: string;
  gstin: string;
  stateCode: string;
}

interface FormErrors {
  name?: string;
  submit?: string;
}

const INITIAL_FORM: FormState = { name: "", contactPerson: "", phone: "", gstin: "", stateCode: "" };

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "Company name is required.";
  return errors;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function CreateSponsorScreen({ navigation }: Props) {
  const { showConfirm } = useAlert();
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);

  const [form, setForm]       = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors]   = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [createdSponsor, setCreatedSponsor] = useState<Sponsor | null>(null);

  const contactRef   = useRef<TextInput>(null);
  const phoneRef      = useRef<TextInput>(null);
  const gstinRef       = useRef<TextInput>(null);
  const stateCodeRef  = useRef<TextInput>(null);

  const checkScale  = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(ms(60))).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key as keyof FormErrors]) setErrors((p) => ({ ...p, [key]: undefined }));
  }

  function showSuccessCard(sp: Sponsor) {
    setCreatedSponsor(sp);
    Animated.parallel([
      Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7, delay: 100 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 60 }),
    ]).start();
  }

  async function handleSubmit() {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});
    try {
      const result = await createSponsor({
        name:          form.name.trim(),
        contactPerson: form.contactPerson.trim() || undefined,
        phone:         form.phone.trim() || undefined,
        gstin:         form.gstin.trim() || undefined,
        stateCode:     form.stateCode.trim() || undefined,
      });
      if (!result.ok) { setErrors({ submit: result.error }); return; }
      showSuccessCard(result.sponsor);
    } catch (err: any) {
      const message =
        err?.response?.data?.error ??
        (err?.code === "ERR_NETWORK" || err?.code === "ECONNREFUSED"
          ? "Cannot reach server. Check your network or API URL."
          : "Something went wrong. Please try again.");
      setErrors({ submit: message });
    } finally {
      setLoading(false);
    }
  }

  const isDirty = Object.values(form).some((v) => v !== "");

  function handleBack() {
    if (isDirty) {
      showConfirm("Discard Changes?", "You have unsaved changes. Go back?", () => navigation.goBack(), { confirmLabel: "Discard", cancelLabel: "Stay", brand: true, icon: "arrow-undo-outline" });
    } else {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="Add Sponsor" onBack={handleBack} />

      <KeyboardAvoidingScroll
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        footer={
          <View style={s.footer}>
            <PrimaryButton label="Add Sponsor" onPress={() => handleSubmit()} loading={loading} disabled={loading} icon="business-outline" />
          </View>
        }
      >

          {/* ── Company Details ── */}
          <View style={s.section}>
            <SectionHead icon="business-outline" title="Company Details" color={colors.primary} />
            <FormField label="COMPANY NAME" value={form.name} onChangeText={(v) => setField("name", v)}
              placeholder="e.g. Acme Corp Pvt. Ltd." error={errors.name} icon="business-outline" required
              maxLength={120} clearable returnKeyType="next" onSubmitEditing={() => contactRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="CONTACT PERSON" value={form.contactPerson} onChangeText={(v) => setField("contactPerson", v)}
              placeholder="e.g. Rohan Mehta" icon="person-outline"
              returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="PHONE" value={form.phone} onChangeText={(v) => setField("phone", v.replace(/\D/g, ""))}
              placeholder="e.g. 9876543210" keyboardType="phone-pad" icon="call-outline"
              returnKeyType="next" onSubmitEditing={() => gstinRef.current?.focus()} blurOnSubmit={false} />
          </View>

          {/* ── Tax Details ── */}
          <View style={s.section}>
            <SectionHead icon="document-text-outline" title="Tax Details" color={colors.primary} />
            <FormField label="GSTIN" value={form.gstin} onChangeText={(v) => setField("gstin", v.toUpperCase())}
              placeholder="e.g. 27AAAAA0000A1Z5" icon="document-text-outline" maxLength={20}
              returnKeyType="next" onSubmitEditing={() => stateCodeRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="GST STATE CODE" value={form.stateCode} onChangeText={(v) => setField("stateCode", v.replace(/\D/g, ""))}
              placeholder="e.g. 27" keyboardType="number-pad" icon="location-outline" maxLength={2}
              returnKeyType="done" onSubmitEditing={() => handleSubmit()} />
          </View>

          {errors.submit && (
            <View style={s.submitError}>
              <Text style={s.submitErrorT}>{errors.submit}</Text>
            </View>
          )}

      </KeyboardAvoidingScroll>

      {/* Full-screen loader */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderTitle}>Adding Sponsor…</Text>
            <Text style={s.loaderSub}>Please wait a moment</Text>
          </View>
        </View>
      )}

      {/* Full-screen success card */}
      {createdSponsor !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>
            <Animated.View style={{ transform: [{ scale: checkScale }], marginBottom: ms(20) }}>
              <LinearGradient colors={[C.green, "#16A085"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
                <Ionicons name="checkmark" size={ms(44)} color="#fff" />
              </LinearGradient>
            </Animated.View>

            <Text style={s.successTitle}>Sponsor Added!</Text>
            <Text style={s.successSub}>The sponsoring company has been registered successfully</Text>

            <View style={s.detailBox}>
              <DetailRow icon="business-outline" label="Company"        value={createdSponsor.name}                              color={colors.primary} />
              <DetailRow icon="person-outline"   label="Contact Person" value={createdSponsor.contactPerson || "—"}              color={C.blue} />
              <DetailRow icon="call-outline"     label="Phone"          value={createdSponsor.phone || "—"}                      color={C.orange} last={!createdSponsor.gstin} />
              {createdSponsor.gstin && (
                <DetailRow icon="document-text-outline" label="GSTIN" value={createdSponsor.gstin} color={C.green} last />
              )}
            </View>

            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
              <View style={[s.doneBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="business-outline" size={ms(18)} color="#fff" />
                <Text style={s.doneBtnT}>View All Sponsors</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionHead({ icon, title, color }: { icon: string; title: string; color: string }) {
  return (
    <View style={sh.wrap}>
      <View style={[sh.iconBox, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(16)} color={color} />
      </View>
      <Text style={[sh.label, { color }]}>{title.toUpperCase()}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap:    { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(16) },
  iconBox: { width: ms(34), height: ms(34), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  label:   { ...T.sectionHeading, letterSpacing: 1 },
});

function DetailRow({ icon, label, value, color, last = false }: {
  icon: string; label: string; value: string; color: string; last?: boolean;
}) {
  return (
    <View style={[dr.row, !last && dr.rowBorder]}>
      <View style={[dr.iconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(14)} color={color} />
      </View>
      <View style={dr.textWrap}>
        <Text style={dr.label}>{label}</Text>
        <Text style={dr.value} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

const dr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(10), gap: ms(12) },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  iconWrap:  { width: ms(32), height: ms(32), borderRadius: ms(8), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  textWrap:  { flex: 1 },
  label:     { ...T.sectionHeading, color: C.muted, marginBottom: ms(1) },
  value:     { ...T.listItemTitle, color: C.text },
});

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.screenBg },
  scroll:        { flex: 1, backgroundColor: colors.screenBg },
  scrollContent: { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(40) },

  section:       { backgroundColor: C.card, borderRadius: ms(18), padding: ms(18), marginBottom: ms(16), shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  submitError:   { backgroundColor: C.red + "0F", borderRadius: ms(12), borderWidth: 1, borderColor: C.red + "30", padding: ms(14), marginBottom: ms(16) },
  submitErrorT:  { ...T.body, color: C.red },
  footer:        { gap: ms(12), paddingHorizontal: ms(20), paddingTop: ms(12), paddingBottom: ms(14), backgroundColor: colors.screenBg, borderTopWidth: 1, borderTopColor: C.border },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg + "EE", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { ...T.cardTitle, color: C.text, marginTop: ms(4) },
  loaderSub:     { ...T.bodySmall, color: C.muted },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successCard:    { width: "100%", backgroundColor: C.card, borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { ...T.displayMedium, color: C.text, marginBottom: ms(6) },
  successSub:     { ...T.body, color: C.muted, marginBottom: ms(24), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(24), borderWidth: 1, borderColor: C.border },
  doneBtnWrap:    { width: "100%" },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  doneBtnT:       { ...T.buttonText, color: "#FFFFFF" },
});

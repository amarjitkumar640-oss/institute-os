import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { useAlert } from "../../context/AlertContext";
import { getTenantSettings, updateLoginMethod, type TenantSettings, type LoginMethod } from "../../api/tenants";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "OrganizationSettings">;

const LOGIN_METHOD_OPTIONS: { key: LoginMethod; label: string; sub: string; icon: string }[] = [
  { key: "phone",          label: "Phone Number",       sub: "Staff sign in with their phone + password",       icon: "call-outline" },
  { key: "email_username", label: "Email or Username",  sub: "Staff sign in with their email/username + password", icon: "person-outline" },
];

export function OrganizationSettingsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeStyles);
  const { showAlert } = useAlert();

  const [settings, setSettings]   = useState<TenantSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<LoginMethod>("email_username");
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    getTenantSettings()
      .then((data) => { setSettings(data); setSelected(data.loginMethod); })
      .catch(() => showAlert("Error", "Could not load organization settings.", "error"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await updateLoginMethod(selected);
      showAlert("Saved", "Login method updated.", "success");
    } catch {
      showAlert("Error", "Could not save. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const brandSwatches = settings
    ? [
        { label: "Primary",   color: settings.branding.primary   ?? colors.primary },
        { label: "Secondary", color: settings.branding.secondary ?? colors.secondary },
        { label: "Accent",    color: settings.branding.accent    ?? colors.accent },
      ]
    : [];

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="Organization Settings" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={s.body}>
          <Text style={s.sectionLabel}>BRANDING</Text>
          <View style={s.card}>
            <View style={s.swatchRow}>
              {brandSwatches.map((sw) => (
                <View key={sw.label} style={s.swatchItem}>
                  <View style={[s.swatch, { backgroundColor: sw.color }]} />
                  <Text style={s.swatchLabel}>{sw.label}</Text>
                </View>
              ))}
            </View>
            <Text style={s.hint}>To change these colors, contact support.</Text>
          </View>

          <Text style={s.sectionLabel}>STAFF LOGIN METHOD</Text>
          <View style={s.card}>
            {LOGIN_METHOD_OPTIONS.map((opt, i) => {
              const active = selected === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.optionRow, i > 0 && s.optionRowBorder]}
                  onPress={() => setSelected(opt.key)}
                  activeOpacity={0.75}
                >
                  <View style={[s.optionIcon, { backgroundColor: active ? colors.primary : C.inputBg }]}>
                    <Ionicons name={opt.icon as any} size={ms(17)} color={active ? "#fff" : C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.optionLabel}>{opt.label}</Text>
                    <Text style={s.optionSub}>{opt.sub}</Text>
                  </View>
                  <View style={[s.radio, active && { borderColor: colors.primary }]}>
                    {active && <View style={[s.radioDot, { backgroundColor: colors.primary }]} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flex: 1 }} />
          <PrimaryButton label="Save Changes" onPress={handleSave} loading={saving} disabled={saving} icon="checkmark-circle-outline" />
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.primary },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  body:   { flex: 1, backgroundColor: C.bg, paddingHorizontal: ms(16), paddingTop: ms(16), paddingBottom: ms(20) },

  sectionLabel: { fontSize: fs(11), fontWeight: "700", color: C.muted, letterSpacing: 1.1, marginBottom: ms(8), marginTop: ms(4) },
  card: {
    backgroundColor: C.card, borderRadius: ms(16), marginBottom: ms(20),
    overflow: "hidden", borderWidth: 1, borderColor: C.border, padding: ms(14),
  },

  swatchRow: { flexDirection: "row", gap: ms(20) },
  swatchItem: { alignItems: "center", gap: ms(6) },
  swatch:     { width: ms(40), height: ms(40), borderRadius: ms(12), borderWidth: 1, borderColor: C.border },
  swatchLabel:{ fontSize: fs(11), color: C.muted, fontWeight: "600" },
  hint:       { fontSize: fs(11), color: C.placeholder, marginTop: ms(12) },

  optionRow: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingVertical: ms(10) },
  optionRowBorder: { borderTopWidth: 1, borderTopColor: C.border, marginTop: ms(10), paddingTop: ms(14) },
  optionIcon: { width: ms(38), height: ms(38), borderRadius: ms(11), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  optionLabel: { fontSize: fs(14), fontWeight: "700", color: C.text },
  optionSub:   { fontSize: fs(11.5), color: C.muted, marginTop: ms(1) },
  radio:      { width: ms(20), height: ms(20), borderRadius: ms(10), borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  radioDot:   { width: ms(10), height: ms(10), borderRadius: ms(5) },
});

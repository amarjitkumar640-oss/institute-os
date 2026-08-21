import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { T } from "../../components/ui/typography";
import { useAlert } from "../../context/AlertContext";
import { getTenantSettings, updateLoginMethod, updateNotificationTiming, updateBrandingBackground, type TenantSettings, type LoginMethod } from "../../api/tenants";
import {
  fetchNotificationRouting, updateNotificationRouting,
  type NotificationRoutingEntry, type NotificationType,
} from "../../api/notifications";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, useSetBrandColors, type ThemeColors } from "../../context/ThemeContext";
import { ROLES, ROLE_META, type Role } from "../../constants/roleMeta";
import { useAuth } from "../../context/AuthContext";

type Props = NativeStackScreenProps<RootStackParamList, "OrganizationSettings">;

const LOGIN_METHOD_OPTIONS: { key: LoginMethod; label: string; sub: string; icon: string }[] = [
  { key: "phone",          label: "Phone Number",       sub: "Staff sign in with their phone + password",       icon: "call-outline" },
  { key: "email_username", label: "Email or Username",  sub: "Staff sign in with their email/username + password", icon: "person-outline" },
];

const NOTIFICATION_TYPE_LABELS: Partial<Record<NotificationType, string>> = {
  new_enrollment:      "New Enrollment",
  installment_overdue: "Installment Overdue",
  batch_capacity:      "Batch Reaching Capacity",
  new_application:     "New Admission Application",
};

export function OrganizationSettingsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeStyles);
  const { showAlert } = useAlert();
  const setBrandColors = useSetBrandColors();
  const { staff } = useAuth();
  const isAdmin = staff?.activeRole === "admin";

  // Nothing links here for a non-admin today (both entry points — Profile's
  // and Dashboard's Admin cards — are already role-gated), but nothing
  // stopped a direct navigation.navigate("OrganizationSettings") either —
  // RootNavigator registers every route unconditionally. Hardcoded role
  // check, not usePermission: this screen configures tenant branding, login
  // method, and notification routing, the same self-lockout-hazard category
  // as Settings itself — deliberately excluded from the configurable system.
  useEffect(() => { if (!isAdmin) navigation.goBack(); }, [isAdmin]);

  const [settings, setSettings]   = useState<TenantSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<LoginMethod>("email_username");
  const [saving, setSaving]       = useState(false);

  const [classReminderMinutes, setClassReminderMinutes] = useState("15");
  const [overdueGraceDays, setOverdueGraceDays]         = useState("0");
  const [bgColor, setBgColor]                           = useState("");

  const [routing, setRouting]           = useState<NotificationRoutingEntry[]>([]);
  const [routingLoading, setRoutingLoading] = useState(true);
  const [routingSavingType, setRoutingSavingType] = useState<NotificationType | null>(null);

  useEffect(() => {
    getTenantSettings()
      .then((data) => {
        setSettings(data);
        setSelected(data.loginMethod);
        setClassReminderMinutes(String(data.classReminderMinutes));
        setOverdueGraceDays(String(data.overdueGraceDays));
        setBgColor(data.branding.background ?? "");
      })
      .catch(() => showAlert("Error", "Could not load organization settings.", "error"))
      .finally(() => setLoading(false));

    fetchNotificationRouting()
      .then(setRouting)
      .catch(() => {})
      .finally(() => setRoutingLoading(false));
  }, []);

  async function handleSave() {
    const hexRe = /^#[0-9A-Fa-f]{6}$/;
    const bgTrimmed = bgColor.trim();
    if (bgTrimmed && !hexRe.test(bgTrimmed)) {
      showAlert("Invalid Color", "Background color must be a valid hex code (e.g. #F4F1EC).", "error");
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        updateLoginMethod(selected),
        updateNotificationTiming({
          classReminderMinutes: Number(classReminderMinutes) || 15,
          overdueGraceDays:     Number(overdueGraceDays) || 0,
        }),
        updateBrandingBackground(bgTrimmed || null),
      ]);
      setBrandColors({ background: bgTrimmed || null });
      showAlert("Saved", "Organization settings updated.", "success");
    } catch {
      showAlert("Error", "Could not save. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRoutingRole(type: NotificationType, role: Role) {
    const entry = routing.find((r) => r.type === type);
    if (!entry) return;
    const nextRoles = entry.roles.includes(role)
      ? entry.roles.filter((r) => r !== role)
      : [...entry.roles, role];

    setRouting((prev) => prev.map((r) => (r.type === type ? { ...r, roles: nextRoles, isDefault: false } : r)));
    setRoutingSavingType(type);
    try {
      await updateNotificationRouting(type, nextRoles);
    } catch {
      showAlert("Error", "Could not update notification routing.", "error");
      fetchNotificationRouting().then(setRouting).catch(() => {});
    } finally {
      setRoutingSavingType(null);
    }
  }

  const brandSwatches = settings
    ? [
        { label: "Primary",   color: settings.branding.primary   ?? colors.primary },
        { label: "Secondary", color: settings.branding.secondary ?? colors.secondary },
        { label: "Accent",    color: settings.branding.accent    ?? colors.accent },
      ]
    : [];

  const bgPreviewColor = /^#[0-9A-Fa-f]{6}$/.test(bgColor.trim()) ? bgColor.trim() : colors.bg;

  if (!isAdmin) return null;

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
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
            <Text style={s.hint}>Primary/secondary/accent colors: contact support to change.</Text>

            <View style={{ height: ms(16) }} />
            <Text style={s.fieldLabel}>Background Color</Text>
            <View style={s.bgRow}>
              <View style={[s.bgPreview, { backgroundColor: bgPreviewColor }]} />
              <TextInput
                style={[s.numberInput, { flex: 1, width: undefined }]}
                value={bgColor}
                onChangeText={setBgColor}
                placeholder={C.bg}
                placeholderTextColor={C.placeholder}
                autoCapitalize="characters"
                maxLength={7}
              />
            </View>
            <Text style={s.hint}>Hex code (e.g. #F4F1EC). Leave blank to use the default.</Text>
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

          <Text style={s.sectionLabel}>NOTIFICATION TIMING</Text>
          <View style={s.card}>
            <Text style={s.fieldLabel}>Remind teachers before class (minutes)</Text>
            <TextInput
              style={s.numberInput}
              value={classReminderMinutes}
              onChangeText={(v) => setClassReminderMinutes(v.replace(/\D/g, ""))}
              keyboardType="number-pad"
              placeholder="15"
              placeholderTextColor={C.placeholder}
            />
            <View style={{ height: ms(14) }} />
            <Text style={s.fieldLabel}>Overdue grace period (days)</Text>
            <TextInput
              style={s.numberInput}
              value={overdueGraceDays}
              onChangeText={(v) => setOverdueGraceDays(v.replace(/\D/g, ""))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={C.placeholder}
            />
            <Text style={s.hint}>How many days past the due date before an installment counts as overdue for notifications.</Text>
          </View>

          <Text style={s.sectionLabel}>NOTIFICATION ROUTING</Text>
          <View style={s.card}>
            {routingLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              routing.filter((r) => r.configurable).map((entry, i) => (
                <View key={entry.type} style={[s.routingRow, i > 0 && s.optionRowBorder]}>
                  <View style={s.routingHead}>
                    <Text style={s.optionLabel}>{NOTIFICATION_TYPE_LABELS[entry.type] ?? entry.type}</Text>
                    {routingSavingType === entry.type && <ActivityIndicator size="small" color={colors.primary} />}
                  </View>
                  <View style={s.roleChipRow}>
                    {ROLES.map((role) => {
                      const meta = ROLE_META[role];
                      const active = entry.roles.includes(role);
                      return (
                        <TouchableOpacity
                          key={role}
                          style={[s.roleChip, active && { backgroundColor: meta.color, borderColor: meta.color }]}
                          onPress={() => toggleRoutingRole(entry.type, role)}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.roleChipT, { color: active ? "#fff" : C.muted }]}>{meta.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {entry.roles.length === 0 && <Text style={s.mutedHint}>Muted — no one receives this notification.</Text>}
                </View>
              ))
            )}
          </View>

          <View style={{ flex: 1 }} />
          <PrimaryButton label="Save Changes" onPress={handleSave} loading={saving} disabled={saving} icon="checkmark-circle-outline" />
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.screenBg },
  loader: { flex: 1, backgroundColor: colors.screenBg, alignItems: "center", justifyContent: "center" },
  body:   { flex: 1, backgroundColor: colors.screenBg, paddingHorizontal: ms(16), paddingTop: ms(16), paddingBottom: ms(20) },

  sectionLabel: { ...T.sectionHeading, color: C.muted, letterSpacing: 1.1, marginBottom: ms(8), marginTop: ms(4) },
  card: {
    backgroundColor: C.card, borderRadius: ms(16), marginBottom: ms(20),
    overflow: "hidden", borderWidth: 1, borderColor: C.border, padding: ms(14),
  },

  swatchRow: { flexDirection: "row", gap: ms(20) },
  swatchItem: { alignItems: "center", gap: ms(6) },
  swatch:     { width: ms(40), height: ms(40), borderRadius: ms(12), borderWidth: 1, borderColor: C.border },
  swatchLabel:{ ...T.caption, color: C.muted },
  hint:       { ...T.caption, color: C.placeholder, marginTop: ms(12) },
  bgRow:      { flexDirection: "row", alignItems: "center", gap: ms(10), marginTop: ms(4) },
  bgPreview:  { width: ms(44), height: ms(44), borderRadius: ms(12), borderWidth: 1, borderColor: C.border, flexShrink: 0 },

  optionRow: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingVertical: ms(10) },
  optionRowBorder: { borderTopWidth: 1, borderTopColor: C.border, marginTop: ms(10), paddingTop: ms(14) },
  optionIcon: { width: ms(38), height: ms(38), borderRadius: ms(11), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  optionLabel: { ...T.listItemTitle, color: C.text },
  optionSub:   { ...T.caption, color: C.muted, marginTop: ms(1) },
  radio:      { width: ms(20), height: ms(20), borderRadius: ms(10), borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  radioDot:   { width: ms(10), height: ms(10), borderRadius: ms(5) },

  fieldLabel: { ...T.chipText, color: C.text, marginBottom: ms(8) },
  numberInput: {
    backgroundColor: C.inputBg, borderRadius: ms(12), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    paddingHorizontal: ms(14), paddingVertical: ms(11), ...T.body, color: C.text, width: ms(100),
  },

  routingRow:  { paddingVertical: ms(10) },
  routingHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(10) },
  roleChipRow: { flexDirection: "row", gap: ms(8), flexWrap: "wrap" },
  roleChip:    { paddingHorizontal: ms(12), paddingVertical: ms(7), borderRadius: ms(20), borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
  roleChipT:   { ...T.chipText },
  mutedHint:   { ...T.caption, color: C.placeholder, marginTop: ms(8), fontStyle: "italic" },
});

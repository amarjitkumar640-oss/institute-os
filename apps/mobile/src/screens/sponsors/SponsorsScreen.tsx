import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
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
import { listSponsors, createSponsor, type Sponsor } from "../../api/sponsors";

const SCREEN_H = Dimensions.get("window").height;

type Props = NativeStackScreenProps<RootStackParamList, "Sponsors">;

function AddSponsorSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);
  const { showAlert } = useAlert();
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) { showAlert("Missing name", "Enter the sponsoring company's name.", "error"); return; }
    setSaving(true);
    try {
      const result = await createSponsor({
        name: name.trim(),
        contactPerson: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        gstin: gstin.trim() || undefined,
        stateCode: stateCode.trim() || undefined,
      });
      if (!result.ok) { showAlert("Error", result.error, "error"); return; }
      setName(""); setContactPerson(""); setPhone(""); setGstin(""); setStateCode("");
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={SHEET_HEIGHT.standard}>
      {/* Explicit height, not flex:1 — BottomSheet's own inner container has
          no height of its own (only a maxHeight cap), so a flex:1 child here
          would have nothing to resolve against and collapse to nothing. */}
      <View style={{ height: SCREEN_H * 0.85 }}>
      <View style={cs.sheetWrap}>
        {/* Only this part scrolls — the submit button below stays pinned to
            the bottom of the sheet, matching StaffManagementScreen's and
            CenterManagementScreen's modals. */}
        <ScrollView style={cs.sheet} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={cs.head}>
            <View style={cs.headIcon}>
              <Ionicons name="business-outline" size={ms(20)} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.headTitle}>Add Sponsor</Text>
            </View>
            <TouchableOpacity style={cs.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>
          <View style={cs.divider} />

          <Text style={cs.label}>Company Name</Text>
          <TextInput style={cs.textField} value={name} onChangeText={setName} placeholder="e.g. Acme Corp Pvt. Ltd." placeholderTextColor={C.placeholder} />

          <Text style={cs.label}>Contact Person</Text>
          <TextInput style={cs.textField} value={contactPerson} onChangeText={setContactPerson} placeholderTextColor={C.placeholder} />

          <Text style={cs.label}>Phone</Text>
          <TextInput style={cs.textField} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={C.placeholder} />

          <Text style={cs.label}>GSTIN</Text>
          <TextInput style={cs.textField} value={gstin} onChangeText={setGstin} autoCapitalize="characters" maxLength={20} placeholderTextColor={C.placeholder} />

          <Text style={cs.label}>GST State Code</Text>
          <TextInput style={cs.textField} value={stateCode} onChangeText={setStateCode} placeholder="e.g. 27" maxLength={2} placeholderTextColor={C.placeholder} />
        </ScrollView>

        <View style={cs.footer}>
          <TouchableOpacity style={[cs.submitBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.65 }]} onPress={submit} disabled={saving} activeOpacity={0.88}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={cs.submitT}>Add Sponsor</Text>}
          </TouchableOpacity>
        </View>
      </View>
      </View>
    </BottomSheet>
  );
}

export function SponsorsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { canWrite } = usePermission("sponsors");
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setSponsors(await listSponsors()); } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader
        title="CSR Sponsors"
        onBack={() => navigation.goBack()}
        right={canWrite ? (
          <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
            <Ionicons name="add" size={ms(14)} color={colors.primary} />
            <Text style={[s.addBtnT, { color: colors.primary }]}>New</Text>
          </TouchableOpacity>
        ) : undefined}
      />
      <Text style={s.hint}>Companies sponsoring a batch's course fee in full.</Text>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {sponsors.length === 0 ? (
            <EmptyState
              scene="batches"
              title="No sponsors yet"
              subtitle="Add a company sponsoring a batch's course fee."
              action={canWrite ? { label: "Add Sponsor", onPress: () => setShowAdd(true) } : undefined}
            />
          ) : (
            sponsors.map((sp) => (
              <TouchableOpacity key={sp.id} style={s.card} onPress={() => navigation.navigate("SponsorDetail", { sponsorId: sp.id })} activeOpacity={0.78}>
                <View style={s.icon}>
                  <Ionicons name="business-outline" size={ms(17)} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{sp.name}</Text>
                  <Text style={s.sub} numberOfLines={1}>{sp.contactPerson || sp.phone || sp.email || "No contact details"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={ms(16)} color={C.border} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <AddSponsorSheet visible={showAdd} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(true); }} />
    </SafeAreaView>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  addBtn: { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: colors.primary + "14", borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(6), borderWidth: 1, borderColor: colors.primary + "30" },
  addBtnT: { ...T.chipText },
  hint: { ...T.caption, color: C.muted, marginHorizontal: ms(16), marginTop: ms(4), marginBottom: ms(8) },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(40) },
  card: {
    flexDirection: "row", alignItems: "center", gap: ms(12), backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(10),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(2) }, shadowOpacity: 0.06, shadowRadius: ms(8), elevation: 2,
  },
  icon: { width: ms(38), height: ms(38), borderRadius: ms(12), backgroundColor: colors.primary + "12", justifyContent: "center", alignItems: "center" },
  name: { ...T.listItemTitle, color: C.text },
  sub: { ...T.caption, color: C.muted, marginTop: ms(2) },
});

const makeCsStyles = (colors: ThemeColors) => StyleSheet.create({
  sheetWrap: { flex: 1 },
  sheet: { flex: 1, paddingHorizontal: ms(20), paddingTop: ms(20) },
  head: { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(14) },
  headIcon: { width: ms(42), height: ms(42), borderRadius: ms(13), backgroundColor: colors.primary + "12", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  headTitle: { ...T.cardTitle, color: C.text },
  closeBtn: { width: ms(32), height: ms(32), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(16) },
  label: { ...T.sectionHeading, color: C.muted, marginBottom: ms(8) },
  textField: { backgroundColor: C.inputBg, borderRadius: ms(12), padding: ms(12), ...T.body, color: C.text, marginBottom: ms(16) },
  submitBtn: { borderRadius: ms(14), paddingVertical: ms(15), alignItems: "center" },
  submitT: { ...T.buttonText, color: "#fff" },
  footer: { paddingHorizontal: ms(20), paddingTop: ms(12), paddingBottom: ms(20), borderTopWidth: 1, borderTopColor: C.border },
});

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput,
  RefreshControl, Switch,
} from "react-native";
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
import {
  listBatchOffers, createBatchOffer, updateBatchOffer, deleteBatchOffer,
  type BatchDiscountOffer,
} from "../../api/batches";

type Props = NativeStackScreenProps<RootStackParamList, "BatchOffers">;

function fmtAmount(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function CreateOfferSheet({
  visible, batchId, onClose, onDone,
}: {
  visible: boolean; batchId: string; onClose: () => void; onDone: () => void;
}) {
  const { showAlert } = useAlert();
  const colors = useThemeColors();
  const cs = useThemedStyles(makeCsStyles);

  const [discountAmount, setDiscountAmount] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDiscountAmount("");
    setMaxRedemptions("");
  }, [visible]);

  async function submit() {
    const amt = parseFloat(discountAmount);
    const max = parseInt(maxRedemptions, 10);
    if (isNaN(amt) || amt <= 0) {
      showAlert("Invalid amount", "Please enter a valid discount amount.", "error");
      return;
    }
    if (isNaN(max) || max <= 0) {
      showAlert("Invalid count", "Please enter how many students this offer applies to.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await createBatchOffer(batchId, { discountAmount: amt, maxRedemptions: max });
      if (!result.ok) {
        showAlert("Error", result.error, "error");
        return;
      }
      onDone();
      showAlert("Offer Created", `First ${max} students will get ${fmtAmount(amt)} off.`, "success" as any);
    } catch {
      showAlert("Error", "Could not create offer. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={SHEET_HEIGHT.short}>
      <View style={cs.sheet}>
        <View style={cs.head}>
          <View style={cs.headIcon}>
            <Ionicons name="pricetag-outline" size={ms(20)} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cs.headTitle}>New Discount Offer</Text>
            <Text style={cs.headSub} numberOfLines={2}>Auto-applied to the first N students admitted into this batch</Text>
          </View>
          <TouchableOpacity style={cs.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>

        <View style={cs.divider} />

        <Text style={cs.label}>Discount Amount</Text>
        <View style={cs.amtField}>
          <Text style={cs.amtPrefix}>₹</Text>
          <TextInput
            style={cs.amtInput}
            value={discountAmount}
            onChangeText={setDiscountAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={C.placeholder}
          />
        </View>

        <Text style={cs.label}>First N Students</Text>
        <TextInput
          style={cs.textField}
          value={maxRedemptions}
          onChangeText={setMaxRedemptions}
          keyboardType="number-pad"
          placeholder="e.g. 10"
          placeholderTextColor={C.placeholder}
        />

        <TouchableOpacity
          style={[cs.submitBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.65 }]}
          onPress={submit}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={ms(18)} color="#fff" />
                <Text style={cs.submitT}>Create Offer</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

function OfferCard({
  offer, canEdit, canDelete, onToggle, onDelete,
}: {
  offer: BatchDiscountOffer;
  canEdit: boolean;
  canDelete: boolean;
  onToggle: (isActive: boolean) => void;
  onDelete: () => void;
}) {
  const oc = useThemedStyles(makeOcStyles);
  const exhausted = offer.redeemedCount >= offer.maxRedemptions;
  const pct = offer.maxRedemptions ? Math.min(offer.redeemedCount / offer.maxRedemptions, 1) : 0;

  return (
    <View style={oc.card}>
      <View style={oc.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={oc.amount}>{fmtAmount(offer.discountAmount)} off</Text>
          <Text style={oc.sub}>{offer.redeemedCount} / {offer.maxRedemptions} students redeemed</Text>
        </View>
        {exhausted && (
          <View style={[oc.badge, { backgroundColor: C.bg }]}>
            <Text style={[oc.badgeT, { color: C.muted }]}>Exhausted</Text>
          </View>
        )}
        {!offer.isActive && (
          <View style={[oc.badge, { backgroundColor: "#FFF3D6" }]}>
            <Text style={[oc.badgeT, { color: "#946200" }]}>Inactive</Text>
          </View>
        )}
      </View>

      <View style={oc.track}>
        <View style={[oc.fill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: exhausted ? C.muted : C.green }]} />
      </View>

      <View style={oc.actionsRow}>
        {canEdit && (
          <View style={oc.toggleRow}>
            <Text style={oc.toggleLabel}>Active</Text>
            <Switch
              value={offer.isActive}
              onValueChange={onToggle}
              trackColor={{ false: C.border, true: C.green + "40" }}
              thumbColor={offer.isActive ? C.green : C.placeholder}
            />
          </View>
        )}
        {canDelete && (
          <TouchableOpacity style={oc.deleteBtn} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={ms(16)} color={C.red} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function BatchOffersScreen({ navigation, route }: Props) {
  const { batchId, batchName } = route.params;
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { showConfirm, showAlert } = useAlert();
  const { canEdit, canDelete } = usePermission("batches");

  const [offers, setOffers] = useState<BatchDiscountOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await listBatchOffers(batchId);
      setOffers(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [batchId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleToggle(offer: BatchDiscountOffer, isActive: boolean) {
    setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, isActive } : o)));
    const result = await updateBatchOffer(offer.id, { isActive });
    if (!result.ok) {
      showAlert("Error", result.error, "error");
      load(true);
    }
  }

  function handleDelete(offer: BatchDiscountOffer) {
    showConfirm(
      "Delete Offer?",
      `Delete this ${fmtAmount(offer.discountAmount)} offer? This can't be undone.`,
      async () => {
        const result = await deleteBatchOffer(offer.id);
        if (!result.ok) {
          showAlert("Error", result.error, "error");
          return;
        }
        load(true);
      },
      { confirmLabel: "Delete", destructive: true },
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader
        title="Discount Offers"
        onBack={() => navigation.goBack()}
        right={canEdit ? (
          <TouchableOpacity style={s.addBtn} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
            <Ionicons name="add" size={ms(14)} color={colors.primary} />
            <Text style={[s.addBtnT, { color: colors.primary }]}>New</Text>
          </TouchableOpacity>
        ) : undefined}
      />

      <Text style={s.batchNameT} numberOfLines={1}>{batchName}</Text>
      <Text style={s.hint}>Gives the first N students admitted into this batch an extra discount — takes priority over the course's standing discount while slots remain.</Text>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {offers.length === 0 ? (
            <EmptyState
              scene="batches"
              title="No discount offers yet"
              subtitle="Create one to give an extra discount to the first N students admitted into this batch."
              action={canEdit ? { label: "New Offer", onPress: () => setShowCreate(true) } : undefined}
            />
          ) : (
            offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                canEdit={canEdit}
                canDelete={canDelete}
                onToggle={(v) => handleToggle(offer, v)}
                onDelete={() => handleDelete(offer)}
              />
            ))
          )}
        </ScrollView>
      )}

      <CreateOfferSheet
        visible={showCreate}
        batchId={batchId}
        onClose={() => setShowCreate(false)}
        onDone={() => { setShowCreate(false); load(true); }}
      />
    </SafeAreaView>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: ms(4),
    backgroundColor: colors.primary + "14", borderRadius: ms(20),
    paddingHorizontal: ms(10), paddingVertical: ms(6),
    borderWidth: 1, borderColor: colors.primary + "30",
  },
  addBtnT: { ...T.chipText },
  batchNameT: { ...T.cardTitle, color: C.text, marginHorizontal: ms(16), marginTop: ms(10) },
  hint: { ...T.caption, color: C.muted, marginHorizontal: ms(16), marginTop: ms(4), marginBottom: ms(8) },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(40) },
});

const makeOcStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(10),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(2) }, shadowOpacity: 0.06, shadowRadius: ms(8), elevation: 2,
  },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: ms(8) },
  amount: { ...T.cardTitle, color: C.text },
  sub: { ...T.caption, color: C.muted, marginTop: ms(2) },
  badge: { borderRadius: ms(6), paddingHorizontal: ms(7), paddingVertical: ms(3) },
  badgeT: { ...T.badgeText, letterSpacing: 0.2 },
  track: { height: ms(5), borderRadius: ms(4), backgroundColor: C.inputBg, overflow: "hidden", marginTop: ms(10) },
  fill: { height: ms(5), borderRadius: ms(4) },
  actionsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: ms(10) },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  toggleLabel: { ...T.caption, color: C.muted },
  deleteBtn: {
    width: ms(30), height: ms(30), borderRadius: ms(10), justifyContent: "center", alignItems: "center",
    backgroundColor: "#FBE9E7",
  },
});

const makeCsStyles = (colors: ThemeColors) => StyleSheet.create({
  sheet: { paddingHorizontal: ms(20), paddingTop: ms(20), paddingBottom: ms(8) },
  head: { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(14) },
  headIcon: {
    width: ms(42), height: ms(42), borderRadius: ms(13), backgroundColor: colors.primary + "12",
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  headTitle: { ...T.cardTitle, color: C.text },
  headSub: { ...T.caption, color: C.muted, marginTop: ms(2) },
  closeBtn: {
    width: ms(32), height: ms(32), borderRadius: ms(10), backgroundColor: C.inputBg,
    borderWidth: 1, borderColor: C.border, justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(16) },
  label: { ...T.sectionHeading, color: C.muted, marginBottom: ms(8) },
  amtField: {
    flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: ms(12),
    paddingHorizontal: ms(14), marginBottom: ms(16), gap: ms(6),
  },
  amtPrefix: { ...T.displayMedium, color: C.text },
  amtInput: { flex: 1, ...T.displayMedium, color: C.text, padding: ms(12), includeFontPadding: false },
  textField: {
    backgroundColor: C.inputBg, borderRadius: ms(12), padding: ms(12), ...T.body, color: C.text, marginBottom: ms(20),
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8),
    borderRadius: ms(14), paddingVertical: ms(15), marginBottom: ms(8),
  },
  submitT: { ...T.buttonText, color: "#fff" },
});

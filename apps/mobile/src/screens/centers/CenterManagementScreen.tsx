import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator,
  RefreshControl, Animated, Easing, Platform,
  Keyboard, TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { ms, fs } from "../../utils/responsive";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import {
  fetchAllCenters, createCenter, updateCenter,
  fetchCenterStaff, assignStaffToCenter, removeStaffFromCenter,
  fetchAllStaff,
  type CenterItem, type CenterStaffItem, type AllStaffItem,
} from "../../api/centers";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, lighten, type ThemeColors } from "../../context/ThemeContext";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

const ROLE_LABELS: Record<string, string> = {
  admin:     "Admin",
  teacher:   "Teacher",
  frontdesk: "Front Desk",
};

function roleColors(colors: ThemeColors): Record<string, string> {
  return {
    admin:     colors.primary,
    teacher:   colors.accent,
    frontdesk: C.orange,
  };
}

// ── Create / Edit center modal ────────────────────────────────────────────────

interface CenterFormModal {
  visible: boolean;
  center:  CenterItem | null;
  onDone:  () => void;
  onClose: () => void;
}

function CenterFormModal({ visible, center, onDone, onClose }: CenterFormModal) {
  const { showAlert } = useAlert();
  const colors = useThemeColors();
  const m = useThemedStyles(makeMStyles);
  const [name,    setName]    = useState("");
  const [address, setAddress] = useState("");
  const [phone,   setPhone]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const keyboardPad = useRef(new Animated.Value(0)).current;

  const isEdit = !!center;

  useEffect(() => {
    if (visible) {
      setName(center?.name    ?? "");
      setAddress(center?.address ?? "");
      setPhone(center?.phone   ?? "");
      setFocused(null);
      keyboardPad.setValue(0);
    }
  }, [visible, center]);

  // ── Keyboard-aware sheet padding — driven directly by keyboard events rather
  //    than KeyboardAvoidingView, which can settle on a stale offset inside a Modal.
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const animateTo = (toValue: number, duration?: number) => {
      Animated.timing(keyboardPad, {
        toValue,
        duration: duration && duration > 0 ? duration : 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, (e) => animateTo(e.endCoordinates.height, e.duration));
    const hideSub = Keyboard.addListener(hideEvent, (e) => animateTo(0, e.duration));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  async function save() {
    if (!name.trim()) {
      showAlert("Required", "Center name is required.", "warning");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name:    name.trim(),
        address: address.trim() || undefined,
        phone:   phone.trim()   || undefined,
      };
      if (center) {
        await updateCenter(center.id, body);
      } else {
        await createCenter(body);
      }
      onDone();
    } catch {
      showAlert("Error", "Could not save center. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose} />
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <Animated.View style={[m.sheet, { paddingBottom: Animated.add(ms(36), keyboardPad) }]}>

          {/* Drag handle */}
          <View style={m.drag} />

          {/* Header row */}
          <View style={m.fHeader}>
            <View style={m.fHeaderLeft}>
              <View style={m.fHeaderIcon}>
                <Ionicons name="business-outline" size={ms(20)} color={colors.primary} />
              </View>
              <View>
                <Text style={m.fTitle}>{isEdit ? "Edit Center" : "New Center"}</Text>
                <Text style={m.fSubtitle}>
                  {isEdit ? "Update center details" : "Add a new teaching center"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={m.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={ms(18)} color={C.text} />
            </TouchableOpacity>
          </View>

          <View style={m.fDivider} />

          {/* Fields */}
          <ScrollView
            style={m.fieldsScroll}
            contentContainerStyle={m.fields}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            <View style={m.fieldWrap}>
              <View style={m.fieldLabelRow}>
                <Ionicons name="business-outline" size={ms(12)} color={colors.primary} />
                <Text style={m.fieldLabelT}>
                  Center Name <Text style={m.req}>*</Text>
                </Text>
              </View>
              <View style={[m.inputBox, focused === "name" && m.inputBoxFocused]}>
                <TextInput
                  style={m.input}
                  placeholder="e.g. Jamshedpur Main Branch"
                  placeholderTextColor={C.placeholder}
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocused("name")}
                  onBlur={() => setFocused(null)}
                  autoFocus
                />
              </View>
            </View>

            <View style={m.fieldWrap}>
              <View style={m.fieldLabelRow}>
                <Ionicons name="location-outline" size={ms(12)} color={colors.accent} />
                <Text style={m.fieldLabelT}>Address</Text>
              </View>
              <View style={[m.inputBox, focused === "address" && m.inputBoxFocused]}>
                <TextInput
                  style={[m.input, m.multiInput]}
                  placeholder="Full address (optional)"
                  placeholderTextColor={C.placeholder}
                  value={address}
                  onChangeText={setAddress}
                  onFocus={() => setFocused("address")}
                  onBlur={() => setFocused(null)}
                  multiline
                />
              </View>
            </View>

            <View style={m.fieldWrap}>
              <View style={m.fieldLabelRow}>
                <Ionicons name="call-outline" size={ms(12)} color={C.orange} />
                <Text style={m.fieldLabelT}>Phone Number</Text>
              </View>
              <View style={[m.inputBox, focused === "phone" && m.inputBoxFocused]}>
                <TextInput
                  style={m.input}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={C.placeholder}
                  value={phone}
                  onChangeText={setPhone}
                  onFocus={() => setFocused("phone")}
                  onBlur={() => setFocused(null)}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

          </ScrollView>

          {/* Submit button */}
          <TouchableOpacity
            style={[m.btn, saving && m.btnDim]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[colors.primary, lighten(colors.primary, 0.15), lighten(colors.primary, 0.32)]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={m.btnGrad}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isEdit ? "checkmark-circle-outline" : "add-circle-outline"}
                    size={ms(18)}
                    color="#fff"
                  />
                  <Text style={m.btnT}>{isEdit ? "Save Changes" : "Create Center"}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

        </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  );
}

// ── Assign staff modal ────────────────────────────────────────────────────────

interface AssignStaffModalProps {
  visible:    boolean;
  centerId:   string;
  assigned:   CenterStaffItem[];
  onDone:     () => void;
  onClose:    () => void;
}

function AssignStaffModal({ visible, centerId, assigned, onDone, onClose }: AssignStaffModalProps) {
  const { showAlert } = useAlert();
  const colors = useThemeColors();
  const m = useThemedStyles(makeMStyles);
  const [allStaff, setAllStaff] = useState<AllStaffItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState<string | null>(null); // staffId being saved
  const [role,     setRole]     = useState<"admin" | "teacher" | "frontdesk">("teacher");

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchAllStaff()
      .then(setAllStaff)
      .finally(() => setLoading(false));
  }, [visible]);

  const assignedIds = new Set(assigned.map((a) => a.staffId));

  async function assign(staffId: string) {
    setSaving(staffId);
    try {
      await assignStaffToCenter(centerId, staffId, role);
      onDone();
    } catch {
      showAlert("Error", "Could not assign staff member.", "error");
    } finally {
      setSaving(null);
    }
  }

  const unassigned = allStaff.filter((s) => !assignedIds.has(s.id) && s.isActive);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[m.sheet, { maxHeight: "80%" }]}>
          <View style={m.drag} />
          <Text style={m.title}>Assign Staff</Text>

          {/* Role selector */}
          <Text style={m.label}>Assign as</Text>
          <View style={m.rolePicker}>
            {(["admin", "teacher", "frontdesk"] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[m.roleChip, role === r && { backgroundColor: roleColors(colors)[r] }]}
                onPress={() => setRole(r)}
              >
                <Text style={[m.roleChipT, role === r && { color: "#fff" }]}>
                  {ROLE_LABELS[r]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: ms(24) }} />
          ) : unassigned.length === 0 ? (
            <Text style={m.emptyT}>All active staff are already assigned to this center.</Text>
          ) : (
            <ScrollView style={{ maxHeight: ms(320) }} showsVerticalScrollIndicator={false}>
              {unassigned.map((s) => (
                <View key={s.id} style={m.staffRow}>
                  <View style={m.staffAv}>
                    <Text style={m.staffAvL}>{s.fullName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={m.staffName} numberOfLines={1}>{s.fullName}</Text>
                    <Text style={m.staffEmail} numberOfLines={1}>{s.email}</Text>
                  </View>
                  <TouchableOpacity
                    style={[m.assignBtn, saving === s.id && m.btnDim]}
                    onPress={() => assign(s.id)}
                    disabled={saving !== null}
                  >
                    {saving === s.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={m.assignBtnT}>Add</Text>
                    }
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
            <Text style={m.cancelT}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Center detail expanded view ───────────────────────────────────────────────

interface CenterDetailProps {
  center:         CenterItem;
  onEdit:         () => void;
  onToggleActive: () => void;
}

function CenterDetail({ center, onEdit, onToggleActive }: CenterDetailProps) {
  const { showAlert, showConfirm } = useAlert();
  const colors = useThemeColors();
  const d = useThemedStyles(makeDStyles);
  const [staff,    setStaff]    = useState<CenterStaffItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchCenterStaff(center.id)
      .then(setStaff)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [center.id]);

  useEffect(() => { load(); }, [load]);

  async function removeStaff(staffId: string, name: string) {
    showConfirm(
      "Remove Staff",
      `Remove ${name} from ${center.name}?`,
      async () => {
        setRemoving(staffId);
        try {
          await removeStaffFromCenter(center.id, staffId);
          setStaff((prev) => prev.filter((s) => s.staffId !== staffId));
        } catch {
          showAlert("Error", "Could not remove staff member.", "error");
        } finally {
          setRemoving(null);
        }
      },
      { confirmLabel: "Remove", destructive: true },
    );
  }

  return (
    <View style={d.wrap}>
      {/* Stats row */}
      <View style={d.statsRow}>
        <View style={d.stat}>
          <Text style={d.statN}>{center.counts.students}</Text>
          <Text style={d.statL}>Students</Text>
        </View>
        <View style={d.statDiv} />
        <View style={d.stat}>
          <Text style={d.statN}>{center.counts.batches}</Text>
          <Text style={d.statL}>Batches</Text>
        </View>
        <View style={d.statDiv} />
        <View style={d.stat}>
          <Text style={d.statN}>{center.counts.staff}</Text>
          <Text style={d.statL}>Staff</Text>
        </View>
      </View>

      {/* Info rows */}
      {center.address ? (
        <View style={d.infoRow}>
          <Ionicons name="location-outline" size={ms(14)} color={C.muted} />
          <Text style={d.infoT} numberOfLines={2}>{center.address}</Text>
        </View>
      ) : null}
      {center.phone ? (
        <View style={d.infoRow}>
          <Ionicons name="call-outline" size={ms(14)} color={C.muted} />
          <Text style={d.infoT}>{center.phone}</Text>
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={d.actions}>
        <TouchableOpacity style={d.actionBtn} onPress={onEdit}>
          <Ionicons name="create-outline" size={ms(15)} color={colors.primary} />
          <Text style={[d.actionT, { color: colors.primary }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={d.actionBtn} onPress={onToggleActive}>
          <Ionicons
            name={center.isActive ? "pause-circle-outline" : "play-circle-outline"}
            size={ms(15)}
            color={center.isActive ? C.red : C.green}
          />
          <Text style={[d.actionT, { color: center.isActive ? C.red : C.green }]}>
            {center.isActive ? "Deactivate" : "Activate"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Staff section */}
      <View style={d.staffHeader}>
        <Text style={d.staffTitle}>Staff Members</Text>
        <TouchableOpacity style={d.addStaffBtn} onPress={() => setShowAssign(true)}>
          <Ionicons name="person-add-outline" size={ms(13)} color={C.purple} />
          <Text style={d.addStaffT}>Assign</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: ms(12) }} />
      ) : staff.length === 0 ? (
        <Text style={d.noStaff}>No staff assigned yet.</Text>
      ) : (
        staff.map((s, i) => (
          <View key={s.id} style={[d.staffRow, i < staff.length - 1 && d.staffDiv]}>
            <View style={d.staffAv}>
              <Text style={d.staffAvL}>{s.fullName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={d.staffName} numberOfLines={1}>{s.fullName}</Text>
              <Text style={d.staffEmail} numberOfLines={1}>{s.email}</Text>
            </View>
            <View style={[d.roleChip, { backgroundColor: roleColors(colors)[s.role] + "22" }]}>
              <Text style={[d.roleChipT, { color: roleColors(colors)[s.role] }]}>
                {ROLE_LABELS[s.role]}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => removeStaff(s.staffId, s.fullName)}
              disabled={removing === s.staffId}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {removing === s.staffId
                ? <ActivityIndicator size="small" color={C.muted} />
                : <Ionicons name="close-circle-outline" size={ms(18)} color={C.muted} />
              }
            </TouchableOpacity>
          </View>
        ))
      )}

      <AssignStaffModal
        visible={showAssign}
        centerId={center.id}
        assigned={staff}
        onDone={() => { setShowAssign(false); load(); }}
        onClose={() => setShowAssign(false)}
      />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function CenterManagementScreen() {
  const navigation = useNavigation();
  const { showAlert, showConfirm } = useAlert();
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const [centers,    setCenters]    = useState<CenterItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState<CenterItem | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await fetchAllCenters();
      setCenters(data);
    } catch {
      showAlert("Error", "Could not load centers.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useRefetchOnReconnect(() => load(true));

  function openCreate() {
    setEditTarget(null);
    setShowForm(true);
  }

  function openEdit(center: CenterItem) {
    setEditTarget(center);
    setShowForm(true);
  }

  async function toggleActive(center: CenterItem) {
    const action = center.isActive ? "Deactivate" : "Activate";
    showConfirm(
      `${action} Center`,
      `Are you sure you want to ${action.toLowerCase()} "${center.name}"?`,
      async () => {
        try {
          await updateCenter(center.id, { isActive: !center.isActive });
          load();
        } catch {
          showAlert("Error", "Could not update center status.", "error");
        }
      },
      {
        confirmLabel: action,
        destructive:  center.isActive,
        // Activating isn't a warning — give it the theme-colored treatment
        // instead of the plain info-blue icon, same reasoning as logout.
        brand:        !center.isActive,
        icon:         !center.isActive ? "power-outline" : undefined,
      },
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader
        title="Manage Centers"
        count={centers.filter((c) => c.isActive).length}
        countLabel="active"
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loaderT}>Loading centers…</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.body}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {centers.length === 0 ? (
            <EmptyState
              scene="centers"
              color={C.green}
              title="No centers yet"
              subtitle="Create your first branch or teaching center to get started"
              action={{ label: "Create Center", onPress: openCreate }}
            />
          ) : (
            centers.map((center) => {
              const isOpen = expanded === center.id;
              return (
                <View key={center.id} style={[s.card, !center.isActive && s.cardInactive]}>
                  {/* Card header — tap to expand */}
                  <TouchableOpacity
                    style={s.cardHead}
                    onPress={() => setExpanded(isOpen ? null : center.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.cardIcon, !center.isActive && { backgroundColor: C.border }]}>
                      <Ionicons name="business-outline" size={ms(18)} color="#fff" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, marginLeft: ms(12) }}>
                      <View style={s.nameRow}>
                        <Text style={s.cardName} numberOfLines={1}>{center.name}</Text>
                        {!center.isActive && (
                          <View style={s.inactiveBadge}>
                            <Text style={s.inactiveBadgeT}>Inactive</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.cardMeta}>
                        {center.counts.staff} staff · {center.counts.students} students
                      </Text>
                    </View>
                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={ms(18)}
                      color={C.muted}
                    />
                  </TouchableOpacity>

                  {/* Expanded detail */}
                  {isOpen && (
                    <CenterDetail
                      center={center}
                      onEdit={() => openEdit(center)}
                      onToggleActive={() => toggleActive(center)}
                    />
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: ms(90) }} />
        </ScrollView>
      )}

      {/* Create / Edit modal */}
      <CenterFormModal
        visible={showForm}
        center={editTarget}
        onDone={() => { setShowForm(false); load(); }}
        onClose={() => setShowForm(false)}
      />

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={openCreate} activeOpacity={0.85}>
        <Ionicons name="add" size={ms(28)} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.screenBg },

  scroll: { flex: 1, backgroundColor: colors.screenBg },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(16) },
  loader: { flex: 1, backgroundColor: colors.screenBg, alignItems: "center", justifyContent: "center", gap: ms(12) },
  loaderT:{ fontSize: fs(13), color: C.muted },

  empty:     { alignItems: "center", paddingVertical: ms(64), gap: ms(8) },
  emptyT:    { fontSize: fs(16), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.placeholder, marginTop: ms(8) },
  emptySub:  { fontSize: fs(12), color: C.placeholder, textAlign: "center", paddingHorizontal: ms(32) },
  emptyBtn:  { marginTop: ms(16), backgroundColor: colors.primary, borderRadius: ms(12), paddingHorizontal: ms(24), paddingVertical: ms(10) },
  emptyBtnT: { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },

  fab: { position: "absolute", bottom: ms(24), right: ms(20), width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) }, shadowOpacity: 0.45, shadowRadius: ms(14), elevation: 8 },

  card:         { backgroundColor: C.card, borderRadius: ms(18), marginBottom: ms(14), shadowColor: C.text, shadowOffset: { width: 0, height: ms(3) }, shadowOpacity: 0.1, shadowRadius: ms(8), elevation: 3, overflow: "hidden" },
  cardInactive: { opacity: 0.65 },
  cardHead:     { flexDirection: "row", alignItems: "center", padding: ms(14) },
  cardIcon:     { width: ms(40), height: ms(40), borderRadius: ms(12), backgroundColor: C.purple, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  nameRow:      { flexDirection: "row", alignItems: "center", gap: ms(6), flexWrap: "wrap" },
  cardName:     { fontSize: fs(15), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text, flexShrink: 1 },
  cardMeta:     { fontSize: fs(11.5), color: C.muted, marginTop: 2 },
  inactiveBadge:  { backgroundColor: C.border, borderRadius: ms(6), paddingHorizontal: ms(6), paddingVertical: 2 },
  inactiveBadgeT: { fontSize: fs(10), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
});

const makeDStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap:      { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: ms(14), paddingBottom: ms(14) },
  statsRow:  { flexDirection: "row", paddingVertical: ms(12) },
  stat:      { flex: 1, alignItems: "center" },
  statN:     { fontSize: fs(18), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  statL:     { fontSize: fs(10), color: C.muted, marginTop: 2 },
  statDiv:   { width: 1, backgroundColor: C.border, marginVertical: ms(4) },
  infoRow:   { flexDirection: "row", alignItems: "flex-start", gap: ms(6), marginBottom: ms(6) },
  infoT:     { fontSize: fs(12), color: C.muted, flex: 1 },
  actions:   { flexDirection: "row", gap: ms(10), marginTop: ms(8), marginBottom: ms(14) },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingVertical: ms(8), borderRadius: ms(10), backgroundColor: colors.bg, borderWidth: 1, borderColor: C.border },
  actionT:   { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700" },
  staffHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(8) },
  staffTitle:  { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  addStaffBtn: { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.purpleBg, borderRadius: ms(8), paddingHorizontal: ms(10), paddingVertical: ms(5) },
  addStaffT:   { fontSize: fs(12), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.purple },
  noStaff:     { fontSize: fs(12), color: C.muted, textAlign: "center", paddingVertical: ms(12) },
  staffRow:    { flexDirection: "row", alignItems: "center", paddingVertical: ms(9), gap: ms(10) },
  staffDiv:    { borderBottomWidth: 1, borderBottomColor: C.border },
  staffAv:     { width: ms(32), height: ms(32), borderRadius: ms(16), backgroundColor: "#EDE5F8", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  staffAvL:    { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.purple },
  staffName:   { fontSize: fs(13), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.text },
  staffEmail:  { fontSize: fs(11), color: C.muted, marginTop: 1 },
  roleChip:    { borderRadius: ms(6), paddingHorizontal: ms(7), paddingVertical: ms(3), marginRight: ms(6) },
  roleChipT:   { fontSize: fs(10), fontFamily: "Inter_700Bold", fontWeight: "700" },
});

const makeMStyles = (colors: ThemeColors) => StyleSheet.create({
  // ── Shared shell ────────────────────────────────────────────────────────────
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(16,4,8,0.50)" },
  sheet:    { backgroundColor: C.card, borderTopLeftRadius: ms(28), borderTopRightRadius: ms(28) },
  drag:     { width: ms(36), height: ms(4), backgroundColor: C.border, borderRadius: ms(2), alignSelf: "center", marginTop: ms(10), marginBottom: ms(16) },
  btnDim:   { opacity: 0.6 },

  // ── CenterFormModal header ───────────────────────────────────────────────────
  fHeader:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ms(20), paddingBottom: ms(14) },
  fHeaderLeft: { flexDirection: "row", alignItems: "center", gap: ms(12), flex: 1, minWidth: 0 },
  fHeaderIcon: { width: ms(44), height: ms(44), borderRadius: ms(14), backgroundColor: "rgba(139,30,63,0.09)", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  fTitle:      { fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  fSubtitle:   { fontSize: fs(11.5), color: C.muted, marginTop: 1 },
  closeBtn:    { width: ms(34), height: ms(34), borderRadius: ms(10), backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  fDivider:    { height: 1, backgroundColor: C.border, marginBottom: ms(8) },

  // ── CenterFormModal fields ───────────────────────────────────────────────────
  fieldsScroll:   { flexGrow: 0 },
  fields:         { paddingHorizontal: ms(20), gap: ms(14) },
  fieldWrap:      { gap: ms(7) },
  fieldLabelRow:  { flexDirection: "row", alignItems: "center", gap: ms(6) },
  fieldLabelT:    { fontSize: fs(12.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  req:            { color: colors.primary },
  inputBox:       { backgroundColor: C.inputBg, borderRadius: ms(14), borderWidth: 1.5, borderColor: C.border },
  inputBoxFocused:{ borderColor: colors.primary, backgroundColor: "#FFF8FB" },
  input:          { paddingHorizontal: ms(14), paddingVertical: ms(12), fontSize: fs(14), color: C.text },
  multiInput:     { minHeight: ms(72), textAlignVertical: "top" },

  // ── CenterFormModal button ───────────────────────────────────────────────────
  btn:     { marginHorizontal: ms(20), marginTop: ms(22), borderRadius: ms(16), overflow: "hidden" },
  btnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), paddingVertical: ms(15) },
  btnT:    { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff" },

  // ── AssignStaffModal ─────────────────────────────────────────────────────────
  title:      { fontSize: fs(17), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, marginBottom: ms(8), paddingHorizontal: ms(20) },
  label:      { fontSize: fs(12), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: ms(6), marginTop: ms(10), paddingHorizontal: ms(20) },
  rolePicker: { flexDirection: "row", gap: ms(8), marginBottom: ms(4), paddingHorizontal: ms(20) },
  roleChip:   { flex: 1, alignItems: "center", paddingVertical: ms(8), borderRadius: ms(10), backgroundColor: colors.bg, borderWidth: 1, borderColor: C.border },
  roleChipT:  { fontSize: fs(12), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.muted },
  emptyT:     { fontSize: fs(13), color: C.muted, textAlign: "center", paddingVertical: ms(16) },
  staffRow:   { flexDirection: "row", alignItems: "center", paddingVertical: ms(10), paddingHorizontal: ms(20), gap: ms(10), borderBottomWidth: 1, borderBottomColor: C.border },
  staffAv:    { width: ms(36), height: ms(36), borderRadius: ms(18), backgroundColor: "#EDE5F8", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  staffAvL:   { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.purple },
  staffName:  { fontSize: fs(13), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.text },
  staffEmail: { fontSize: fs(11), color: C.muted, marginTop: 1 },
  assignBtn:  { backgroundColor: C.purple, borderRadius: ms(8), paddingHorizontal: ms(12), paddingVertical: ms(6), minWidth: ms(44), alignItems: "center" },
  assignBtnT: { fontSize: fs(12), fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },
  cancelBtn:  { alignItems: "center", marginTop: ms(12), paddingBottom: ms(4) },
  cancelT:    { fontSize: fs(14), color: C.muted, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
});

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator,
  RefreshControl, Switch, Image, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { ms, fs } from "../../utils/responsive";
import { useKeyboardScrollIntoView } from "../../hooks/useKeyboardScrollIntoView";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { AVATAR_SIZE, AVATAR_RADIUS, getAvatarFill } from "../../components/ui/avatarStyle";
import { T } from "../../components/ui/typography";
import { useAuth } from "../../context/AuthContext";
import {
  fetchAllStaffDetailed, createStaffMember, updateStaffMember, resetStaffPassword,
  type StaffMember, type CreateStaffInput, type StaffCenterAssignment,
} from "../../api/staff";
import {
  fetchAllCenters, assignStaffToCenter, removeStaffFromCenter,
  type CenterItem,
} from "../../api/centers";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { ROLES, ROLE_META, type Role } from "../../constants/roleMeta";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import { usePermission } from "../../hooks/usePermission";

const SCREEN_H = Dimensions.get("window").height;

// ── Role chip ─────────────────────────────────────────────────────────────────

function RoleChip({ role, size = "sm" }: { role: Role; size?: "sm" | "md" }) {
  const m = ROLE_META[role];
  const pad = size === "md"
    ? { paddingHorizontal: ms(10), paddingVertical: ms(5) }
    : { paddingHorizontal: ms(7),  paddingVertical: ms(3) };
  return (
    <View style={[chip.wrap, { backgroundColor: m.bg }, pad]}>
      <Text style={[chip.txt, { color: m.color, fontSize: size === "md" ? fs(12) : fs(10) }]}>
        {m.label}
      </Text>
    </View>
  );
}

const chip = StyleSheet.create({
  wrap: { borderRadius: ms(6) },
  txt:  { fontFamily: "Inter_700Bold", fontWeight: "700" },
});

// ── Create Staff modal ────────────────────────────────────────────────────────

interface CreateModalProps {
  visible: boolean;
  onDone:  (member: StaffMember) => void;
  onClose: () => void;
}

function CreateStaffModal({ visible, onDone, onClose }: CreateModalProps) {
  const colors = useThemeColors();
  const md = useThemedStyles(makeMdStyles);
  const [fullName, setFullName] = useState("");
  const [email,    setEmail]    = useState("");
  const [phone,    setPhone]    = useState("");
  // A staff member can hold more than one role at once at the same center.
  const [roles,    setRoles]    = useState<Role[]>(["frontdesk"]);
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const { scrollRef, recordFieldY, scrollFieldIntoView, onScrollViewLayout, onScroll } =
    useKeyboardScrollIntoView({ sheetHeight: SCREEN_H * 0.85 });

  useEffect(() => {
    if (visible) {
      setFullName(""); setEmail(""); setPhone(""); setRoles(["frontdesk"]);
      setPassword(""); setError("");
    }
  }, [visible]);

  async function save() {
    if (!fullName.trim() || !email.trim() || !phone.trim() || !password || roles.length === 0) {
      setError("All fields are required."); return;
    }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setSaving(true); setError("");
    try {
      const member = await createStaffMember({
        fullName: fullName.trim(),
        email:    email.trim().toLowerCase(),
        phone:    phone.trim(),
        roles,
        password,
      });
      onDone(member);
    } catch (e: any) {
      const msg = e?.response?.data?.error;
      setError(typeof msg === "string" ? msg : "Could not create staff member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <TouchableOpacity style={md.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[md.sheet, { maxHeight: SHEET_HEIGHT.standard }]}>
          <View style={md.drag} />

          <View style={md.editHeader}>
            <View style={md.editHeaderIcon}>
              <Ionicons name="person-add-outline" size={ms(21)} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={md.editTitle}>Add Staff Member</Text>
              <Text style={md.editDesc}>Create a login for a new team member.</Text>
            </View>
            <TouchableOpacity
              style={md.editCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Only this part scrolls — the Create button below stays pinned to
              the bottom of the sheet regardless of scroll position. */}
          <ScrollView
            ref={scrollRef}
            style={{ flexShrink: 1 }}
            onLayout={onScrollViewLayout}
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={md.sectionLabel}>Roles</Text>
            <View style={md.roleRow}>
              {ROLES.map((r) => {
                const m = ROLE_META[r];
                const active = roles.includes(r);
                return (
                  <TouchableOpacity
                    key={r}
                    style={[md.roleTab, active && { backgroundColor: m.color, borderColor: m.color }]}
                    onPress={() => setRoles(active ? roles.filter((x) => x !== r) : [...roles, r])}
                  >
                    <Ionicons name={m.icon as any} size={ms(13)} color={active ? "#fff" : C.muted} />
                    <Text style={[md.roleTabT, { color: active ? "#fff" : C.muted }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={md.sectionLabel}>Details</Text>
            <View onLayout={recordFieldY("fullName")}>
              <TextInput style={md.input} placeholder="Full name" placeholderTextColor={C.muted} value={fullName} onChangeText={setFullName} onFocus={() => scrollFieldIntoView("fullName")} />
            </View>
            <View onLayout={recordFieldY("email")}>
              <TextInput style={md.input} placeholder="Email address" placeholderTextColor={C.muted} value={email} onChangeText={setEmail} onFocus={() => scrollFieldIntoView("email")} keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View onLayout={recordFieldY("phone")}>
              <TextInput style={md.input} placeholder="Phone number" placeholderTextColor={C.muted} value={phone} onChangeText={setPhone} onFocus={() => scrollFieldIntoView("phone")} keyboardType="phone-pad" />
            </View>

            <Text style={md.sectionLabel}>Initial Password</Text>
            <View style={md.pwRow} onLayout={recordFieldY("password")}>
              <TextInput
                style={[md.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Min. 6 characters"
                placeholderTextColor={C.muted}
                value={password}
                onChangeText={setPassword}
                onFocus={() => scrollFieldIntoView("password")}
                secureTextEntry={!showPw}
              />
              <TouchableOpacity style={md.eyeBtn} onPress={() => setShowPw((v) => !v)}>
                <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={ms(20)} color={C.muted} />
              </TouchableOpacity>
            </View>
            <Text style={md.pwHint}>Staff can change this after first login.</Text>

            {!!error && <Text style={md.errorT}>{error}</Text>}
          </ScrollView>

          <TouchableOpacity style={[md.btn, saving && md.btnDim]} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={md.btnT}>Create Staff Account</Text>
            }
          </TouchableOpacity>
          <View style={{ height: ms(20) }} />
        </View>
      </View>
    </Modal>
  );
}

// ── Edit Staff modal ──────────────────────────────────────────────────────────

interface EditModalProps {
  visible: boolean;
  member:  StaffMember | null;
  isSelf:  boolean;
  onDone:  (updated: StaffMember) => void;
  onClose: () => void;
}

function EditStaffModal({ visible, member, isSelf, onDone, onClose }: EditModalProps) {
  const colors = useThemeColors();
  const md = useThemedStyles(makeMdStyles);
  const [fullName, setFullName] = useState("");
  const [phone,    setPhone]    = useState("");
  // A staff member can hold more than one role at once at the same center.
  const [roles,    setRoles]    = useState<Role[]>(["frontdesk"]);
  const [isActive, setIsActive] = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const { scrollRef, recordFieldY, scrollFieldIntoView, onScrollViewLayout, onScroll } =
    useKeyboardScrollIntoView({ sheetHeight: SCREEN_H * 0.65 });

  useEffect(() => {
    if (visible && member) {
      setFullName(member.fullName);
      setPhone(member.phone);
      setRoles(member.roles);
      setIsActive(member.isActive);
      setError("");
    }
  }, [visible, member]);

  async function save() {
    if (!fullName.trim() || !phone.trim() || roles.length === 0) { setError("Name, phone, and at least one role are required."); return; }
    setSaving(true); setError("");
    try {
      const updated = await updateStaffMember(member!.id, {
        fullName: fullName.trim(),
        phone:    phone.trim(),
        roles,
        isActive: isSelf ? undefined : isActive,
      });
      onDone(updated);
    } catch (e: any) {
      const msg = e?.response?.data?.error;
      setError(typeof msg === "string" ? msg : "Could not update staff member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <TouchableOpacity style={md.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={md.sheet}>
          <View style={md.drag} />

          <View style={md.editHeader}>
            <View style={md.editHeaderIcon}>
              <Ionicons name="person-outline" size={ms(21)} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={md.editTitle}>Edit Staff Member</Text>
              <Text style={md.editDesc}>Update role, contact details, and account status.</Text>
            </View>
            <TouchableOpacity
              style={md.editCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Only this part scrolls — the Save button below stays pinned to
              the bottom of the sheet regardless of scroll position.
              flexShrink lets it give up space to the fixed header/button
              siblings instead of pushing them past the sheet's maxHeight. */}
          <ScrollView
            ref={scrollRef}
            style={{ flexShrink: 1 }}
            onLayout={onScrollViewLayout}
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={md.sectionLabel}>Roles</Text>
            <View style={md.roleRow}>
              {ROLES.map((r) => {
                const m = ROLE_META[r];
                const active = roles.includes(r);
                return (
                  <TouchableOpacity
                    key={r}
                    style={[md.roleTab, active && { backgroundColor: m.color, borderColor: m.color }]}
                    onPress={() => setRoles(active ? roles.filter((x) => x !== r) : [...roles, r])}
                  >
                    <Ionicons name={m.icon as any} size={ms(13)} color={active ? "#fff" : C.muted} />
                    <Text style={[md.roleTabT, { color: active ? "#fff" : C.muted }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={md.sectionLabel}>Details</Text>
            <View onLayout={recordFieldY("fullName")}>
              <TextInput style={md.input} placeholder="Full name" placeholderTextColor={C.muted} value={fullName} onChangeText={setFullName} onFocus={() => scrollFieldIntoView("fullName")} />
            </View>
            <View onLayout={recordFieldY("phone")}>
              <TextInput style={md.input} placeholder="Phone number" placeholderTextColor={C.muted} value={phone} onChangeText={setPhone} onFocus={() => scrollFieldIntoView("phone")} keyboardType="phone-pad" />
            </View>

            {!isSelf && (
              <View style={md.toggleRow}>
                <View>
                  <Text style={md.toggleLabel}>Account Active</Text>
                  <Text style={md.toggleSub}>Inactive accounts cannot log in.</Text>
                </View>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ true: C.green, false: C.border }}
                  thumbColor="#fff"
                />
              </View>
            )}

            {!!error && <Text style={md.errorT}>{error}</Text>}
          </ScrollView>

          <TouchableOpacity style={[md.btn, saving && md.btnDim]} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={md.btnT}>Save Changes</Text>
            }
          </TouchableOpacity>
          <View style={{ height: ms(20) }} />
        </View>
      </View>
    </Modal>
  );
}

// ── Reset Password modal ──────────────────────────────────────────────────────

interface ResetPwModalProps {
  visible:  boolean;
  member:   StaffMember | null;
  onDone:   () => void;
  onClose:  () => void;
}

function ResetPasswordModal({ visible, member, onDone, onClose }: ResetPwModalProps) {
  const colors = useThemeColors();
  const md = useThemedStyles(makeMdStyles);
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const { scrollRef, recordFieldY, scrollFieldIntoView, onScrollViewLayout, onScroll } =
    useKeyboardScrollIntoView({ sheetHeight: SCREEN_H * 0.65 });

  useEffect(() => {
    if (visible) { setPassword(""); setConfirm(""); setError(""); }
  }, [visible]);

  async function save() {
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm)  { setError("Passwords do not match."); return; }
    setSaving(true); setError("");
    try {
      await resetStaffPassword(member!.id, password);
      onDone();
    } catch {
      setError("Could not reset password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <TouchableOpacity style={md.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={md.sheet}>
          <View style={md.drag} />

          <View style={md.editHeader}>
            <View style={[md.editHeaderIcon, { backgroundColor: colors.orangeBg }]}>
              <Ionicons name="key-outline" size={ms(21)} color={colors.orange} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={md.editTitle}>Reset Password</Text>
              <Text style={md.editDesc}>Set a new password for this staff member.</Text>
            </View>
            <TouchableOpacity
              style={md.editCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flexShrink: 1 }}
            onLayout={onScrollViewLayout}
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <Text style={md.sectionLabel}>New Password</Text>
          <View style={md.pwRow} onLayout={recordFieldY("password")}>
            <TextInput
              style={[md.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Min. 6 characters"
              placeholderTextColor={C.muted}
              onFocus={() => scrollFieldIntoView("password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity style={md.eyeBtn} onPress={() => setShowPw((v) => !v)}>
              <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={ms(20)} color={C.muted} />
            </TouchableOpacity>
          </View>

          <View onLayout={recordFieldY("confirm")}>
          <Text style={[md.sectionLabel, { marginTop: ms(12) }]}>Confirm Password</Text>
          <TextInput
            style={md.input}
            placeholder="Re-enter password"
            placeholderTextColor={C.muted}
            value={confirm}
            onChangeText={setConfirm}
            onFocus={() => scrollFieldIntoView("confirm")}
            secureTextEntry={!showPw}
          />
          </View>

          {!!error && <Text style={md.errorT}>{error}</Text>}
          </ScrollView>

          <TouchableOpacity style={[md.btn, saving && md.btnDim]} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={md.btnT}>Reset Password</Text>
            }
          </TouchableOpacity>
          <View style={{ height: ms(28) }} />
        </View>
      </View>
    </Modal>
  );
}

// ── Manage Centers modal ──────────────────────────────────────────────────────

interface ManageCentersModalProps {
  visible: boolean;
  member:  StaffMember | null;
  onDone:  (updated: StaffMember) => void;
  onClose: () => void;
}

function ManageCentersModal({ visible, member, onDone, onClose }: ManageCentersModalProps) {
  const colors = useThemeColors();
  const mc = useThemedStyles(makeMcStyles);
  const { showAlert, showConfirm } = useAlert();
  const [centers,     setCenters]     = useState<CenterItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [assignments, setAssignments] = useState<StaffCenterAssignment[]>([]);
  // A staff member can hold more than one role at once at the same center.
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role[]>>({});
  const [search,      setSearch]      = useState("");
  const [busy,        setBusy]        = useState<{ id: string; action: "assign" | "remove" } | null>(null);

  useEffect(() => {
    if (!visible || !member) return;
    setAssignments(member.centerAssignments);
    setPendingRoles({});
    setSearch("");
    setLoading(true);
    fetchAllCenters().then(setCenters).catch(() => {}).finally(() => setLoading(false));
  }, [visible, member]);

  function getAssignment(centerId: string) {
    return assignments.find((a) => a.center.id === centerId);
  }

  // Defaults to the center's *current* roles once assigned (not the staff's
  // global roles) — the picker is now always visible, including for
  // already-assigned centers, so it needs to reflect what's actually saved there.
  function getRolesForCenter(centerId: string): Role[] {
    return pendingRoles[centerId] ?? getAssignment(centerId)?.roles ?? member?.roles ?? ["frontdesk"];
  }

  function sameRoleSet(a: Role[], b: Role[]): boolean {
    if (a.length !== b.length) return false;
    const bSet = new Set(b);
    return a.every((r) => bSet.has(r));
  }

  // True only when a chip pick actually differs from what's saved — picking the
  // same roles a center already has, or never touching a chip, isn't "dirty".
  const hasPendingChanges = Object.entries(pendingRoles).some(
    ([centerId, roles]) => !sameRoleSet(roles, getAssignment(centerId)?.roles ?? [])
  );

  async function assign(centerId: string) {
    if (!member) return;
    const roles = getRolesForCenter(centerId);
    if (roles.length === 0) return;
    setBusy({ id: centerId, action: "assign" });
    try {
      await assignStaffToCenter(centerId, member.id, roles);
      const center = centers.find((c) => c.id === centerId)!;
      const newAssignments: StaffCenterAssignment[] = [
        ...assignments.filter((a) => a.center.id !== centerId),
        { roles, center: { id: centerId, name: center.name } },
      ];
      setAssignments(newAssignments);
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[centerId];
        return next;
      });
      onDone({ ...member, centerAssignments: newAssignments });
    } catch {
      showAlert("Error", "Could not assign to center. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(centerId: string) {
    if (!member) return;
    setBusy({ id: centerId, action: "remove" });
    try {
      await removeStaffFromCenter(centerId, member.id);
      const newAssignments = assignments.filter((a) => a.center.id !== centerId);
      setAssignments(newAssignments);
      onDone({ ...member, centerAssignments: newAssignments });
    } catch {
      showAlert("Error", "Could not remove from center. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  // Header X, backdrop tap, the Android back gesture, and the bottom Done button
  // all funnel through here, so an unsaved role pick can't be lost silently no
  // matter which way the sheet gets dismissed.
  function attemptClose() {
    if (hasPendingChanges) {
      showConfirm(
        "Discard changes?",
        "You've selected a role that hasn't been saved yet. Leaving now won't save it.",
        () => onClose(),
        { confirmLabel: "Discard", destructive: true },
      );
    } else {
      onClose();
    }
  }

  const assignedCount = assignments.length;
  const q = search.trim().toLowerCase();
  const filteredCenters = q ? centers.filter((c) => c.name.toLowerCase().includes(q)) : centers;
  const initials = member ? member.fullName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() : "";
  const roleMeta = member?.roles?.[0] ? ROLE_META[member.roles[0]] : null;
  const staffFill = roleMeta ? getAvatarFill(roleMeta.color) : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={attemptClose}>
      <View style={mc.overlay}>
        <TouchableOpacity style={mc.backdrop} activeOpacity={1} onPress={attemptClose} />
        <View style={mc.sheet}>
          <View style={mc.drag} />

          {/* Header */}
          <View style={mc.header}>
            <View style={mc.headerIcon}>
              <Ionicons name="business-outline" size={ms(21)} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={mc.title}>Manage Center Access</Text>
              <Text style={mc.desc}>
                Assign staff roles for each coaching center. A staff member may have different roles in different centers.
              </Text>
            </View>
            <TouchableOpacity
              style={mc.closeBtn}
              onPress={attemptClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={ms(18)} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Staff summary */}
          {member && roleMeta && staffFill && (
            <View style={mc.staffCard}>
              {member.photoUrl ? (
                <Image source={{ uri: member.photoUrl }} style={sc.avatar} />
              ) : (
                <View style={[sc.avatar, { backgroundColor: staffFill.backgroundColor, borderWidth: staffFill.borderWidth, borderColor: staffFill.borderColor }]}>
                  <Text style={[sc.avatarL, { color: staffFill.color }]}>{initials}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={mc.staffNameRow}>
                  <Text style={mc.staffName} numberOfLines={1}>{member.fullName}</Text>
                  {member.isActive ? (
                    <View style={sc.activePill}><View style={sc.activeDot} /><Text style={sc.activePillT}>Active</Text></View>
                  ) : (
                    <View style={sc.inactivePill}><Text style={sc.inactivePillT}>Inactive</Text></View>
                  )}
                </View>
                <Text style={mc.staffSub}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text }}>{assignedCount}</Text>
                  {` center${assignedCount !== 1 ? "s" : ""} assigned`}
                </Text>
              </View>
            </View>
          )}

          {loading ? (
            <View style={mc.statusWrap}>
              <ActivityIndicator color={colors.primary} />
              <Text style={mc.statusSub}>Loading centers…</Text>
            </View>
          ) : centers.length === 0 ? (
            <View style={mc.statusWrap}>
              <View style={mc.emptyIcon}>
                <Ionicons name="business-outline" size={ms(22)} color={colors.primary} />
              </View>
              <Text style={mc.emptyTitle}>No centers yet</Text>
              <Text style={mc.statusSub}>Create a center first, then come back to assign staff to it.</Text>
            </View>
          ) : (
            <>
              {/* Search */}
              <View style={mc.searchBox}>
                <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
                <TextInput
                  style={mc.searchInput}
                  placeholder="Search centers…"
                  placeholderTextColor={C.muted}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={ms(15)} color={C.muted} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={mc.listLabel}>Centers</Text>

              {filteredCenters.length === 0 ? (
                <View style={mc.statusWrap}>
                  <View style={mc.emptyIcon}>
                    <Ionicons name="search-outline" size={ms(20)} color={colors.primary} />
                  </View>
                  <Text style={mc.emptyTitle}>No centers found</Text>
                  <Text style={mc.statusSub}>Try a different search term.</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: "50%" }}>
                  {filteredCenters.map((center) => {
                    const assignment    = getAssignment(center.id);
                    const isAssigned    = !!assignment;
                    const selectedRoles = getRolesForCenter(center.id);
                    const rolesChanged  = !sameRoleSet(selectedRoles, assignment?.roles ?? []);
                    const isBusy        = busy?.id === center.id;
                    const isAssigning   = isBusy && busy?.action === "assign";
                    const isRemoving    = isBusy && busy?.action === "remove";
                    // Nothing to save — same roles already assigned, or button disabled state.
                    const settled       = isAssigned && !rolesChanged;

                    return (
                      <View key={center.id} style={[mc.centerCard, isAssigned && mc.centerCardAssigned]}>
                        {/* Center name + assigned indicator */}
                        <View style={mc.centerTop}>
                          <View style={[mc.centerDot, { backgroundColor: isAssigned ? C.green : C.border }]} />
                          <Text style={mc.centerName} numberOfLines={1}>{center.name}</Text>
                          {isAssigned
                            ? (
                              <View style={{ flexDirection: "row", gap: ms(4) }}>
                                {assignment.roles.map((r) => <RoleChip key={r} role={r} />)}
                              </View>
                            )
                            : <View style={mc.notAssignedBadge}><Text style={mc.notAssignedBadgeT}>Not assigned</Text></View>
                          }
                        </View>

                        {/* Role picker — always visible, so an existing assignment's roles can be
                            changed too. No "Assign as" caption — the chips (Admin/Teacher/Front
                            Desk) are self-explanatory and the label was just dead vertical space.
                            Multiple chips can be active at once — a staff member can hold more
                            than one role at the same center. */}
                        <View style={mc.roleTabs}>
                          {ROLES.map((r) => {
                            const m = ROLE_META[r];
                            const active = selectedRoles.includes(r);
                            return (
                              <TouchableOpacity
                                key={r}
                                style={[mc.roleTab, { backgroundColor: active ? m.color : m.bg }]}
                                onPress={() => setPendingRoles((prev) => ({
                                  ...prev,
                                  [center.id]: active ? selectedRoles.filter((x) => x !== r) : [...selectedRoles, r],
                                }))}
                                activeOpacity={0.8}
                              >
                                <Text style={[mc.roleTabT, { color: active ? "#fff" : m.color }]}>{m.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* Footer — small icon-only affordances, matching how AddStudentModal
                            (BatchDetailScreen) styles its own per-row "add this" action: a
                            quiet tinted square, not a full-width solid-brand button repeated
                            down a list. Remove stays available for dropping the assignment
                            entirely; the assign action itself is disabled once every chip is
                            deselected (roles.length === 0) — use Remove for that instead. */}
                        <View style={mc.centerFooter}>
                          {isAssigned ? (
                            <TouchableOpacity
                              style={[mc.actionIcon, { backgroundColor: C.red + "10" }]}
                              onPress={() => remove(center.id)}
                              disabled={isBusy}
                              activeOpacity={0.75}
                            >
                              {isRemoving
                                ? <ActivityIndicator size="small" color={C.red} />
                                : <Ionicons name="close" size={ms(15)} color={C.red} />
                              }
                            </TouchableOpacity>
                          ) : <View />}

                          {settled ? (
                            <View style={mc.assignedBadge}>
                              <Ionicons name="checkmark-circle" size={ms(14)} color={C.green} />
                              <Text style={mc.assignedBadgeT}>Assigned</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={[mc.actionIcon, { backgroundColor: colors.primary + "10" }]}
                              onPress={() => assign(center.id)}
                              disabled={isBusy || selectedRoles.length === 0}
                              activeOpacity={0.75}
                            >
                              {isAssigning
                                ? <ActivityIndicator size="small" color={colors.primary} />
                                : <Ionicons name={!isAssigned ? "add" : "checkmark"} size={ms(16)} color={colors.primary} />
                              }
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ height: ms(8) }} />
                </ScrollView>
              )}
            </>
          )}

          <View style={{ height: ms(20) }} />
        </View>
      </View>
    </Modal>
  );
}

const makeMcStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet:    { backgroundColor: C.card, borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingHorizontal: ms(20), paddingTop: ms(8), maxHeight: SHEET_HEIGHT.tall },
  drag:     { width: ms(36), height: ms(4), backgroundColor: C.border, borderRadius: ms(2), alignSelf: "center", marginBottom: ms(16) },

  header:     { flexDirection: "row", alignItems: "flex-start", gap: ms(12), marginBottom: ms(14) },
  // Was a fixed lavender tint regardless of tenant branding — now derived from
  // colors.primary, matching every other soft-tint icon chip in the app.
  headerIcon: { width: ms(44), height: ms(44), borderRadius: ms(12), backgroundColor: colors.primary + "17", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  title:      { ...T.cardTitle, color: C.text, marginBottom: 3 },
  desc:       { ...T.bodySmall, color: C.muted },
  // Matches the Select Course popup's close button exactly (C.inputBg + border,
  // not the screen-background token) — same form-field surface, not a page fill.
  closeBtn:   { width: ms(34), height: ms(34), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },

  // Reuses StaffCard's own avatar/active-pill styles (`sc.*`) for the inner
  // pieces — this card is just a themed wrapper around content that already
  // exists elsewhere in this file.
  staffCard:    { flexDirection: "row", alignItems: "center", gap: ms(12), backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(14), borderWidth: 1, borderColor: C.border },
  staffNameRow: { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: 2 },
  staffName:    { ...T.cardTitle, color: C.text, flexShrink: 1 },
  staffSub:     { ...T.bodySmall, color: C.muted },

  statusWrap: { alignItems: "center", paddingVertical: ms(28), paddingHorizontal: ms(12), gap: ms(6) },
  statusSub:  { ...T.bodySmall, color: C.muted, textAlign: "center" },
  emptyIcon:  { width: ms(48), height: ms(48), borderRadius: ms(16), backgroundColor: colors.primary + "12", justifyContent: "center", alignItems: "center", marginBottom: ms(2) },
  emptyTitle: { ...T.listItemTitle, color: C.text },

  // C.inputBg, same as the Select Course popup's search row — a form-field
  // surface, not the colors.bg screen fill.
  searchBox:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.inputBg, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginBottom: ms(12) },
  searchInput: { flex: 1, ...T.body, color: C.text, padding: 0 },
  listLabel:   { ...T.sectionHeading, color: C.muted, marginBottom: ms(8) },

  // White like every other popup's cards (e.g. CenterManagementScreen's list) — the
  // "assigned" state now reads through its border color alone, not a filled tint.
  // Padding/margins trimmed throughout this card to cut the dead space between
  // its three rows (name, roles, actions) — no row needs this much air.
  centerCard:         { backgroundColor: C.card, borderRadius: ms(14), padding: ms(11), marginBottom: ms(8), borderWidth: 1, borderColor: C.border },
  centerCardAssigned: { borderColor: C.green + "60" },

  centerTop:  { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(8) },
  centerDot:  { width: ms(8), height: ms(8), borderRadius: ms(4), flexShrink: 0 },
  centerName: { flex: 1, ...T.listItemTitle, color: C.text },
  notAssignedBadge:  { backgroundColor: C.border, borderRadius: ms(6), paddingHorizontal: ms(7), paddingVertical: ms(3) },
  notAssignedBadgeT: { ...T.chipText, color: C.muted },

  roleTabs: { flexDirection: "row", gap: ms(6), marginBottom: ms(8) },
  // Background set per-role at render (tinted idle, solid when selected) —
  // same recipe RoleChip already uses. This only carries layout.
  roleTab:  { flex: 1, alignItems: "center", paddingVertical: ms(6), borderRadius: ms(8) },
  roleTabT: { ...T.chipText },

  centerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ms(10) },
  // Small tinted square, not a full-width solid-brand button — same visual
  // weight as AddStudentModal's own per-row action (BatchDetailScreen's `addBtn`).
  // Background color (brand tint vs red tint) is set per-use at render.
  actionIcon:     { width: ms(30), height: ms(30), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  assignedBadge:  { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: C.green + "18", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(5) },
  assignedBadgeT: { ...T.chipText, color: C.green },

});

// ── Staff Card ────────────────────────────────────────────────────────────────

interface StaffCardProps {
  member:         StaffMember;
  isSelf:         boolean;
  onEdit:         () => void;
  onReset:        () => void;
  onManageCenters:() => void;
}

function StaffCard({ member, isSelf, onEdit, onReset, onManageCenters }: StaffCardProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const rm = ROLE_META[member.roles[0] ?? "frontdesk"];
  const fill = getAvatarFill(rm.color);
  const initials = member.fullName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View style={[sc.card, !member.isActive && sc.cardInactive]}>
      <View style={sc.inner}>
        {/* Tap-to-expand row */}
        <TouchableOpacity style={sc.head} onPress={() => setOpen((v) => !v)} activeOpacity={0.75}>
          {member.photoUrl ? (
            <Image source={{ uri: member.photoUrl }} style={sc.avatar} />
          ) : (
            <View style={[sc.avatar, { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor }]}>
              <Text style={[sc.avatarL, { color: fill.color }]}>{initials}</Text>
            </View>
          )}

          <View style={sc.info}>
            <View style={sc.nameRow}>
              <Text style={sc.name} numberOfLines={1}>{member.fullName}</Text>
              {isSelf && (
                <View style={sc.youBadge}>
                  <Text style={sc.youBadgeT}>You</Text>
                </View>
              )}
            </View>
            <Text style={sc.email} numberOfLines={1}>{member.email}</Text>
            <View style={sc.tagRow}>
              {member.roles.map((r) => <RoleChip key={r} role={r} />)}
              {member.isActive ? (
                <View style={sc.activePill}>
                  <View style={sc.activeDot} />
                  <Text style={sc.activePillT}>Active</Text>
                </View>
              ) : (
                <View style={sc.inactivePill}>
                  <Text style={sc.inactivePillT}>Inactive</Text>
                </View>
              )}
            </View>
          </View>

          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={ms(16)}
            color={C.muted}
            style={{ marginLeft: ms(4) }}
          />
        </TouchableOpacity>

        {/* Expanded body */}
        {open && (
          <View style={sc.body}>
            <View style={sc.divider} />

            {/* Phone */}
            <View style={sc.infoRow}>
              <View style={[sc.infoIcon, { backgroundColor: C.border }]}>
                <Ionicons name="call-outline" size={ms(13)} color={C.muted} />
              </View>
              <Text style={sc.infoT}>{member.phone}</Text>
            </View>

            {/* Center assignments */}
            {member.centerAssignments.length > 0 && (
              <View style={sc.centersBlock}>
                <Text style={sc.sectionLabel}>Center Assignments</Text>
                {member.centerAssignments.map((a) => (
                  <View key={a.center.id} style={sc.centerRow}>
                    <View style={[sc.infoIcon, { backgroundColor: "#EEE9F6" }]}>
                      <Ionicons name="business-outline" size={ms(13)} color={C.purple} />
                    </View>
                    <Text style={sc.centerName} numberOfLines={1}>{a.center.name}</Text>
                    <View style={{ flexDirection: "row", gap: ms(4) }}>
                      {a.roles.map((r) => <RoleChip key={r} role={r} />)}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Role note */}
            <View style={sc.noteBox}>
              <Ionicons name="information-circle-outline" size={ms(14)} color={C.muted} />
              <Text style={sc.noteT}>
                {"Global roles: "}
                <Text style={{ fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text }}>
                  {member.roles.map((r) => ROLE_META[r].label).join(", ")}
                </Text>
                {member.centerAssignments.length > 0
                  ? "  ·  Per-center roles may differ. Edit in Center Management."
                  : "  ·  Assign to a center to set their per-center roles."}
              </Text>
            </View>

            {/* Actions — row 1 */}
            <View style={sc.actions}>
              <TouchableOpacity style={sc.actionEdit} onPress={onEdit} activeOpacity={0.8}>
                <Ionicons name="create-outline" size={ms(15)} color={colors.primary} />
                <Text style={[sc.actionT, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={sc.actionCenters} onPress={onManageCenters} activeOpacity={0.8}>
                <Ionicons name="business-outline" size={ms(15)} color={C.purple} />
                <Text style={[sc.actionT, { color: C.purple }]}>Centers</Text>
                {member.centerAssignments.length > 0 && (
                  <View style={sc.centersBadge}>
                    <Text style={sc.centersBadgeT}>{member.centerAssignments.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Actions — row 2 */}
            <TouchableOpacity
              style={[sc.actions, sc.actionKey, { marginTop: ms(8), backgroundColor: colors.orangeBg, borderColor: colors.orange + "40" }]}
              onPress={onReset}
              activeOpacity={0.8}
            >
              <Ionicons name="key-outline" size={ms(15)} color={colors.orange} />
              <Text style={[sc.actionT, { color: colors.orange }]}>Reset Password</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  card:         {
    backgroundColor: C.card,
    borderRadius: ms(18),
    marginBottom: ms(12),
    shadowColor: C.text,
    shadowOffset: { width: 0, height: ms(3) },
    shadowOpacity: 0.08,
    shadowRadius: ms(8),
    elevation: 2,
    overflow: "hidden",
  },
  cardInactive: { opacity: 0.5 },
  inner:        { flex: 1 },

  head:    { flexDirection: "row", alignItems: "center", padding: ms(14), gap: ms(12) },
  // Rounded square, matching the icon-box pattern used on other list screens
  // (Faculty/Course/Subject) instead of a circular avatar.
  avatar:  { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarL: { ...T.listItemTitle },

  info:    { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  name:    { ...T.listItemTitle, color: C.text, flexShrink: 1 },

  youBadge:  { backgroundColor: "#E8F4FD", borderRadius: ms(5), paddingHorizontal: ms(6), paddingVertical: 1 },
  youBadgeT: { ...T.badgeText, color: C.blue },

  email:  { ...T.caption, color: C.muted, marginTop: ms(2), marginBottom: ms(5) },
  tagRow: { flexDirection: "row", alignItems: "center", gap: ms(6) },

  activePill:    { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: "#E8F8F0", borderRadius: ms(6), paddingHorizontal: ms(7), paddingVertical: ms(3) },
  activeDot:     { width: ms(5), height: ms(5), borderRadius: ms(3), backgroundColor: C.green },
  activePillT:   { ...T.badgeText, color: C.green },
  inactivePill:  { backgroundColor: C.border, borderRadius: ms(6), paddingHorizontal: ms(7), paddingVertical: ms(3) },
  inactivePillT: { ...T.badgeText, color: C.muted },

  body:    { paddingHorizontal: ms(14), paddingBottom: ms(14) },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(12) },

  infoRow:  { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(8) },
  infoIcon: { width: ms(26), height: ms(26), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },
  infoT:    { ...T.bodySmall, color: C.muted },

  centersBlock: { marginTop: ms(4), marginBottom: ms(8) },
  sectionLabel: { ...T.sectionHeading, color: C.muted, marginBottom: ms(8) },
  centerRow:    { flexDirection: "row", alignItems: "center", gap: ms(8), paddingVertical: ms(6), borderBottomWidth: 1, borderBottomColor: C.border },
  centerName:   { flex: 1, ...T.chipText, color: C.text },

  noteBox: { flexDirection: "row", alignItems: "flex-start", gap: ms(6), backgroundColor: "#FAF7F2", borderRadius: ms(10), padding: ms(10), marginBottom: ms(12) },
  noteT:   { flex: 1, ...T.helperText, color: C.muted },

  actions:      { flexDirection: "row", gap: ms(8) },
  actionEdit:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingVertical: ms(9), borderRadius: ms(10), backgroundColor: "#FDF0F3", borderWidth: 1, borderColor: "#F5CEDB" },
  actionCenters:{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingVertical: ms(9), borderRadius: ms(10), backgroundColor: "#EEE9F6", borderWidth: 1, borderColor: "#C9BDE8" },
  // Background/border color supplied inline at the call site (theme-derived) — this
  // module-level StyleSheet has no access to colors.*, only layout belongs here.
  actionKey:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingVertical: ms(9), borderRadius: ms(10), borderWidth: 1 },
  actionT:      { ...T.chipText },
  centersBadge: { backgroundColor: C.purple, borderRadius: ms(8), paddingHorizontal: ms(5), paddingVertical: 1, marginLeft: ms(2) },
  centersBadgeT:{ ...T.badgeText, color: "#fff" },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function StaffManagementScreen() {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const navigation  = useNavigation();
  const { staff: authStaff } = useAuth();
  const { showAlert } = useAlert();

  // Nothing links here for a non-admin today, but nothing stopped a direct
  // navigation.navigate("StaffManagement") either — RootNavigator registers
  // every route unconditionally (no URL bar on mobile to gate). This closes
  // that deep-link gap at the destination itself.
  const { canRead } = usePermission("staff");
  useEffect(() => { if (!canRead) navigation.goBack(); }, [canRead]);

  const [members,     setMembers]     = useState<StaffMember[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [filter,      setFilter]      = useState<"all" | Role | "inactive">("all");
  const [search,      setSearch]      = useState("");
  const [showCreate,     setShowCreate]     = useState(false);
  const [editTarget,     setEditTarget]     = useState<StaffMember | null>(null);
  const [resetTarget,    setResetTarget]    = useState<StaffMember | null>(null);
  const [centersTarget,  setCentersTarget]  = useState<StaffMember | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await fetchAllStaffDetailed();
      setMembers(data);
    } catch {
      showAlert("Error", "Could not load staff list.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useRefetchOnReconnect(() => load(true));

  const counts = {
    all:       members.filter((m) =>  m.isActive).length,
    // A staff member holding more than one role is counted in each role's
    // bucket — matches how filtering below shows them under any tab for a
    // role they hold, not just a single "primary" one.
    admin:     members.filter((m) =>  m.roles.includes("admin")     && m.isActive).length,
    teacher:   members.filter((m) =>  m.roles.includes("teacher")   && m.isActive).length,
    frontdesk: members.filter((m) =>  m.roles.includes("frontdesk") && m.isActive).length,
    inactive:  members.filter((m) => !m.isActive).length,
  };

  const FILTERS: { key: "all" | Role | "inactive"; label: string; count: number; color: string; icon: string }[] = [
    { key: "all",       label: "All Staff",  count: counts.all,       color: C.text,                    icon: "people-outline" },
    { key: "admin",     label: "Admin",      count: counts.admin,     color: ROLE_META.admin.color,     icon: ROLE_META.admin.icon },
    { key: "teacher",   label: "Teacher",    count: counts.teacher,   color: ROLE_META.teacher.color,   icon: ROLE_META.teacher.icon },
    { key: "frontdesk", label: "Front Desk", count: counts.frontdesk, color: ROLE_META.frontdesk.color, icon: ROLE_META.frontdesk.icon },
    { key: "inactive",  label: "Inactive",   count: counts.inactive,  color: C.muted,                   icon: "ban-outline" },
  ];

  const q = search.toLowerCase().trim();
  const filtered = members.filter((m) => {
    const passTab =
      filter === "inactive" ? !m.isActive
      : filter === "all"    ?  m.isActive
      : m.roles.includes(filter) && m.isActive;
    if (!passTab) return false;
    if (!q) return true;
    return (
      m.fullName.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.phone.includes(q)
    );
  });

  if (!canRead) return null;

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader
        title="Staff & Roles"
        count={counts.all}
        countLabel="active"
        onBack={() => navigation.goBack()}
      />

      {/* Search bar */}
      <View style={s.searchWrap}>
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={ms(16)} color={C.muted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by name, email or phone…"
            placeholderTextColor={C.muted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={ms(16)} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipsScroll}
        contentContainerStyle={s.chipsContent}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.chip, active && { backgroundColor: f.color, borderColor: f.color }]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={f.icon as any}
                size={ms(13)}
                color={active ? "#fff" : f.color}
              />
              <Text style={[s.chipT, { color: active ? "#fff" : C.text }]}>{f.label}</Text>
              <View style={[s.chipCount, active && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                <Text style={[s.chipCountT, { color: active ? "#fff" : C.muted }]}>{f.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loaderT}>Loading staff…</Text>
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
          {filtered.length === 0 ? (
            <EmptyState
              scene="staff"
              color={colors.primary}
              title={
                search
                  ? "No results found"
                  : filter === "inactive"
                    ? "No inactive staff"
                    : `No ${filter === "all" ? "staff" : ROLE_META[filter as Role]?.label} yet`
              }
              subtitle={
                search
                  ? `No staff match "${search}"`
                  : filter === "all"
                    ? "Add your first staff member to get started"
                    : "Try a different filter or add a new member"
              }
              action={
                !search && filter === "all"
                  ? { label: "Add Staff Member", onPress: () => setShowCreate(true) }
                  : undefined
              }
            />
          ) : (
            filtered.map((m) => (
              <StaffCard
                key={m.id}
                member={m}
                isSelf={m.id === authStaff?.id}
                onEdit={() => setEditTarget(m)}
                onReset={() => setResetTarget(m)}
                onManageCenters={() => setCentersTarget(m)}
              />
            ))
          )}
          <View style={{ height: ms(100) }} />
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={ms(26)} color="#fff" />
      </TouchableOpacity>

      {/* Modals */}
      <CreateStaffModal
        visible={showCreate}
        onDone={(member) => {
          setMembers((prev) =>
            [...prev, { ...member, centerAssignments: [] }]
              .sort((a, b) => a.fullName.localeCompare(b.fullName))
          );
          setShowCreate(false);
        }}
        onClose={() => setShowCreate(false)}
      />
      <EditStaffModal
        visible={!!editTarget}
        member={editTarget}
        isSelf={editTarget?.id === authStaff?.id}
        onDone={(updated) => {
          setMembers((prev) =>
            prev.map((m) =>
              m.id === updated.id ? { ...updated, centerAssignments: m.centerAssignments } : m
            )
          );
          setEditTarget(null);
        }}
        onClose={() => setEditTarget(null)}
      />
      <ResetPasswordModal
        visible={!!resetTarget}
        member={resetTarget}
        onDone={() => {
          showAlert("Done", `Password for ${resetTarget?.fullName} has been reset.`, "success");
          setResetTarget(null);
        }}
        onClose={() => setResetTarget(null)}
      />
      <ManageCentersModal
        visible={!!centersTarget}
        member={centersTarget}
        onDone={(updated) => {
          setMembers((prev) =>
            prev.map((m) => m.id === updated.id ? updated : m)
          );
          setCentersTarget(updated);
        }}
        onClose={() => setCentersTarget(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.screenBg },
  loader:  { flex: 1, backgroundColor: colors.screenBg, alignItems: "center", justifyContent: "center", gap: ms(10) },
  loaderT: { ...T.body, color: C.muted },

  searchWrap:  { backgroundColor: colors.screenBg, paddingHorizontal: ms(14), paddingTop: ms(8), paddingBottom: ms(6) },
  searchBar:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.inputBg, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  searchInput: { flex: 1, ...T.body, color: C.text, padding: 0 },

  chipsScroll:  { flexGrow: 0, backgroundColor: colors.screenBg },
  chipsContent: { paddingHorizontal: ms(14), paddingTop: ms(4), paddingBottom: ms(12), gap: ms(8) },
  chip:         { flexDirection: "row", alignItems: "center", gap: ms(5), paddingHorizontal: ms(12), paddingVertical: ms(7), borderRadius: ms(20), backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipT:        { ...T.chipText },
  chipCount:    { backgroundColor: C.border, borderRadius: ms(8), paddingHorizontal: ms(6), paddingVertical: 1 },
  chipCountT:   { ...T.badgeText },

  scroll: { flex: 1, backgroundColor: colors.screenBg },
  body:   { paddingHorizontal: ms(14), paddingTop: ms(4) },

  empty:        { alignItems: "center", paddingVertical: ms(56), gap: ms(8) },
  emptyIconWrap:{ width: ms(72), height: ms(72), borderRadius: ms(36), backgroundColor: "#FDF0F3", justifyContent: "center", alignItems: "center", marginBottom: ms(4) },
  emptyTitle:   { ...T.cardTitle, color: C.text },
  emptySub:     { ...T.body, color: C.muted, textAlign: "center", paddingHorizontal: ms(24) },
  emptyBtn:     { flexDirection: "row", alignItems: "center", gap: ms(6), marginTop: ms(16), backgroundColor: colors.primary, borderRadius: ms(12), paddingHorizontal: ms(22), paddingVertical: ms(11) },
  emptyBtnT:    { ...T.buttonText, color: "#fff" },

  fab: {
    position: "absolute", bottom: ms(24), right: ms(20),
    width: ms(56), height: ms(56), borderRadius: ms(28),
    backgroundColor: colors.primary,
    justifyContent: "center", alignItems: "center",
    shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(6) },
    shadowOpacity: 0.45, shadowRadius: ms(12), elevation: 10,
  },
});

const makeMdStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  // "short" default — right for EditStaffModal/ResetPasswordModal (a handful of fields);
  // CreateStaffModal overrides to "standard" at its own call site for its extra fields.
  sheet:    { backgroundColor: C.card, borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingHorizontal: ms(20), paddingTop: ms(8), maxHeight: SHEET_HEIGHT.short },
  drag:     { width: ms(36), height: ms(4), backgroundColor: C.border, borderRadius: ms(2), alignSelf: "center", marginBottom: ms(16) },

  // Shared modal-header row (icon badge + title/subtitle + close button) —
  // matches ManageCentersModal's mc.header/headerIcon/title/desc/closeBtn
  // exactly, per DESIGN_SYSTEM.md's documented popup-header pattern. Used by
  // all three staff modals (Add/Edit/Reset Password).
  editHeader:     { flexDirection: "row", alignItems: "flex-start", gap: ms(12), marginBottom: ms(14) },
  editHeaderIcon: { width: ms(44), height: ms(44), borderRadius: ms(12), backgroundColor: colors.primary + "17", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  editTitle:      { ...T.cardTitle, color: C.text, marginBottom: 3 },
  editDesc:       { ...T.bodySmall, color: C.muted },
  editCloseBtn:   { width: ms(34), height: ms(34), borderRadius: ms(10), backgroundColor: colors.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },

  sectionLabel: { ...T.sectionHeading, color: C.muted, marginTop: ms(8), marginBottom: ms(8) },
  input:        { backgroundColor: colors.inputBg, borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(12), ...T.body, color: C.text, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginBottom: ms(10) },
  pwRow:        { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(6) },
  eyeBtn:       { padding: ms(4) },
  pwHint:       { ...T.caption, color: C.muted, marginBottom: ms(4) },
  errorT:       { ...T.bodySmall, color: C.red, marginTop: ms(6), marginBottom: ms(4) },
  btn:          { backgroundColor: colors.primary, borderRadius: ms(14), paddingVertical: ms(14), alignItems: "center", marginTop: ms(16) },
  btnDim:       { opacity: 0.6 },
  btnT:         { ...T.buttonText, color: "#fff" },

  toggleRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.inputBg, borderRadius: ms(12), padding: ms(14), marginTop: ms(10), borderWidth: 1, borderColor: C.border },
  toggleLabel:  { ...T.listItemTitle, color: C.text },
  toggleSub:    { ...T.caption, color: C.muted, marginTop: 2 },

  roleRow: { flexDirection: "row", gap: ms(8) },
  roleTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingVertical: ms(9), borderRadius: ms(10), backgroundColor: colors.inputBg, borderWidth: 1, borderColor: C.border },
  roleTabT:{ ...T.chipText },
});

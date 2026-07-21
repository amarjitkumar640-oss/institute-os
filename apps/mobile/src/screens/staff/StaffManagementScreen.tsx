import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, StatusBar,
  RefreshControl, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { ms, fs } from "../../utils/responsive";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
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
import { ROLES, ROLE_META, type Role } from "../../constants/roleMeta";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

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
  txt:  { fontWeight: "700" },
});

// ── Create Staff modal ────────────────────────────────────────────────────────

interface CreateModalProps {
  visible: boolean;
  onDone:  (member: StaffMember) => void;
  onClose: () => void;
}

function CreateStaffModal({ visible, onDone, onClose }: CreateModalProps) {
  const [fullName, setFullName] = useState("");
  const [email,    setEmail]    = useState("");
  const [phone,    setPhone]    = useState("");
  const [role,     setRole]     = useState<Role>("frontdesk");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (visible) {
      setFullName(""); setEmail(""); setPhone(""); setRole("frontdesk");
      setPassword(""); setError("");
    }
  }, [visible]);

  async function save() {
    if (!fullName.trim() || !email.trim() || !phone.trim() || !password) {
      setError("All fields are required."); return;
    }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setSaving(true); setError("");
    try {
      const member = await createStaffMember({
        fullName: fullName.trim(),
        email:    email.trim().toLowerCase(),
        phone:    phone.trim(),
        role,
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
      <KeyboardAvoidingView style={md.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={md.backdrop} activeOpacity={1} onPress={onClose} />
        <ScrollView style={md.sheet} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={md.drag} />
          <Text style={md.title}>Add Staff Member</Text>

          <Text style={md.sectionLabel}>Role</Text>
          <View style={md.rolePicker}>
            {ROLES.map((r) => {
              const m = ROLE_META[r];
              const active = role === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[md.roleCard, active && { borderColor: m.color, backgroundColor: m.bg }]}
                  onPress={() => setRole(r)}
                  activeOpacity={0.7}
                >
                  <View style={[md.roleIcon, { backgroundColor: active ? m.color : "#F0EDE8" }]}>
                    <Ionicons name={m.icon as any} size={ms(16)} color={active ? "#fff" : C.muted} />
                  </View>
                  <Text style={[md.roleCardLabel, active && { color: m.color }]}>{m.label}</Text>
                  <Text style={md.roleCardDesc} numberOfLines={2}>{m.desc}</Text>
                  {active && (
                    <View style={[md.roleCheck, { backgroundColor: m.color }]}>
                      <Ionicons name="checkmark" size={ms(11)} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={md.sectionLabel}>Details</Text>
          <TextInput style={md.input} placeholder="Full name" placeholderTextColor={C.muted} value={fullName} onChangeText={setFullName} />
          <TextInput style={md.input} placeholder="Email address" placeholderTextColor={C.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={md.input} placeholder="Phone number" placeholderTextColor={C.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

          <Text style={md.sectionLabel}>Initial Password</Text>
          <View style={md.pwRow}>
            <TextInput
              style={[md.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Min. 6 characters"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity style={md.eyeBtn} onPress={() => setShowPw((v) => !v)}>
              <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={ms(20)} color={C.muted} />
            </TouchableOpacity>
          </View>
          <Text style={md.pwHint}>Staff can change this after first login.</Text>

          {!!error && <Text style={md.errorT}>{error}</Text>}

          <TouchableOpacity style={[md.btn, saving && md.btnDim]} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={md.btnT}>Create Staff Account</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={md.cancelBtn} onPress={onClose}>
            <Text style={md.cancelT}>Cancel</Text>
          </TouchableOpacity>
          <View style={{ height: ms(32) }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  const [fullName, setFullName] = useState("");
  const [phone,    setPhone]    = useState("");
  const [role,     setRole]     = useState<Role>("frontdesk");
  const [isActive, setIsActive] = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (visible && member) {
      setFullName(member.fullName);
      setPhone(member.phone);
      setRole(member.role);
      setIsActive(member.isActive);
      setError("");
    }
  }, [visible, member]);

  async function save() {
    if (!fullName.trim() || !phone.trim()) { setError("Name and phone are required."); return; }
    setSaving(true); setError("");
    try {
      const updated = await updateStaffMember(member!.id, {
        fullName: fullName.trim(),
        phone:    phone.trim(),
        role,
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
      <KeyboardAvoidingView style={md.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={md.backdrop} activeOpacity={1} onPress={onClose} />
        <ScrollView style={md.sheet} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={md.drag} />
          <Text style={md.title}>Edit Staff Member</Text>

          <Text style={md.sectionLabel}>Role</Text>
          <View style={md.roleRow}>
            {ROLES.map((r) => {
              const m = ROLE_META[r];
              const active = role === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[md.roleTab, active && { backgroundColor: m.color, borderColor: m.color }]}
                  onPress={() => setRole(r)}
                >
                  <Ionicons name={m.icon as any} size={ms(13)} color={active ? "#fff" : C.muted} />
                  <Text style={[md.roleTabT, { color: active ? "#fff" : C.muted }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={md.sectionLabel}>Details</Text>
          <TextInput style={md.input} placeholder="Full name" placeholderTextColor={C.muted} value={fullName} onChangeText={setFullName} />
          <TextInput style={md.input} placeholder="Phone number" placeholderTextColor={C.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

          {!isSelf && (
            <View style={md.toggleRow}>
              <View>
                <Text style={md.toggleLabel}>Account Active</Text>
                <Text style={md.toggleSub}>Inactive accounts cannot log in.</Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ true: C.green, false: "#D0C8C4" }}
                thumbColor="#fff"
              />
            </View>
          )}

          {!!error && <Text style={md.errorT}>{error}</Text>}

          <TouchableOpacity style={[md.btn, saving && md.btnDim]} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={md.btnT}>Save Changes</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={md.cancelBtn} onPress={onClose}>
            <Text style={md.cancelT}>Cancel</Text>
          </TouchableOpacity>
          <View style={{ height: ms(32) }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

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
      <KeyboardAvoidingView style={md.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={md.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={md.sheet}>
          <View style={md.drag} />

          <View style={md.resetHeader}>
            <View style={md.resetIconWrap}>
              <Ionicons name="key-outline" size={ms(24)} color="#946200" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={md.title}>Reset Password</Text>
              {member && (
                <Text style={md.resetFor}>
                  {"For "}
                  <Text style={{ fontWeight: "700", color: C.text }}>{member.fullName}</Text>
                </Text>
              )}
            </View>
          </View>

          <Text style={md.sectionLabel}>New Password</Text>
          <View style={md.pwRow}>
            <TextInput
              style={[md.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Min. 6 characters"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoFocus
            />
            <TouchableOpacity style={md.eyeBtn} onPress={() => setShowPw((v) => !v)}>
              <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={ms(20)} color={C.muted} />
            </TouchableOpacity>
          </View>

          <Text style={[md.sectionLabel, { marginTop: ms(12) }]}>Confirm Password</Text>
          <TextInput
            style={md.input}
            placeholder="Re-enter password"
            placeholderTextColor={C.muted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showPw}
          />

          {!!error && <Text style={md.errorT}>{error}</Text>}

          <TouchableOpacity style={[md.btn, saving && md.btnDim]} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={md.btnT}>Reset Password</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={md.cancelBtn} onPress={onClose}>
            <Text style={md.cancelT}>Cancel</Text>
          </TouchableOpacity>
          <View style={{ height: ms(28) }} />
        </View>
      </KeyboardAvoidingView>
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
  const { showAlert } = useAlert();
  const [centers,     setCenters]     = useState<CenterItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [assignments, setAssignments] = useState<StaffCenterAssignment[]>([]);
  const [pendingRole, setPendingRole] = useState<Record<string, Role>>({});
  const [saving,      setSaving]      = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !member) return;
    setAssignments(member.centerAssignments);
    setPendingRole({});
    setLoading(true);
    fetchAllCenters().then(setCenters).catch(() => {}).finally(() => setLoading(false));
  }, [visible, member]);

  function getAssignment(centerId: string) {
    return assignments.find((a) => a.center.id === centerId);
  }

  function getRoleForCenter(centerId: string): Role {
    return pendingRole[centerId] ?? (member?.role ?? "frontdesk");
  }

  async function assign(centerId: string) {
    if (!member) return;
    const role = getRoleForCenter(centerId);
    setSaving(centerId);
    try {
      await assignStaffToCenter(centerId, member.id, role);
      const center = centers.find((c) => c.id === centerId)!;
      const newAssignments: StaffCenterAssignment[] = [
        ...assignments.filter((a) => a.center.id !== centerId),
        { role, center: { id: centerId, name: center.name } },
      ];
      setAssignments(newAssignments);
      onDone({ ...member, centerAssignments: newAssignments });
    } catch {
      showAlert("Error", "Could not assign to center. Please try again.", "error");
    } finally {
      setSaving(null);
    }
  }

  async function remove(centerId: string) {
    if (!member) return;
    setSaving(centerId);
    try {
      await removeStaffFromCenter(centerId, member.id);
      const newAssignments = assignments.filter((a) => a.center.id !== centerId);
      setAssignments(newAssignments);
      onDone({ ...member, centerAssignments: newAssignments });
    } catch {
      showAlert("Error", "Could not remove from center. Please try again.", "error");
    } finally {
      setSaving(null);
    }
  }

  const assignedCount = assignments.length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={mc.overlay}>
        <TouchableOpacity style={mc.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={mc.sheet}>
          <View style={mc.drag} />

          {/* Header */}
          <View style={mc.header}>
            <View style={mc.headerIcon}>
              <Ionicons name="business-outline" size={ms(22)} color="#5B2D8E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={mc.title}>Manage Centers</Text>
              {member && (
                <Text style={mc.subtitle}>
                  <Text style={{ fontWeight: "700", color: C.text }}>{member.fullName}</Text>
                  {` · ${assignedCount} center${assignedCount !== 1 ? "s" : ""} assigned`}
                </Text>
              )}
            </View>
          </View>

          {loading ? (
            <View style={mc.loadWrap}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : centers.length === 0 ? (
            <View style={mc.loadWrap}>
              <Text style={mc.emptyT}>No centers found. Create a center first.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: "70%" }}>
              {centers.map((center) => {
                const assignment = getAssignment(center.id);
                const isAssigned = !!assignment;
                const isSaving   = saving === center.id;
                const selectedRole = getRoleForCenter(center.id);

                return (
                  <View key={center.id} style={[mc.centerCard, isAssigned && mc.centerCardAssigned]}>
                    {/* Center name + assigned indicator */}
                    <View style={mc.centerTop}>
                      <View style={[mc.centerDot, { backgroundColor: isAssigned ? C.green : C.border }]} />
                      <Text style={mc.centerName} numberOfLines={1}>{center.name}</Text>
                      {isAssigned && <RoleChip role={assignment.role} />}
                    </View>

                    {/* Role picker — only shown when not yet assigned */}
                    {!isAssigned && (
                      <View style={mc.roleRow}>
                        <Text style={mc.rolePickLabel}>Assign as</Text>
                        <View style={mc.roleTabs}>
                          {ROLES.map((r) => {
                            const m = ROLE_META[r];
                            const active = selectedRole === r;
                            return (
                              <TouchableOpacity
                                key={r}
                                style={[mc.roleTab, active && { backgroundColor: m.color, borderColor: m.color }]}
                                onPress={() => setPendingRole((prev) => ({ ...prev, [center.id]: r }))}
                              >
                                <Text style={[mc.roleTabT, { color: active ? "#fff" : C.muted }]}>{m.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Action button */}
                    <View style={mc.centerActions}>
                      {isAssigned ? (
                        <TouchableOpacity
                          style={mc.removeBtn}
                          onPress={() => remove(center.id)}
                          disabled={isSaving}
                          activeOpacity={0.8}
                        >
                          {isSaving
                            ? <ActivityIndicator size="small" color="#C0392B" />
                            : <>
                                <Ionicons name="remove-circle-outline" size={ms(14)} color="#C0392B" />
                                <Text style={mc.removeBtnT}>Remove</Text>
                              </>
                          }
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={mc.assignBtn}
                          onPress={() => assign(center.id)}
                          disabled={isSaving}
                          activeOpacity={0.8}
                        >
                          {isSaving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <>
                                <Ionicons name="add-circle-outline" size={ms(14)} color="#fff" />
                                <Text style={mc.assignBtnT}>Assign</Text>
                              </>
                          }
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
              <View style={{ height: ms(16) }} />
            </ScrollView>
          )}

          <TouchableOpacity style={mc.doneBtn} onPress={onClose}>
            <Text style={mc.doneBtnT}>Done</Text>
          </TouchableOpacity>
          <View style={{ height: ms(24) }} />
        </View>
      </View>
    </Modal>
  );
}

const mc = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet:    { backgroundColor: C.card, borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingHorizontal: ms(20), paddingTop: ms(8) },
  drag:     { width: ms(36), height: ms(4), backgroundColor: C.border, borderRadius: ms(2), alignSelf: "center", marginBottom: ms(16) },

  header:     { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(16) },
  headerIcon: { width: ms(44), height: ms(44), borderRadius: ms(12), backgroundColor: "#EEE9F6", justifyContent: "center", alignItems: "center" },
  title:      { fontSize: fs(17), fontWeight: "800", color: C.text },
  subtitle:   { fontSize: fs(12), color: C.muted, marginTop: 2 },

  loadWrap: { alignItems: "center", paddingVertical: ms(32) },
  emptyT:   { fontSize: fs(13), color: C.muted, textAlign: "center" },

  centerCard:         { backgroundColor: C.bg, borderRadius: ms(14), padding: ms(14), marginBottom: ms(10), borderWidth: 1, borderColor: C.border },
  centerCardAssigned: { backgroundColor: "#F0FDF6", borderColor: "#A8E6C8" },

  centerTop:  { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(8) },
  centerDot:  { width: ms(8), height: ms(8), borderRadius: ms(4), flexShrink: 0 },
  centerName: { flex: 1, fontSize: fs(13), fontWeight: "700", color: C.text },

  roleRow:       { marginBottom: ms(10) },
  rolePickLabel: { fontSize: fs(10), fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: ms(6) },
  roleTabs:      { flexDirection: "row", gap: ms(6) },
  roleTab:       { flex: 1, alignItems: "center", paddingVertical: ms(7), borderRadius: ms(8), backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  roleTabT:      { fontSize: fs(11), fontWeight: "700" },

  centerActions: { alignItems: "flex-end" },
  assignBtn:     { flexDirection: "row", alignItems: "center", gap: ms(5), backgroundColor: C.primary, borderRadius: ms(8), paddingHorizontal: ms(14), paddingVertical: ms(7) },
  assignBtnT:    { fontSize: fs(12), fontWeight: "700", color: "#fff" },
  removeBtn:     { flexDirection: "row", alignItems: "center", gap: ms(5), backgroundColor: "#FEF0EF", borderRadius: ms(8), paddingHorizontal: ms(14), paddingVertical: ms(7), borderWidth: 1, borderColor: "#F5BFBB" },
  removeBtnT:    { fontSize: fs(12), fontWeight: "700", color: "#C0392B" },

  doneBtn:  { backgroundColor: C.bg, borderRadius: ms(12), paddingVertical: ms(13), alignItems: "center", borderWidth: 1, borderColor: C.border, marginTop: ms(8) },
  doneBtnT: { fontSize: fs(14), fontWeight: "700", color: C.text },
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
  const [open, setOpen] = useState(false);
  const rm = ROLE_META[member.role];
  const initials = member.fullName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View style={[sc.card, !member.isActive && sc.cardInactive]}>
      {/* Colored left accent strip */}
      <View style={[sc.accent, { backgroundColor: rm.color }]} />

      <View style={sc.inner}>
        {/* Tap-to-expand row */}
        <TouchableOpacity style={sc.head} onPress={() => setOpen((v) => !v)} activeOpacity={0.75}>
          <View style={[sc.avatar, { backgroundColor: rm.bg }]}>
            <Text style={[sc.avatarL, { color: rm.color }]}>{initials}</Text>
          </View>

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
              <RoleChip role={member.role} />
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
              <View style={[sc.infoIcon, { backgroundColor: "#F0EDE8" }]}>
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
                      <Ionicons name="business-outline" size={ms(13)} color="#5B2D8E" />
                    </View>
                    <Text style={sc.centerName} numberOfLines={1}>{a.center.name}</Text>
                    <RoleChip role={a.role} />
                  </View>
                ))}
              </View>
            )}

            {/* Role note */}
            <View style={sc.noteBox}>
              <Ionicons name="information-circle-outline" size={ms(14)} color={C.muted} />
              <Text style={sc.noteT}>
                {"Global role: "}
                <Text style={{ fontWeight: "700", color: C.text }}>{rm.label}</Text>
                {member.centerAssignments.length > 0
                  ? "  ·  Per-center roles may differ. Edit in Center Management."
                  : "  ·  Assign to a center to set their per-center role."}
              </Text>
            </View>

            {/* Actions — row 1 */}
            <View style={sc.actions}>
              <TouchableOpacity style={sc.actionEdit} onPress={onEdit} activeOpacity={0.8}>
                <Ionicons name="create-outline" size={ms(15)} color={C.primary} />
                <Text style={[sc.actionT, { color: C.primary }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={sc.actionCenters} onPress={onManageCenters} activeOpacity={0.8}>
                <Ionicons name="business-outline" size={ms(15)} color="#5B2D8E" />
                <Text style={[sc.actionT, { color: "#5B2D8E" }]}>Centers</Text>
                {member.centerAssignments.length > 0 && (
                  <View style={sc.centersBadge}>
                    <Text style={sc.centersBadgeT}>{member.centerAssignments.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Actions — row 2 */}
            <TouchableOpacity style={[sc.actions, sc.actionKey, { marginTop: ms(8) }]} onPress={onReset} activeOpacity={0.8}>
              <Ionicons name="key-outline" size={ms(15)} color="#946200" />
              <Text style={[sc.actionT, { color: "#946200" }]}>Reset Password</Text>
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
    shadowColor: "#2B1B1F",
    shadowOffset: { width: 0, height: ms(3) },
    shadowOpacity: 0.08,
    shadowRadius: ms(8),
    elevation: 2,
    flexDirection: "row",
    overflow: "hidden",
  },
  cardInactive: { opacity: 0.5 },
  accent:       { width: ms(4), flexShrink: 0 },
  inner:        { flex: 1 },

  head:    { flexDirection: "row", alignItems: "center", padding: ms(14), gap: ms(12) },
  avatar:  { width: ms(48), height: ms(48), borderRadius: ms(24), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarL: { fontSize: fs(17), fontWeight: "800" },

  info:    { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  name:    { fontSize: fs(14), fontWeight: "700", color: C.text, flexShrink: 1 },

  youBadge:  { backgroundColor: "#E8F4FD", borderRadius: ms(5), paddingHorizontal: ms(6), paddingVertical: 1 },
  youBadgeT: { fontSize: fs(9), fontWeight: "700", color: "#2563A8" },

  email:  { fontSize: fs(11), color: C.muted, marginTop: ms(2), marginBottom: ms(5) },
  tagRow: { flexDirection: "row", alignItems: "center", gap: ms(6) },

  activePill:    { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: "#E8F8F0", borderRadius: ms(6), paddingHorizontal: ms(7), paddingVertical: ms(3) },
  activeDot:     { width: ms(5), height: ms(5), borderRadius: ms(3), backgroundColor: C.green },
  activePillT:   { fontSize: fs(10), fontWeight: "700", color: C.green },
  inactivePill:  { backgroundColor: "#F0EDE8", borderRadius: ms(6), paddingHorizontal: ms(7), paddingVertical: ms(3) },
  inactivePillT: { fontSize: fs(10), fontWeight: "600", color: C.muted },

  body:    { paddingHorizontal: ms(14), paddingBottom: ms(14) },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(12) },

  infoRow:  { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(8) },
  infoIcon: { width: ms(26), height: ms(26), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },
  infoT:    { fontSize: fs(12), color: C.muted, fontWeight: "500" },

  centersBlock: { marginTop: ms(4), marginBottom: ms(8) },
  sectionLabel: { fontSize: fs(10), fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: ms(8) },
  centerRow:    { flexDirection: "row", alignItems: "center", gap: ms(8), paddingVertical: ms(6), borderBottomWidth: 1, borderBottomColor: C.border },
  centerName:   { flex: 1, fontSize: fs(12), fontWeight: "600", color: C.text },

  noteBox: { flexDirection: "row", alignItems: "flex-start", gap: ms(6), backgroundColor: "#FAF7F2", borderRadius: ms(10), padding: ms(10), marginBottom: ms(12) },
  noteT:   { flex: 1, fontSize: fs(11), color: C.muted, lineHeight: fs(16) },

  actions:      { flexDirection: "row", gap: ms(8) },
  actionEdit:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingVertical: ms(9), borderRadius: ms(10), backgroundColor: "#FDF0F3", borderWidth: 1, borderColor: "#F5CEDB" },
  actionCenters:{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingVertical: ms(9), borderRadius: ms(10), backgroundColor: "#EEE9F6", borderWidth: 1, borderColor: "#C9BDE8" },
  actionKey:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingVertical: ms(9), borderRadius: ms(10), backgroundColor: "#FEF8ED", borderWidth: 1, borderColor: "#F5DFA0" },
  actionT:      { fontSize: fs(12), fontWeight: "700" },
  centersBadge: { backgroundColor: "#5B2D8E", borderRadius: ms(8), paddingHorizontal: ms(5), paddingVertical: 1, marginLeft: ms(2) },
  centersBadgeT:{ fontSize: fs(9), fontWeight: "800", color: "#fff" },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function StaffManagementScreen() {
  const navigation  = useNavigation();
  const { staff: authStaff } = useAuth();
  const { showAlert } = useAlert();

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
    admin:     members.filter((m) =>  m.role === "admin"     && m.isActive).length,
    teacher:   members.filter((m) =>  m.role === "teacher"   && m.isActive).length,
    frontdesk: members.filter((m) =>  m.role === "frontdesk" && m.isActive).length,
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
      : m.role === filter && m.isActive;
    if (!passTab) return false;
    if (!q) return true;
    return (
      m.fullName.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.phone.includes(q)
    );
  });

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
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
          <ActivityIndicator size="large" color={C.primary} />
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
              colors={[C.primary]}
              tintColor={C.primary}
            />
          }
        >
          {filtered.length === 0 ? (
            <EmptyState
              scene="staff"
              color={C.primary}
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
        <LinearGradient
          colors={["#8B1E3F", "#C64A3E", "#E8752C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.fabGrad}
        >
          <Ionicons name="person-add-outline" size={ms(20)} color="#fff" />
          <Text style={s.fabT}>Add Staff</Text>
        </LinearGradient>
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

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: "#8B1E3F" },
  loader:  { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: ms(10) },
  loaderT: { fontSize: fs(13), color: C.muted, fontWeight: "500" },

  searchWrap:  { backgroundColor: C.bg, paddingHorizontal: ms(14), paddingTop: ms(12), paddingBottom: ms(6) },
  searchBar:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.card, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, fontSize: fs(13), color: C.text, padding: 0 },

  chipsScroll:  { flexGrow: 0, backgroundColor: C.bg },
  chipsContent: { paddingHorizontal: ms(14), paddingTop: ms(4), paddingBottom: ms(12), gap: ms(8) },
  chip:         { flexDirection: "row", alignItems: "center", gap: ms(5), paddingHorizontal: ms(12), paddingVertical: ms(7), borderRadius: ms(20), backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipT:        { fontSize: fs(12), fontWeight: "700" },
  chipCount:    { backgroundColor: "#F0EDE8", borderRadius: ms(8), paddingHorizontal: ms(6), paddingVertical: 1 },
  chipCountT:   { fontSize: fs(10), fontWeight: "700" },

  scroll: { flex: 1, backgroundColor: C.bg },
  body:   { paddingHorizontal: ms(14), paddingTop: ms(4) },

  empty:        { alignItems: "center", paddingVertical: ms(56), gap: ms(8) },
  emptyIconWrap:{ width: ms(72), height: ms(72), borderRadius: ms(36), backgroundColor: "#FDF0F3", justifyContent: "center", alignItems: "center", marginBottom: ms(4) },
  emptyTitle:   { fontSize: fs(16), fontWeight: "800", color: C.text },
  emptySub:     { fontSize: fs(13), color: C.muted, textAlign: "center", paddingHorizontal: ms(24) },
  emptyBtn:     { flexDirection: "row", alignItems: "center", gap: ms(6), marginTop: ms(16), backgroundColor: C.primary, borderRadius: ms(12), paddingHorizontal: ms(22), paddingVertical: ms(11) },
  emptyBtnT:    { fontSize: fs(13), fontWeight: "700", color: "#fff" },

  fab:     { position: "absolute", bottom: ms(28), right: ms(20) },
  fabGrad: {
    flexDirection: "row", alignItems: "center", gap: ms(7),
    paddingHorizontal: ms(20), paddingVertical: ms(14), borderRadius: ms(28),
    shadowColor: "#8B1E3F", shadowOffset: { width: 0, height: ms(4) },
    shadowOpacity: 0.35, shadowRadius: ms(10), elevation: 6,
  },
  fabT: { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});

const md = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet:    { backgroundColor: C.card, borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingHorizontal: ms(20), paddingTop: ms(8), maxHeight: "90%" },
  drag:     { width: ms(36), height: ms(4), backgroundColor: C.border, borderRadius: ms(2), alignSelf: "center", marginBottom: ms(16) },
  title:    { fontSize: fs(18), fontWeight: "800", color: C.text, marginBottom: ms(4) },

  sectionLabel: { fontSize: fs(11), fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: ms(16), marginBottom: ms(8) },
  input:        { backgroundColor: C.bg, borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(12), fontSize: fs(14), color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: ms(10) },
  pwRow:        { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(6) },
  eyeBtn:       { padding: ms(4) },
  pwHint:       { fontSize: fs(11), color: C.muted, marginBottom: ms(4) },
  errorT:       { fontSize: fs(12), color: "#C0392B", marginTop: ms(6), marginBottom: ms(4) },
  btn:          { backgroundColor: C.primary, borderRadius: ms(14), paddingVertical: ms(14), alignItems: "center", marginTop: ms(16) },
  btnDim:       { opacity: 0.6 },
  btnT:         { fontSize: fs(15), fontWeight: "800", color: "#fff" },
  cancelBtn:    { alignItems: "center", marginTop: ms(12) },
  cancelT:      { fontSize: fs(14), color: C.muted, fontWeight: "600" },

  resetHeader:  { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(4) },
  resetIconWrap:{ width: ms(44), height: ms(44), borderRadius: ms(12), backgroundColor: "#FEF8ED", justifyContent: "center", alignItems: "center" },
  resetFor:     { fontSize: fs(13), color: C.muted },

  toggleRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg, borderRadius: ms(12), padding: ms(14), marginTop: ms(10), borderWidth: 1, borderColor: C.border },
  toggleLabel:  { fontSize: fs(14), fontWeight: "700", color: C.text },
  toggleSub:    { fontSize: fs(11), color: C.muted, marginTop: 2 },

  rolePicker:   { gap: ms(8) },
  roleCard:     { borderRadius: ms(14), borderWidth: 2, borderColor: C.border, padding: ms(12), position: "relative" },
  roleIcon:     { width: ms(32), height: ms(32), borderRadius: ms(9), justifyContent: "center", alignItems: "center", marginBottom: ms(6) },
  roleCardLabel:{ fontSize: fs(13), fontWeight: "800", color: C.text, marginBottom: 2 },
  roleCardDesc: { fontSize: fs(11), color: C.muted },
  roleCheck:    { position: "absolute", top: ms(10), right: ms(10), width: ms(20), height: ms(20), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },

  roleRow: { flexDirection: "row", gap: ms(8) },
  roleTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(5), paddingVertical: ms(9), borderRadius: ms(10), backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  roleTabT:{ fontSize: fs(11), fontWeight: "700" },
});

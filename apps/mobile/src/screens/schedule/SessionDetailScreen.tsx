import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, StatusBar, FlatList,
} from "react-native";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import {
  listSessions, patchSession,
  type ClassSession, type SessionStatus,
  fmtTimeRange,
} from "../../api/classSchedule";
import { listFaculty, type FacultyItem } from "../../api/faculty";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { ScreenHeader } from "../../components/ui/ScreenHeader";

type Props = NativeStackScreenProps<RootStackParamList, "SessionDetail">;

function fmtFullDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ── Faculty avatar helpers ────────────────────────────────────────────────────

const AVATAR_COLORS = [C.primary, C.blue, C.green, C.accent, C.purple, C.orange];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name: string) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

const STATUS_META = {
  scheduled: { label: "Scheduled", color: C.blue,  bg: "#EEF4FF", icon: "calendar-outline"         },
  completed: { label: "Completed", color: C.green,  bg: "#EAF7F1", icon: "checkmark-circle-outline"  },
  cancelled: { label: "Cancelled", color: C.red,    bg: "#FEF0EE", icon: "close-circle-outline"      },
} as const;

const TYPE_META = {
  regular: { label: "Regular class", icon: "repeat-outline"        },
  extra:   { label: "Extra class",   icon: "add-circle-outline"     },
  makeup:  { label: "Makeup class",  icon: "refresh-circle-outline" },
} as const;

function InfoRow({ icon, label, value, color = C.muted }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <View style={sd.infoRow}>
      <View style={[sd.infoIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(14)} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={sd.infoLabel}>{label}</Text>
        <Text style={sd.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export function SessionDetailScreen({ route, navigation }: Props) {
  const { sessionId, batchId, batchName } = route.params;

  const [session, setSession]             = useState<ClassSession | null>(null);
  const [loading, setLoading]             = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelReason, setCancelReason]   = useState("");
  const [showCancelInput, setShowCancelInput] = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // Faculty picker
  const [showFacultyPicker, setShowFacultyPicker] = useState(false);
  const [facultyList, setFacultyList]             = useState<FacultyItem[]>([]);
  const [facultySearch, setFacultySearch]         = useState("");
  const [facultyPickerLoading, setFacultyPickerLoading] = useState(false);

  useEffect(() => {
    if (!showFacultyPicker) return;
    setFacultyPickerLoading(true);
    listFaculty({ isActive: true, limit: 100 })
      .then((res) => setFacultyList(res.data))
      .catch(() => {})
      .finally(() => setFacultyPickerLoading(false));
  }, [showFacultyPicker]);

  const load = useCallback(async () => {
    try {
      const today = new Date();
      const sixAgo   = new Date(today); sixAgo.setMonth(today.getMonth() - 6);
      const sixAhead = new Date(today); sixAhead.setMonth(today.getMonth() + 6);
      const toStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const all   = await listSessions(batchId, { from: toStr(sixAgo), to: toStr(sixAhead) });
      setSession(all.find((s) => s.id === sessionId) ?? null);
    } catch { setError("Failed to load session"); }
    finally { setLoading(false); }
  }, [batchId, sessionId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const doAction = async (status: SessionStatus, extra?: { cancelReason?: string }) => {
    setActionLoading(status);
    setError(null);
    try {
      const updated = await patchSession(sessionId, { status, ...extra });
      setSession(updated);
      setShowCancelInput(false);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={sd.safe} edges={["bottom"]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ScreenHeader title="Session Detail" onBack={() => navigation.goBack()} />
        <View style={sd.center}><ActivityIndicator size="large" color={C.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={sd.safe} edges={["bottom"]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ScreenHeader title="Session Detail" onBack={() => navigation.goBack()} />
        <View style={sd.center}>
          <View style={sd.emptyIllus}>
            <Ionicons name="alert-circle-outline" size={ms(44)} color={C.muted} />
          </View>
          <Text style={sd.emptyTitle}>Session not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sm = STATUS_META[session.status];
  const tm = TYPE_META[session.type];
  const canComplete = session.status === "scheduled";
  const canCancel   = session.status === "scheduled";
  // Fall back to slot's subject/faculty for sessions generated before assignment was set
  const subject = session.subject ?? session.slot?.subject ?? null;
  const faculty = session.faculty ?? session.slot?.faculty ?? null;

  return (
    <SafeAreaView style={sd.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScreenHeader
        title="Session Detail"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: C.bg }}
        contentContainerStyle={sd.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Date + status card */}
        <View style={sd.dateCard}>
          <View style={[sd.statusStripe, { backgroundColor: sm.color }]} />
          <View style={sd.dateBody}>
            <Text style={sd.batchName} numberOfLines={1}>{batchName}</Text>
            <Text style={sd.fullDate}>{fmtFullDate(session.scheduledDate)}</Text>
            <Text style={sd.timeRange}>{fmtTimeRange(session.startTime, session.endTime)}</Text>
            <View style={sd.badgeRow}>
              <View style={[sd.statusBadge, { backgroundColor: sm.bg }]}>
                <Ionicons name={sm.icon as any} size={ms(11)} color={sm.color} />
                <Text style={[sd.statusBadgeT, { color: sm.color }]}>{sm.label}</Text>
              </View>
              <View style={sd.typeBadge}>
                <Ionicons name={tm.icon as any} size={ms(11)} color={C.muted} />
                <Text style={sd.typeBadgeT}>{tm.label}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Details card */}
        {(subject || faculty || session.room || session.slot || canComplete) && (
          <View style={sd.card}>
            {subject && (
              <InfoRow icon="book-outline" label="Subject" value={subject.name} color={C.blue} />
            )}

            {/* Faculty row — tappable to change when session is scheduled */}
            {faculty ? (
              <>
                {subject && <View style={sd.divider} />}
                <TouchableOpacity
                  style={sd.infoRow}
                  onPress={() => canComplete && setShowFacultyPicker(true)}
                  activeOpacity={canComplete ? 0.7 : 1}
                >
                  <View style={[sd.infoIcon, { backgroundColor: C.green + "18" }]}>
                    <Ionicons name="person-outline" size={ms(14)} color={C.green} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sd.infoLabel}>Faculty</Text>
                    <Text style={sd.infoValue}>{faculty.fullName}</Text>
                  </View>
                  {canComplete && (
                    <View style={sd.changeChip}>
                      <Text style={sd.changeChipT}>Change</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            ) : canComplete ? (
              <>
                {subject && <View style={sd.divider} />}
                <TouchableOpacity style={sd.infoRow} onPress={() => setShowFacultyPicker(true)} activeOpacity={0.7}>
                  <View style={[sd.infoIcon, { backgroundColor: C.muted + "18" }]}>
                    <Ionicons name="person-add-outline" size={ms(14)} color={C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sd.infoLabel}>Faculty</Text>
                    <Text style={[sd.infoValue, { color: C.muted }]}>Not assigned</Text>
                  </View>
                  <View style={sd.changeChip}>
                    <Text style={sd.changeChipT}>Assign</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : null}

            {session.room && (
              <>
                {(subject || faculty) && <View style={sd.divider} />}
                <InfoRow icon="location-outline" label="Room" value={session.room} color={C.orange} />
              </>
            )}
            {session.slot && (
              <>
                {(subject || faculty || session.room) && <View style={sd.divider} />}
                <InfoRow icon="repeat-outline" label="From template" value={`${session.slot.dayOfWeek} recurring slot`} color={C.primary} />
              </>
            )}
          </View>
        )}

        {/* Cancel reason */}
        {session.status === "cancelled" && session.cancelReason && (
          <View style={sd.cancelCard}>
            <Ionicons name="alert-circle-outline" size={ms(14)} color={C.red} />
            <Text style={sd.cancelT}>{session.cancelReason}</Text>
          </View>
        )}

        {/* Notes */}
        {session.notes && (
          <View style={sd.notesCard}>
            <Text style={sd.notesLabel}>Notes</Text>
            <Text style={sd.notesT}>{session.notes}</Text>
          </View>
        )}

        {/* Faculty change saving indicator */}
        {actionLoading === "faculty" && (
          <View style={[sd.errorBox, { backgroundColor: C.green + "10" }]}>
            <ActivityIndicator size="small" color={C.green} />
            <Text style={[sd.errorT, { color: C.green }]}>Updating faculty…</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={sd.errorBox}>
            <Ionicons name="alert-circle-outline" size={ms(14)} color={C.red} />
            <Text style={sd.errorT}>{error}</Text>
          </View>
        )}

        {/* Cancel reason input */}
        {showCancelInput && (
          <View style={sd.card}>
            <Text style={sd.inputLabel}>Reason for cancellation (optional)</Text>
            <TextInput
              style={sd.reasonInput}
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="e.g. Faculty on leave"
              placeholderTextColor={C.placeholder}
              multiline
              numberOfLines={2}
            />
            <View style={sd.cancelConfirmRow}>
              <TouchableOpacity style={sd.cancelAbort} onPress={() => setShowCancelInput(false)}>
                <Text style={sd.cancelAbortT}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[sd.cancelConfirm, actionLoading === "cancelled" && { opacity: 0.6 }]}
                onPress={() => doAction("cancelled", { cancelReason: cancelReason || undefined })}
                disabled={actionLoading === "cancelled"}
              >
                {actionLoading === "cancelled"
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={sd.cancelConfirmT}>Confirm Cancel</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action buttons */}
        {(canComplete || canCancel) && !showCancelInput && (
          <View style={sd.actionsRow}>
            {canComplete && (
              <TouchableOpacity
                style={[sd.actionBtn, sd.completeBtn, actionLoading === "completed" && { opacity: 0.6 }]}
                onPress={() => doAction("completed")}
                disabled={!!actionLoading}
              >
                {actionLoading === "completed"
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <>
                      <Ionicons name="checkmark-circle-outline" size={ms(16)} color="#FFFFFF" />
                      <Text style={sd.actionBtnT}>Mark Complete</Text>
                    </>
                }
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity
                style={[sd.actionBtn, sd.cancelBtn]}
                onPress={() => setShowCancelInput(true)}
                disabled={!!actionLoading}
              >
                <Ionicons name="close-circle-outline" size={ms(16)} color={C.red} />
                <Text style={sd.cancelBtnT}>Cancel Class</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Faculty Picker */}
      <BottomSheet
        visible={showFacultyPicker}
        onClose={() => setShowFacultyPicker(false)}
        maxHeight="78%"
      >
          <View style={sd.pickerSheet}>
            {/* Header */}
            <View style={sd.pickerHeader}>
              <Text style={sd.pickerTitle}>Assign Faculty</Text>
              <TouchableOpacity onPress={() => setShowFacultyPicker(false)} style={sd.pickerClose}>
                <Ionicons name="close" size={ms(20)} color={C.text} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={sd.pickerSearch}>
              <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
              <TextInput
                style={sd.pickerSearchInput}
                value={facultySearch}
                onChangeText={setFacultySearch}
                placeholder="Search faculty…"
                placeholderTextColor={C.placeholder}
              />
              {facultySearch !== "" && (
                <TouchableOpacity onPress={() => setFacultySearch("")}>
                  <Ionicons name="close-circle" size={ms(16)} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Remove assignment option */}
            {faculty && (
              <TouchableOpacity
                style={sd.removeRow}
                onPress={async () => {
                  setShowFacultyPicker(false);
                  setActionLoading("faculty");
                  try {
                    const updated = await patchSession(sessionId, { facultyId: null });
                    setSession(updated);
                  } catch { setError("Could not remove faculty"); }
                  finally { setActionLoading(null); }
                }}
              >
                <Ionicons name="person-remove-outline" size={ms(16)} color={C.red} />
                <Text style={sd.removeRowT}>Remove faculty assignment</Text>
              </TouchableOpacity>
            )}

            {/* List */}
            {facultyPickerLoading ? (
              <View style={sd.pickerCenter}>
                <ActivityIndicator color={C.primary} />
              </View>
            ) : (
              <FlatList
                data={facultyList.filter((f) =>
                  f.fullName.toLowerCase().includes(facultySearch.toLowerCase()) ||
                  f.employeeCode.toLowerCase().includes(facultySearch.toLowerCase())
                )}
                keyExtractor={(f) => f.id}
                contentContainerStyle={{ padding: ms(12), gap: ms(8) }}
                renderItem={({ item: f }) => {
                  const color    = avatarColor(f.fullName);
                  const initials = getInitials(f.fullName);
                  const selected = session?.facultyId === f.id;
                  return (
                    <TouchableOpacity
                      style={[sd.facultyRow, selected && { backgroundColor: C.green + "0D", borderColor: C.green }]}
                      onPress={async () => {
                        setShowFacultyPicker(false);
                        setActionLoading("faculty");
                        try {
                          const updated = await patchSession(sessionId, { facultyId: f.id });
                          setSession(updated);
                        } catch { setError("Could not update faculty"); }
                        finally { setActionLoading(null); }
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={[sd.facultyAvatar, { backgroundColor: color + "22" }]}>
                        <Text style={[sd.facultyInitials, { color }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={sd.facultyName}>{f.fullName}</Text>
                        <Text style={sd.facultyCode}>{f.employeeCode}</Text>
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={ms(18)} color={C.green} />}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={sd.pickerCenter}>
                    <Text style={sd.pickerEmpty}>No faculty found</Text>
                  </View>
                }
              />
            )}
          </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sd = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
  body:   { padding: ms(16), paddingBottom: ms(48), gap: ms(12) },

  emptyIllus: {
    width: ms(90), height: ms(90), borderRadius: ms(24),
    backgroundColor: C.primary + "10",
    alignItems: "center", justifyContent: "center",
    marginBottom: ms(12),
  },
  emptyTitle: { fontSize: fs(15), fontWeight: "700", color: C.text },

  // Date card
  dateCard: {
    flexDirection:   "row",
    backgroundColor: "#FFFFFF",
    borderRadius:    ms(16),
    shadowColor:     "#2B1B1F",
    shadowOffset:    { width: 0, height: ms(2) },
    shadowOpacity:   0.07,
    shadowRadius:    ms(8),
    elevation:       2,
    overflow:        "hidden",
  },
  statusStripe: { width: ms(4) },
  dateBody:     { flex: 1, padding: ms(16) },
  batchName:    { fontSize: fs(11), fontWeight: "600", color: C.muted, marginBottom: ms(4), textTransform: "uppercase", letterSpacing: 0.4 },
  fullDate:     { fontSize: fs(15), fontWeight: "800", color: C.text, marginBottom: ms(2) },
  timeRange:    { fontSize: fs(13), color: C.muted, marginBottom: ms(10) },
  badgeRow:     { flexDirection: "row", gap: ms(8), flexWrap: "wrap" },
  statusBadge:  { flexDirection: "row", alignItems: "center", gap: ms(4), borderRadius: ms(6), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  statusBadgeT: { fontSize: fs(11), fontWeight: "700" },
  typeBadge:    { flexDirection: "row", alignItems: "center", gap: ms(4), borderRadius: ms(6), paddingHorizontal: ms(8), paddingVertical: ms(3), backgroundColor: "#F3F4F6" },
  typeBadgeT:   { fontSize: fs(11), color: C.muted },

  // Info card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius:    ms(16),
    shadowColor:     "#2B1B1F",
    shadowOffset:    { width: 0, height: ms(2) },
    shadowOpacity:   0.07,
    shadowRadius:    ms(8),
    elevation:       2,
    overflow:        "hidden",
  },
  divider:  { height: 1, backgroundColor: C.border, marginHorizontal: ms(12) },
  infoRow:  { flexDirection: "row", alignItems: "center", padding: ms(14), gap: ms(10) },
  infoIcon: { width: ms(34), height: ms(34), borderRadius: ms(9), alignItems: "center", justifyContent: "center" },
  infoLabel:{ fontSize: fs(10), color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  infoValue:{ fontSize: fs(13), fontWeight: "700", color: C.text, marginTop: 1 },

  // Cancel / notes
  cancelCard: {
    flexDirection: "row", gap: ms(8), alignItems: "flex-start",
    backgroundColor: "#FEF0EE", borderRadius: ms(12), padding: ms(12),
  },
  cancelT: { flex: 1, fontSize: fs(12), color: C.red },

  notesCard:  { backgroundColor: "#FFFFFF", borderRadius: ms(12), padding: ms(14), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(1) }, shadowOpacity: 0.05, shadowRadius: ms(4), elevation: 1 },
  notesLabel: { fontSize: fs(10), color: C.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: ms(4) },
  notesT:     { fontSize: fs(13), color: C.text, lineHeight: fs(20) },

  errorBox: {
    flexDirection: "row", gap: ms(8), alignItems: "flex-start",
    backgroundColor: "#FEF0EE", borderRadius: ms(12), padding: ms(12),
  },
  errorT: { flex: 1, fontSize: fs(12), color: C.red },

  // Cancel input
  inputLabel:  { fontSize: fs(11), fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.4, padding: ms(14), paddingBottom: ms(6) },
  reasonInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: ms(8),
    marginHorizontal: ms(14), padding: ms(10), fontSize: fs(13), color: C.text,
    minHeight: ms(60), textAlignVertical: "top", backgroundColor: C.inputBg,
  },
  cancelConfirmRow: { flexDirection: "row", gap: ms(10), padding: ms(14), paddingTop: ms(10) },
  cancelAbort:      { flex: 1, height: ms(44), borderRadius: ms(10), borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  cancelAbortT:     { fontSize: fs(13), color: C.muted, fontWeight: "600" },
  cancelConfirm:    { flex: 2, height: ms(44), borderRadius: ms(10), backgroundColor: C.red, alignItems: "center", justifyContent: "center" },
  cancelConfirmT:   { fontSize: fs(13), fontWeight: "700", color: "#FFFFFF" },

  // Actions
  actionsRow: { flexDirection: "column", gap: ms(10) },
  actionBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), height: ms(50), borderRadius: ms(12) },
  completeBtn:{ backgroundColor: C.green },
  cancelBtn:  { backgroundColor: "#FEF0EE", borderWidth: 1, borderColor: C.red + "50" },
  actionBtnT: { fontSize: fs(14), fontWeight: "700", color: "#FFFFFF" },
  cancelBtnT: { fontSize: fs(14), fontWeight: "700", color: C.red },

  // Change chip on faculty row
  changeChip:  { paddingHorizontal: ms(9), paddingVertical: ms(4), borderRadius: ms(6), backgroundColor: C.primary + "10", borderWidth: 1, borderColor: C.primary + "30" },
  changeChipT: { fontSize: fs(10), fontWeight: "700", color: C.primary },

  // Faculty picker sheet (background override + bottom pad)
  pickerSheet: {
    backgroundColor: C.bg,
    paddingBottom: ms(24),
  },
  pickerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: ms(16), paddingBottom: ms(12),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  pickerTitle: { fontSize: fs(15), fontWeight: "800", color: C.text },
  pickerClose: { width: ms(32), height: ms(32), borderRadius: ms(8), alignItems: "center", justifyContent: "center", backgroundColor: C.inputBg },
  pickerSearch: {
    flexDirection: "row", alignItems: "center", gap: ms(8),
    margin: ms(12), marginBottom: ms(4),
    backgroundColor: C.inputBg, borderRadius: ms(10), borderWidth: 1, borderColor: C.border,
    paddingHorizontal: ms(10), height: ms(40),
  },
  pickerSearchInput: { flex: 1, fontSize: fs(13), color: C.text },
  pickerCenter: { alignItems: "center", justifyContent: "center", paddingVertical: ms(32) },
  pickerEmpty:  { fontSize: fs(13), color: C.muted },
  removeRow: {
    flexDirection: "row", alignItems: "center", gap: ms(8),
    marginHorizontal: ms(12), marginTop: ms(4), marginBottom: ms(2),
    paddingVertical: ms(10), paddingHorizontal: ms(12),
    borderRadius: ms(10), backgroundColor: "#FEF0EE",
  },
  removeRowT: { fontSize: fs(13), color: C.red, fontWeight: "600" },
  facultyRow: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    padding: ms(12), borderRadius: ms(12),
    borderWidth: 1, borderColor: C.border, backgroundColor: "#FFFFFF",
  },
  facultyAvatar:   { width: ms(40), height: ms(40), borderRadius: ms(12), alignItems: "center", justifyContent: "center" },
  facultyInitials: { fontSize: fs(14), fontWeight: "800" },
  facultyName:     { fontSize: fs(13), fontWeight: "700", color: C.text },
  facultyCode:     { fontSize: fs(11), color: C.muted, marginTop: 1 },
});

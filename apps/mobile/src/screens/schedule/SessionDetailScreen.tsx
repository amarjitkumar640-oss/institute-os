import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, FlatList,
} from "react-native";
import { BottomSheet, SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { T } from "../../components/ui/typography";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import {
  listSessions, patchSession,
  type ClassSession, type SessionStatus,
  fmtTimeRange,
  getSessionAttendance, setSessionAttendance as apiSetSessionAttendance,
  type SessionAttendanceRow, type AttendanceStatus,
} from "../../api/classSchedule";
import { listFaculty, type FacultyItem } from "../../api/faculty";
import { listSubjects, type SubjectItem } from "../../api/subjects";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { ScreenHeader } from "../../components/ui/ScreenHeader";

type Props = NativeStackScreenProps<RootStackParamList, "SessionDetail">;

function fmtFullDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// Mirrors the API's own sessionHasEnded() check in schedule.service.ts — a
// session can't be marked completed until it's actually ended (same-day
// session before its end time, or any future day). This is a UX nicety to
// hide the button up front; the API is the real enforcement and uses the
// server's clock, not the device's, so the two can disagree right at the
// boundary — acceptable, matching the server-side check's own accepted
// midnight-wraparound imprecision.
function sessionHasEnded(scheduledDateIso: string, endTime: string): boolean {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const scheduledDateStr = scheduledDateIso.slice(0, 10);
  if (scheduledDateStr < todayStr) return true;
  if (scheduledDateStr > todayStr) return false;
  const nowHHMM = now.toTimeString().slice(0, 5);
  return nowHHMM >= endTime;
}

// ── Faculty avatar helpers ────────────────────────────────────────────────────

function avatarColors(colors: ThemeColors) {
  return [colors.primary, C.blue, C.green, colors.accent, C.purple, C.orange];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name: string, colors: ThemeColors) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  const palette = avatarColors(colors);
  return palette[n % palette.length];
}

const STATUS_META = {
  scheduled: { label: "Scheduled", color: C.blue,  bg: "#EEF4FF", icon: "calendar-outline"         },
  completed: { label: "Completed", color: C.green,  bg: C.greenBg, icon: "checkmark-circle-outline"  },
  cancelled: { label: "Cancelled", color: C.red,    bg: C.redBg, icon: "close-circle-outline"      },
} as const;

const TYPE_META = {
  regular: { label: "Regular class", icon: "repeat-outline"        },
  extra:   { label: "Extra class",   icon: "add-circle-outline"     },
  makeup:  { label: "Makeup class",  icon: "refresh-circle-outline" },
} as const;

function InfoRow({ icon, label, value, color = C.muted }: { icon: string; label: string; value: string; color?: string }) {
  const sd = useThemedStyles(makeSdStyles);
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
  const colors = useThemeColors();
  const sd = useThemedStyles(makeSdStyles);
  const { staff } = useAuth();
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

  // Subject picker
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [subjectList, setSubjectList]             = useState<SubjectItem[]>([]);
  const [subjectSearch, setSubjectSearch]         = useState("");
  const [subjectPickerLoading, setSubjectPickerLoading] = useState(false);

  // Attendance
  const [roster, setRoster]                       = useState<SessionAttendanceRow[] | null>(null);
  const [showAttendanceSheet, setShowAttendanceSheet] = useState(false);
  const [pendingMarks, setPendingMarks]           = useState<Record<string, AttendanceStatus>>({});
  const [savingAttendance, setSavingAttendance]   = useState(false);
  const [attendanceError, setAttendanceError]     = useState<string | null>(null);

  useEffect(() => {
    if (!showFacultyPicker) return;
    setFacultyPickerLoading(true);
    listFaculty({ isActive: true, limit: 100 })
      .then((res) => setFacultyList(res.data))
      .catch(() => {})
      .finally(() => setFacultyPickerLoading(false));
  }, [showFacultyPicker]);

  useEffect(() => {
    if (!showSubjectPicker) return;
    setSubjectPickerLoading(true);
    // Unfiltered, matching ManageSlotModal.tsx's precedent for slot-level
    // subject picking — this codebase doesn't restrict subject choice to
    // the batch's own course.
    listSubjects()
      .then(setSubjectList)
      .catch(() => {})
      .finally(() => setSubjectPickerLoading(false));
  }, [showSubjectPicker]);

  const load = useCallback(async () => {
    try {
      const today = new Date();
      const sixAgo   = new Date(today); sixAgo.setMonth(today.getMonth() - 6);
      const sixAhead = new Date(today); sixAhead.setMonth(today.getMonth() + 6);
      const toStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const [all, rosterData] = await Promise.all([
        listSessions(batchId, { from: toStr(sixAgo), to: toStr(sixAhead) }),
        // Don't fail the whole screen over this — e.g. a teacher viewing a
        // session that isn't theirs gets a 403 here, but should still see
        // everything else on the screen.
        getSessionAttendance(sessionId).catch(() => null),
      ]);
      setSession(all.find((s) => s.id === sessionId) ?? null);
      setRoster(rosterData);
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
        <ScreenHeader title="Session Detail" onBack={() => navigation.goBack()} />
        <View style={sd.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={sd.safe} edges={["bottom"]}>
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
  const isScheduled = session.status === "scheduled";
  // Cancelling and reassigning subject/faculty are a step above the ordinary
  // edit a teacher can otherwise make here (marking their own ended session
  // complete) — only admin/frontdesk may cancel or reassign. Matches the
  // API's own checks.
  const isAdminOrFrontdesk = staff?.activeRole === "admin" || staff?.activeRole === "frontdesk";
  const canCancel   = isScheduled && isAdminOrFrontdesk;
  const canReassign = isScheduled && isAdminOrFrontdesk;
  // Marking attendance is admin/frontdesk-only — matches the API's own
  // check. Not date/status-gated like the two above (attendance can be
  // recorded for a completed session too).
  const canMarkAttendance = isAdminOrFrontdesk;
  // Cancelling a not-yet-ended session is still fine (canCancel above) —
  // only "completed" requires the session to have actually ended.
  const canMarkComplete = isScheduled && sessionHasEnded(session.scheduledDate, session.endTime);
  // Fall back to slot's subject/faculty for sessions generated before assignment was set
  const subject = session.subject ?? session.slot?.subject ?? null;
  const faculty = session.faculty ?? session.slot?.faculty ?? null;
  // Whether a Subject/Faculty row is actually rendered above the next one —
  // used purely to decide whether that next row needs a leading divider. A
  // teacher with no subject/faculty set sees no row at all here (nothing to
  // show, nothing they can do about it) rather than an inert "Assign" prompt.
  const subjectRowShown = !!subject || canReassign;
  const facultyRowShown = !!faculty || canReassign;

  return (
    <SafeAreaView style={sd.safe} edges={["bottom"]}>

      <ScreenHeader
        title="Session Detail"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.screenBg }}
        contentContainerStyle={sd.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Date + status card */}
        <View style={sd.dateCard}>
          <View style={[sd.statusStripe, { backgroundColor: colors.primary }]} />
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

        {/* Details card — uses subjectRowShown/facultyRowShown (not the raw
            subject/faculty/isScheduled) so this card doesn't render empty
            for a teacher, who sees no row at all when unset (no reassign
            permission, nothing useful to show). */}
        {(subjectRowShown || facultyRowShown || session.room || session.slot) && (
          <View style={sd.card}>
            {/* Subject row — tappable to change for admin/frontdesk only */}
            {subject ? (
              <TouchableOpacity
                style={sd.infoRow}
                onPress={() => canReassign && setShowSubjectPicker(true)}
                activeOpacity={canReassign ? 0.7 : 1}
              >
                <View style={[sd.infoIcon, { backgroundColor: C.blue + "18" }]}>
                  <Ionicons name="book-outline" size={ms(14)} color={C.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sd.infoLabel}>Subject</Text>
                  <Text style={sd.infoValue}>{subject.name}</Text>
                </View>
                {canReassign && (
                  <View style={sd.changeChip}>
                    <Text style={sd.changeChipT}>Change</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : canReassign ? (
              <TouchableOpacity style={sd.infoRow} onPress={() => setShowSubjectPicker(true)} activeOpacity={0.7}>
                <View style={[sd.infoIcon, { backgroundColor: C.muted + "18" }]}>
                  <Ionicons name="book-outline" size={ms(14)} color={C.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sd.infoLabel}>Subject</Text>
                  <Text style={[sd.infoValue, { color: C.muted }]}>Not assigned</Text>
                </View>
                <View style={sd.changeChip}>
                  <Text style={sd.changeChipT}>Assign</Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {/* Faculty row — tappable to change for admin/frontdesk only */}
            {faculty ? (
              <>
                {subjectRowShown && <View style={sd.divider} />}
                <TouchableOpacity
                  style={sd.infoRow}
                  onPress={() => canReassign && setShowFacultyPicker(true)}
                  activeOpacity={canReassign ? 0.7 : 1}
                >
                  <View style={[sd.infoIcon, { backgroundColor: C.green + "18" }]}>
                    <Ionicons name="person-outline" size={ms(14)} color={C.green} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sd.infoLabel}>Faculty</Text>
                    <Text style={sd.infoValue}>{faculty.fullName}</Text>
                  </View>
                  {canReassign && (
                    <View style={sd.changeChip}>
                      <Text style={sd.changeChipT}>Change</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            ) : canReassign ? (
              <>
                {subjectRowShown && <View style={sd.divider} />}
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
                {(subjectRowShown || facultyRowShown) && <View style={sd.divider} />}
                <InfoRow icon="location-outline" label="Room" value={session.room} color={C.orange} />
              </>
            )}
            {session.slot && (
              <>
                {(subjectRowShown || facultyRowShown || session.room) && <View style={sd.divider} />}
                <InfoRow icon="repeat-outline" label="From template" value={`${session.slot.dayOfWeek} recurring slot`} color={colors.primary} />
              </>
            )}
          </View>
        )}

        {/* Attendance — admin/frontdesk-only, matching the API's own check
            (marking is restricted there; the card is hidden entirely here
            rather than shown read-only, same treatment as the Subject/Faculty
            rows above). roster is null while loading, or [] when the batch
            has no active enrollments, in which case there's nothing to show. */}
        {canMarkAttendance && roster && roster.length > 0 && (
          <View style={sd.card}>
            <View style={sd.attendanceHead}>
              <Text style={sd.attendanceTitle}>Attendance</Text>
              {roster.some((r) => r.status !== null) && (
                <Text style={sd.attendanceSummary}>
                  {roster.filter((r) => r.status === "present").length}/{roster.length} present
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={sd.attendanceBtn}
              activeOpacity={0.75}
              onPress={() => {
                setPendingMarks(
                  Object.fromEntries(
                    roster.filter((r) => r.status !== null).map((r) => [r.studentId, r.status as AttendanceStatus]),
                  ),
                );
                setAttendanceError(null);
                setShowAttendanceSheet(true);
              }}
            >
              <Ionicons
                name={roster.every((r) => r.status === null) ? "people-outline" : "create-outline"}
                size={ms(15)}
                color={colors.primary}
              />
              <Text style={sd.attendanceBtnT}>
                {roster.every((r) => r.status === null) ? "Take Attendance" : "Edit Attendance"}
              </Text>
            </TouchableOpacity>
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

        {/* Subject change saving indicator */}
        {actionLoading === "subject" && (
          <View style={[sd.errorBox, { backgroundColor: C.blue + "10" }]}>
            <ActivityIndicator size="small" color={C.blue} />
            <Text style={[sd.errorT, { color: C.blue }]}>Updating subject…</Text>
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
        {(canMarkComplete || canCancel) && !showCancelInput && (
          <View style={sd.actionsRow}>
            {canMarkComplete && (
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

      {/* Faculty Picker — standard height (BottomSheet's own default) */}
      <BottomSheet
        visible={showFacultyPicker}
        onClose={() => setShowFacultyPicker(false)}
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
                <ActivityIndicator color={colors.primary} />
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
                  const color    = avatarColor(f.fullName, colors);
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

      {/* Subject Picker — mirrors the Faculty picker above; no "remove"
          option since a session always needs some subject, unlike faculty
          which can be legitimately unassigned. */}
      <BottomSheet
        visible={showSubjectPicker}
        onClose={() => setShowSubjectPicker(false)}
      >
          <View style={sd.pickerSheet}>
            <View style={sd.pickerHeader}>
              <Text style={sd.pickerTitle}>Assign Subject</Text>
              <TouchableOpacity onPress={() => setShowSubjectPicker(false)} style={sd.pickerClose}>
                <Ionicons name="close" size={ms(20)} color={C.text} />
              </TouchableOpacity>
            </View>

            <View style={sd.pickerSearch}>
              <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
              <TextInput
                style={sd.pickerSearchInput}
                value={subjectSearch}
                onChangeText={setSubjectSearch}
                placeholder="Search subjects…"
                placeholderTextColor={C.placeholder}
              />
              {subjectSearch !== "" && (
                <TouchableOpacity onPress={() => setSubjectSearch("")}>
                  <Ionicons name="close-circle" size={ms(16)} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>

            {subjectPickerLoading ? (
              <View style={sd.pickerCenter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={subjectList.filter((s) =>
                  s.name.toLowerCase().includes(subjectSearch.toLowerCase())
                )}
                keyExtractor={(s) => s.id}
                contentContainerStyle={{ padding: ms(12), gap: ms(8) }}
                renderItem={({ item: s }) => {
                  const color    = avatarColor(s.name, colors);
                  const initials = getInitials(s.name);
                  const selected = session?.subjectId === s.id;
                  const categoryLabel = s.examCategories.length > 0
                    ? s.examCategories.map((c) => c.label).join(", ")
                    : "General";
                  return (
                    <TouchableOpacity
                      style={[sd.facultyRow, selected && { backgroundColor: C.blue + "0D", borderColor: C.blue }]}
                      onPress={async () => {
                        setShowSubjectPicker(false);
                        setActionLoading("subject");
                        try {
                          const updated = await patchSession(sessionId, { subjectId: s.id });
                          setSession(updated);
                        } catch { setError("Could not update subject"); }
                        finally { setActionLoading(null); }
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={[sd.facultyAvatar, { backgroundColor: color + "22" }]}>
                        <Text style={[sd.facultyInitials, { color }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={sd.facultyName}>{s.name}</Text>
                        <Text style={sd.facultyCode}>{categoryLabel}</Text>
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={ms(18)} color={C.blue} />}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={sd.pickerCenter}>
                    <Text style={sd.pickerEmpty}>No subjects found</Text>
                  </View>
                }
              />
            )}
          </View>
      </BottomSheet>

      {/* Attendance sheet — tall, since a roster can run long */}
      <BottomSheet
        visible={showAttendanceSheet}
        onClose={() => setShowAttendanceSheet(false)}
        maxHeight={SHEET_HEIGHT.tall}
      >
        <View style={sd.pickerSheet}>
          <View style={sd.pickerHeader}>
            <Text style={sd.pickerTitle}>Take Attendance</Text>
            <TouchableOpacity onPress={() => setShowAttendanceSheet(false)} style={sd.pickerClose}>
              <Ionicons name="close" size={ms(20)} color={C.text} />
            </TouchableOpacity>
          </View>

          {attendanceError && (
            <View style={[sd.errorBox, { marginHorizontal: ms(12), marginTop: ms(8) }]}>
              <Ionicons name="alert-circle-outline" size={ms(14)} color={C.red} />
              <Text style={sd.errorT}>{attendanceError}</Text>
            </View>
          )}

          <FlatList
            data={roster ?? []}
            keyExtractor={(r) => r.studentId}
            contentContainerStyle={{ padding: ms(12), gap: ms(8) }}
            renderItem={({ item }) => {
              const mark     = pendingMarks[item.studentId];
              const color    = avatarColor(item.fullName, colors);
              const initials = getInitials(item.fullName);
              return (
                <View style={sd.attendanceRow}>
                  <View style={[sd.facultyAvatar, { backgroundColor: color + "22" }]}>
                    <Text style={[sd.facultyInitials, { color }]}>{initials}</Text>
                  </View>
                  <Text style={sd.attendanceRowName} numberOfLines={1}>{item.fullName}</Text>
                  <View style={sd.attendanceToggle}>
                    <TouchableOpacity
                      style={[sd.attendanceToggleBtn, mark === "present" && { backgroundColor: C.green, borderColor: C.green }]}
                      onPress={() => setPendingMarks((p) => ({ ...p, [item.studentId]: "present" }))}
                    >
                      <Text style={[sd.attendanceToggleT, mark === "present" && { color: "#fff" }]}>Present</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[sd.attendanceToggleBtn, mark === "absent" && { backgroundColor: C.red, borderColor: C.red }]}
                      onPress={() => setPendingMarks((p) => ({ ...p, [item.studentId]: "absent" }))}
                    >
                      <Text style={[sd.attendanceToggleT, mark === "absent" && { color: "#fff" }]}>Absent</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />

          <View style={sd.attendanceSaveWrap}>
            <TouchableOpacity
              style={[sd.attendanceSaveBtn, savingAttendance && { opacity: 0.6 }]}
              disabled={savingAttendance}
              onPress={async () => {
                setSavingAttendance(true);
                setAttendanceError(null);
                try {
                  const marks = Object.entries(pendingMarks).map(([studentId, status]) => ({ studentId, status }));
                  const updated = await apiSetSessionAttendance(sessionId, marks);
                  setRoster(updated);
                  setShowAttendanceSheet(false);
                } catch {
                  setAttendanceError("Could not save attendance");
                } finally {
                  setSavingAttendance(false);
                }
              }}
            >
              {savingAttendance
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={sd.attendanceSaveBtnT}>Save Attendance</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeSdStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.screenBg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.screenBg },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(48), gap: ms(12) },

  emptyIllus: {
    width: ms(90), height: ms(90), borderRadius: ms(24),
    backgroundColor: colors.primary + "10",
    alignItems: "center", justifyContent: "center",
    marginBottom: ms(12),
  },
  emptyTitle: { ...T.cardTitle, color: C.text },

  // Date card
  dateCard: {
    flexDirection:   "row",
    backgroundColor: C.card,
    borderRadius:    ms(16),
    shadowColor:     C.text,
    shadowOffset:    { width: 0, height: ms(2) },
    shadowOpacity:   0.07,
    shadowRadius:    ms(8),
    elevation:       2,
    overflow:        "hidden",
  },
  statusStripe: { width: ms(4) },
  dateBody:     { flex: 1, padding: ms(16) },
  batchName:    { ...T.sectionHeading, color: C.muted, marginBottom: ms(4) },
  // Full spelled-out date ("Monday, 10 August 2026") — a timestamp-like
  // value, not a headline. Dropped twice now (cardTitle 15 → listItemTitle
  // 14 → chipText 11) to read at the compact, dense scale a coaching-app
  // info screen calls for, rather than a hero figure. chipText (not
  // bodySmall) keeps a touch of semibold weight without a bespoke override.
  fullDate:     { ...T.chipText, color: C.text, marginBottom: ms(3) },
  timeRange:    { ...T.caption, color: C.muted, marginBottom: ms(10) },
  badgeRow:     { flexDirection: "row", gap: ms(8), flexWrap: "wrap" },
  statusBadge:  { flexDirection: "row", alignItems: "center", gap: ms(4), borderRadius: ms(6), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  statusBadgeT: { ...T.badgeText },
  typeBadge:    { flexDirection: "row", alignItems: "center", gap: ms(4), borderRadius: ms(6), paddingHorizontal: ms(8), paddingVertical: ms(3), backgroundColor: "#F3F4F6" },
  typeBadgeT:   { ...T.caption, color: C.muted },

  // Info card
  card: {
    backgroundColor: C.card,
    borderRadius:    ms(16),
    shadowColor:     C.text,
    shadowOffset:    { width: 0, height: ms(2) },
    shadowOpacity:   0.07,
    shadowRadius:    ms(8),
    elevation:       2,
    overflow:        "hidden",
  },
  divider:  { height: 1, backgroundColor: C.border, marginHorizontal: ms(12) },
  infoRow:  { flexDirection: "row", alignItems: "center", padding: ms(14), gap: ms(10) },
  infoIcon: { width: ms(34), height: ms(34), borderRadius: ms(9), alignItems: "center", justifyContent: "center" },
  infoLabel:{ ...T.sectionHeading, color: C.muted },
  // Was listItemTitle (14px) — one size down for the same denser, coaching-
  // app read as the rest of this pass; matches the tile-value fix already
  // applied to BatchDetailScreen/ManageSlotModal for consistency.
  infoValue:{ ...T.chipText, color: C.text, marginTop: 1 },

  // Cancel / notes
  cancelCard: {
    flexDirection: "row", gap: ms(8), alignItems: "flex-start",
    backgroundColor: C.redBg, borderRadius: ms(12), padding: ms(12),
  },
  cancelT: { flex: 1, ...T.bodySmall, color: C.red },

  notesCard:  { backgroundColor: C.card, borderRadius: ms(12), padding: ms(14), shadowColor: C.text, shadowOffset: { width: 0, height: ms(1) }, shadowOpacity: 0.05, shadowRadius: ms(4), elevation: 1 },
  notesLabel: { ...T.sectionHeading, color: C.muted, marginBottom: ms(4) },
  notesT:     { ...T.bodySmall, color: C.text },

  errorBox: {
    flexDirection: "row", gap: ms(8), alignItems: "flex-start",
    backgroundColor: C.redBg, borderRadius: ms(12), padding: ms(12),
  },
  errorT: { flex: 1, ...T.bodySmall, color: C.red },

  // Cancel input
  inputLabel:  { ...T.sectionHeading, color: C.muted, padding: ms(14), paddingBottom: ms(6) },
  reasonInput: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(8),
    marginHorizontal: ms(14), padding: ms(10), ...T.body, color: C.text,
    minHeight: ms(60), textAlignVertical: "top", backgroundColor: C.inputBg,
  },
  cancelConfirmRow: { flexDirection: "row", gap: ms(10), padding: ms(14), paddingTop: ms(10) },
  cancelAbort:      { flex: 1, height: ms(44), borderRadius: ms(10), borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  cancelAbortT:     { ...T.buttonText, color: C.muted },
  cancelConfirm:    { flex: 2, height: ms(44), borderRadius: ms(10), backgroundColor: C.red, alignItems: "center", justifyContent: "center" },
  cancelConfirmT:   { ...T.buttonText, color: "#FFFFFF" },

  // Actions
  actionsRow: { flexDirection: "column", gap: ms(10) },
  actionBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), height: ms(50), borderRadius: ms(12) },
  completeBtn:{ backgroundColor: C.green },
  cancelBtn:  { backgroundColor: C.redBg, borderWidth: 1, borderColor: C.red + "50" },
  actionBtnT: { ...T.buttonText, color: "#FFFFFF" },
  cancelBtnT: { ...T.buttonText, color: C.red },

  // Change chip on faculty row
  changeChip:  { paddingHorizontal: ms(9), paddingVertical: ms(4), borderRadius: ms(6), backgroundColor: colors.primary + "10", borderWidth: 1, borderColor: colors.primary + "30" },
  changeChipT: { ...T.badgeText, color: colors.primary },

  // Faculty picker sheet — was colors.bg (the tenant's configurable screen background),
  // which made this the only sheet in the app not rendering white like its siblings.
  pickerSheet: {
    backgroundColor: colors.card,
    paddingBottom: ms(24),
  },
  pickerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: ms(16), paddingBottom: ms(12),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  // One size down from the usual sheet-header cardTitle (15px) — this
  // screen's whole information density calls for the more compact scale.
  pickerTitle: { ...T.listItemTitle, color: C.text },
  pickerClose: { width: ms(32), height: ms(32), borderRadius: ms(8), alignItems: "center", justifyContent: "center", backgroundColor: C.inputBg },
  pickerSearch: {
    flexDirection: "row", alignItems: "center", gap: ms(8),
    marginHorizontal: ms(12), marginTop: ms(8), marginBottom: ms(4),
    backgroundColor: C.inputBg, borderRadius: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    paddingHorizontal: ms(10), height: ms(40),
  },
  pickerSearchInput: { flex: 1, ...T.body, color: C.text },
  pickerCenter: { alignItems: "center", justifyContent: "center", paddingVertical: ms(32) },
  pickerEmpty:  { ...T.body, color: C.muted },
  removeRow: {
    flexDirection: "row", alignItems: "center", gap: ms(8),
    marginHorizontal: ms(12), marginTop: ms(4), marginBottom: ms(2),
    paddingVertical: ms(10), paddingHorizontal: ms(12),
    borderRadius: ms(10), backgroundColor: C.redBg,
  },
  // Matches facultyName's size below (both one step down from listItemTitle).
  removeRowT: { ...T.body, color: C.red },
  facultyRow: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    padding: ms(12), borderRadius: ms(12),
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  facultyAvatar:   { width: ms(40), height: ms(40), borderRadius: ms(12), alignItems: "center", justifyContent: "center" },
  facultyInitials: { ...T.body },
  // One size down from listItemTitle (14px) for the same denser read.
  facultyName:     { ...T.body, color: C.text },
  facultyCode:     { ...T.caption, color: C.muted, marginTop: 1 },

  // Attendance
  attendanceHead:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: ms(14) },
  attendanceTitle:   { ...T.body, color: C.text },
  attendanceSummary: { ...T.chipText, color: C.green },
  attendanceBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(6),
    marginHorizontal: ms(14), marginBottom: ms(14), height: ms(40),
    borderRadius: ms(10), borderWidth: 1, borderColor: colors.primary + "40",
    backgroundColor: colors.primary + "0D",
  },
  // Was T.buttonText (15px) — per DESIGN_SYSTEM.md, buttonText is reserved
  // for full-width primary CTAs; this is a small tinted pill button, so it
  // belongs in the "compact action-row button label" bucket → chipText.
  attendanceBtnT: { ...T.chipText, color: colors.primary },
  attendanceRow: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    padding: ms(10), borderRadius: ms(12),
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  attendanceRowName: { flex: 1, ...T.body, color: C.text },
  attendanceToggle:  { flexDirection: "row", gap: ms(6) },
  attendanceToggleBtn: {
    paddingHorizontal: ms(10), paddingVertical: ms(7), borderRadius: ms(8),
    borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg,
  },
  attendanceToggleT: { ...T.chipText, color: C.muted },
  attendanceSaveWrap: { padding: ms(14), borderTopWidth: 1, borderTopColor: C.border },
  attendanceSaveBtn: {
    height: ms(48), borderRadius: ms(12), backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  attendanceSaveBtnT: { ...T.buttonText, color: "#fff" },
});

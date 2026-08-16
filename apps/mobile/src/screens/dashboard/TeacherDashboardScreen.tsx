import React, { useCallback, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl, Modal, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ms, fs } from "../../utils/responsive";
import { useAuth, type StaffRole } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import { useNotificationBadge } from "../../context/NotificationBadgeContext";
import type { RootStackParamList } from "../../navigation/types";
import { fetchTeacherDashboardStats, type TeacherDashboardStats, type TeacherClassSession } from "../../api/dashboard";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { BottomNav } from "../../components/ui/BottomNav";
import { StatTile } from "../../components/ui/StatTile";
import { T } from "../../components/ui/typography";
import { C } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import { ROLE_META } from "../../constants/roleMeta";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Design tokens ─────────────────────────────────────────────────────────────
const DARK = C.text;
const MID  = "#5A5450";
const MUTED = "#9A9490";

// ── Helpers ───────────────────────────────────────────────────────────────────
function firstWord(name: string) { return name.split(" ")[0]; }

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function sessionStatus(session: TeacherClassSession): { label: string; kind: "live" | "upcoming" | "done" | "cancelled" } {
  if (session.status === "cancelled") return { label: "Cancelled", kind: "cancelled" };
  if (session.status === "completed") return { label: "Done", kind: "done" };
  const now = new Date().toTimeString().slice(0, 5);
  if (now >= session.startTime && now <= session.endTime) return { label: "Live", kind: "live" };
  if (now < session.startTime) return { label: "Upcoming", kind: "upcoming" };
  return { label: "Scheduled", kind: "upcoming" };
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function TeacherDashboardScreen() {
  const colors = useThemeColors();
  const primarySoft = colors.primary + "1A"; // ~10% opacity badge background
  const insets = useSafeAreaInsets();
  const { staff, currentCenter, isAllCenters, switchCenter, selectRole, hasMultipleCenters } = useAuth();
  const { showAlert } = useAlert();
  const navigation = useNavigation<Nav>();
  const name = staff?.fullName ?? "Teacher";
  const firstName = firstWord(name);

  const [switchingRole, setSwitchingRole] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  async function handleSwitchCenter() {
    try { await switchCenter(); }
    catch { showAlert("Error", "Could not load centers. Please try again.", "error"); }
  }

  const [stats, setStats]           = useState<TeacherDashboardStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(false);
  const { unreadCount } = useNotificationBadge();

  // Lets the "Classes Today" / "Live Now" tiles jump straight to the
  // Today's Schedule card further down this same screen, rather than
  // needing a separate "my schedule" screen that doesn't exist yet.
  const scrollRef = useRef<ScrollView>(null);
  const scheduleY = useRef(0);
  function scrollToSchedule() {
    scrollRef.current?.scrollTo({ y: scheduleY.current, animated: true });
  }

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const data = await fetchTeacherDashboardStats();
      setStats(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRefetchOnReconnect(() => load(true));

  function handleProfilePress() {
    navigation.navigate("Profile");
  }

  async function handleSelectRole(role: StaffRole) {
    if (role === staff?.activeRole) return;
    setSwitchingRole(true);
    try { await selectRole(role); }
    catch { showAlert("Error", "Could not switch role. Please try again.", "error"); }
    finally { setSwitchingRole(false); }
  }

  function handleBatchPress(batch: { id: string; name: string }) {
    navigation.navigate("BatchSchedule", { batchId: batch.id, batchName: batch.name });
  }

  const linked = stats?.linked === true;
  const classesToday  = linked ? stats.classesToday  : [];
  const myBatches     = linked ? stats.myBatches     : [];
  const totalBatches  = linked ? stats.totalBatches  : 0;
  const totalStudents = linked ? stats.totalStudents : 0;
  const liveCount = classesToday.filter((c) => sessionStatus(c).kind === "live").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: ms(20) }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {/* ── Top bar ── */}
          <View style={[s.topBar, { paddingTop: insets.top + ms(12) }]}>
            <TouchableOpacity
              style={[s.topAvatar, !staff?.photoUrl && { backgroundColor: colors.primary }]}
              onPress={handleProfilePress}
              activeOpacity={0.8}
            >
              {staff?.photoUrl
                ? <Image source={{ uri: staff.photoUrl }} style={s.topAvatarImg} />
                : <Text style={s.topAvatarT}>{initials(name)}</Text>}
            </TouchableOpacity>

            <View style={s.topMid}>
              <View style={s.hiRow}>
                <Text style={s.hiLine}>{greeting()}, {firstName} 👋</Text>
              </View>
              <View style={s.hiRow2}>
                {hasMultipleCenters ? (
                  <TouchableOpacity
                    style={[s.centerChip, { backgroundColor: primarySoft }]}
                    onPress={handleSwitchCenter}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Switch center"
                  >
                    <Ionicons name="business-outline" size={ms(12)} color={colors.primary} />
                    <Text style={[s.centerChipT, { color: colors.primary }]} numberOfLines={1}>
                      {isAllCenters ? "All Centers" : currentCenter?.name ?? "—"}
                    </Text>
                    <Ionicons name="chevron-down" size={ms(11)} color={colors.primary} />
                  </TouchableOpacity>
                ) : (
                  <View style={[s.centerChip, { backgroundColor: primarySoft }]}>
                    <Ionicons name="business-outline" size={ms(12)} color={colors.primary} />
                    <Text style={[s.centerChipT, { color: colors.primary }]} numberOfLines={1}>
                      {isAllCenters ? "All Centers" : currentCenter?.name ?? "—"}
                    </Text>
                  </View>
                )}
                {staff && staff.roles.length > 1 ? (
                  <TouchableOpacity
                    style={[s.roleBadge, { backgroundColor: primarySoft }]}
                    onPress={() => setRoleModalOpen(true)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Switch active role"
                  >
                    <Text style={[s.roleBadgeT, { color: colors.primary }]} numberOfLines={1}>
                      {staff.activeRole.charAt(0).toUpperCase() + staff.activeRole.slice(1)}
                    </Text>
                    <Ionicons name="chevron-down" size={ms(11)} color={colors.primary} />
                  </TouchableOpacity>
                ) : (
                  <View style={[s.roleBadge, { backgroundColor: primarySoft }]}>
                    <Text style={[s.roleBadgeT, { color: colors.primary }]}>
                      {staff?.roles?.[0]
                        ? staff.roles[0].charAt(0).toUpperCase() + staff.roles[0].slice(1)
                        : "Teacher"}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={s.bellWrap}
              onPress={() => navigation.navigate("Notifications")}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={ms(20)} color={DARK} />
              {unreadCount > 0 && (
                <View style={s.bellBadge}>
                  <Text style={s.bellBadgeT}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Loading / Error / Not linked ── */}
          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: ms(40) }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : error ? (
            <View style={s.card}>
              <ListErrorState title="Failed to load dashboard" onRetry={() => load()} />
            </View>
          ) : !linked ? (
            <View style={s.card}>
              <View style={s.notLinkedIcon}>
                <Ionicons name="link-outline" size={ms(24)} color={MUTED} />
              </View>
              <Text style={s.notLinkedTitle}>Not linked yet</Text>
              <Text style={s.notLinkedSub}>
                Your account isn't linked to a faculty profile yet. Ask your admin to link it from Faculty settings so you can see your classes and batches here.
              </Text>
            </View>
          ) : (
            <>
              {/* ── Stat tiles — one row, only the 3 numbers the teacher API
                  actually returns. "Live now" used to also get its own tile
                  plus a separate banner below; that's now folded into just
                  this tile's sub-text, the single place it's shown. ── */}
              <View style={s.tilesRow}>
                <StatTile
                  icon="calendar-outline"
                  value={String(classesToday.length)}
                  label="Classes Today"
                  bg="#EDE8FA" iconBg="#DDD5F4" iconColor={colors.primary}
                  sub={liveCount > 0 ? `${liveCount} live now` : "None live now"}
                  subUp={liveCount > 0}
                  onPress={scrollToSchedule}
                />
                <StatTile
                  icon="layers-outline"
                  value={String(totalBatches)}
                  label="My Batches"
                  bg="#E6EFF0" iconBg="#CFE8E5" iconColor="#1B7A72"
                  onPress={() => navigation.navigate("BatchList" as any)}
                />
                <StatTile
                  icon="school-outline"
                  value={String(totalStudents)}
                  label="My Students"
                  bg="#FCEAE8" iconBg="#F8D5D2" iconColor="#B03A2E"
                  sub={`Across ${totalBatches} batch${totalBatches !== 1 ? "es" : ""}`}
                  subUp={totalStudents > 0}
                  onPress={() => navigation.navigate("StudentList" as any)}
                />
              </View>

              {/* No Quick Actions section: My Batches/Students/Profile are
                  already one tap away via the stat tiles above and the
                  bottom tab bar, and "Subjects" — the one destination that
                  used to live here with no other path — was removed because
                  teacher has no permission grant for that screen (subjects.read
                  is admin/frontdesk-only; the API would 403 the request). */}

              {/* ── Today's Schedule ── */}
              <View style={s.card} onLayout={(e) => { scheduleY.current = e.nativeEvent.layout.y; }}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>Today's Schedule</Text>
                </View>

                {classesToday.length === 0 ? (
                  <View style={s.emptyBlock}>
                    <Ionicons name="calendar-outline" size={ms(28)} color={C.border} />
                    <Text style={s.emptyT}>No classes scheduled today</Text>
                  </View>
                ) : (
                  classesToday.map((session, i) => {
                    const st = sessionStatus(session);
                    return (
                      <TouchableOpacity
                        key={session.id}
                        style={[s.classRow, i < classesToday.length - 1 && s.classDiv]}
                        onPress={() => handleBatchPress(session.batch)}
                        activeOpacity={0.7}
                      >
                        <View style={[s.classIco, { backgroundColor: colors.primary + "15" }]}>
                          <Ionicons name="book-outline" size={ms(16)} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.classSubj} numberOfLines={2}>
                            {session.subject?.name ?? "Class"}
                          </Text>
                          <View style={[s.classChip, s.classChipStandalone, { backgroundColor: colors.primary + "14" }]}>
                            <Ionicons name="layers-outline" size={ms(10)} color={colors.primary} style={s.classChipIcon} />
                            <Text style={[s.classChipT, { color: colors.primary }]} numberOfLines={1}>{session.batch.name}</Text>
                          </View>
                          <View style={s.classChipsRow}>
                            {session.room && (
                              <View style={[s.classChip, { backgroundColor: C.blueBg }]}>
                                <Ionicons name="location-outline" size={ms(10)} color={C.blue} style={s.classChipIcon} />
                                <Text style={[s.classChipT, { color: C.blue }]} numberOfLines={1}>{session.room}</Text>
                              </View>
                            )}
                            <View style={[s.classChip, { backgroundColor: C.orangeBg }]}>
                              <Ionicons name="time-outline" size={ms(10)} color={C.orange} style={s.classChipIcon} />
                              <Text style={[s.classChipT, { color: C.orange }]} numberOfLines={1}>{formatTime(session.startTime)}</Text>
                            </View>
                            <View style={[s.statusChip, s[`status_${st.kind}` as const]]}>
                              <Text style={[s.statusChipT, s[`statusT_${st.kind}` as const]]}>{st.label}</Text>
                            </View>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={ms(15)} color={MUTED} />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              {/* ── My Batches ── */}
              <View style={s.card}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>My Batches</Text>
                </View>

                {myBatches.length === 0 ? (
                  <View style={s.emptyBlock}>
                    <Ionicons name="layers-outline" size={ms(28)} color={C.border} />
                    <Text style={s.emptyT}>No batches assigned yet</Text>
                  </View>
                ) : (
                  myBatches.map((batch, i) => (
                    <TouchableOpacity
                      key={batch.id}
                      style={[s.batchRow, i < myBatches.length - 1 && s.classDiv]}
                      onPress={() => handleBatchPress(batch)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.batchIco, { backgroundColor: colors.primary + "15" }]}>
                        <Ionicons name="layers-outline" size={ms(16)} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.batchName} numberOfLines={1}>{batch.name}</Text>
                        <Text style={s.batchSub} numberOfLines={1}>
                          {batch.courseName} · {batch.studentCount} student{batch.studentCount !== 1 ? "s" : ""}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={ms(15)} color={MUTED} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* ── Bottom nav ── */}
        <BottomNav
          items={[
            { key: "home",     icon: "home",           label: "Home",     active: true, onPress: () => {} },
            { key: "batches",  icon: "layers-outline",  label: "Batches",  onPress: () => navigation.navigate("BatchList" as any) },
            { key: "students", icon: "school-outline",  label: "Students", onPress: () => navigation.navigate("StudentList" as any) },
            { key: "profile",  icon: "person-outline",  label: "Profile",  onPress: handleProfilePress },
          ]}
        />
      </View>

      {/* Role switcher — tapping the role badge above opens this. Switching
          hits the API (see AuthContext.selectRole) and re-scopes access
          control everywhere in the app, not just this screen's content. */}
      <Modal visible={roleModalOpen} transparent animationType="fade" onRequestClose={() => setRoleModalOpen(false)}>
        <TouchableOpacity
          style={rms.backdrop}
          activeOpacity={1}
          onPress={() => !switchingRole && setRoleModalOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[rms.sheet, { backgroundColor: colors.card }]}>
            <View style={rms.header}>
              <View style={[rms.headerIcon, { backgroundColor: colors.primary + "17" }]}>
                <Ionicons name="swap-horizontal-outline" size={ms(21)} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[rms.title, { color: colors.text }]}>Switch Role</Text>
                <Text style={[rms.subtitle, { color: colors.muted }]}>Choose which role is currently active</Text>
              </View>
              <TouchableOpacity
                style={rms.closeBtn}
                onPress={() => !switchingRole && setRoleModalOpen(false)}
                disabled={switchingRole}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={ms(18)} color={C.muted} />
              </TouchableOpacity>
            </View>
            {(staff?.roles ?? []).map((r) => {
              const m = ROLE_META[r];
              const active = staff?.activeRole === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[rms.roleRow, active && { backgroundColor: m.bg }]}
                  onPress={async () => {
                    if (active) { setRoleModalOpen(false); return; }
                    await handleSelectRole(r);
                    setRoleModalOpen(false);
                  }}
                  disabled={switchingRole}
                  activeOpacity={0.75}
                >
                  <View style={[rms.roleIcon, { backgroundColor: m.color }]}>
                    <Ionicons name={m.icon as any} size={ms(16)} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[rms.roleLabel, { color: colors.text }]}>{m.label}</Text>
                    <Text style={[rms.roleDesc, { color: colors.muted }]} numberOfLines={1}>{m.desc}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={20} color={m.color} />}
                  {switchingRole && !active && <ActivityIndicator size="small" color={C.muted} />}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── Top bar ──────────────────────────────────────────────────────────────
  topBar: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: ms(16),
    paddingBottom:     ms(12),
  },
  // Fixed square (not alignSelf: "stretch" tracking topMid's two-line
  // height) — mirrors the admin dashboard's own avatar fix: a stretched
  // tall rectangle read fine for centered initials but visibly distorts a
  // cover-fit profile photo.
  topAvatar: {
    width: ms(38), height: ms(38), borderRadius: ms(12),
    justifyContent: "center", alignItems: "center", flexShrink: 0,
    marginRight: ms(10), overflow: "hidden",
  },
  topAvatarT: { ...T.listItemTitle, color: "#fff" },
  topAvatarImg: { width: "100%", height: "100%", borderRadius: ms(12) },
  topMid: { flex: 1, marginRight: ms(10) },
  hiRow:  { flexDirection: "row", alignItems: "center", gap: ms(8) },
  hiRow2: { flexDirection: "row", alignItems: "center", gap: ms(6), marginTop: ms(4) },
  hiLine: { ...T.cardTitle, color: DARK },
  // Filled pill + chevron so this reads as a control, not a label, when
  // there's actually something to switch to.
  centerChip: {
    flexDirection: "row", alignItems: "center", gap: ms(4),
    borderRadius: ms(10), paddingHorizontal: ms(8), paddingVertical: ms(3),
  },
  centerChipT: { ...T.caption },
  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: ms(4),
    borderRadius: ms(10), paddingHorizontal: ms(10), paddingVertical: ms(4),
  },
  roleBadgeT: { ...T.caption },
  bellWrap: {
    width: ms(40), height: ms(40), borderRadius: ms(20),
    backgroundColor: C.card,
    justifyContent: "center", alignItems: "center",
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(2) },
    shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2,
  },
  bellBadge: {
    position: "absolute", top: -ms(3), right: -ms(3), minWidth: ms(16), height: ms(16),
    borderRadius: ms(8), paddingHorizontal: ms(3), backgroundColor: C.red,
    justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: C.card,
  },
  bellBadgeT: { ...T.badgeText, color: "#fff" },

  // ── Tile grid ─────────────────────────────────────────────────────────────
  tilesRow: { flexDirection: "row", gap: ms(10), marginHorizontal: ms(16), marginTop: ms(6), marginBottom: ms(14) },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    marginHorizontal: ms(16), marginBottom: ms(14),
    backgroundColor: C.card, borderRadius: ms(22), padding: ms(16),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(4) },
    shadowOpacity: 0.06, shadowRadius: ms(10), elevation: 2,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(4) },
  cardTitle: { ...T.cardTitle, color: DARK, marginBottom: ms(2) },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyBlock: { alignItems: "center", paddingVertical: ms(24), gap: ms(8) },
  emptyT:     { ...T.helperText, color: C.placeholder },

  // ── Schedule rows ─────────────────────────────────────────────────────────
  classRow:  { flexDirection: "row", alignItems: "center", gap: ms(12), paddingVertical: ms(11) },
  classDiv:  { borderBottomWidth: 1, borderBottomColor: C.border },
  classIco:  { width: ms(36), height: ms(36), borderRadius: ms(11), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  classSubj: { ...T.listItemTitle, color: DARK, marginBottom: 4 },
  // Room/time/status all sit in one wrapping row — wrap (not a fixed width
  // per chip) since a session may or may not have a room, and status label
  // length varies (SCHEDULED/LIVE/DONE/CANCELLED), unlike the admin
  // dashboard's Today's Classes row where only two chips ever share the row.
  classChipsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: ms(6), marginTop: ms(4) },
  classChipStandalone: { alignSelf: "flex-start", marginTop: ms(3), marginBottom: ms(4) },
  classChip: {
    flexDirection: "row", alignItems: "center",
    borderRadius: ms(8), paddingHorizontal: ms(7), paddingVertical: ms(3),
  },
  classChipIcon: { marginRight: ms(4) },
  classChipT: { ...T.chipText },

  statusChip:        { paddingHorizontal: ms(9), paddingVertical: ms(4), borderRadius: ms(999), flexShrink: 0 },
  statusChipT:       { ...T.badgeText },
  status_live:       { backgroundColor: C.greenBg },
  statusT_live:      { color: C.green },
  status_upcoming:   { backgroundColor: "#FDF1D6" },
  statusT_upcoming:  { color: "#9A6B00" },
  status_done:       { backgroundColor: "#F0ECEA" },
  statusT_done:      { color: MUTED },
  status_cancelled:  { backgroundColor: "#FDEDEB" },
  statusT_cancelled: { color: C.red },

  // ── Batch rows ────────────────────────────────────────────────────────────
  batchRow:  { flexDirection: "row", alignItems: "center", gap: ms(12), paddingVertical: ms(12) },
  batchIco:  { width: ms(34), height: ms(34), borderRadius: ms(10), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  batchName: { ...T.listItemTitle, color: DARK },
  batchSub:  { ...T.caption, color: MUTED, marginTop: ms(1) },

  // ── Not linked ────────────────────────────────────────────────────────────
  notLinkedIcon:  { width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: C.border, justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: ms(12) },
  notLinkedTitle: { ...T.cardTitle, color: DARK, textAlign: "center", marginBottom: ms(6) },
  notLinkedSub:   { ...T.helperText, color: MUTED, textAlign: "center" },
});

// ── Role switcher modal ──────────────────────────────────────────────────────
const rms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), padding: ms(20), gap: ms(4) },
  header: { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(6) },
  headerIcon: { width: ms(44), height: ms(44), borderRadius: ms(12), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  closeBtn: { width: ms(34), height: ms(34), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  title: { ...T.cardTitle },
  subtitle: { ...T.caption, marginTop: ms(2) },
  roleRow: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingVertical: ms(10), paddingHorizontal: ms(10), borderRadius: ms(12) },
  roleIcon: { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  roleLabel: { ...T.listItemTitle },
  roleDesc: { ...T.caption, marginTop: ms(1) },
});

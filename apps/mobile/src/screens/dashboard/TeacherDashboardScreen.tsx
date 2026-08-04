import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ms, fs } from "../../utils/responsive";
import { useAuth } from "../../context/AuthContext";
import type { RootStackParamList } from "../../navigation/types";
import { fetchTeacherDashboardStats, type TeacherDashboardStats, type TeacherClassSession } from "../../api/dashboard";
import { fetchUnreadCount } from "../../api/notifications";
import * as Notifications from "expo-notifications";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { BottomNav } from "../../components/ui/BottomNav";
import { C } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";

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

// ── Pastel stat tile ──────────────────────────────────────────────────────────
function StatTile({
  icon, value, label, bg, iconBg, iconColor, sub, subUp, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  bg: string; iconBg: string; iconColor: string;
  sub?: string; subUp?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[tile.wrap, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[tile.icoWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={ms(18)} color={iconColor} />
      </View>
      <Text style={[tile.val, { color: iconColor }]}>{value}</Text>
      <Text style={tile.lbl}>{label}</Text>
      {sub !== undefined && (
        <View style={tile.subRow}>
          <Ionicons
            name={subUp ? "trending-up" : "remove-outline"}
            size={ms(10)}
            color={subUp ? C.green : MUTED}
          />
          <Text style={[tile.subT, { color: subUp ? C.green : MUTED }]}>{" " + sub}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const tile = StyleSheet.create({
  wrap:   { flex: 1, borderRadius: ms(18), padding: ms(14), gap: ms(5), minHeight: ms(110) },
  icoWrap:{ width: ms(36), height: ms(36), borderRadius: ms(12), justifyContent: "center", alignItems: "center" },
  val:    { fontSize: fs(20), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: -0.5 },
  lbl:    { fontSize: fs(10), color: MID, fontFamily: "Inter_600SemiBold", fontWeight: "600", letterSpacing: 0.1 },
  subRow: { flexDirection: "row", alignItems: "center", marginTop: ms(2) },
  subT:   { fontSize: fs(10), fontFamily: "Inter_700Bold", fontWeight: "700" },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export function TeacherDashboardScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { staff } = useAuth();
  const navigation = useNavigation<Nav>();
  const name = staff?.fullName ?? "Teacher";
  const firstName = firstWord(name);

  const [stats, setStats]           = useState<TeacherDashboardStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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
  useFocusEffect(useCallback(() => { fetchUnreadCount().then(setUnreadCount).catch(() => {}); }, []));
  useRefetchOnReconnect(() => load(true));

  // Refresh bell count immediately when a push notification arrives — no
  // navigation needed.
  useEffect(() => {
    let sub: Notifications.EventSubscription | null = null;
    try {
      sub = Notifications.addNotificationReceivedListener(() => {
        fetchUnreadCount().then(setUnreadCount).catch(() => {});
      });
    } catch {}
    return () => { sub?.remove(); };
  }, []);

  function handleProfilePress() {
    navigation.navigate("Profile");
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
              style={[s.topAvatar, { backgroundColor: colors.primary }]}
              onPress={handleProfilePress}
              activeOpacity={0.8}
            >
              <Text style={s.topAvatarT}>{initials(name)}</Text>
            </TouchableOpacity>

            <View style={s.topMid}>
              <Text style={s.hiLine}>Hi {firstName} 👋</Text>
              <Text style={s.subLine}>Teacher Dashboard</Text>
            </View>

            <TouchableOpacity
              style={s.bellWrap}
              onPress={() => navigation.navigate("Notifications")}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={ms(20)} color={DARK} />
              {unreadCount > 0 && <View style={s.bellDot} />}
            </TouchableOpacity>
          </View>

          {/* ── Hero headline ── */}
          <View style={s.hero}>
            <Text style={s.heroLine1}>Your classes</Text>
            <Text style={s.heroLine2}>
              today <Text style={s.heroItalic}>look great</Text>
            </Text>
          </View>

          {/* ── Stats strip card ── */}
          <View style={s.statsCard}>
            {loading ? (
              <View style={s.statsSkel} />
            ) : (
              <View style={s.statsRow}>
                <View style={s.statCol}>
                  <Text style={s.statColVal}>{classesToday.length}</Text>
                  <Text style={s.statColLbl}>Classes Today</Text>
                </View>
                <View style={s.statSep} />
                <View style={s.statCol}>
                  <Text style={s.statColVal}>{totalBatches}</Text>
                  <Text style={s.statColLbl}>My Batches</Text>
                </View>
                <View style={s.statSep} />
                <View style={s.statCol}>
                  <Text style={s.statColVal}>{totalStudents}</Text>
                  <Text style={s.statColLbl}>My Students</Text>
                </View>
              </View>
            )}
          </View>

          {/* ── Quick-access chips ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.quickRow}
          >
            {([
              { label: "My Batches", icon: "layers-outline"  as const, nav: "BatchList"   as const, color: colors.primary },
              { label: "Students",   icon: "school-outline"  as const, nav: "StudentList" as const, color: "#946200"      },
              { label: "Subjects",   icon: "library-outline" as const, nav: "SubjectList" as const, color: colors.accent  },
              { label: "Profile",    icon: "person-outline"  as const, nav: "Profile"     as const, color: C.blue         },
            ]).map((q) => (
              <TouchableOpacity
                key={q.label}
                style={s.quickChip}
                onPress={() => navigation.navigate(q.nav as any)}
                activeOpacity={0.72}
              >
                <View style={[s.quickIco, { backgroundColor: q.color + "1A" }]}>
                  <Ionicons name={q.icon} size={ms(14)} color={q.color} />
                </View>
                <Text style={s.quickLbl}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

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
              {/* ── 4 Pastel stat tiles ── */}
              <View style={s.tilesGrid}>
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
                    sub="Assigned to you"
                    subUp={false}
                    onPress={() => navigation.navigate("BatchList" as any)}
                  />
                </View>
                <View style={s.tilesRow}>
                  <StatTile
                    icon="school-outline"
                    value={String(totalStudents)}
                    label="My Students"
                    bg="#FCEAE8" iconBg="#F8D5D2" iconColor="#B03A2E"
                    sub={`Across ${totalBatches} batch${totalBatches !== 1 ? "es" : ""}`}
                    subUp={totalStudents > 0}
                    onPress={() => navigation.navigate("StudentList" as any)}
                  />
                  <StatTile
                    icon="radio-outline"
                    value={String(liveCount)}
                    label="Live Now"
                    bg={C.greenBg} iconBg="#C8EFD9" iconColor={C.green}
                    sub={liveCount > 0 ? "In session" : "No live class"}
                    subUp={liveCount > 0}
                    onPress={scrollToSchedule}
                  />
                </View>
              </View>

              {/* ── Live banner ── */}
              {liveCount > 0 && (
                <View style={s.liveBanner}>
                  <View style={s.liveDot} />
                  <Text style={s.liveBannerT}>
                    {liveCount} class{liveCount > 1 ? "es" : ""} live right now
                  </Text>
                </View>
              )}

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
                        <View style={s.timeBlock}>
                          <Text style={s.timeT}>{formatTime(session.startTime)}</Text>
                        </View>
                        <View style={s.vDiv} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.classSubj} numberOfLines={1}>
                            {session.subject?.name ?? "Class"}
                          </Text>
                          <Text style={s.classMeta} numberOfLines={1}>
                            {session.batch.name}{session.room ? ` · Room ${session.room}` : ""}
                          </Text>
                        </View>
                        <View style={[s.statusChip, s[`status_${st.kind}` as const]]}>
                          <Text style={[s.statusChipT, s[`statusT_${st.kind}` as const]]}>{st.label}</Text>
                        </View>
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
                      <Text style={s.batchName} numberOfLines={1}>{batch.name}</Text>
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
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── Top bar ──────────────────────────────────────────────────────────────
  topBar: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: ms(20),
    paddingBottom:     ms(8),
  },
  topAvatar: {
    width: ms(42), height: ms(42), borderRadius: ms(21),
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  topAvatarT: { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff" },
  topMid:  { flex: 1, marginLeft: ms(10) },
  hiLine:  { fontSize: fs(15), fontFamily: "Inter_700Bold", fontWeight: "700", color: DARK },
  subLine: { fontSize: fs(11), color: MUTED, marginTop: ms(1) },
  bellWrap: {
    width: ms(40), height: ms(40), borderRadius: ms(20),
    backgroundColor: C.card,
    justifyContent: "center", alignItems: "center",
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(2) },
    shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2,
  },
  bellDot: {
    position: "absolute", top: ms(9), right: ms(9),
    width: ms(8), height: ms(8), borderRadius: ms(4),
    backgroundColor: "#E84040", borderWidth: 1.5, borderColor: "#fff",
  },

  // ── Hero ─────────────────────────────────────────────────────────────────
  hero: { paddingHorizontal: ms(20), paddingTop: ms(10), marginBottom: ms(20) },
  heroLine1:  { fontSize: fs(31), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: DARK, lineHeight: fs(38), letterSpacing: -0.5 },
  heroLine2:  { fontSize: fs(31), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: DARK, lineHeight: fs(40), letterSpacing: -0.5 },
  heroItalic: { fontStyle: "italic" },

  // ── Stats strip card ──────────────────────────────────────────────────────
  statsCard: {
    marginHorizontal: ms(16), marginBottom: ms(14),
    backgroundColor: C.card, borderRadius: ms(22), padding: ms(16),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(4) },
    shadowOpacity: 0.08, shadowRadius: ms(14), elevation: 3,
  },
  statsSkel: { height: ms(44), backgroundColor: "#F0EBE5", borderRadius: ms(10) },
  statsRow:  { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  statCol:   { flex: 1, alignItems: "center", paddingVertical: ms(6) },
  statColVal:{ fontSize: fs(18), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: DARK },
  statColLbl:{ fontSize: fs(10), color: MUTED, fontFamily: "Inter_600SemiBold", fontWeight: "600", marginTop: ms(2), textTransform: "uppercase", letterSpacing: 0.3 },
  statSep:   { width: 1, height: ms(30), backgroundColor: "#F0EAE4" },

  // ── Quick chips ───────────────────────────────────────────────────────────
  quickRow: { paddingHorizontal: ms(16), paddingBottom: ms(14), gap: ms(8) },
  quickChip: {
    flexDirection: "row", alignItems: "center", gap: ms(7),
    backgroundColor: C.card, borderRadius: ms(24),
    paddingHorizontal: ms(13), paddingVertical: ms(9),
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(1) },
    shadowOpacity: 0.05, shadowRadius: ms(4), elevation: 1,
  },
  quickIco: { width: ms(26), height: ms(26), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },
  quickLbl: { fontSize: fs(12.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: DARK },

  // ── Tile grid ─────────────────────────────────────────────────────────────
  tilesGrid: { marginHorizontal: ms(16), marginBottom: ms(14), gap: ms(10) },
  tilesRow:  { flexDirection: "row", gap: ms(10) },

  // ── Live banner ───────────────────────────────────────────────────────────
  liveBanner:  { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.greenBg, borderRadius: ms(12), paddingHorizontal: ms(16), paddingVertical: ms(10), marginHorizontal: ms(16), marginBottom: ms(14) },
  liveDot:     { width: ms(8), height: ms(8), borderRadius: ms(4), backgroundColor: C.green },
  liveBannerT: { fontSize: fs(12.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: "#127045" },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    marginHorizontal: ms(16), marginBottom: ms(14),
    backgroundColor: C.card, borderRadius: ms(22), padding: ms(16),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(4) },
    shadowOpacity: 0.06, shadowRadius: ms(10), elevation: 2,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(4) },
  cardTitle: { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: DARK, marginBottom: ms(2) },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyBlock: { alignItems: "center", paddingVertical: ms(24), gap: ms(8) },
  emptyT:     { fontSize: fs(12.5), color: C.placeholder, fontFamily: "Inter_600SemiBold", fontWeight: "600" },

  // ── Schedule rows ─────────────────────────────────────────────────────────
  classRow:  { flexDirection: "row", alignItems: "center", gap: ms(12), paddingVertical: ms(11) },
  classDiv:  { borderBottomWidth: 1, borderBottomColor: C.border },
  timeBlock: { width: ms(58), flexShrink: 0 },
  timeT:     { fontSize: fs(12.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: DARK },
  vDiv:      { width: 1, alignSelf: "stretch", backgroundColor: C.border },
  classSubj: { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700", color: DARK, marginBottom: 2 },
  classMeta: { fontSize: fs(11), color: MUTED },

  statusChip:        { paddingHorizontal: ms(9), paddingVertical: ms(4), borderRadius: ms(999), flexShrink: 0 },
  statusChipT:       { fontSize: fs(9.5), fontFamily: "Inter_700Bold", fontWeight: "700" },
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
  batchName: { flex: 1, fontSize: fs(13.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: DARK },

  // ── Not linked ────────────────────────────────────────────────────────────
  notLinkedIcon:  { width: ms(52), height: ms(52), borderRadius: ms(26), backgroundColor: C.border, justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: ms(12) },
  notLinkedTitle: { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: DARK, textAlign: "center", marginBottom: ms(6) },
  notLinkedSub:   { fontSize: fs(12.5), color: MUTED, textAlign: "center", lineHeight: fs(18) },
});

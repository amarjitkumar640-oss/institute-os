import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Dimensions, ActivityIndicator, RefreshControl, Animated,
} from "react-native";
import { ms, fs } from "../../utils/responsive";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import type { RootStackParamList } from "../../navigation/types";
import { fetchDashboardStats, type DashboardStats } from "../../api/dashboard";
import { fetchUnreadCount } from "../../api/notifications";
import * as Notifications from "expo-notifications";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { C } from "../../theme";
import { useThemeColors, type ThemeColors } from "../../context/ThemeContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import { TeacherDashboardScreen } from "./TeacherDashboardScreen";
import { BottomNav } from "../../components/ui/BottomNav";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const { width: W } = Dimensions.get("window");
const CHART_W = W - ms(64);

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG = C.bg;
const DARK = C.text;
const MID = "#5A5450";
const MUTED = "#9A9490";

// ── Helpers ───────────────────────────────────────────────────────────────────
function firstWord(name: string) { return name.split(" ")[0]; }

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function formatFees(amount: number): string {
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(2)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatCount(n: number): string {
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BarChart({ data, primaryColor }: { data: { label: string; count: number }[]; primaryColor: string }) {
  const cH = ms(110);
  const n = data.length;
  const gap = ms(5);
  const bW = (CHART_W - gap * (n - 1)) / n;
  const max = Math.max(...data.map((d) => d.count), 1);
  const hiIdx = data.length - 1;

  return (
    <View>
      <Svg width={CHART_W} height={cH}>
        <Defs>
          <SvgGrad id="barPrimary" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={primaryColor} stopOpacity="1" />
            <Stop offset="100%" stopColor={primaryColor} stopOpacity="0.65" />
          </SvgGrad>
          <SvgGrad id="barMuted" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#E8E3DE" />
            <Stop offset="100%" stopColor="#D8D0C8" />
          </SvgGrad>
        </Defs>
        {data.map((d, i) => {
          const bH = Math.max((d.count / max) * (cH - ms(10)), d.count > 0 ? ms(8) : ms(3));
          return (
            <Rect
              key={i}
              x={i * (bW + gap)}
              y={cH - bH}
              width={bW}
              height={bH}
              rx={ms(8)}
              fill={i === hiIdx ? "url(#barPrimary)" : "url(#barMuted)"}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: ms(8), width: CHART_W }}>
        {data.map((d, i) => (
          <Text
            key={i}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: fs(9),
              fontWeight: i === hiIdx ? "700" : "500",
              color: i === hiIdx ? primaryColor : MUTED,
            }}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ── Pastel stat tile ──────────────────────────────────────────────────────────
function StatTile({
  icon, value, label, bg, iconBg, iconColor, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  bg: string; iconBg: string; iconColor: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[st.tile, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.74 : 1}
    >
      <View style={[st.icoWrap, { backgroundColor: "#fff" }]}>
        <Ionicons name={icon} size={ms(24)} color={DARK} />
      </View>
      <Text style={st.val}>{value}</Text>
      <Text style={st.lbl}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  tile: { flex: 1, borderRadius: ms(20), padding: ms(14), gap: ms(12), minHeight: ms(118) },
  icoWrap: { width: ms(45), height: ms(45), borderRadius: ms(15), justifyContent: "center", alignItems: "center" },
  val: { fontSize: fs(19), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: -0.4, color: DARK },
  lbl: { fontSize: fs(10.5), color: MID, fontFamily: "Inter_500Medium", fontWeight: "500" },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export function DashboardScreen() {
  const colors = useThemeColors();
  const primarySoft = colors.primary + "1A"; // ~10% opacity badge background
  const insets = useSafeAreaInsets();
  const { staff, currentCenter, isAllCenters, switchCenter } = useAuth();
  const navigation = useNavigation<Nav>();

  if (staff?.role === "teacher") return <TeacherDashboardScreen />;

  const name = staff?.fullName ?? "Admin";
  const firstName = firstWord(name);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try { setStats(await fetchDashboardStats()); }
    catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusEffect(useCallback(() => { fetchUnreadCount().then(setUnread).catch(() => { }); }, []));
  useRefetchOnReconnect(() => load(true));

  // Refresh bell count immediately when a push notification arrives — no
  // navigation needed.
  useEffect(() => {
    let sub: Notifications.EventSubscription | null = null;
    try {
      sub = Notifications.addNotificationReceivedListener(() => {
        fetchUnreadCount().then(setUnread).catch(() => { });
      });
    } catch { }
    return () => { sub?.remove(); };
  }, []);

  const students = stats?.totalStudents ?? 0;
  const enrolled = stats?.totalEnrollments ?? 0;
  const activeB = stats?.activeBatches ?? 0;
  const fees = stats?.feesCollected ?? 0;

  const actIcon: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
    enrollment: { icon: "person-add-outline", color: colors.primary },
    faculty: { icon: "people-outline", color: C.orange },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <View style={{ flex: 1, backgroundColor: colors.bg }}>

        {/* ── Scroll content ────────────────────────────────────────────────── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: ms(110) }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[colors.primary]} tintColor={colors.primary}
            />
          }
        >
          {/* ── Top bar ── */}
          <View style={[s.topBar, { paddingTop: insets.top + ms(12) }]}>
            <TouchableOpacity
              style={[s.topAvatar, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate("Profile")}
              activeOpacity={0.8}
            >
              <Text style={s.topAvatarT}>{initials(name)}</Text>
            </TouchableOpacity>

            <View style={s.topMid}>
              <Text style={s.hiLine}>Hi {firstName} 👋</Text>
              <Text style={s.centerLine} numberOfLines={1}>
                {isAllCenters ? "All Centers" : currentCenter?.name ?? "—"}
              </Text>
            </View>

            <TouchableOpacity
              style={s.bellWrap}
              onPress={() => navigation.navigate("Notifications")}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={ms(20)} color={DARK} />
              {unread > 0 && <View style={s.bellDot} />}
            </TouchableOpacity>
          </View>

          {/* ── Hero headline ── */}
          <View style={s.hero}>
            <Text style={s.heroLine1}>Your institute</Text>
            <Text style={s.heroLine2}>
              journey <Text style={s.heroItalic}>starts here</Text>
            </Text>
          </View>

          {/* ── Profile overview card ── */}
          <View style={s.overviewCard}>
            <View style={s.ovTop}>
              <View style={[s.ovAvatar, { backgroundColor: colors.primary }]}>
                <Text style={s.ovAvatarT}>{initials(name)}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: ms(12) }}>
                <Text style={s.ovName} numberOfLines={1}>{name}</Text>
                <Text style={s.ovCenter} numberOfLines={1}>
                  {isAllCenters ? "All Centers" : currentCenter?.name ?? "—"}
                </Text>
              </View>
              <View style={[s.roleBadge, { backgroundColor: primarySoft }]}>
                <Text style={[s.roleBadgeT, { color: colors.primary }]}>
                  {staff?.role
                    ? staff.role.charAt(0).toUpperCase() + staff.role.slice(1)
                    : "Staff"}
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={s.ovSkelBar} />
            ) : (
              <>
                <View style={s.ovDivider} />
                <View style={s.ovStats}>
                  {[
                    { label: "Students", value: formatCount(students) },
                    { label: "Enrolled", value: formatCount(enrolled) },
                    { label: "Batches", value: String(activeB) },
                  ].map((item, idx) => (
                    <React.Fragment key={item.label}>
                      {idx > 0 && <View style={s.ovStatSep} />}
                      <View style={s.ovStat}>
                        <Text style={s.ovStatVal}>{item.value}</Text>
                        <Text style={s.ovStatLbl}>{item.label}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </>
            )}
          </View>

          {/* ── 3 Pastel stat tiles ── */}
          <View style={s.tilesRow}>
            {loading ? (
              [...Array(3)].map((_, i) => <View key={i} style={s.tileSkel} />)
            ) : (
              <>
                <StatTile
                  icon="school-outline"
                  value={formatCount(students)}
                  label="Students"
                  bg="#FCEAE8" iconBg="#F8D5D2" iconColor="#B03A2E"
                  onPress={() => navigation.navigate("StudentList")}
                />
                <StatTile
                  icon="layers-outline"
                  value={String(activeB)}
                  label="Active Batches"
                  bg="#EDE8FA" iconBg="#DDD5F4" iconColor={colors.primary}
                  onPress={() => navigation.navigate("BatchList", { initialFilter: "active" })}
                />
                <StatTile
                  icon="cash-outline"
                  value={formatFees(fees)}
                  label="Fees Collected"
                  bg="#E6EFF0" iconBg="#CFE8E5" iconColor="#1B7A72"
                  onPress={() => navigation.navigate("FeesList")}
                />
              </>
            )}
          </View>

          {/* ── Quick-access horizontal chips ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.quickRow}
          >
            {([
              { label: "Faculty", icon: "people-outline" as const, nav: "FacultyList" as const, color: C.orange },
              { label: "Courses", icon: "book-outline" as const, nav: "CourseList" as const, color: colors.primary },
              { label: "Subjects", icon: "library-outline" as const, nav: "SubjectList" as const, color: C.blue },
              { label: "Leads", icon: "funnel-outline" as const, nav: "Leads" as const, color: "#1B7A72" },
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

          {/* ── Loading / Error ── */}
          {loading && (
            <View style={{ alignItems: "center", paddingVertical: ms(40) }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
          {error && !loading && (
            <View style={s.card}>
              <ListErrorState title="Failed to load dashboard" onRetry={() => load()} />
            </View>
          )}

          {/* ── Enrollment chart ── */}
          {!loading && !error && stats && (
            <View style={s.card}>
              <View style={s.cardHead}>
                <View>
                  <Text style={s.cardTitle}>This Week's Activity</Text>
                  <Text style={s.cardSub}>Monthly enrollment trend</Text>
                </View>
                <View style={[s.amberTag, { backgroundColor: primarySoft }]}>
                  <Text style={[s.amberTagT, { color: colors.primary }]}>{enrolled} enrolled</Text>
                </View>
              </View>
              <View style={{ marginTop: ms(14) }}>
                <BarChart data={stats.monthlyEnrollments} primaryColor={colors.primary} />
              </View>
            </View>
          )}

          {/* ── Recent Activity ── */}
          {!loading && !error && stats && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Recent Activity</Text>
              {stats.recentActivity.length === 0 ? (
                <View style={s.emptyBox}>
                  <Ionicons name="pulse-outline" size={ms(32)} color="#D0CBC5" />
                  <Text style={s.emptyT}>No activity yet</Text>
                  <Text style={s.emptySub}>Activity appears as students enroll</Text>
                </View>
              ) : (
                stats.recentActivity.map((a, i) => {
                  const meta = actIcon[a.type] ?? { icon: "ellipse-outline" as const, color: MUTED };
                  return (
                    <View
                      key={i}
                      style={[
                        s.actRow,
                        i < stats.recentActivity.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
                      ]}
                    >
                      <View style={[s.actIco, { backgroundColor: meta.color + "18" }]}>
                        <Ionicons name={meta.icon} size={ms(16)} color={meta.color} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.actTitle} numberOfLines={1}>{a.title}</Text>
                        <Text style={s.actSub} numberOfLines={1}>{a.sub}</Text>
                      </View>
                      <Text style={s.actTime}>{relTime(a.time)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ── Per-center breakdown ── */}
          {!loading && !error && stats && isAllCenters && (stats.perCenter?.length ?? 0) > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Centers Overview</Text>
              {stats.perCenter!.map((c, i) => (
                <View
                  key={c.id}
                  style={[
                    s.actRow,
                    i < stats.perCenter!.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
                  ]}
                >
                  <View style={[s.actIco, { backgroundColor: colors.primary + "15" }]}>
                    <Ionicons name="business-outline" size={ms(16)} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.actTitle}>{c.name}</Text>
                    <Text style={s.actSub}>{c.students} students · {c.batches} batches · {c.enrollments} enrolled</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── Admin actions ── */}
          {!loading && !error && staff?.role === "admin" && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Admin</Text>
              {([
                { label: "Staff & Roles", sub: "Manage staff and permissions", icon: "shield-checkmark-outline" as const, color: colors.primary, nav: "StaffManagement" as const },
                { label: "Manage Centers", sub: "Create and assign centers", icon: "business-outline" as const, color: C.orange, nav: "CenterManagement" as const },
                { label: "Org Settings", sub: "Branding and login method", icon: "settings-outline" as const, color: C.blue, nav: "OrganizationSettings" as const },
              ] as const).map((item, i) => (
                <React.Fragment key={item.label}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: C.border, marginVertical: ms(2) }} />}
                  <TouchableOpacity
                    style={s.adminRow}
                    onPress={() => navigation.navigate(item.nav)}
                    activeOpacity={0.72}
                  >
                    <View style={[s.actIco, { backgroundColor: item.color + "15" }]}>
                      <Ionicons name={item.icon} size={ms(18)} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.actTitle}>{item.label}</Text>
                      <Text style={s.actSub}>{item.sub}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={ms(16)} color={MUTED} />
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          )}
        </ScrollView>

        {/* ── Bottom navigation ─────────────────────────────────────────────── */}
        <BottomNav
          items={[
            { key: "home", icon: "home", label: "Home", active: true, onPress: () => { } },
            { key: "students", icon: "school-outline", label: "Students", onPress: () => navigation.navigate("StudentList") },
            { key: "faculty", icon: "people-outline", label: "Faculty", onPress: () => navigation.navigate("FacultyList") },
            { key: "profile", icon: "person-outline", label: "Profile", onPress: () => navigation.navigate("Profile") },
          ]}
          fabActions={[
            { key: "admission", icon: "school-outline", color: colors.primary, angle: 150, onPress: () => navigation.navigate("NewAdmission") },
            { key: "lead", icon: "person-add-outline", color: C.blue, angle: 90, onPress: () => navigation.navigate("AddLead") },
            { key: "leads", icon: "list-outline", color: "#1B7A72", angle: 30, onPress: () => navigation.navigate("Leads") },
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ms(20),
    paddingBottom: ms(8),
  },
  topAvatar: {
    width: ms(42), height: ms(42), borderRadius: ms(21),
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  topAvatarT: { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff" },
  topMid: { flex: 1, marginLeft: ms(10) },
  hiLine: { fontSize: fs(15), fontFamily: "Inter_700Bold", fontWeight: "700", color: DARK },
  centerLine: { fontSize: fs(11), color: MUTED, marginTop: ms(1) },
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
  heroLine1: { fontSize: fs(31), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: DARK, lineHeight: fs(38), letterSpacing: -0.5 },
  heroLine2: { fontSize: fs(31), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: DARK, lineHeight: fs(40), letterSpacing: -0.5 },
  heroItalic: { fontStyle: "italic" },

  // ── Overview card ─────────────────────────────────────────────────────────
  overviewCard: {
    marginHorizontal: ms(16), marginBottom: ms(14),
    backgroundColor: C.card, borderRadius: ms(22), padding: ms(16),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(4) },
    shadowOpacity: 0.08, shadowRadius: ms(14), elevation: 3,
  },
  ovTop: { flexDirection: "row", alignItems: "center" },
  ovAvatar: { width: ms(46), height: ms(46), borderRadius: ms(14), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  ovAvatarT: { fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#fff" },
  ovName: { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: DARK },
  ovCenter: { fontSize: fs(11), color: MUTED, marginTop: ms(1) },
  roleBadge: { borderRadius: ms(10), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  roleBadgeT: { fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700" },
  ovSkelBar: { height: ms(44), backgroundColor: "#F0EBE5", borderRadius: ms(10), marginTop: ms(14) },
  ovDivider: { height: 1, backgroundColor: "#F0EAE4", marginVertical: ms(14) },
  ovStats: { flexDirection: "row", justifyContent: "space-around" },
  ovStat: { alignItems: "center" },
  ovStatVal: { fontSize: fs(18), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: DARK },
  ovStatLbl: { fontSize: fs(10), color: MUTED, fontFamily: "Inter_600SemiBold", fontWeight: "600", marginTop: ms(2), textTransform: "uppercase", letterSpacing: 0.3 },
  ovStatSep: { width: 1, backgroundColor: "#F0EAE4" },

  // ── Stat tiles ───────────────────────────────────────────────────────────
  tilesRow: { flexDirection: "row", gap: ms(10), marginHorizontal: ms(16), marginBottom: ms(14) },
  tileSkel: { flex: 1, height: ms(104), borderRadius: ms(18), backgroundColor: C.border },

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

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    marginHorizontal: ms(16), marginBottom: ms(14),
    backgroundColor: C.card, borderRadius: ms(22), padding: ms(16),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(4) },
    shadowOpacity: 0.06, shadowRadius: ms(10), elevation: 2,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardTitle: { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: DARK, marginBottom: ms(2) },
  cardSub: { fontSize: fs(11), color: MUTED },
  amberTag: { borderRadius: ms(10), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  amberTagT: { fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700" },

  // ── Activity rows ─────────────────────────────────────────────────────────
  actRow: { flexDirection: "row", alignItems: "center", paddingVertical: ms(10), gap: ms(12) },
  actIco: { width: ms(36), height: ms(36), borderRadius: ms(11), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  actTitle: { fontSize: fs(13), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: DARK },
  actSub: { fontSize: fs(11), color: MUTED, marginTop: ms(1) },
  actTime: { fontSize: fs(10), color: C.placeholder, flexShrink: 0 },
  adminRow: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingVertical: ms(8) },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyBox: { alignItems: "center", paddingVertical: ms(24), gap: ms(6) },
  emptyT: { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700", color: MID },
  emptySub: { fontSize: fs(11), color: MUTED, textAlign: "center" },
});

import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Dimensions, ActivityIndicator, RefreshControl, Animated, Modal, Image,
} from "react-native";
import { ms, fs } from "../../utils/responsive";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import { useNotificationBadge } from "../../context/NotificationBadgeContext";
import type { RootStackParamList } from "../../navigation/types";
import { fetchDashboardStats, type DashboardStats } from "../../api/dashboard";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { C } from "../../theme";
import { useThemeColors, darken, type ThemeColors } from "../../context/ThemeContext";
import { ROLE_META } from "../../constants/roleMeta";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import { TeacherDashboardScreen } from "./TeacherDashboardScreen";
import { BottomNav } from "../../components/ui/BottomNav";
import { T } from "../../components/ui/typography";
import { AVATAR_SIZE, AVATAR_RADIUS, getAvatarFill } from "../../components/ui/avatarStyle";
import { StatTile } from "../../components/ui/StatTile";
import { fmtTimeRange } from "../../api/classSchedule";
import { LeadIcon } from "../../components/ui/icons/LeadIcon";

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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function daysOverdue(dueDateIso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDateIso).getTime()) / 86_400_000));
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
          const isCurrent = i === hiIdx;
          return (
            <Rect
              key={i}
              x={i * (bW + gap)}
              y={cH - bH}
              width={bW}
              height={bH}
              rx={ms(8)}
              fill={isCurrent ? "url(#barPrimary)" : "url(#barMuted)"}
              // Current month also gets a stroke outline — the highlight can't rely on the
              // gradient fill alone, which is indistinguishable for color-blind users.
              stroke={isCurrent ? primaryColor : "none"}
              strokeWidth={isCurrent ? 1.5 : 0}
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
// ── Main screen ───────────────────────────────────────────────────────────────
export function DashboardScreen() {
  const colors = useThemeColors();
  const primarySoft = colors.primary + "1A"; // ~10% opacity badge background
  const insets = useSafeAreaInsets();
  const { staff, currentCenter, isAllCenters, switchCenter, selectRole, hasMultipleCenters } = useAuth();
  const { showAlert } = useAlert();
  const navigation = useNavigation<Nav>();
  const [switchingRole, setSwitchingRole] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  async function handleSelectRole(role: "admin" | "teacher" | "frontdesk") {
    if (role === staff?.activeRole) return;
    setSwitchingRole(true);
    try { await selectRole(role); }
    catch { showAlert("Error", "Could not switch role. Please try again.", "error"); }
    finally { setSwitchingRole(false); }
  }

  const name = staff?.fullName ?? "Admin";
  const firstName = firstWord(name);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const { unreadCount } = useNotificationBadge();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try { setStats(await fetchDashboardStats({ force: isRefresh })); }
    catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRefetchOnReconnect(() => load(true));

  const students = stats?.totalStudents ?? 0;
  const enrolled = stats?.totalEnrollments ?? 0;
  const activeB = stats?.activeBatches ?? 0;
  const fees = stats?.feesCollected ?? 0;
  const enrollmentsThisMonth = stats?.enrollmentsThisMonth ?? 0;
  const newBatchesThisMonth = stats?.newBatchesThisMonth ?? 0;
  const feesTrendPercent = stats?.feesTrendPercent ?? null;
  const feesTrendUpFromZero = stats?.feesTrendUpFromZero ?? false;

  const actIcon: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
    enrollment: { icon: "person-add-outline", color: colors.primary },
    faculty: { icon: "people-outline", color: C.orange },
    lead: { icon: "funnel-outline", color: "#1B7A72" },
    payment: { icon: "cash-outline", color: C.green },
  };

  async function handleSwitchCenter() {
    try { await switchCenter(); }
    catch { showAlert("Error", "Could not load centers. Please try again.", "error"); }
  }

  // Which dashboard shows is driven entirely by staff.activeRole — a real,
  // server-enforced session property (see AuthContext/select-role), not a
  // local display toggle. Switching (the role badge below) changes what you
  // can *do* everywhere else in the app too, not just this screen's content.
  // This check must come after every hook above has run unconditionally —
  // an early return interleaved with hook calls (its previous position)
  // made DashboardScreen call a different number of hooks depending on
  // activeRole, which crashes React with "Rendered more hooks than during
  // the previous render" the instant a mid-session role switch flips it.
  if (staff?.activeRole === "teacher") return <TeacherDashboardScreen />;

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
              style={[s.topAvatar, !staff?.photoUrl && { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate("Profile")}
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
                    style={[s.roleBadge, s.topRoleBadge, { backgroundColor: primarySoft }]}
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
                  <View style={[s.roleBadge, s.topRoleBadge, { backgroundColor: primarySoft }]}>
                    <Text style={[s.roleBadgeT, { color: colors.primary }]}>
                      {staff?.roles?.[0]
                        ? staff.roles[0].charAt(0).toUpperCase() + staff.roles[0].slice(1)
                        : "Staff"}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={s.topActions}>
              <TouchableOpacity
                style={s.topIconBtn}
                onPress={() => navigation.navigate("Notifications")}
                activeOpacity={0.8}
              >
                <Ionicons name="notifications-outline" size={ms(18)} color={DARK} />
                {unreadCount > 0 && (
                  <View style={s.bellBadge}>
                    <Text style={s.bellBadgeT}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Today's Summary ── */}
          {!loading && !error && stats && (
            <View style={[s.summaryCard, { backgroundColor: darken(colors.primary, 0.04) }]}>
              {/* Solid brand fill, not a gradient/wave texture — the wave overlay was
                  competing with the stat tiles and alert rows for contrast. A single
                  flat institute-related icon, very low opacity, keeps a bit of visual
                  identity in the background without touching readability. */}
              <Ionicons name="school" size={ms(130)} color="#ffffff12" style={s.summaryDeco} />
              <View style={s.summaryHead}>
                <Ionicons name="sparkles" size={ms(16)} color="#fff" />
                <Text style={s.summaryTitle}>Today's Summary</Text>
              </View>
              <Text style={s.summarySub}>Here's what's happening at your institute today</Text>
              <View style={s.summaryStatsRow}>
                {/* A dark scrim tile (not a tint of white) — the wave overlay is itself
                    translucent white, so a white-tinted tile blended straight into it.
                    A dark chip contrasts against the gradient AND the waves regardless
                    of which brand color a tenant configures. */}
                <View style={s.summaryStat}>
                  <Text style={s.summaryStatVal} numberOfLines={1} adjustsFontSizeToFit>{stats.admissionsToday}</Text>
                  <Text style={s.summaryStatLbl} numberOfLines={2} adjustsFontSizeToFit>{"New\nAdmissions"}</Text>
                </View>
                <View style={s.summaryStat}>
                  <Text style={s.summaryStatVal} numberOfLines={1} adjustsFontSizeToFit>{formatFees(stats.feesCollectedToday)}</Text>
                  <Text style={s.summaryStatLbl} numberOfLines={2} adjustsFontSizeToFit>{"Fees\nCollected"}</Text>
                </View>
                <View style={s.summaryStat}>
                  <Text style={s.summaryStatVal} numberOfLines={1} adjustsFontSizeToFit>{stats.studentsAbsentToday ?? "—"}</Text>
                  <Text style={s.summaryStatLbl} numberOfLines={2} adjustsFontSizeToFit>{"Students\nAbsent"}</Text>
                </View>
                <View style={s.summaryStat}>
                  <Text style={s.summaryStatVal} numberOfLines={1} adjustsFontSizeToFit>{stats.facultyAbsentToday ?? "—"}</Text>
                  <Text style={s.summaryStatLbl} numberOfLines={2} adjustsFontSizeToFit>{"Faculty\nAbsent"}</Text>
                </View>
              </View>

              {/* ── Today at a glance — folded into the same card instead of a
                  separate one below it, so the two "what's happening today"
                  sections don't sit as two stacked cards with a gap between them. ── */}
              <View style={s.glanceDivider} />
              <View style={s.briefTitleRow}>
                {(stats.overdueFeesCount > 0 || stats.staleLeadsCount > 0 || stats.pendingApplicationsCount > 0) && (
                  <View style={s.glanceAlertDot}>
                    <Ionicons name="alert-circle" size={ms(13)} color={C.red} />
                  </View>
                )}
                <Text style={s.briefTitle}>Today at a glance</Text>
              </View>
              {stats.overdueFeesCount === 0 && stats.staleLeadsCount === 0 && stats.pendingApplicationsCount === 0 ? (
                <Text style={s.briefCaughtUp}>All caught up — nothing overdue or waiting.</Text>
              ) : (
                <View>
                  {stats.overdueFeesCount > 0 && (
                    <TouchableOpacity
                      style={s.glanceRow}
                      onPress={() => navigation.navigate("FeesList", { initialFilter: "overdue" })}
                      activeOpacity={0.75}
                    >
                      <View style={s.glanceIco}>
                        <Ionicons name="cash-outline" size={ms(15)} color={C.red} />
                      </View>
                      <Text style={s.glanceRowT}>
                        {stats.overdueFeesCount} fee{stats.overdueFeesCount === 1 ? "" : "s"} overdue
                      </Text>
                      <Ionicons name="chevron-forward" size={ms(15)} color="#ffffffcc" />
                    </TouchableOpacity>
                  )}
                  {stats.staleLeadsCount > 0 && (
                    <TouchableOpacity
                      style={s.glanceRow}
                      onPress={() => navigation.navigate("Leads")}
                      activeOpacity={0.75}
                    >
                      <View style={s.glanceIco}>
                        <Ionicons name="person-outline" size={ms(15)} color="#946200" />
                      </View>
                      <Text style={s.glanceRowT}>
                        {stats.staleLeadsCount} lead{stats.staleLeadsCount === 1 ? "" : "s"} untouched 48h+
                      </Text>
                      <Ionicons name="chevron-forward" size={ms(15)} color="#ffffffcc" />
                    </TouchableOpacity>
                  )}
                  {stats.pendingApplicationsCount > 0 && (
                    <TouchableOpacity
                      style={s.glanceRow}
                      onPress={() => navigation.navigate("AdmissionApplications")}
                      activeOpacity={0.75}
                    >
                      <View style={s.glanceIco}>
                        <Ionicons name="document-text-outline" size={ms(15)} color={C.blue} />
                      </View>
                      <Text style={s.glanceRowT}>
                        {stats.pendingApplicationsCount} application{stats.pendingApplicationsCount === 1 ? "" : "s"} pending
                      </Text>
                      <Ionicons name="chevron-forward" size={ms(15)} color="#ffffffcc" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* ── Stat tile row ── */}
          <View style={s.tilesGrid}>
            {loading ? (
              <View style={s.tilesRow}>
                <View style={s.tileSkel} /><View style={s.tileSkel} /><View style={s.tileSkel} />
              </View>
            ) : (
              <View style={s.tilesRow}>
                <StatTile
                  icon="school-outline"
                  value={formatCount(students)}
                  label="Students"
                  bg="#FCEAE8" iconBg="#F8D5D2" iconColor="#B03A2E"
                  onPress={() => navigation.navigate("StudentList")}
                  sub={enrollmentsThisMonth > 0 ? `+${enrollmentsThisMonth} this month` : undefined}
                  subUp
                />
                <StatTile
                  icon="layers-outline"
                  value={String(activeB)}
                  label="Active Batches"
                  bg="#EDE8FA" iconBg="#DDD5F4" iconColor={colors.primary}
                  onPress={() => navigation.navigate("BatchList", { initialFilter: "active" })}
                  sub={newBatchesThisMonth > 0 ? `+${newBatchesThisMonth} new` : undefined}
                  subUp
                />
                <StatTile
                  icon="cash-outline"
                  value={formatFees(fees)}
                  label="Fees Collected"
                  bg="#E6EFF0" iconBg="#CFE8E5" iconColor="#1B7A72"
                  onPress={() => navigation.navigate("FeesList")}
                  sub={
                    feesTrendPercent !== null
                      ? `${feesTrendPercent >= 0 ? "+" : ""}${feesTrendPercent}% vs last mo`
                      : feesTrendUpFromZero ? "" : undefined
                  }
                  subUp={
                    feesTrendPercent !== null
                      ? feesTrendPercent >= 0
                      : feesTrendUpFromZero ? true : undefined
                  }
                />
              </View>
            )}
          </View>

          {/* ── Quick Actions ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Quick Actions</Text>
            <View style={s.quickGrid}>
              {/* Leads dropped here — it's now a primary bottom-tab destination, and having
                  it in three places (tab, chip, FAB) at once was itself a review finding.
                  Applications leads the row since it's the newest module and otherwise
                  easy to never discover. */}
              {([
                { label: "Applications", icon: "document-text-outline" as const, nav: "AdmissionApplications" as const, color: C.blue, badge: stats?.pendingApplicationsCount ?? 0 },
                { label: "Faculty", icon: "people-outline" as const, nav: "FacultyList" as const, color: C.orange, badge: 0 },
                { label: "Courses", icon: "book-outline" as const, nav: "CourseList" as const, color: colors.primary, badge: 0 },
                { label: "Subjects", icon: "library-outline" as const, nav: "SubjectList" as const, color: C.blue, badge: 0 },
              ]).map((q) => (
                <TouchableOpacity
                  key={q.label}
                  style={s.quickChip}
                  onPress={() => navigation.navigate(q.nav as any)}
                  activeOpacity={0.72}
                >
                  <View style={[s.quickIco, { backgroundColor: q.color + "1A" }]}>
                    <Ionicons name={q.icon} size={ms(14)} color={q.color} />
                    {q.badge > 0 && (
                      <View style={s.quickBadge}>
                        <Text style={s.quickBadgeT}>{q.badge > 9 ? "9+" : q.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.quickLbl}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Today's Classes ── */}
          {!loading && !error && stats && (
            <View style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.cardTitle}>Today's Classes</Text>
                {stats.todaySessionsCount > 0 && (
                  <View style={[s.amberTag, { backgroundColor: C.blue + "18" }]}>
                    <Text style={[s.amberTagT, { color: C.blue }]}>{stats.todaySessionsCount} total</Text>
                  </View>
                )}
              </View>
              {stats.todaySessions.length === 0 ? (
                <View style={s.emptyBox}>
                  <Ionicons name="calendar-outline" size={ms(32)} color="#D0CBC5" />
                  <Text style={s.emptyT}>No classes today</Text>
                </View>
              ) : (
                stats.todaySessions.map((sess, i, arr) => (
                  <TouchableOpacity
                    key={sess.id}
                    style={[
                      s.actRow,
                      i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
                    ]}
                    activeOpacity={0.72}
                    onPress={() => navigation.navigate("SessionDetail", { sessionId: sess.id, batchId: sess.batchId, batchName: sess.batchName })}
                  >
                    <View style={[s.actIco, { backgroundColor: colors.primary + "15" }]}>
                      <Ionicons name="book-outline" size={ms(16)} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.actTitle} numberOfLines={1}>
                        {sess.subjectName ?? sess.batchName}
                      </Text>
                      {/* Only shown when there's a subject name to sit below — otherwise
                          the batch name is already the title above, and repeating it
                          as a chip too would just show the same text twice. */}
                      {sess.subjectName && (
                        <View style={[s.classChip, s.classChipStandalone, { backgroundColor: colors.primary + "14" }]}>
                          <Ionicons name="layers-outline" size={ms(10)} color={colors.primary} style={s.classChipIcon} />
                          <Text style={[s.classChipT, { color: colors.primary }]} numberOfLines={1}>{sess.batchName}</Text>
                        </View>
                      )}
                      <View style={s.classChipsRow}>
                        <View style={[s.classChip, s.classChipFaculty, { backgroundColor: C.blueBg }]}>
                          <Ionicons name="person-outline" size={ms(10)} color={C.blue} style={s.classChipIcon} />
                          <Text style={[s.classChipT, s.classChipTFaculty, { color: C.blue }]} numberOfLines={1}>{sess.facultyName ?? "Faculty TBD"}</Text>
                        </View>
                        <View style={[s.classChip, s.classChipFaculty, { backgroundColor: C.orangeBg }]}>
                          <Ionicons name="time-outline" size={ms(10)} color={C.orange} style={s.classChipIcon} />
                          <Text style={[s.classChipT, s.classChipTTime, { color: C.orange }]} numberOfLines={1}>{fmtTimeRange(sess.startTime, sess.endTime)}</Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={ms(16)} color={MUTED} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* ── Admissions ── */}
          {!loading && !error && stats && (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate("AdmissionApplications")}
            >
              <Text style={s.cardTitle}>Admissions</Text>
              <View style={s.admStatRow}>
                <View style={s.admStat}>
                  <Text style={[s.admStatVal, { color: C.blue }]}>{stats.applicationStatusCounts.pending}</Text>
                  <Text style={s.admStatLbl}>Pending</Text>
                </View>
                <View style={s.admStatSep} />
                <View style={s.admStat}>
                  <Text style={[s.admStatVal, { color: C.green }]}>{stats.applicationStatusCounts.admitted}</Text>
                  <Text style={s.admStatLbl}>Admitted</Text>
                </View>
                <View style={s.admStatSep} />
                <View style={s.admStat}>
                  <Text style={[s.admStatVal, { color: C.red }]}>{stats.applicationStatusCounts.rejected}</Text>
                  <Text style={s.admStatLbl}>Rejected</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* ── Pending Fees ── */}
          {!loading && !error && stats && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Pending Fees</Text>
              {stats.topOverdueFees.length === 0 ? (
                <View style={s.emptyBox}>
                  <Ionicons name="checkmark-done-outline" size={ms(32)} color="#D0CBC5" />
                  <Text style={s.emptyT}>No overdue fees</Text>
                </View>
              ) : (
                stats.topOverdueFees.map((f, i, arr) => {
                  const fill = getAvatarFill(C.red);
                  return (
                    <TouchableOpacity
                      key={f.enrollmentId}
                      style={[
                        s.actRow,
                        i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
                      ]}
                      activeOpacity={0.72}
                      onPress={() => navigation.navigate("FeeScheduleDetail", { enrollmentId: f.enrollmentId, studentName: f.studentName })}
                    >
                      <View style={[
                        { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, justifyContent: "center", alignItems: "center" },
                        { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor },
                      ]}>
                        <Text style={[s.actTitle, { color: fill.color }]}>{initials(f.studentName)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.actTitle} numberOfLines={1}>{f.studentName}</Text>
                        <Text style={[s.actSub, { color: C.red }]}>{daysOverdue(f.dueDate)} days overdue</Text>
                      </View>
                      <Text style={s.actTitle}>{formatFees(f.outstanding)}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* ── Admin actions ── */}
          {!loading && !error && staff?.activeRole === "admin" && (
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
                  <Text style={s.cardTitle}>Enrollments</Text>
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

          {/* ── Recent Admissions ── */}
          {!loading && !error && stats && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Recent Admissions</Text>
              {stats.recentAdmissions.length === 0 ? (
                <View style={s.emptyBox}>
                  <Ionicons name="document-text-outline" size={ms(32)} color="#D0CBC5" />
                  <Text style={s.emptyT}>No applications yet</Text>
                </View>
              ) : (
                stats.recentAdmissions.map((ad, i, arr) => {
                  const fill = getAvatarFill(colors.primary);
                  const statusColor = ad.status === "admitted" ? C.green : ad.status === "rejected" ? C.red : C.blue;
                  return (
                    <TouchableOpacity
                      key={ad.id}
                      style={[
                        s.actRow,
                        i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
                      ]}
                      activeOpacity={0.72}
                      onPress={() => navigation.navigate("AdmissionApplications")}
                    >
                      <View style={[
                        { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, justifyContent: "center", alignItems: "center" },
                        { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor },
                      ]}>
                        <Text style={[s.actTitle, { color: fill.color }]}>{initials(ad.fullName)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.actTitle} numberOfLines={1}>{ad.fullName}</Text>
                        <Text style={s.actSub} numberOfLines={1}>{ad.courseName}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: ms(4) }}>
                        <View style={[s.admStatusChip, { backgroundColor: statusColor + "18" }]}>
                          <Text style={[s.admStatusChipT, { color: statusColor }]}>{ad.status}</Text>
                        </View>
                        <Text style={s.actTime}>{relTime(ad.createdAt)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
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
              {/* Capped rather than switched to FlatList — this card already lives inside the
                  screen's outer ScrollView, and nesting a virtualized list inside a plain
                  ScrollView is its own (worse) problem in React Native. Fine at real-world
                  center counts; revisit with a dedicated screen if a tenant ever has dozens. */}
              {stats.perCenter!.slice(0, 8).map((c, i, arr) => (
                <View
                  key={c.id}
                  style={[
                    s.actRow,
                    i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
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
              {stats.perCenter!.length > 8 && (
                <Text style={s.moreCentersT}>+{stats.perCenter!.length - 8} more centers</Text>
              )}
            </View>
          )}
        </ScrollView>

        {/* ── Bottom navigation ─────────────────────────────────────────────── */}
        <BottomNav
          items={[
            { key: "home", icon: "home", label: "Home", active: true, onPress: () => { } },
            { key: "students", icon: "school-outline", label: "Students", onPress: () => navigation.navigate("StudentList") },
            { key: "leads", renderIcon: (p) => <LeadIcon {...p} />, label: "Leads", onPress: () => navigation.navigate("Leads") },
            { key: "profile", icon: "person-outline", label: "Profile", onPress: () => navigation.navigate("Profile") },
          ]}
          // FAB is create-only now — "View leads" was a pure navigation shortcut that
          // duplicated the Leads tab (and the old quick-access chip), one of three ways
          // to reach the same screen. Leads tab covers that; the dial keeps only actions
          // that create something new.
          fabActions={[
            { key: "admission", icon: "school-outline", color: colors.primary, angle: 135, label: "New admission", onPress: () => navigation.navigate("NewAdmission") },
            { key: "lead", icon: "person-add-outline", color: C.blue, angle: 45, label: "Add lead", onPress: () => navigation.navigate("AddLead") },
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
                    setSwitchingRole(true);
                    try { await selectRole(r); setRoleModalOpen(false); }
                    catch { showAlert("Error", "Could not switch role. Please try again.", "error"); }
                    finally { setSwitchingRole(false); }
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
    flexDirection: "row",
    alignItems: "center",
    // Matches summaryCard/tilesGrid's own marginHorizontal (16) below —
    // was 20, which made the avatar/bell sit slightly inset from the
    // cards' edges instead of lining up flush with them.
    paddingHorizontal: ms(16),
    paddingBottom: ms(12),
  },
  // Rounded square, not a circle — matches the squircle avatar shape used
  // everywhere else once this became the app's only avatar display. Fixed
  // width AND height (a true square, centered by topBar's alignItems:
  // "center") rather than alignSelf: "stretch" tracking topMid's two-line
  // height — that stretch made this a tall rectangle, which read fine for
  // centered initials text but visibly distorts a cover-fit profile photo.
  topAvatar: {
    width: ms(38), height: ms(38), borderRadius: ms(12),
    justifyContent: "center", alignItems: "center", flexShrink: 0,
    marginRight: ms(10), overflow: "hidden",
  },
  topAvatarT: { ...T.listItemTitle, color: "#fff" },
  // Fills the squircle exactly — width/height 100% (not a fixed pixel size)
  // since topAvatar's own height comes from alignSelf: "stretch", not a set value.
  topAvatarImg: { width: "100%", height: "100%", borderRadius: ms(12) },
  topMid: { flex: 1, marginRight: ms(10) },
  hiRow: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  hiRow2: { flexDirection: "row", alignItems: "center", gap: ms(6), marginTop: ms(4) },
  hiLine: { ...T.cardTitle, color: DARK },
  topRoleBadge: { paddingHorizontal: ms(8), paddingVertical: ms(2) },
  // Filled pill + chevron so this reads as a control, not a label — this is
  // the only way to switch centers, so it needs to look tappable.
  centerChip: {
    flexDirection: "row", alignItems: "center", gap: ms(4),
    borderRadius: ms(10), paddingHorizontal: ms(8), paddingVertical: ms(3),
  },
  // Matches the stat tiles' own label style (e.g. "Students", "Active
  // Batches") for visual consistency across the dashboard.
  centerChipT: { ...T.caption },
  topActions: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  topIconBtn: {
    width: ms(38), height: ms(38), borderRadius: ms(19),
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

  // ── Today's Summary banner ───────────────────────────────────────────────
  summaryCard: {
    marginHorizontal: ms(16), marginBottom: ms(8),
    borderRadius: ms(18), padding: ms(10), overflow: "hidden",
  },
  summaryDeco: { position: "absolute", right: -ms(20), bottom: -ms(20) },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  summaryTitle: { ...T.cardTitle, color: "#fff" },
  summarySub: { ...T.caption, color: "#ffffffcc", marginTop: ms(2), marginBottom: ms(6) },
  summaryStatsRow: { flexDirection: "row", gap: ms(6) },
  summaryStat: {
    flex: 1, minWidth: 0, alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.22)", borderRadius: ms(12),
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: ms(6), paddingVertical: ms(7),
  },
  summaryStatVal: { ...T.displayMedium, color: "#fff", textAlign: "center" },
  summaryStatLbl: { ...T.caption, color: "#ffffffb3", marginTop: ms(1), textAlign: "center" },

  // ── Today at a glance (folded into the summary card) ──────────────────────
  glanceDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.18)", marginTop: ms(10), marginBottom: ms(8) },
  briefTitleRow: { flexDirection: "row", alignItems: "center", gap: ms(6), marginBottom: ms(6) },
  briefTitle: { ...T.cardTitle, color: "#fff" },
  briefCaughtUp: { ...T.helperText, color: "#ffffffcc" },
  glanceAlertDot: {
    width: ms(20), height: ms(20), borderRadius: ms(10),
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center", alignItems: "center",
  },
  glanceRow: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    backgroundColor: "rgba(0,0,0,0.18)", borderRadius: ms(12),
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: ms(10), paddingVertical: ms(8),
    marginBottom: ms(6),
  },
  glanceIco: {
    width: ms(28), height: ms(28), borderRadius: ms(9),
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  glanceRowT: { ...T.listItemTitle, color: "#fff", flex: 1 },

  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: ms(4),
    borderRadius: ms(10), paddingHorizontal: ms(10), paddingVertical: ms(4),
  },
  // Matches the stat tiles' own label style (e.g. "Students", "Active
  // Batches") for visual consistency across the dashboard.
  roleBadgeT: { ...T.caption },

  // ── Stat tiles ────────────────────────────────────────────────────────────
  tilesGrid: { marginHorizontal: ms(16), marginBottom: ms(8), gap: ms(8) },
  tilesRow: { flexDirection: "row", gap: ms(8) },
  tileSkel: { flex: 1, height: ms(96), borderRadius: ms(18), backgroundColor: C.border },

  // ── Quick chips ───────────────────────────────────────────────────────────
  quickGrid: {
    flexDirection: "row", flexWrap: "wrap",
    marginTop: ms(6), gap: ms(8),
  },
  quickChip: {
    flexDirection: "row", alignItems: "center", gap: ms(7),
    flexBasis: "48%", flexGrow: 1,
    backgroundColor: C.inputBg, borderRadius: ms(16),
    paddingHorizontal: ms(13), paddingVertical: ms(11),
    borderWidth: 1, borderColor: C.border,
  },
  quickIco: { width: ms(26), height: ms(26), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },
  quickBadge: {
    position: "absolute", top: -ms(4), right: -ms(4), minWidth: ms(14), height: ms(14),
    borderRadius: ms(7), paddingHorizontal: ms(3), backgroundColor: C.red,
    justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: C.inputBg,
  },
  quickBadgeT: { ...T.badgeText, color: "#fff" },
  quickLbl: { ...T.chipText, color: DARK },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    marginHorizontal: ms(16), marginBottom: ms(8),
    backgroundColor: C.card, borderRadius: ms(18), padding: ms(12),
    shadowColor: C.text, shadowOffset: { width: 0, height: ms(4) },
    shadowOpacity: 0.06, shadowRadius: ms(10), elevation: 2,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardTitle: { ...T.cardTitle, color: DARK, marginBottom: ms(2) },
  cardSub: { ...T.caption, color: MUTED },
  amberTag: { borderRadius: ms(10), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  amberTagT: { ...T.chipText },

  // ── Admissions stat row ──────────────────────────────────────────────────
  admStatRow: { flexDirection: "row", alignItems: "center", marginTop: ms(12) },
  admStat: { flex: 1, alignItems: "center", gap: ms(2) },
  admStatVal: { ...T.displayMedium },
  admStatLbl: { ...T.caption, color: MUTED },
  admStatSep: { width: 1, height: ms(28), backgroundColor: C.border },
  admStatusChip: { borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  admStatusChipT: { ...T.chipText, textTransform: "capitalize" },

  // ── Activity rows ─────────────────────────────────────────────────────────
  actRow: { flexDirection: "row", alignItems: "center", paddingVertical: ms(10), gap: ms(12) },
  actIco: { width: ms(36), height: ms(36), borderRadius: ms(11), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  actTitle: { ...T.listItemTitle, color: DARK },
  actSub: { ...T.caption, color: MUTED, marginTop: ms(1) },
  // Faculty/timing chips use a fixed `width` (not flexShrink/flexGrow) on
  // both the pill and its Text — on this RN/Android combo, flex-only sizing
  // left the timing chip's Text stuck at an undersized measurement that
  // never grew even when the row had confirmed unused space. An explicit
  // width forces Text to measure against that exact value instead.
  classChipsRow: { flexDirection: "row", alignItems: "center", marginTop: ms(4) },
  classChipStandalone: { alignSelf: "flex-start", marginTop: ms(3) },
  classChip: {
    flexDirection: "row", alignItems: "center",
    borderRadius: ms(8), paddingHorizontal: ms(7), paddingVertical: ms(3),
  },
  classChipIcon: { marginRight: ms(4) },
  classChipFaculty: { width: ms(125), marginRight: ms(6) },
  classChipTFaculty: { width: ms(88) },
  classChipTime: { width: ms(150) },
  classChipTTime: { width: ms(110) },
  classChipT: { ...T.chipText },
  actTime: { ...T.caption, color: C.placeholder, flexShrink: 0 },
  adminRow: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingVertical: ms(8) },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyBox: { alignItems: "center", paddingVertical: ms(24), gap: ms(6) },
  emptyT: { ...T.listItemTitle, color: MID },
  emptySub: { ...T.caption, color: MUTED, textAlign: "center" },
  moreCentersT: { ...T.caption, color: MUTED, textAlign: "center", paddingTop: ms(10) },
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

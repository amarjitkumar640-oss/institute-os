import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Dimensions, ActivityIndicator, RefreshControl,
} from "react-native";
import { ms, fs } from "../../utils/responsive";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Rect, Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import type { RootStackParamList } from "../../navigation/types";
import { fetchDashboardStats, type DashboardStats } from "../../api/dashboard";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { C } from "../../theme";
import { useAlert } from "../../context/AlertContext";
import { useRefetchOnReconnect } from "../../hooks/useRefetchOnReconnect";
import { ROLE_META } from "../../constants/roleMeta";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const { width: W } = Dimensions.get("window");
const WAVE_H  = Math.round(ms(40));
const CARD_W  = (W - ms(32) - ms(12)) / 2;
const CHART_W = W - ms(32) - ms(36);

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function formatFees(amount: number): string {
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`;
  if (amount >= 1_000)    return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatCount(n: number): string {
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── SVG decorations ───────────────────────────────────────────────────────────

function PolkaDots() {
  const sp = 22;
  const cols = Math.ceil(W / sp) + 2;
  const rows = 14;
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dots.push(<Circle key={`${r}-${c}`} cx={c * sp + (r % 2 ? sp / 2 : 0)} cy={r * sp} r={1.5} fill="rgba(255,255,255,0.12)" />);
  return <Svg width={W} height={rows * sp} style={StyleSheet.absoluteFill}>{dots}</Svg>;
}

function Wave() {
  return (
    <Svg width={W} height={WAVE_H} viewBox={`0 0 ${W} 40`} preserveAspectRatio="none">
      <Path d={`M0 22 C${W * 0.23} 46,${W * 0.77} 4,${W} 22 L${W} 40 L0 40 Z`} fill={C.bg} />
    </Svg>
  );
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; count: number }[] }) {
  const cH    = 90;
  const n     = data.length;
  const gap   = 8;
  const bW    = (CHART_W - gap * (n - 1)) / n;
  const max   = Math.max(...data.map((d) => d.count), 1);
  // highlight the most recent bar (last one)
  const hiIdx = data.length - 1;

  return (
    <View>
      <Svg width={CHART_W} height={cH}>
        <Defs>
          <SvgGrad id="barHi" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={C.orange} />
            <Stop offset="100%" stopColor={C.primary} />
          </SvgGrad>
        </Defs>
        {data.map((d, i) => {
          const bH = Math.max((d.count / max) * cH, d.count > 0 ? 6 : 2);
          return (
            <Rect
              key={i}
              x={i * (bW + gap)}
              y={cH - bH}
              width={bW}
              height={bH}
              rx={6}
              fill={i === hiIdx ? "url(#barHi)" : "#F1E7DD"}
            />
          );
        })}
      </Svg>
      <View style={s.months}>
        {data.map((d, i) => (
          <Text key={i} style={[s.month, i === hiIdx && s.monthHi]}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={[s.statCard, { backgroundColor: "#F5F0EC", borderColor: "#EAE4DF" }]}>
      <View style={{ width: ms(32), height: ms(32), borderRadius: ms(10), backgroundColor: "#E8E0DC", marginBottom: ms(10) }} />
      <View style={{ width: ms(48), height: ms(18), borderRadius: ms(6), backgroundColor: "#E8E0DC", marginBottom: ms(6) }} />
      <View style={{ width: ms(72), height: ms(11), borderRadius: ms(4), backgroundColor: "#EDE8E3" }} />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { staff, currentCenter, isAllCenters, switchCenter } = useAuth();
  const navigation = useNavigation<Nav>();
  const { showAlert } = useAlert();
  const name = staff?.fullName ?? "Admin";

  const [stats, setStats]       = useState<DashboardStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const data = await fetchDashboardStats();
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

  // ── Derived stats cards ──────────────────────────────────────────────────────

  type StatNav =
    | { screen: "BatchList";   params: { initialFilter: "all" | "active" } }
    | { screen: "CourseList";  params?: undefined }
    | { screen: "FacultyList"; params?: undefined }
    | { screen: "SubjectList"; params?: undefined }
    | { screen: "StudentList"; params?: undefined }
    | { screen: "FeesList";    params?: undefined }
    | null;

  const STATS: {
    label: string; value: string; icon: string;
    color: string; delta: string; up: boolean; nav: StatNav;
  }[] = stats ? [
    {
      label: "Total Batches",
      value: String(stats.totalBatches),
      icon:  "layers-outline",
      color: C.primary,
      delta: `${stats.activeBatches} running now`,
      up:    stats.activeBatches > 0,
      nav:   { screen: "BatchList", params: { initialFilter: "all" } },
    },
    {
      label: "Total Courses",
      value: String(stats.totalCourses),
      icon:  "book-outline",
      color: C.accent,
      delta: "Active courses",
      up:    false,
      nav:   { screen: "CourseList" },
    },
    {
      label: "Total Faculty",
      value: String(stats.totalFaculty),
      icon:  "people-outline",
      color: C.orange,
      delta: "Active members",
      up:    false,
      nav:   { screen: "FacultyList" },
    },
    {
      label: "Total Students",
      value: formatCount(stats.totalStudents),
      icon:  "school-outline",
      color: "#946200",
      delta: `${stats.totalEnrollments} enrolled`,
      up:    stats.totalEnrollments > 0,
      nav:   { screen: "StudentList" },
    },
    {
      label: "Total Subjects",
      value: String(stats.totalSubjects),
      icon:  "library-outline",
      color: "#2563A8",
      delta: "All categories",
      up:    false,
      nav:   { screen: "SubjectList" },
    },
    {
      label: "Fees Collected",
      value: formatFees(stats.feesCollected),
      icon:  "cash-outline",
      color: "#B3273F",
      delta: "All time total",
      up:    stats.feesCollected > 0,
      nav:   { screen: "FeesList" },
    },
  ] : [];

  function handleProfilePress() {
    navigation.navigate("Profile");
  }

  function handleStatPress(nav: StatNav) {
    if (!nav) return;
    if (nav.screen === "BatchList") {
      navigation.navigate("BatchList", nav.params ?? { initialFilter: "all" });
    } else if (nav.screen === "FeesList") {
      navigation.navigate("FeesList");
    } else if (nav.screen === "SubjectList") {
      navigation.navigate("SubjectList");
    } else {
      navigation.navigate(nav.screen);
    }
  }

  const activityIcon: Record<string, { icon: string; color: string }> = {
    enrollment: { icon: "person-add-outline",   color: C.accent  },
    faculty:    { icon: "people-outline",        color: C.orange },
  };

  // ── Enrollment total for header ───────────────────────────────────────────
  const enrollTotal  = stats?.totalEnrollments ?? 0;
  const coursesCount = stats?.totalCourses     ?? 0;
  const activeB      = stats?.activeBatches    ?? 0;

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={s.root}>

        {/* ── Main scroll — header lives INSIDE so no overlap hacks needed ── */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollBody}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#8B1E3F"]} tintColor="#8B1E3F" />
          }
        >
          {/* ── Header ── */}
          <LinearGradient
            colors={["#5C0E23", "#8B1E3F", "#C0422E", "#E87830"]}
            start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
            style={s.header}
          >
            <PolkaDots />
            <View style={[s.hPad, { paddingTop: insets.top + ms(10) }]}>

              {/* Date row */}
              <View style={s.dateRow}>
                <View style={s.dateChip}>
                  <Ionicons name="calendar-outline" size={ms(11)} color="rgba(255,255,255,0.82)" />
                  <Text style={s.dateText}>{formatDate()}</Text>
                </View>
                <View style={s.headerActions}>
                  <TouchableOpacity style={s.hBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="search-outline" size={ms(18)} color="rgba(255,255,255,0.9)" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.hBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="notifications-outline" size={ms(18)} color="rgba(255,255,255,0.9)" />
                    <View style={s.bellDot} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Profile row */}
              <TouchableOpacity style={s.profileRow} onPress={handleProfilePress} activeOpacity={0.78}>
                <View style={s.avatarRing}>
                  <View style={s.avatar}>
                    <Text style={s.avatarL}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                </View>
                <View style={s.profileInfo}>
                  <Text style={s.hi}>{greeting()},</Text>
                  <Text style={s.hName} numberOfLines={1}>{name}</Text>
                  <View style={s.centerChip}>
                    <Ionicons name="location-outline" size={ms(10)} color="rgba(255,255,255,0.68)" />
                    <Text style={s.centerChipT} numberOfLines={1}>
                      {isAllCenters ? "All Centers" : currentCenter?.name ?? "—"}
                    </Text>
                    <Ionicons name="chevron-forward" size={ms(10)} color="rgba(255,255,255,0.5)" />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Key stats glass strip */}
              <View style={s.glassStrip}>
                {loading ? (
                  <>
                    <View style={s.pillSkel} />
                    <View style={s.pillDivider} />
                    <View style={s.pillSkel} />
                    <View style={s.pillDivider} />
                    <View style={s.pillSkel} />
                  </>
                ) : (
                  <>
                    <View style={s.pill}>
                      <Text style={s.pillVal}>{formatCount(enrollTotal)}</Text>
                      <Text style={s.pillLbl}>Enrolled</Text>
                    </View>
                    <View style={s.pillDivider} />
                    <View style={s.pill}>
                      <Text style={s.pillVal}>{activeB}</Text>
                      <Text style={s.pillLbl}>Active Batches</Text>
                    </View>
                    <View style={s.pillDivider} />
                    <View style={s.pill}>
                      <Text style={s.pillVal}>{formatFees(stats?.feesCollected ?? 0)}</Text>
                      <Text style={s.pillLbl}>Fees</Text>
                    </View>
                  </>
                )}
              </View>

              {/* Center switch row */}
              {!loading && (
                <View style={s.switchRow}>
                  <Text style={s.switchMeta} numberOfLines={1}>
                    {coursesCount} course{coursesCount !== 1 ? "s" : ""} · {stats?.totalStudents ?? 0} students total
                  </Text>
                  <TouchableOpacity style={s.switchChip} onPress={() => switchCenter()} activeOpacity={0.75}>
                    <Ionicons name="swap-horizontal-outline" size={ms(11)} color="rgba(255,255,255,0.92)" />
                    <Text style={s.switchChipT}>Switch Center</Text>
                  </TouchableOpacity>
                </View>
              )}

            </View>
            <Wave />
          </LinearGradient>

          {/* ── Content area (starts cleanly below the wave) ── */}
          <View style={s.content}>

            {/* Quick-access chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.quickRow}
            >
              {([
                { label: "Students", icon: "school-outline",  nav: "StudentList" as const, color: "#946200"  },
                { label: "Batches",  icon: "layers-outline",  nav: "BatchList"   as const, color: C.primary  },
                { label: "Faculty",  icon: "people-outline",  nav: "FacultyList" as const, color: C.orange   },
                { label: "Courses",  icon: "book-outline",    nav: "CourseList"  as const, color: C.accent   },
                { label: "Subjects", icon: "library-outline", nav: "SubjectList" as const, color: C.blue     },
              ] as const).map((q) => (
                <TouchableOpacity
                  key={q.label}
                  style={[s.quickChip, { backgroundColor: hexToRgba(q.color, 0.09), borderColor: hexToRgba(q.color, 0.20) }]}
                  onPress={() => navigation.navigate(q.nav as any)}
                  activeOpacity={0.72}
                >
                  <View style={[s.quickIco, { backgroundColor: hexToRgba(q.color, 0.14) }]}>
                    <Ionicons name={q.icon as any} size={ms(14)} color={q.color} />
                  </View>
                  <Text style={[s.quickLbl, { color: q.color }]}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Section header */}
            <View style={s.secRowHead}>
              <Text style={s.secRowTitle}>Overview</Text>
              <Text style={s.secRowSub}>
                {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              </Text>
            </View>

            {/* ── Stats grid ── */}
            <View style={s.grid}>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
              ) : error ? (
                <ListErrorState title="Failed to load dashboard" onRetry={() => load()} />
              ) : (
                STATS.map((st) => {
                  const bg       = hexToRgba(st.color, 0.07);
                  const border   = hexToRgba(st.color, 0.22);
                  const iconBg   = hexToRgba(st.color, 0.11);
                  const ghostClr = hexToRgba(st.color, 0.09);
                  const deltaClr = st.up ? "#1B9C63" : hexToRgba(st.color, 0.55);
                  return (
                    <TouchableOpacity
                      key={st.label}
                      style={[s.statCard, { backgroundColor: bg, borderColor: border }]}
                      onPress={() => handleStatPress(st.nav)}
                      activeOpacity={st.nav ? 0.74 : 1}
                    >
                      <View style={[s.cardStripe, { backgroundColor: st.color }]} />
                      <Ionicons name={st.icon as any} size={ms(60)} color={ghostClr} style={s.ghostIcon} />
                      <View style={[s.statIcon, { backgroundColor: iconBg, borderColor: border }]}>
                        <Ionicons name={st.icon as any} size={ms(16)} color={st.color} />
                      </View>
                      <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
                      <Text style={s.statLbl}>{st.label}</Text>
                      <View style={s.delta}>
                        <Ionicons name={st.up ? "trending-up" : "remove-outline"} size={10} color={deltaClr} />
                        <Text style={[s.deltaT, { color: deltaClr }]}>{" " + st.delta}</Text>
                      </View>
                      {st.nav && (
                        <View style={[s.cardArrow, { backgroundColor: iconBg }]}>
                          <Ionicons name="chevron-forward" size={ms(10)} color={st.color} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* ── Enrollment trend chart ── */}
            {!loading && !error && stats && (
              <View style={s.card}>
                <View style={s.secHead}>
                  <Text style={s.secT}>Enrollment Trend</Text>
                  <Text style={s.secLnk}>Last 8 months</Text>
                </View>
                <View style={s.cMeta}>
                  <Text style={s.cNum}>{enrollTotal.toLocaleString("en-IN")}</Text>
                  <View style={s.gTag}>
                    <Text style={s.gTagT}>Active enrollments</Text>
                  </View>
                </View>
                <BarChart data={stats.monthlyEnrollments} />
              </View>
            )}

            {/* ── Recent Activity ── */}
            {!loading && !error && stats && stats.recentActivity.length > 0 && (
              <View style={s.card}>
                <View style={s.secHead}>
                  <Text style={s.secT}>Recent Activity</Text>
                </View>
                {stats.recentActivity.map((a, i) => {
                  const meta = activityIcon[a.type] ?? { icon: "ellipse-outline", color: C.muted };
                  return (
                    <View key={i} style={[s.actRow, i < stats.recentActivity.length - 1 && s.actDiv]}>
                      <View style={[s.actIco, { backgroundColor: meta.color }]}>
                        <Ionicons name={meta.icon as any} size={16} color="#fff" />
                      </View>
                      <View style={s.actBod}>
                        <Text style={s.actTtl} numberOfLines={1}>{a.title}</Text>
                        <Text style={s.actSub} numberOfLines={1}>{a.sub}</Text>
                      </View>
                      <Text style={s.actTm}>{relTime(a.time)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Empty activity state */}
            {!loading && !error && stats && stats.recentActivity.length === 0 && (
              <View style={s.card}>
                <Text style={s.secT}>Recent Activity</Text>
                <View style={s.emptyAct}>
                  <Ionicons name="pulse-outline" size={ms(32)} color="#D5CCC8" />
                  <Text style={s.emptyActT}>No activity yet</Text>
                  <Text style={s.emptyActSub}>Activity will appear as students enroll and faculty are added</Text>
                </View>
              </View>
            )}

            {/* ── Per-Center Breakdown ── */}
            {!loading && !error && stats && isAllCenters && stats.perCenter && stats.perCenter.length > 0 && (
              <View style={s.card}>
                <Text style={s.secT}>Centers Overview</Text>
                {stats.perCenter.map((c, i) => (
                  <View key={c.id} style={[s.centerRow, i < stats.perCenter!.length - 1 && s.centerDiv]}>
                    <View style={s.centerRowIcon}>
                      <Ionicons name="business-outline" size={ms(16)} color="#5B2D8E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.centerRowName}>{c.name}</Text>
                      <Text style={s.centerRowMeta}>{c.students} students · {c.batches} batches · {c.enrollments} enrolled</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── Admin quick actions ── */}
            {!loading && !error && staff?.role === "admin" && (
              <View style={s.card}>
                <Text style={s.secT}>Admin</Text>
                <TouchableOpacity style={s.adminRow} onPress={() => navigation.navigate("StaffManagement")} activeOpacity={0.7}>
                  <View style={[s.adminIco, { backgroundColor: "#FDF0F3" }]}>
                    <Ionicons name="shield-checkmark-outline" size={ms(18)} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.adminT}>Staff & Roles</Text>
                    <Text style={s.adminSub}>Add staff, assign roles, reset passwords</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
                </TouchableOpacity>
                <View style={s.adminDiv} />
                <TouchableOpacity style={s.adminRow} onPress={() => navigation.navigate("CenterManagement")} activeOpacity={0.7}>
                  <View style={[s.adminIco, { backgroundColor: "#F3EDFF" }]}>
                    <Ionicons name="business-outline" size={ms(18)} color="#5B2D8E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.adminT}>Manage Centers</Text>
                    <Text style={s.adminSub}>Create centers and assign staff</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: ms(8) }} />
          </View>

        </ScrollView>

        {/* ── Bottom nav (stays fixed) ── */}
        <View style={s.nav}>
          <TouchableOpacity style={s.navI}>
            <Ionicons name="grid" size={22} color={C.primary} />
            <Text style={[s.navL, { color: C.primary, fontWeight: "700" }]}>Dashboard</Text>
            <View style={s.navDot} />
          </TouchableOpacity>
          <TouchableOpacity style={s.navI} onPress={() => navigation.navigate("StudentList")}>
            <Ionicons name="school-outline" size={22} color={C.muted} />
            <Text style={s.navL}>Students</Text>
          </TouchableOpacity>
          <View style={s.fabW}>
            <TouchableOpacity onPress={() => navigation.navigate("NewAdmission")}>
              <LinearGradient colors={[C.secondary, C.orange]} style={s.fab}>
                <Ionicons name="add" size={28} color="#2B1B1F" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.navI} onPress={() => navigation.navigate("FacultyList")}>
            <Ionicons name="people-outline" size={22} color={C.muted} />
            <Text style={s.navL}>Faculty</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.navI} onPress={handleProfilePress}>
            <Ionicons name="person-outline" size={22} color={C.muted} />
            <Text style={s.navL}>Profile</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: "#5C0E23" },
  root:      { flex: 1, backgroundColor: C.bg },
  header:    { paddingTop: ms(14), overflow: "hidden" },
  hPad:      { paddingHorizontal: ms(18), paddingBottom: ms(18), gap: ms(14) },

  // Date row
  dateRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateChip:     { flexDirection: "row", alignItems: "center", gap: ms(5), backgroundColor: "rgba(255,255,255,0.14)", borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(4) },
  dateText:     { fontSize: fs(11), fontWeight: "600", color: "rgba(255,255,255,0.88)", letterSpacing: 0.2 },
  headerActions:{ flexDirection: "row", alignItems: "center", gap: ms(8) },
  hBtn:         { width: ms(36), height: ms(36), borderRadius: ms(12), backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  bellDot:      { position: "absolute", top: ms(7), right: ms(7), width: ms(7), height: ms(7), borderRadius: ms(3.5), backgroundColor: C.secondary, borderWidth: 1.5, borderColor: "rgba(80,10,30,0.7)" },

  // Profile row
  profileRow:   { flexDirection: "row", alignItems: "center", gap: ms(13) },
  avatarRing:   { width: ms(54), height: ms(54), borderRadius: ms(27), borderWidth: 2.5, borderColor: "rgba(245,179,1,0.80)", padding: ms(2), flexShrink: 0 },
  avatar:       { flex: 1, borderRadius: ms(24), backgroundColor: "rgba(255,255,255,0.22)", justifyContent: "center", alignItems: "center" },
  avatarL:      { fontSize: fs(20), fontWeight: "800", color: "#fff" },
  profileInfo:  { flex: 1, minWidth: 0, gap: ms(1) },
  hi:           { fontSize: fs(12), color: "rgba(255,255,255,0.72)", fontWeight: "500" },
  hName:        { fontSize: fs(18), fontWeight: "800", color: "#fff", letterSpacing: 0.1 },
  centerChip:   { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(2) },
  centerChipT:  { fontSize: fs(11), color: "rgba(255,255,255,0.7)", flexShrink: 1 },

  // Glass stats strip
  glassStrip:   { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.13)", borderRadius: ms(16), borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
  pill:         { flex: 1, alignItems: "center", paddingVertical: ms(11) },
  pillVal:      { fontSize: fs(16), fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  pillLbl:      { fontSize: fs(9.5), color: "rgba(255,255,255,0.68)", fontWeight: "600", marginTop: ms(2), textTransform: "uppercase", letterSpacing: 0.3 },
  pillDivider:  { width: 1, height: ms(30), backgroundColor: "rgba(255,255,255,0.20)" },
  pillSkel:     { flex: 1, height: ms(36), margin: ms(10), borderRadius: ms(8), backgroundColor: "rgba(255,255,255,0.14)" },

  // Switch row
  switchRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ms(8) },
  switchMeta:   { fontSize: fs(11.5), color: "rgba(255,255,255,0.72)", flex: 1 },
  switchChip:   { flexDirection: "row", alignItems: "center", gap: ms(4), backgroundColor: "rgba(255,255,255,0.16)", borderRadius: ms(10), paddingHorizontal: ms(10), paddingVertical: ms(5), borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  switchChipT:  { fontSize: fs(10.5), fontWeight: "700", color: "rgba(255,255,255,0.92)" },

  scroll:     { flex: 1 },
  scrollBody: { flexGrow: 1 },
  content:    { paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(4) },

  // Quick-access chips
  quickRow:  { gap: ms(8), paddingBottom: ms(14) },
  quickChip: { flexDirection: "row", alignItems: "center", gap: ms(7), borderRadius: ms(24), paddingHorizontal: ms(13), paddingVertical: ms(8), borderWidth: 1.5 },
  quickIco:  { width: ms(26), height: ms(26), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },
  quickLbl:  { fontSize: fs(12.5), fontWeight: "700" },

  // Section header
  secRowHead:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(12) },
  secRowTitle: { fontSize: fs(16), fontWeight: "800", color: C.text, letterSpacing: 0.1 },
  secRowSub:   { fontSize: fs(11.5), color: C.muted, fontWeight: "500" },

  grid:      { flexDirection: "row", flexWrap: "wrap", gap: ms(12), marginBottom: ms(16) },
  statCard:  { width: CARD_W, borderRadius: ms(18), padding: ms(14), paddingLeft: ms(18), borderWidth: 1.5, overflow: "hidden", minHeight: ms(122) },
  cardStripe:{ position: "absolute", left: 0, top: ms(14), bottom: ms(14), width: ms(3.5), borderRadius: ms(2) },
  ghostIcon: { position: "absolute", bottom: ms(-10), right: ms(-6) },
  statIcon:  { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center", marginBottom: ms(8), borderWidth: 1 },
  statVal:   { fontSize: fs(22), fontWeight: "800", marginBottom: ms(2), letterSpacing: -0.5 },
  statLbl:   { fontSize: fs(11), color: C.muted, fontWeight: "500", marginBottom: ms(5) },
  delta:     { flexDirection: "row", alignItems: "center" },
  deltaT:    { fontSize: fs(10), fontWeight: "700" },
  cardArrow: { position: "absolute", top: ms(12), right: ms(12), width: ms(22), height: ms(22), borderRadius: ms(7), justifyContent: "center", alignItems: "center" },


  card:    { backgroundColor: C.card, borderRadius: ms(18), padding: ms(16), marginBottom: ms(16), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(4) }, shadowOpacity: 0.1, shadowRadius: ms(10), elevation: 3 },
  secHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ms(4) },
  secT:    { fontSize: fs(15), fontWeight: "700", color: C.text },
  secLnk:  { fontSize: fs(11.5), color: C.muted, fontWeight: "600" },
  cMeta:   { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(10) },
  cNum:    { fontSize: fs(19), fontWeight: "800", color: C.text },
  gTag:    { backgroundColor: "#E7F7EF", borderRadius: ms(8), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  gTagT:   { fontSize: fs(11), fontWeight: "700", color: "#1B9C63" },
  months:  { flexDirection: "row", justifyContent: "space-between", marginTop: ms(8), width: CHART_W },
  month:   { fontSize: fs(9), color: C.muted, textAlign: "center" },
  monthHi: { color: C.primary, fontWeight: "700" },

  actRow:  { flexDirection: "row", alignItems: "center", paddingVertical: ms(10), gap: ms(12) },
  actDiv:  { borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  actIco:  { width: ms(36), height: ms(36), borderRadius: ms(11), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  actBod:  { flex: 1, minWidth: 0 },
  actTtl:  { fontSize: fs(12.5), fontWeight: "600", color: C.text },
  actSub:  { fontSize: fs(11), color: C.muted, marginTop: ms(1) },
  actTm:   { fontSize: fs(10), color: "#C7BAB4", flexShrink: 0 },

  emptyAct:    { alignItems: "center", paddingVertical: ms(24), gap: ms(6) },
  centerRow:     { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), gap: ms(12) },
  centerDiv:     { borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  centerRowIcon: { width: ms(34), height: ms(34), borderRadius: ms(10), backgroundColor: "#F3EDFF", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  centerRowName: { fontSize: fs(14), fontWeight: "700", color: "#1E1014", marginBottom: 2 },
  centerRowMeta: { fontSize: fs(12), color: "#7A6E70" },
  emptyActT:   { fontSize: fs(13), fontWeight: "700", color: "#B0A9AC" },
  emptyActSub: { fontSize: fs(11), color: "#C7BAB4", textAlign: "center" },

  adminDiv: { height: 1, backgroundColor: "#EDE8E3", marginHorizontal: ms(4) },
  adminRow: { flexDirection: "row", alignItems: "center", gap: ms(12), marginTop: ms(12), padding: ms(12), backgroundColor: C.bg, borderRadius: ms(14) },
  adminIco: { width: ms(40), height: ms(40), borderRadius: ms(12), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  adminT:   { fontSize: fs(14), fontWeight: "700", color: C.text },
  adminSub: { fontSize: fs(11), color: C.muted, marginTop: 2 },

  nav:    { flexDirection: "row", backgroundColor: "#fff", borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingTop: ms(10), paddingBottom: ms(20), paddingHorizontal: ms(8), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: -ms(4) }, shadowOpacity: 0.15, shadowRadius: ms(12), elevation: 10 },
  navI:   { flex: 1, alignItems: "center", gap: ms(3) },
  navL:   { fontSize: fs(9.5), color: C.muted, fontWeight: "600" },
  navDot: { width: ms(4), height: ms(4), borderRadius: ms(2), backgroundColor: C.primary, marginTop: ms(1) },
  fabW:   { flex: 1, alignItems: "center", marginTop: -ms(26) },
  fab:    { width: ms(52), height: ms(52), borderRadius: ms(26), justifyContent: "center", alignItems: "center", shadowColor: C.orange, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.5, shadowRadius: ms(16), elevation: 8 },
});

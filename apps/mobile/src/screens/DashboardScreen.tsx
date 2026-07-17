import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Rect,
  Path,
  Defs,
  LinearGradient as SvgGrad,
  Stop,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";

const { width: W } = Dimensions.get("window");

const C = {
  primary: "#8B1E3F",
  secondary: "#F5B301",
  accent: "#2CA6A4",
  support: "#E8752C",
  bg: "#FFFBF0",
  card: "#FFFFFF",
  text: "#2B1B1F",
  muted: "#8A7F82",
};

// card width: body pads 16 each side, gap 10 between two cols
const CARD_W = (W - 32 - 10) / 2;
// chart width: body pads 16 each side, card pads 18 each side
const CHART_W = W - 32 - 36;

// ── Polka dot overlay ─────────────────────────────────────────────────────────
function PolkaDots() {
  const sp = 22;
  const cols = Math.ceil(W / sp) + 2;
  const rows = 14;
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dots.push(
        <Circle
          key={`${r}-${c}`}
          cx={c * sp + (r % 2 ? sp / 2 : 0)}
          cy={r * sp}
          r={1.5}
          fill="rgba(255,255,255,0.12)"
        />
      );
  return (
    <Svg width={W} height={rows * sp} style={StyleSheet.absoluteFill}>
      {dots}
    </Svg>
  );
}

// ── Wave divider ──────────────────────────────────────────────────────────────
function Wave() {
  return (
    <Svg
      width={W}
      height={40}
      viewBox={`0 0 ${W} 40`}
      preserveAspectRatio="none"
      style={{ display: "flex" }}
    >
      <Path
        d={`M0 22 C${W * 0.23} 46,${W * 0.77} 4,${W} 22 L${W} 40 L0 40 Z`}
        fill={C.bg}
      />
    </Svg>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BarChart() {
  const cH = 90;
  const values = [45, 57, 66, 50, 82, 62, 71, 92];
  const months = ["Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  const n = values.length;
  const gap = 8;
  const bW = (CHART_W - gap * (n - 1)) / n;

  return (
    <View>
      <Svg width={CHART_W} height={cH}>
        <Defs>
          <SvgGrad id="barHi" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={C.support} />
            <Stop offset="100%" stopColor={C.primary} />
          </SvgGrad>
        </Defs>
        {values.map((v, i) => {
          const bH = (v / 100) * cH;
          return (
            <Rect
              key={i}
              x={i * (bW + gap)}
              y={cH - bH}
              width={bW}
              height={bH}
              rx={6}
              fill={i === 4 ? "url(#barHi)" : "#F1E7DD"}
            />
          );
        })}
      </Svg>
      <View style={s.months}>
        {months.map((m, i) => (
          <Text key={m} style={[s.month, i === 4 && s.monthHi]}>
            {m}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
const STATS: {
  label: string; value: string; icon: string;
  color: string; bg: string; delta: string; up: boolean;
}[] = [
    { label: "Total Batches", value: "18", icon: "layers-outline", color: C.primary, bg: "#FFFFFF", delta: "+2 this month", up: false },
    { label: "Total Courses", value: "6", icon: "book-outline", color: C.accent, bg: "#FFFFFF", delta: "No change", up: false },
    { label: "Total Faculties", value: "14", icon: "people-outline", color: C.support, bg: "#FFFFFF", delta: "+1 this month", up: false },
    { label: "Active Students", value: "1,102", icon: "school-outline", color: "#946200", bg: "#FFFFFF", delta: "+64 this week", up: false },
    { label: "Active Batches", value: "15", icon: "calendar-outline", color: "#2563A8", bg: "#FFFFFF", delta: "+3 this month", up: false },
    { label: "Fees Collected", value: "₹4.2L", icon: "cash-outline", color: "#B3273F", bg: "#FFFFFF", delta: "+12% this month", up: false },
  ];

const ACTIVITY = [
  { icon: "person-add-outline", color: C.accent, title: "12 new students enrolled", sub: "NEET Batch 2026 · Morning", time: "2h ago" },
  { icon: "calendar-outline", color: C.support, title: "New batch scheduled", sub: "JEE Foundation · Starts Aug 1", time: "5h ago" },
  { icon: "document-text-outline", color: C.primary, title: "Faculty added", sub: "Priya Sharma · Physics", time: "1d ago" },
];

// ── Screen ────────────────────────────────────────────────────────────────────
export function DashboardScreen() {
  const { staff, logout } = useAuth();
  const name = staff?.fullName ?? "Admin";

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#5C0E23" />
      <View style={s.root}>

        {/* ── Header ── */}
        <LinearGradient
          colors={["#8B1E3F", "#A8264A", "#C64A3E", "#E8752C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.header}
        >
          <PolkaDots />
          <View style={s.hPad}>

            {/* Top row — avatar · greeting · bell */}
            <View style={s.topRow}>
              {/* Left: avatar + name — flex:1 + minWidth:0 prevents overflow */}
              <View style={s.greet}>
                <View style={s.avatar}>
                  <Text style={s.avatarL}>{name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={s.greetTxt}>
                  <Text style={s.hi} numberOfLines={1}>Good morning,</Text>
                  <Text style={s.hName} numberOfLines={1}>{name}</Text>
                </View>
              </View>

              {/* Right: bell — explicit 40×40, flexShrink:0 so it never hides */}
              <TouchableOpacity
                style={s.bell}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="notifications-outline" size={18} color="#fff" />
                <View style={s.bellDot} />
              </TouchableOpacity>
            </View>

            {/* Overview */}
            <Text style={s.overLabel}>TOTAL ENROLLMENTS</Text>
            <Text style={s.overBig}>1,284 students</Text>
            <Text style={s.overSub}>Across 6 courses & 18 active batches</Text>
          </View>
          {/* Wave is the bottom border of the header — curves into the content bg */}
          <Wave />
        </LinearGradient>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.body}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats grid */}
          <View style={s.grid}>
            {STATS.map((st) => (
              <View key={st.label} style={[s.statCard, { backgroundColor: st.bg }]}>
                <View style={[s.statIcon, { backgroundColor: st.color }]}>
                  <Ionicons name={st.icon as any} size={17} color="#fff" />
                </View>
                <Text style={s.statVal}>{st.value}</Text>
                <Text style={s.statLbl}>{st.label}</Text>
                <View style={s.delta}>
                  {/* <Ionicons
                    name={st.up ? "trending-up" : "remove-outline"}
                    size={10}
                    color={st.up ? "#1B9C63" : C.muted}
                  /> */}
                  <Text style={[s.deltaT, { color: "#1B9C63" }]}>
                    {" " + st.delta}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Enrollment trend card */}
          <View style={s.card}>
            <View style={s.secHead}>
              <Text style={s.secT}>Enrollment Trend</Text>
              <TouchableOpacity>
                <Text style={s.secLnk}>This year</Text>
              </TouchableOpacity>
            </View>
            <View style={s.cMeta}>
              <Text style={s.cNum}>1,284</Text>
              <View style={s.gTag}>
                <Text style={s.gTagT}>+18.4%</Text>
              </View>
            </View>
            <BarChart />
          </View>

          {/* Recent activity card */}
          <View style={s.card}>
            <View style={s.secHead}>
              <Text style={s.secT}>Recent Activity</Text>
              <TouchableOpacity>
                <Text style={s.secLnk}>View all</Text>
              </TouchableOpacity>
            </View>
            {ACTIVITY.map((a, i) => (
              <View
                key={i}
                style={[s.actRow, i < ACTIVITY.length - 1 && s.actDiv]}
              >
                <View style={[s.actIco, { backgroundColor: a.color }]}>
                  <Ionicons name={a.icon as any} size={16} color="#fff" />
                </View>
                <View style={s.actBod}>
                  <Text style={s.actTtl}>{a.title}</Text>
                  <Text style={s.actSub}>{a.sub}</Text>
                </View>
                <Text style={s.actTm}>{a.time}</Text>
              </View>
            ))}
          </View>

          <View style={{ height: 12 }} />
        </ScrollView>

        {/* ── Bottom nav ── */}
        <View style={s.nav}>
          <TouchableOpacity style={s.navI}>
            <Ionicons name="grid" size={22} color={C.primary} />
            <Text style={[s.navL, { color: C.primary, fontWeight: "700" }]}>Dashboard</Text>
            <View style={s.navDot} />
          </TouchableOpacity>

          <TouchableOpacity style={s.navI}>
            <Ionicons name="school-outline" size={22} color={C.muted} />
            <Text style={s.navL}>Students</Text>
          </TouchableOpacity>

          <View style={s.fabW}>
            <TouchableOpacity>
              <LinearGradient colors={[C.secondary, C.support]} style={s.fab}>
                <Ionicons name="add" size={28} color="#2B1B1F" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.navI}>
            <Ionicons name="people-outline" size={22} color={C.muted} />
            <Text style={s.navL}>Faculty</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.navI} onPress={logout}>
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
  safe: { flex: 1, backgroundColor: "#5C0E23" },
  root: { flex: 1, backgroundColor: C.bg },

  // Header — paddingBottom removed; Wave SVG inside provides the wavy bottom edge
  header: { paddingTop: 16, overflow: "hidden" },
  hPad: { paddingHorizontal: 22, paddingBottom: 20 },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",  // greet left, bell right — no overflow
    marginBottom: 18,
  },

  // greet: flex:1 + minWidth:0 → the key combo that prevents text overflow
  greet: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarL: { fontSize: 18, fontWeight: "700", color: "#fff" },

  // greetTxt: flex:1 + minWidth:0 → text truncates instead of overflowing
  greetTxt: { marginLeft: 10, flex: 1, minWidth: 0 },
  hi: { fontSize: 11.5, color: "rgba(255,255,255,0.78)" },
  hName: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // bell: explicit 40×40, flexShrink:0 → always visible, never collapses
  bell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  bellDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.secondary,
    borderWidth: 1.5,
    borderColor: "rgba(139,30,63,0.9)",
  },

  overLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  overBig: { fontSize: 26, fontWeight: "800", color: "#fff", marginBottom: 2 },
  overSub: { fontSize: 12, color: "rgba(255,255,255,0.85)" },

  // Scroll
  // marginTop: -34 pulls the scroll content up over the header wave so cards overlap
  scroll: { flex: 1, marginTop: -34 },
  body: { paddingHorizontal: 16, paddingTop: 4 },

  // Stats grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  statCard: {
    width: CARD_W,
    borderRadius: 18,
    padding: 14,
    shadowColor: "#2B1B1F",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 3,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statVal: { fontSize: 21, fontWeight: "800", color: C.text, marginBottom: 2 },
  statLbl: { fontSize: 11, color: C.muted, fontWeight: "500", marginBottom: 4 },
  delta: { flexDirection: "row", alignItems: "center" },
  deltaT: { fontSize: 10, fontWeight: "700" },

  // Cards
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#2B1B1F",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 3,
  },
  secHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  secT: { fontSize: 15, fontWeight: "700", color: C.text },
  secLnk: { fontSize: 11.5, color: C.primary, fontWeight: "600" },

  // Chart meta
  cMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cNum: { fontSize: 19, fontWeight: "800", color: C.text },
  gTag: { backgroundColor: "#E7F7EF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  gTagT: { fontSize: 11, fontWeight: "700", color: "#1B9C63" },

  // Months row under chart
  months: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, width: CHART_W },
  month: { fontSize: 9, color: C.muted, textAlign: "center" },
  monthHi: { color: C.primary, fontWeight: "700" },

  // Activity
  actRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  actDiv: { borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  actIco: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  actBod: { flex: 1, minWidth: 0 },
  actTtl: { fontSize: 12.5, fontWeight: "600", color: C.text },
  actSub: { fontSize: 11, color: C.muted, marginTop: 1 },
  actTm: { fontSize: 10, color: "#C7BAB4", flexShrink: 0 },

  // Bottom nav
  nav: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingBottom: 22,
    paddingHorizontal: 8,
    shadowColor: "#2B1B1F",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  navI: { flex: 1, alignItems: "center", gap: 3 },
  navL: { fontSize: 9.5, color: C.muted, fontWeight: "600" },
  navDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary, marginTop: 1 },

  fabW: { flex: 1, alignItems: "center", marginTop: -26 },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: C.support,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 22,
    elevation: 8,
  },
});

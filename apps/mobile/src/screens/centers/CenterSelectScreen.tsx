import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, type CenterInfo } from "../../context/AuthContext";
import { ms, fs, sw } from "../../utils/responsive";
import { C } from "../../theme";
import { ROLE_META, type Role } from "../../constants/roleMeta";
import { useAlert } from "../../context/AlertContext";

// ── Decorative helpers (mirrors ScreenHeader) ─────────────────────────────────

const WAVE_H = Math.round(ms(40));

function PolkaDots({ height }: { height: number }) {
  const sp = ms(22);
  const cols = Math.ceil(sw / sp) + 2;
  const rows = Math.ceil(height / sp) + 1;
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dots.push(
        <Circle
          key={`${r}-${c}`}
          cx={c * sp + (r % 2 ? sp / 2 : 0)}
          cy={r * sp}
          r={ms(1.5)}
          fill="rgba(255,255,255,0.12)"
        />
      );
  return (
    <Svg width={sw} height={height} style={StyleSheet.absoluteFill}>
      {dots}
    </Svg>
  );
}

function Wave() {
  return (
    <Svg width={sw} height={WAVE_H} viewBox={`0 0 ${sw} ${WAVE_H}`} preserveAspectRatio="none">
      <Path
        d={`M0 ${WAVE_H * 0.5} C${sw * 0.25} ${WAVE_H},${sw * 0.75} 0,${sw} ${WAVE_H * 0.5} L${sw} ${WAVE_H} L0 ${WAVE_H} Z`}
        fill={C.bg}
      />
    </Svg>
  );
}

// ── Center card ───────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function CenterCard({
  center,
  loading,
  onPress,
  disabled,
}: {
  center: CenterInfo;
  loading: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const rm = ROLE_META[center.role as Role] ?? ROLE_META.frontdesk;

  return (
    <TouchableOpacity
      style={s.card}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.72}
    >
      {/* Left accent strip */}
      <View style={[s.accent, { backgroundColor: rm.color }]} />

      {/* Avatar */}
      <View style={[s.avatar, { backgroundColor: rm.bg }]}>
        <Text style={[s.avatarT, { color: rm.color }]}>{initials(center.name)}</Text>
      </View>

      {/* Body */}
      <View style={s.cardBody}>
        <Text style={s.cardName} numberOfLines={1}>{center.name}</Text>
        <View style={s.chipRow}>
          <Ionicons name={rm.icon as any} size={ms(11)} color={rm.color} />
          <Text style={[s.chipT, { color: rm.color }]}>{rm.label}</Text>
        </View>
      </View>

      {loading
        ? <ActivityIndicator size="small" color={rm.color} style={s.arrow} />
        : <Ionicons name="chevron-forward" size={ms(18)} color={C.muted} style={s.arrow} />
      }
    </TouchableOpacity>
  );
}

// ── All-centers card ──────────────────────────────────────────────────────────

function AllCentersCard({
  loading,
  onPress,
  disabled,
}: {
  loading: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.card, s.allCard]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.72}
    >
      <View style={[s.accent, { backgroundColor: C.purple }]} />
      <View style={[s.avatar, { backgroundColor: C.purpleBg }]}>
        <Ionicons name="globe-outline" size={ms(20)} color={C.purple} />
      </View>
      <View style={s.cardBody}>
        <Text style={[s.cardName, { color: C.purple }]}>All Centers</Text>
        <Text style={s.allSub}>Aggregated view across all branches</Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={C.purple} style={s.arrow} />
        : <Ionicons name="chevron-forward" size={ms(18)} color={C.purple} style={s.arrow} />
      }
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function CenterSelectScreen() {
  const insets = useSafeAreaInsets();
  const { staff, pendingCenters, selectCenter } = useAuth();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState<string | null>(null);

  const centers = pendingCenters ?? [];
  const heroH   = insets.top + ms(130);

  async function handleSelect(centerId: string | null) {
    const key = centerId ?? "__all__";
    setLoading(key);
    try {
      await selectCenter(centerId);
    } catch {
      showAlert("Error", "Could not select center. Please try again.", "error");
      setLoading(null);
    }
  }

  const ListHeader = (
    <View style={s.listHeader}>
      {centers.length >= 2 && (
        <AllCentersCard
          loading={loading === "__all__"}
          onPress={() => handleSelect(null)}
          disabled={loading !== null}
        />
      )}
      <Text style={s.sectionLabel}>
        {centers.length === 1 ? "YOUR CENTER" : "YOUR BRANCHES"}
      </Text>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Hero ── */}
      <LinearGradient
        colors={["#8B1E3F", "#A8264A", "#C64A3E", "#E8752C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.hero, { paddingTop: insets.top + ms(24) }]}
      >
        <PolkaDots height={heroH} />

        <View style={s.heroRow}>
          <View style={s.heroText}>
            <Text style={s.heroGreet}>Welcome back</Text>
            <Text style={s.heroName} numberOfLines={1}>{staff?.fullName ?? "Staff"}</Text>
            <View style={s.heroPill}>
              <Ionicons name="location-outline" size={ms(11)} color="rgba(255,255,255,0.8)" />
              <Text style={s.heroPillT}>Select a center to continue</Text>
            </View>
          </View>

          {/* Institute emblem — right side */}
          <View style={s.emblem}>
            <Ionicons name="school" size={ms(28)} color={C.primary} />
          </View>
        </View>

        <Wave />
      </LinearGradient>

      {/* ── Center list ── */}
      <FlatList
        data={centers}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <CenterCard
            center={item}
            loading={loading === item.id}
            onPress={() => handleSelect(item.id)}
            disabled={loading !== null}
          />
        )}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={s.sep} />}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Hero
  hero: {
    overflow:        "hidden",
    paddingBottom:   0,
    paddingHorizontal: ms(22),
  },
  heroRow: {
    flexDirection:  "row",
    alignItems:     "center",
    paddingBottom:  ms(20),
    gap:            ms(16),
  },
  emblem: {
    width:           ms(60),
    height:          ms(60),
    borderRadius:    ms(18),
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
    shadowColor:     "#000",
    shadowOffset:    { width: 0, height: ms(4) },
    shadowOpacity:   0.18,
    shadowRadius:    ms(10),
    elevation:       6,
  },
  heroText: { flex: 1 },
  heroGreet: { fontSize: fs(12.5), color: "rgba(255,255,255,0.72)", fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: ms(3) },
  heroName:  { fontSize: fs(24), color: "#FFFFFF", fontWeight: "800", letterSpacing: -0.3, marginBottom: ms(10) },
  heroPill:  { flexDirection: "row", alignItems: "center", gap: ms(4), alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: ms(20), paddingHorizontal: ms(10), paddingVertical: ms(5) },
  heroPillT: { fontSize: fs(11.5), color: "rgba(255,255,255,0.9)", fontWeight: "600" },

  // List
  list:        { paddingHorizontal: ms(16), paddingBottom: ms(36), paddingTop: ms(4) },
  listHeader:  { gap: ms(4), marginBottom: ms(4) },
  sectionLabel:{ fontSize: fs(10.5), fontWeight: "700", color: C.muted, letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: ms(4), paddingTop: ms(8), paddingBottom: ms(4) },
  sep:         { height: ms(8) },

  // Card
  card: {
    flexDirection:   "row",
    alignItems:      "center",
    backgroundColor: C.card,
    borderRadius:    ms(16),
    overflow:        "hidden",
    shadowColor:     "#3A1020",
    shadowOffset:    { width: 0, height: ms(3) },
    shadowOpacity:   0.08,
    shadowRadius:    ms(8),
    elevation:       3,
  },
  allCard: {
    borderWidth:  1.5,
    borderColor:  "rgba(91,45,142,0.15)",
  },
  accent: {
    width:  ms(4),
    alignSelf: "stretch",
    flexShrink: 0,
  },
  avatar: {
    width:           ms(44),
    height:          ms(44),
    borderRadius:    ms(12),
    alignItems:      "center",
    justifyContent:  "center",
    marginHorizontal: ms(12),
    flexShrink:      0,
  },
  avatarT:  { fontSize: fs(14), fontWeight: "800" },
  cardBody: { flex: 1, paddingVertical: ms(16), paddingRight: ms(4) },
  cardName: { fontSize: fs(15), fontWeight: "700", color: C.text, marginBottom: ms(5) },
  chipRow:  { flexDirection: "row", alignItems: "center", gap: ms(4) },
  chipT:    { fontSize: fs(11), fontWeight: "700" },
  allSub:   { fontSize: fs(11.5), color: C.muted, marginTop: ms(3) },
  arrow:    { paddingHorizontal: ms(14), flexShrink: 0 },
});

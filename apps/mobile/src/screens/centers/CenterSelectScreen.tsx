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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, type CenterInfo } from "../../context/AuthContext";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, contrastColor, type ThemeColors } from "../../context/ThemeContext";
import { ROLE_META, type Role } from "../../constants/roleMeta";
import { useAlert } from "../../context/AlertContext";

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
  center, loading, onPress, disabled,
}: {
  center: CenterInfo;
  loading: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const colors = useThemeColors();
  const rm = ROLE_META[center.role as Role] ?? ROLE_META.frontdesk;
  return (
    <TouchableOpacity style={ss.card} onPress={onPress} disabled={disabled} activeOpacity={0.72}>
      <View style={[ss.avatar, { backgroundColor: rm.bg }]}>
        <Text style={[ss.avatarT, { color: rm.color }]}>{initials(center.name)}</Text>
      </View>
      <View style={ss.cardBody}>
        <Text style={[ss.cardName, { color: colors.text }]} numberOfLines={1}>{center.name}</Text>
        <View style={ss.chipRow}>
          <Ionicons name={rm.icon as any} size={ms(11)} color={rm.color} />
          <Text style={[ss.chipT, { color: rm.color }]}>{rm.label}</Text>
        </View>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={rm.color} style={ss.arrow} />
        : <Ionicons name="chevron-forward" size={ms(18)} color={C.muted} style={ss.arrow} />}
    </TouchableOpacity>
  );
}

// ── All-centers card ──────────────────────────────────────────────────────────

function AllCentersCard({ loading, onPress, disabled }: {
  loading: boolean; onPress: () => void; disabled: boolean;
}) {
  return (
    <TouchableOpacity style={[ss.card, ss.allCard]} onPress={onPress} disabled={disabled} activeOpacity={0.72}>
      <View style={[ss.avatar, { backgroundColor: C.purpleBg }]}>
        <Ionicons name="globe-outline" size={ms(20)} color={C.purple} />
      </View>
      <View style={ss.cardBody}>
        <Text style={[ss.cardName, { color: C.purple }]}>All Centers</Text>
        <Text style={ss.allSub}>Aggregated view across all branches</Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={C.purple} style={ss.arrow} />
        : <Ionicons name="chevron-forward" size={ms(18)} color={C.purple} style={ss.arrow} />}
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function CenterSelectScreen() {
  const colors  = useThemeColors();
  const t       = useThemedStyles(makeStyles);
  const insets  = useSafeAreaInsets();
  const { staff, pendingCenters, selectCenter, isSwitchingCenter, cancelCenterSwitch, logout } = useAuth();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState<string | null>(null);

  const centers = pendingCenters ?? [];

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
    <View style={ss.listHeader}>
      {centers.length >= 2 && (
        <AllCentersCard
          loading={loading === "__all__"}
          onPress={() => handleSelect(null)}
          disabled={loading !== null}
        />
      )}
      <Text style={ss.sectionLabel}>
        {centers.length === 1 ? "YOUR CENTER" : "YOUR BRANCHES"}
      </Text>
    </View>
  );

  return (
    <View style={[t.root, { backgroundColor: colors.screenBg }]}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Header ── */}
      <View style={[t.hero, { paddingTop: insets.top + ms(8), backgroundColor: colors.bg }]}>
        {/* Mid-session "switch center" has a session to cancel back into —
            only the very first post-login pick (no prior session) logs out. */}
        <TouchableOpacity
          style={t.backBtn}
          onPress={isSwitchingCenter ? cancelCenterSwitch : logout}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={ms(20)} color={contrastColor(colors.bg)} />
        </TouchableOpacity>

        <View style={t.heroCenter}>
          <View style={[t.emblem, { backgroundColor: colors.primary + "14" }]}>
            <Ionicons name="school" size={ms(26)} color={colors.primary} />
          </View>

          <Text style={t.heroGreet}>Welcome back</Text>
          <Text style={t.heroName} numberOfLines={1}>{staff?.fullName ?? "Staff"}</Text>

          <View style={[t.heroPill, { backgroundColor: colors.primary + "14" }]}>
            <Ionicons name="location-outline" size={ms(11)} color={colors.primary} />
            <Text style={[t.heroPillT, { color: colors.primary }]}>Select a center to continue</Text>
          </View>
        </View>
      </View>

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
        contentContainerStyle={ss.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={ss.sep} />}
      />
    </View>
  );
}

// ── Static styles ─────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  // List
  list:         { paddingHorizontal: ms(16), paddingBottom: ms(36), paddingTop: ms(16) },
  listHeader:   { gap: ms(4), marginBottom: ms(4) },
  sectionLabel: {
    fontSize:      fs(10.5),
    fontFamily:    "Inter_700Bold",
    fontWeight:    "700",
    color:         C.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: ms(4),
    paddingTop:    ms(12),
    paddingBottom: ms(4),
  },
  sep: { height: ms(8) },

  // Card
  card: {
    flexDirection:   "row",
    alignItems:      "center",
    backgroundColor: C.card,
    borderRadius:    ms(16),
    paddingHorizontal: ms(12),
    shadowColor:     "#000",
    shadowOffset:    { width: 0, height: ms(2) },
    shadowOpacity:   0.06,
    shadowRadius:    ms(8),
    elevation:       3,
  },
  allCard: {
    borderWidth:  1.5,
    borderColor:  "rgba(91,45,142,0.15)",
  },
  avatar: {
    width:           ms(44),
    height:          ms(44),
    borderRadius:    ms(12),
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
  },
  avatarT:  { fontSize: fs(14), fontFamily: "Inter_800ExtraBold", fontWeight: "800" },
  cardBody: { flex: 1, paddingVertical: ms(16), paddingLeft: ms(12), paddingRight: ms(4) },
  cardName: { fontSize: fs(15), fontFamily: "Inter_700Bold", fontWeight: "700", marginBottom: ms(5) },
  chipRow:  { flexDirection: "row", alignItems: "center", gap: ms(4) },
  chipT:    { fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700" },
  allSub:   { fontSize: fs(11.5), color: C.muted, marginTop: ms(3) },
  arrow:    { paddingLeft: ms(8), flexShrink: 0 },
});

// ── Themed styles ─────────────────────────────────────────────────────────────

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1 },

  // Hero header
  hero: {
    paddingHorizontal: ms(16),
    paddingBottom:     ms(28),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  // Theme-derived, matching ScreenHeader's back button — tint/icon come from
  // the contrast color against this header's own background (colors.bg).
  backBtn: {
    width:          ms(38),
    height:         ms(38),
    borderRadius:   ms(12),
    backgroundColor: contrastColor(colors.bg) + "18",
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   ms(12),
    marginTop:      ms(8),
  },
  heroCenter: {
    alignItems:        "center",
    paddingHorizontal: ms(8),
  },
  emblem: {
    width:          ms(64),
    height:         ms(64),
    borderRadius:   ms(20),
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   ms(16),
  },
  heroGreet: {
    fontSize:      fs(12),
    fontFamily:    "Inter_600SemiBold",
    fontWeight:    "600",
    color:         C.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom:  ms(4),
  },
  heroName: {
    fontSize:      fs(26),
    fontFamily:    "Inter_800ExtraBold",
    fontWeight:    "800",
    color:         colors.text,
    letterSpacing: -0.4,
    marginBottom:  ms(12),
    textAlign:     "center",
  },
  heroPill: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(5),
    borderRadius:      ms(20),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(6),
  },
  heroPillT: {
    fontSize:   fs(12),
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
});

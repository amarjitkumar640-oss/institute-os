import React, { useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";

export type BottomNavItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
};

export type BottomNavDialAction = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  angle: number; // degrees around the FAB, measured from the +x axis
  onPress: () => void;
};

const FAB_SZ  = ms(54);
const DIAL_SZ = ms(46);
const DIAL_R  = ms(96);

function NavBtn({ item, primaryColor }: { item: BottomNavItem; primaryColor: string }) {
  return (
    <TouchableOpacity style={nb.btn} onPress={item.onPress} activeOpacity={0.8}>
      {item.active ? (
        <View style={[nb.chip, { backgroundColor: primaryColor }]}>
          <Ionicons name={item.icon} size={ms(16)} color="#fff" />
          <Text style={nb.chipT}>{item.label}</Text>
        </View>
      ) : (
        <Ionicons name={item.icon} size={ms(22)} color={C.muted} />
      )}
    </TouchableOpacity>
  );
}

function DialBtn({ anim, action }: { anim: Animated.Value; action: BottomNavDialAction }) {
  const rad = (action.angle * Math.PI) / 180;
  const dx  = DIAL_R * Math.cos(rad);
  const dy  = -DIAL_R * Math.sin(rad);
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: (FAB_SZ - DIAL_SZ) / 2,
        left: "50%", marginLeft: -DIAL_SZ / 2,
        zIndex: 20,
        opacity: anim,
        transform: [
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          { scale:      anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
        ],
      }}
    >
      <TouchableOpacity onPress={action.onPress} activeOpacity={0.85}>
        <View style={{
          width: DIAL_SZ, height: DIAL_SZ, borderRadius: DIAL_SZ / 2,
          backgroundColor: action.color,
          justifyContent: "center", alignItems: "center",
          shadowColor: "#000", shadowOffset: { width: 0, height: ms(4) },
          shadowOpacity: 0.28, shadowRadius: ms(8), elevation: 6,
        }}>
          <Ionicons name={action.icon} size={ms(20)} color="#fff" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function BottomNav({ items, fabActions }: { items: BottomNavItem[]; fabActions?: BottomNavDialAction[] }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [fabOpen, setFabOpen] = useState(false);
  const fabRot = useRef(new Animated.Value(0)).current;
  const dialAnims = useRef((fabActions ?? []).map(() => new Animated.Value(0))).current;

  function toggleFab() {
    const opening = !fabOpen;
    setFabOpen(opening);
    Animated.timing(fabRot, { toValue: opening ? 1 : 0, duration: opening ? 200 : 150, useNativeDriver: true }).start();
    if (opening) {
      Animated.stagger(70, dialAnims.map((anim) =>
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 9 })
      )).start();
    } else {
      Animated.parallel(dialAnims.map((anim) =>
        Animated.timing(anim, { toValue: 0, duration: 120, useNativeDriver: true })
      )).start();
    }
  }

  function dialPress(action: BottomNavDialAction) {
    toggleFab();
    action.onPress();
  }

  const hasFab = !!fabActions && fabActions.length > 0;
  const splitAt = Math.ceil(items.length / 2);
  const leftItems  = hasFab ? items.slice(0, splitAt) : items;
  const rightItems = hasFab ? items.slice(splitAt) : [];

  return (
    <>
      {hasFab && (
        <Animated.View
          pointerEvents={fabOpen ? "auto" : "none"}
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "#000",
              zIndex: 15,
              opacity: fabRot.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] }),
            },
          ]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={toggleFab} />
        </Animated.View>
      )}

      <View style={[s.nav, { marginBottom: insets.bottom + ms(10) }]}>
        {leftItems.map((item) => (
          <NavBtn key={item.key} item={item} primaryColor={colors.primary} />
        ))}

        {hasFab && (
          <View style={s.fabArea}>
            <View pointerEvents={fabOpen ? "auto" : "none"} style={StyleSheet.absoluteFill}>
              {fabActions!.map((action, i) => (
                <DialBtn key={action.key} anim={dialAnims[i]} action={action} />
              ))}
            </View>
            <TouchableOpacity onPress={toggleFab} activeOpacity={0.88}>
              <View style={[s.fab, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
                <Animated.View
                  style={{
                    transform: [{
                      rotate: fabRot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }),
                    }],
                  }}
                >
                  <Ionicons name="add" size={ms(28)} color="#fff" />
                </Animated.View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {rightItems.map((item) => (
          <NavBtn key={item.key} item={item} primaryColor={colors.primary} />
        ))}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  // ── Bottom nav — floating pill ────────────────────────────────────────────
  nav: {
    flexDirection:     "row",
    backgroundColor:   C.card,
    borderRadius:      ms(40),
    marginHorizontal:  ms(16),
    paddingVertical:   ms(4),
    paddingHorizontal: ms(6),
    alignItems:        "center",
    shadowColor:       "#000",
    shadowOffset:      { width: 0, height: ms(8) },
    shadowOpacity:     0.13,
    shadowRadius:      ms(24),
    elevation:         14,
    zIndex:            25,
  },
  fabArea: {
    flex:       1,
    alignItems: "center",
    marginTop:  -ms(22),
    position:   "relative",
    zIndex:     20,
  },
  fab: {
    width:          FAB_SZ,
    height:         FAB_SZ,
    borderRadius:   FAB_SZ / 2,
    justifyContent: "center",
    alignItems:     "center",
    borderWidth:    3.5,
    borderColor:    C.bg,
    shadowOffset:   { width: 0, height: ms(6) },
    shadowOpacity:  0.5,
    shadowRadius:   ms(14),
    elevation:      8,
  },
});

const nb = StyleSheet.create({
  btn:   { flex: 1, alignItems: "center", justifyContent: "center", height: ms(50) },
  chip:  { flexDirection: "row", alignItems: "center", gap: ms(5), borderRadius: ms(24), paddingHorizontal: ms(13), paddingVertical: ms(8) },
  chipT: { fontSize: fs(12), fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },
});

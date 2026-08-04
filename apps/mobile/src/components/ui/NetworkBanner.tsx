import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";
import { useNetwork } from "../../context/NetworkContext";
import { C } from "../../theme";

const BANNER_H = ms(56);

export function NetworkBanner() {
  const { isOnline, justReconnected } = useNetwork();
  const insets    = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(BANNER_H + insets.bottom + ms(16))).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  const visible = !isOnline || justReconnected;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 160,
          friction: 13,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: BANNER_H + insets.bottom + ms(16),
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const isReconnected = isOnline && justReconnected;

  return (
    <Animated.View
      style={[
        s.wrap,
        { bottom: insets.bottom + ms(12), opacity, transform: [{ translateY }], pointerEvents: "none" },
      ]}
    >
      <View style={[s.banner, isReconnected ? s.onlineBg : s.offlineBg]}>
        {/* Pulse dot */}
        <View style={[s.dot, isReconnected ? s.dotOnline : s.dotOffline]} />

        {/* Icon */}
        <View style={[s.iconCircle, isReconnected ? s.iconCircleOnline : s.iconCircleOffline]}>
          <Ionicons
            name={isReconnected ? "wifi" : "wifi-outline"}
            size={ms(17)}
            color={isReconnected ? C.green : "#C64A3E"}
          />
        </View>

        {/* Text */}
        <View style={s.textCol}>
          <Text style={[s.title, isReconnected ? s.titleOnline : s.titleOffline]}>
            {isReconnected ? "Back Online" : "No Internet Connection"}
          </Text>
          <Text style={s.sub}>
            {isReconnected ? "Connection restored" : "Check your network settings"}
          </Text>
        </View>

        {/* Status pill */}
        <View style={[s.pill, isReconnected ? s.pillOnline : s.pillOffline]}>
          <Text style={[s.pillT, isReconnected ? s.pillTOnline : s.pillTOffline]}>
            {isReconnected ? "Online" : "Offline"}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position:          "absolute",
    left:              ms(12),
    right:             ms(12),
    zIndex:            9999,
    shadowColor:       "#000",
    shadowOffset:      { width: 0, height: ms(6) },
    shadowOpacity:     0.18,
    shadowRadius:      ms(16),
    elevation:         20,
  },

  banner: {
    flexDirection:  "row",
    alignItems:     "center",
    borderRadius:   ms(18),
    paddingVertical:    ms(12),
    paddingHorizontal:  ms(14),
    gap:            ms(10),
    overflow:       "hidden",
  },

  // Backgrounds
  offlineBg: {
    backgroundColor: "#1C0A0E",
    borderWidth:     1,
    borderColor:     "rgba(198,74,62,0.25)",
  },
  onlineBg: {
    backgroundColor: "#061A0F",
    borderWidth:     1,
    borderColor:     "rgba(27,156,99,0.25)",
  },

  // Pulse dot (top-left ambient glow)
  dot: {
    position:     "absolute",
    top:          -ms(20),
    left:         -ms(20),
    width:        ms(80),
    height:       ms(80),
    borderRadius: ms(40),
    opacity:      0.12,
  },
  dotOffline: { backgroundColor: "#C64A3E" },
  dotOnline:  { backgroundColor: C.green },

  // Icon
  iconCircle: {
    width:           ms(36),
    height:          ms(36),
    borderRadius:    ms(10),
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
  },
  iconCircleOffline: { backgroundColor: "rgba(198,74,62,0.15)" },
  iconCircleOnline:  { backgroundColor: "rgba(27,156,99,0.15)"  },

  // Text
  textCol: { flex: 1 },
  title:   { fontSize: fs(13.5), fontFamily: "Inter_700Bold", fontWeight: "700", marginBottom: ms(1) },
  titleOffline: { color: "#F5D0CC" },
  titleOnline:  { color: "#B8EDD6" },
  sub: { fontSize: fs(11), color: "rgba(255,255,255,0.45)", fontFamily: "Inter_500Medium", fontWeight: "500" },

  // Status pill
  pill: {
    borderRadius:       ms(20),
    paddingHorizontal:  ms(10),
    paddingVertical:    ms(4),
    flexShrink:         0,
  },
  pillOffline: { backgroundColor: "rgba(198,74,62,0.18)" },
  pillOnline:  { backgroundColor: "rgba(27,156,99,0.18)"  },
  pillT:       { fontSize: fs(10.5), fontFamily: "Inter_700Bold", fontWeight: "700" },
  pillTOffline:{ color: "#E8907E" },
  pillTOnline: { color: "#5ED4A0"  },
});

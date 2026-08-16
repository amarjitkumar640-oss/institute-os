import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { useThemeColors, useBrandLogoUrl, darken, lighten } from "../../context/ThemeContext";
import { ms, fs } from "../../utils/responsive";
import { T } from "./typography";

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(700 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay]);

  const scale   = v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  return <Animated.View style={[styles.dot, { transform: [{ scale }], opacity }]} />;
}

// Same three translucent wave layers used behind the login screen's header
// (see WaveOverlay in LoginScreen.tsx), reused full-bleed here so the splash
// and login screen read as one visual family rather than two unrelated looks.
function Waves() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 430 340" preserveAspectRatio="none">
      <Path fill="rgba(255,255,255,.12)" d="M0 150 C60 210 140 230 220 205 C300 180 360 160 430 185 L430 340 L0 340 Z" />
      <Path fill="rgba(255,255,255,.18)" d="M0 185 C70 250 150 260 240 220 C320 185 385 180 430 205 L430 340 L0 340 Z" />
      <Path fill="rgba(255,255,255,.28)" d="M0 250 C90 295 170 265 220 225 C285 170 345 230 430 180 L430 340 L0 340 Z" />
    </Svg>
  );
}

// Branded app-boot screen, shown while fonts load and again while the
// tenant's org/branding and auth session are being resolved — reads live
// tenant colors/logo the same way every other screen does, so it needs no
// tenant-specific config of its own. `orgName` is only known once the
// OrgProvider fetch resolves; falls back to the product name until then.
export function AppSplashScreen({ orgName }: { orgName?: string | null }) {
  const colors  = useThemeColors();
  const logoUrl = useBrandLogoUrl();

  // Logo entrance: a quick scale+fade pop on mount rather than appearing
  // instantly — runs once per mount, which (post the boot-sequence fix) is
  // exactly once for the whole splash lifetime, not re-triggered per gate.
  const badgeScale   = useRef(new Animated.Value(0.6)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(badgeScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(badgeOpacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <LinearGradient
      // Same two stops as the login screen's primary button gradient (see
      // LoginScreen.tsx) — keeps the splash color tied to the one place in
      // the app that already defines "what colors.primary looks like as a
      // gradient," instead of inventing a separate darken amount here.
      colors={[darken(colors.primary, 0.06), lighten(colors.primary, 0.12)]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.fill}
    >
      <Waves />

      <View style={styles.center}>
        <Animated.View
          style={[styles.badge, { opacity: badgeOpacity, transform: [{ scale: badgeScale }] }]}
        >
          <Image
            source={logoUrl ? { uri: logoUrl } : require("../../../assets/institute-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
        <Text style={styles.name}>{orgName || "Institute OS"}</Text>
        <Text style={styles.tagline}>Getting things ready…</Text>
      </View>

      <View style={styles.dots}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>

      <Text style={styles.powered}>Powered by The Success</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill:   { flex: 1, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", paddingHorizontal: ms(32) },
  badge: {
    width: ms(88), height: ms(88), borderRadius: ms(24),
    backgroundColor: "rgba(255,255,255,.97)",
    alignItems: "center", justifyContent: "center",
    marginBottom: ms(20),
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  logo: { width: ms(56), height: ms(56) },
  name: {
    ...T.displayMedium,
    color: "#fff", textAlign: "center",
  },
  tagline: {
    ...T.caption,
    color: "rgba(255,255,255,.72)", marginTop: ms(6),
  },
  dots: {
    position: "absolute", bottom: "14%", flexDirection: "row", gap: ms(7),
  },
  dot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: "#fff" },
  powered: {
    position: "absolute", bottom: ms(28),
    color: "rgba(255,255,255,.5)", fontSize: fs(9.5), fontWeight: "600",
    letterSpacing: 0.5, textTransform: "uppercase", fontFamily: "Inter_600SemiBold",
  },
});

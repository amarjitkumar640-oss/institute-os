import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";
import { useAppUpdate } from "../../context/AppUpdateContext";
import { useAlert } from "../../context/AlertContext";
import { downloadAndInstallApk } from "../../lib/apkInstaller";
import { useThemeColors } from "../../context/ThemeContext";
import { T } from "./typography";

const BANNER_H = ms(56);
const EXPLAINER_SEEN_KEY = "apk_install_explainer_seen";

// A colored large icon can't apply here — this is a purely informational,
// non-brand surface, so it takes the fixed semantic "blue" per
// DESIGN_SYSTEM.md, same reasoning as NetworkBanner's fixed red/green.
export function UpdateBanner() {
  const { updateAvailable, release, refetchLatest } = useAppUpdate();
  const { showConfirm } = useAlert();
  const colors  = useThemeColors();
  const insets  = useSafeAreaInsets();

  const [state, setState] = useState<"idle" | "downloading" | "error">("idle");
  const [progress, setProgress] = useState(0);

  const translateY = useRef(new Animated.Value(-(BANNER_H + insets.top + ms(16)))).current;
  const opacity     = useRef(new Animated.Value(0)).current;

  const visible = updateAvailable && state !== "error";

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : -(BANNER_H + insets.top + ms(16)),
        useNativeDriver: true,
        tension: 160,
        friction: 13,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 200 : 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  async function handleInstallPress() {
    const seen = await SecureStore.getItemAsync(EXPLAINER_SEEN_KEY);
    if (!seen) {
      showConfirm(
        "One-time permission needed",
        "Android will ask permission to install updates from this app — this only happens once. Allow it, then come back here.",
        () => {
          SecureStore.setItemAsync(EXPLAINER_SEEN_KEY, "1").catch(() => {});
          startDownload();
        },
        { confirmLabel: "Continue", cancelLabel: "Not now", brand: true },
      );
      return;
    }
    startDownload();
  }

  async function startDownload() {
    if (!release) return;
    setState("downloading");
    setProgress(0);
    try {
      // Signed download URL is short-lived — fetch a fresh one right before
      // downloading rather than trusting whatever was current when the
      // banner first appeared.
      const fresh = (await refetchLatest()) ?? release;
      await downloadAndInstallApk(fresh.downloadUrl, fresh.versionCode, setProgress);
      setState("idle");
    } catch (e) {
      console.error("[update] install failed", e);
      setState("error");
      // Give the user another chance rather than hiding the banner forever
      // on one failed attempt (e.g. a flaky connection mid-download).
      setTimeout(() => setState("idle"), 4000);
    }
  }

  if (!release) return null;

  return (
    <Animated.View
      style={[
        s.wrap,
        { top: insets.top + ms(12), opacity, transform: [{ translateY }] },
      ]}
      pointerEvents={visible ? "box-none" : "none"}
    >
      <View style={[s.banner, { backgroundColor: colors.blueBg, borderColor: colors.blue + "40" }]}>
        <View style={[s.iconCircle, { backgroundColor: colors.blue + "20" }]}>
          <Ionicons name="cloud-download-outline" size={ms(18)} color={colors.blue} />
        </View>

        <View style={s.textCol}>
          <Text style={[s.title, { color: colors.text }]}>
            {state === "downloading" ? "Downloading update…" : "Update available"}
          </Text>
          <Text style={[s.sub, { color: colors.muted }]} numberOfLines={1}>
            {state === "downloading"
              ? `${Math.round(progress * 100)}%`
              : release.changelog || `Version ${release.versionName}`}
          </Text>
        </View>

        {state !== "downloading" && (
          <TouchableOpacity
            style={[s.button, { backgroundColor: colors.blue }]}
            onPress={handleInstallPress}
            activeOpacity={0.85}
          >
            <Text style={s.buttonText}>Install</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left:     ms(12),
    right:    ms(12),
    zIndex:   9998,
    shadowColor:   "#000",
    shadowOffset:  { width: 0, height: ms(4) },
    shadowOpacity: 0.12,
    shadowRadius:  ms(12),
    elevation:     16,
  },
  banner: {
    flexDirection:  "row",
    alignItems:     "center",
    borderRadius:   ms(18),
    paddingVertical:   ms(10),
    paddingHorizontal: ms(12),
    gap: ms(10),
    borderWidth: 1,
  },
  iconCircle: {
    width: ms(34), height: ms(34), borderRadius: ms(10),
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  textCol: { flex: 1 },
  title: { ...T.listItemTitle },
  sub:   { ...T.caption, marginTop: ms(1) },
  button: {
    borderRadius: ms(12),
    paddingVertical: ms(7),
    paddingHorizontal: ms(14),
    flexShrink: 0,
  },
  buttonText: { ...T.chipText, color: "#fff", fontSize: fs(12) },
});

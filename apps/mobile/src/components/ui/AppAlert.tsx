import React, { useEffect, useRef } from "react";
import {
  Animated, Modal, StyleSheet, Text,
  TouchableOpacity, TouchableWithoutFeedback, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";
import { useThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";

// ── Types ─────────────────────────────────────────────────────────────────────

// "brand" is distinct from the other four: its color comes from the tenant's
// theme at render time (see `meta` below), not a fixed semantic hex — for
// confirmations that aren't a warning (e.g. logging out) but still deserve
// more presence than a plain info dialog.
export type AlertType   = "error" | "warning" | "info" | "success" | "brand";
export type ButtonStyle = "primary" | "danger" | "cancel";

export interface AlertButton {
  label:    string;
  onPress?: () => void;
  style?:   ButtonStyle;
}

export interface AlertConfig {
  title:    string;
  message?: string;
  type?:    AlertType;
  icon?:    string;
  buttons?: AlertButton[];
}

// ── Meta ──────────────────────────────────────────────────────────────────────
// These are structural/semantic (error/warning/info/success), not brand
// tokens — fixed app-wide regardless of tenant branding. "brand" isn't here;
// it's computed from useThemeColors() where `meta` is built below.

const TYPE_META: Record<Exclude<AlertType, "brand">, { icon: string; color: string; bg: string }> = {
  error:   { icon: "alert-circle",       color: C.red,    bg: "#FEF0F0" },
  warning: { icon: "warning",            color: C.orange, bg: "#FFF8EE" },
  info:    { icon: "information-circle", color: C.blue,   bg: "#EEF4FF" },
  success: { icon: "checkmark-circle",   color: C.green,  bg: C.greenBg },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  config:  AlertConfig | null;
  onClose: () => void;
}

export function AppAlert({ visible, config, onClose }: Props) {
  const colors = useThemeColors();
  const scale   = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1, useNativeDriver: true,
          tension: 200, friction: 14,
        }),
        Animated.timing(opacity, {
          toValue: 1, duration: 160, useNativeDriver: true,
        }),
      ]).start();
    } else {
      scale.setValue(0.88);
      opacity.setValue(0);
    }
  }, [visible]);

  if (!config) return null;

  const type    = config.type ?? "info";
  const meta    = type === "brand"
    ? { icon: config.icon ?? "log-out-outline", color: colors.primary, bg: colors.primary + "17" }
    : { ...TYPE_META[type], icon: config.icon ?? TYPE_META[type].icon };
  const buttons = config.buttons ?? [{ label: "OK" }];
  const isMulti = buttons.length > 2;
  const isTwo   = buttons.length === 2;

  function handlePress(btn: AlertButton) {
    onClose();
    btn.onPress?.();
  }

  // ── Multi-action list (3+ buttons — profile menu, etc.) ───────────────────
  if (isMulti) {
    return (
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={s.backdrop}>
            <TouchableWithoutFeedback>
              <Animated.View style={[s.card, { opacity, transform: [{ scale }] }]}>
                {/* Header */}
                <View style={s.multiHeader}>
                  <Text style={s.multiTitle}>{config.title}</Text>
                  {config.message ? <Text style={s.multiMsg}>{config.message}</Text> : null}
                </View>

                {/* Action rows */}
                {buttons.map((btn, i) => {
                  const isCancel  = btn.style === "cancel";
                  const isDanger  = btn.style === "danger";
                  const isLast    = i === buttons.length - 1;
                  return (
                    <View key={i}>
                      {i > 0 && <View style={s.divider} />}
                      <TouchableOpacity
                        style={[s.multiRow, isCancel && s.multiRowCancel]}
                        onPress={() => handlePress(btn)}
                        activeOpacity={0.65}
                      >
                        <Text style={[
                          s.multiRowT,
                          isDanger  && { color: C.red },
                          isCancel  && { color: C.muted, fontFamily: "Inter_500Medium", fontWeight: "500" },
                        ]}>
                          {btn.label}
                        </Text>
                        {!isCancel && (
                          <Ionicons
                            name="chevron-forward"
                            size={ms(16)}
                            color={isDanger ? C.red : C.muted}
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  }

  // ── Standard alert (1 or 2 buttons) ──────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop}>
          <TouchableWithoutFeedback>
            <Animated.View style={[s.card, { opacity, transform: [{ scale }] }]}>
              {/* Icon */}
              <View style={[s.iconCircle, { backgroundColor: meta.bg }]}>
                <Ionicons name={meta.icon as any} size={ms(32)} color={meta.color} />
              </View>

              {/* Text */}
              <Text style={s.title}>{config.title}</Text>
              {config.message ? (
                <Text style={s.message}>{config.message}</Text>
              ) : null}

              {/* Buttons */}
              <View style={[s.btnArea, isTwo && s.btnRow]}>
                {buttons.map((btn, i) => {
                  const isDanger  = btn.style === "danger";
                  const isCancel  = btn.style === "cancel";
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        s.btn,
                        isTwo  && s.btnHalf,
                        !isTwo && s.btnFull,
                        isCancel ? s.btnOutline
                          : isDanger ? s.btnDanger
                          : { backgroundColor: colors.primary },
                      ]}
                      onPress={() => handlePress(btn)}
                      activeOpacity={0.78}
                    >
                      <Text style={[
                        s.btnT,
                        isCancel && s.btnOutlineT,
                      ]}>
                        {btn.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: "rgba(18,8,12,0.55)",
    justifyContent:  "center",
    alignItems:      "center",
    paddingHorizontal: ms(28),
  },
  card: {
    width:           "100%",
    backgroundColor: C.card,
    borderRadius:    ms(24),
    overflow:        "hidden",
    shadowColor:     "#1A0010",
    shadowOffset:    { width: 0, height: ms(12) },
    shadowOpacity:   0.22,
    shadowRadius:    ms(24),
    elevation:       16,
  },

  // Icon
  iconCircle: {
    width:           ms(68),
    height:          ms(68),
    borderRadius:    ms(34),
    alignItems:      "center",
    justifyContent:  "center",
    alignSelf:       "center",
    marginTop:       ms(28),
    marginBottom:    ms(16),
  },

  // Text
  title: {
    fontSize:      fs(17),
    fontFamily: "Inter_800ExtraBold", fontWeight: "800",
    color:         C.text,
    textAlign:     "center",
    paddingHorizontal: ms(24),
    marginBottom:  ms(8),
  },
  message: {
    fontSize:      fs(13.5),
    color:         C.muted,
    textAlign:     "center",
    lineHeight:    fs(20),
    paddingHorizontal: ms(24),
    marginBottom:  ms(4),
  },

  // Button area
  btnArea: {
    padding:    ms(20),
    paddingTop: ms(16),
  },
  btnRow: {
    flexDirection: "row",
    gap:           ms(10),
  },
  btn: {
    height:         ms(48),
    borderRadius:   ms(14),
    alignItems:     "center",
    justifyContent: "center",
  },
  btnFull:    { width: "100%" },
  btnHalf:    { flex: 1 },
  btnDanger:  { backgroundColor: C.red },
  btnOutline: { borderWidth: 1.5, borderColor: C.border, backgroundColor: "transparent" },
  btnT:       { fontSize: fs(14), fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },
  btnOutlineT:{ color: C.text },

  // Multi-action
  multiHeader: {
    paddingHorizontal: ms(20),
    paddingTop:        ms(20),
    paddingBottom:     ms(14),
  },
  multiTitle: {
    fontSize:   fs(16),
    fontFamily: "Inter_800ExtraBold", fontWeight: "800",
    color:      C.text,
    marginBottom: ms(4),
  },
  multiMsg: {
    fontSize:   fs(12.5),
    color:      C.muted,
    lineHeight: fs(18),
  },
  divider:       { height: 1, backgroundColor: C.border, marginHorizontal: ms(0) },
  multiRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ms(20), paddingVertical: ms(16) },
  multiRowCancel:{ paddingVertical: ms(14), justifyContent: "center" },
  multiRowT:     { fontSize: fs(14.5), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.text },
});

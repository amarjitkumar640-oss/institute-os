import React, { useEffect, useRef } from "react";
import {
  Animated, Modal, StyleSheet, Text,
  TouchableOpacity, TouchableWithoutFeedback, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";
import { useThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";
import { T } from "./typography";

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
  error:   { icon: "alert-circle",       color: C.red,    bg: C.redBg },
  warning: { icon: "warning",            color: C.orange, bg: C.orangeBg },
  info:    { icon: "information-circle", color: C.blue,   bg: C.blueBg },
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
              <View style={[s.iconBadge, { backgroundColor: meta.bg }]}>
                <Ionicons name={meta.icon as any} size={ms(24)} color={meta.color} />
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
                        isCancel ? s.btnFlat
                          : isDanger ? s.btnDanger
                          : { backgroundColor: colors.primary },
                      ]}
                      onPress={() => handlePress(btn)}
                      activeOpacity={0.78}
                    >
                      <Text style={[
                        s.btnT,
                        isCancel && s.btnFlatT,
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
    borderRadius:    ms(22),
    overflow:        "hidden",
    shadowColor:     "#1A0010",
    shadowOffset:    { width: 0, height: ms(10) },
    shadowOpacity:   0.16,
    shadowRadius:    ms(20),
    elevation:       16,
  },

  // Icon
  iconBadge: {
    width:           ms(48),
    height:          ms(48),
    borderRadius:    ms(16),
    alignItems:      "center",
    justifyContent:  "center",
    alignSelf:       "center",
    marginTop:       ms(24),
    marginBottom:    ms(14),
  },

  // Text
  title: {
    ...T.cardTitle,
    color:         C.text,
    textAlign:     "center",
    paddingHorizontal: ms(24),
    marginBottom:  ms(6),
  },
  message: {
    ...T.bodySmall,
    color:         C.muted,
    textAlign:     "center",
    paddingHorizontal: ms(24),
    marginBottom:  ms(4),
    lineHeight:    ms(18),
  },

  // Button area
  btnArea: {
    padding:    ms(18),
    paddingTop: ms(16),
    gap:        ms(8),
  },
  btnRow: {
    flexDirection: "row",
  },
  btn: {
    height:         ms(46),
    borderRadius:   ms(13),
    alignItems:     "center",
    justifyContent: "center",
  },
  btnFull:    { width: "100%" },
  btnHalf:    { flex: 1 },
  btnDanger:  { backgroundColor: C.red },
  btnFlat:    { backgroundColor: C.inputBg },
  btnT:       { ...T.buttonText, color: "#fff" },
  btnFlatT:   { color: C.text },

  // Multi-action
  multiHeader: {
    paddingHorizontal: ms(20),
    paddingTop:        ms(20),
    paddingBottom:     ms(14),
  },
  multiTitle: {
    ...T.cardTitle,
    color:      C.text,
    marginBottom: ms(4),
  },
  multiMsg: {
    ...T.bodySmall,
    color:      C.muted,
  },
  divider:       { height: 1, backgroundColor: C.border, marginHorizontal: ms(0) },
  multiRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ms(20), paddingVertical: ms(16) },
  multiRowCancel:{ paddingVertical: ms(14), justifyContent: "center" },
  multiRowT:     { ...T.listItemTitle, color: C.text },
});

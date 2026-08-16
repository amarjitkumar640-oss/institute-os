import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ms } from "../../utils/responsive";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";
import { T } from "./typography";

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Icon shown to the left of the label */
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "outline" | "danger";
}

const makeStyles = (colors: ThemeColors) => ({
  primaryBtn:    { paddingVertical: ms(14), borderRadius: ms(14), justifyContent: "center" as const, alignItems: "center" as const, backgroundColor: colors.primary },
  outlineBtn:    { paddingVertical: ms(14), borderRadius: ms(14), borderWidth: 1.5, borderColor: colors.primary, justifyContent: "center" as const, alignItems: "center" as const, backgroundColor: C.card },
  dangerBtn:     { paddingVertical: ms(14), borderRadius: ms(14), backgroundColor: C.red, justifyContent: "center" as const, alignItems: "center" as const },
  disabledSolid: { opacity: 0.55 },
  disabledOutline:{ opacity: 0.55 },
  inner:         { flexDirection: "row" as const, alignItems: "center" as const, gap: ms(8) },
  solidT:        { ...T.buttonText, color: colors.textInverse, includeFontPadding: false },
  outlineT:      { ...T.buttonText, color: colors.primary, includeFontPadding: false },
});

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
  variant = "primary",
}: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeStyles);
  const isDisabled = disabled || loading;

  if (variant === "outline") {
    return (
      <TouchableOpacity
        style={[s.outlineBtn, isDisabled && s.disabledOutline]}
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.75}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <View style={s.inner}>
            {icon && <Ionicons name={icon} size={17} color={colors.primary} />}
            <Text style={s.outlineT}>{label}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (variant === "danger") {
    return (
      <TouchableOpacity
        style={[s.dangerBtn, isDisabled && s.disabledSolid]}
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.75}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <View style={s.inner}>
            {icon && <Ionicons name={icon} size={17} color="#fff" />}
            <Text style={s.solidT}>{label}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // Primary — flat, brand-colored button (matches the solid submit buttons used elsewhere in the app)
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.82}
      style={[s.primaryBtn, isDisabled && s.disabledSolid]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <View style={s.inner}>
          {icon && <Ionicons name={icon} size={17} color="#fff" />}
          <Text style={s.solidT}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

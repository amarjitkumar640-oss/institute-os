import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Icon shown to the left of the label */
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "outline" | "danger";
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
  variant = "primary",
}: Props) {
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
          <ActivityIndicator size="small" color="#8B1E3F" />
        ) : (
          <View style={s.inner}>
            {icon && <Ionicons name={icon} size={17} color="#8B1E3F" />}
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

  // Primary — gradient button
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.82}
      style={isDisabled ? s.disabledSolid : undefined}
    >
      <LinearGradient
        colors={isDisabled ? ["#C4B3B7", "#C4B3B7"] : ["#8B1E3F", "#C64A3E", "#E8752C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.gradient}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <View style={s.inner}>
            {icon && <Ionicons name={icon} size={17} color="#fff" />}
            <Text style={s.solidT}>{label}</Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  gradient:      { paddingVertical: ms(14), borderRadius: ms(14), justifyContent: "center", alignItems: "center" },
  outlineBtn:    { paddingVertical: ms(14), borderRadius: ms(14), borderWidth: 1.5, borderColor: "#8B1E3F", justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  dangerBtn:     { paddingVertical: ms(14), borderRadius: ms(14), backgroundColor: "#C0392B", justifyContent: "center", alignItems: "center" },
  disabledSolid: { opacity: 0.55 },
  disabledOutline:{ opacity: 0.55 },
  inner:         { flexDirection: "row", alignItems: "center", gap: ms(8) },
  solidT:        { fontSize: fs(15), fontWeight: "700", color: "#fff", includeFontPadding: false },
  outlineT:      { fontSize: fs(15), fontWeight: "700", color: "#8B1E3F", includeFontPadding: false },
});

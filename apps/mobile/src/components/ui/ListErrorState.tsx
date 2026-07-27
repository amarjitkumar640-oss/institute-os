import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";
import { ListErrorIllustration } from "./ListErrorIllustration";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

interface Props {
  title?:    string;
  subtitle?: string;
  onRetry:   () => void;
}

export function ListErrorState({
  title    = "Failed to load data",
  subtitle = "Check your connection and try again",
  onRetry,
}: Props) {
  const s = useThemedStyles(makeSStyles);
  return (
    <View style={s.wrap}>
      <ListErrorIllustration />
      <Text style={s.title}>{title}</Text>
      <Text style={s.sub}>{subtitle}</Text>
      <TouchableOpacity style={s.btn} onPress={onRetry} activeOpacity={0.8}>
        <Ionicons name="refresh-outline" size={ms(16)} color="#fff" />
        <Text style={s.btnT}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap:  { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: ms(40), paddingHorizontal: ms(24), gap: ms(6) },
  title: { fontSize: fs(15), fontWeight: "700", color: "#B0A9AC", textAlign: "center", marginTop: ms(4) },
  sub:   { fontSize: fs(12), color: "#C7BAB4", textAlign: "center" },
  btn:   { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: colors.primary, borderRadius: ms(12), paddingHorizontal: ms(20), paddingVertical: ms(10), marginTop: ms(8) },
  btnT:  { fontSize: fs(13), fontWeight: "700", color: "#fff" },
});

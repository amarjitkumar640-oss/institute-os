import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";
import { T } from "./typography";

// Shared pastel stat tile — originally lived independently in both
// DashboardScreen.tsx (admin/frontdesk) and TeacherDashboardScreen.tsx with
// slightly diverging styles. Extracted so every role's dashboard renders
// stats identically; a future style tweak here applies everywhere at once.
export function StatTile({
  icon, value, label, bg, iconBg, iconColor, onPress, sub, subUp,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  bg: string; iconBg: string; iconColor: string;
  onPress?: () => void;
  sub?: string;
  subUp?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[st.tile, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.74 : 1}
    >
      <View style={[st.icoWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={ms(20)} color={iconColor} />
      </View>
      <Text style={[st.val, { color: iconColor }]}>{value}</Text>
      <Text style={st.lbl} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
      {sub !== undefined && (
        <View style={st.subRow}>
          <Ionicons
            name={subUp ? "trending-up" : "trending-down"}
            size={ms(10)}
            color={subUp ? C.green : C.red}
          />
          {/* Empty string is a deliberate "icon only, no comparable number" signal —
              e.g. fees going from ₹0 to something has no meaningful percentage. */}
          {sub.length > 0 && (
            <Text style={[st.subT, { color: subUp ? C.green : C.red }]}>{" " + sub}</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  tile: { flex: 1, borderRadius: ms(18), padding: ms(12), gap: ms(7), minHeight: ms(96) },
  icoWrap: { width: ms(36), height: ms(36), borderRadius: ms(12), justifyContent: "center", alignItems: "center" },
  val: { ...T.displayMedium, color: C.text },
  lbl: { ...T.caption, color: "#5A5450" },
  subRow: { flexDirection: "row", alignItems: "center" },
  subT: { ...T.chipText },
});

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ms, fs } from "../../utils/responsive";
import { useThemeColors } from "../../context/ThemeContext";

interface Props {
  title:             string;
  count?:            number;
  countLabel?:       string;
  onBack:            () => void;
  rightIcon?:        string;
  onRight?:          () => void;
  right?:            React.ReactNode;
  heroIllustration?: React.ReactNode;
}

export function ScreenHeader({ title, count, countLabel = "total", onBack, rightIcon, onRight, right }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  // headerText is auto-derived contrast color: white on dark headers, dark on light
  const iconColor   = colors.headerText;
  const btnBg       = colors.headerText + "18"; // 10% opacity tint for back button
  const borderColor = colors.headerText + "20"; // 12% opacity for the bottom border
  const barStyle    = colors.headerText === "#FFFFFF" ? "light-content" : "dark-content";

  return (
    <>
    <StatusBar barStyle={barStyle} translucent backgroundColor={colors.headerBg} />
    <View style={[s.header, {
      paddingTop:        insets.top + ms(10),
      backgroundColor:   colors.headerBg,
      borderBottomColor: borderColor,
    }]}>
      <TouchableOpacity
        style={[s.back, { backgroundColor: btnBg }]}
        onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={ms(20)} color={iconColor} />
      </TouchableOpacity>

      <Text style={[s.title, { color: iconColor }]} numberOfLines={1}>{title}</Text>

      {count !== undefined && (
        <View style={[s.badge, { backgroundColor: iconColor + "18" }]}>
          <Text style={[s.badgeT, { color: iconColor }]}>{count} {countLabel}</Text>
        </View>
      )}

      {rightIcon && onRight && (
        <TouchableOpacity
          style={[s.back, { backgroundColor: btnBg }]}
          onPress={onRight}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={rightIcon as any} size={ms(20)} color={iconColor} />
        </TouchableOpacity>
      )}
      {right}
    </View>
    </>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: ms(16),
    paddingBottom:     ms(14),
    gap:               ms(12),
    borderBottomWidth: 1,
  },
  back: {
    width:        ms(36),
    height:       ms(36),
    borderRadius: ms(10),
    justifyContent: "center",
    alignItems:     "center",
    flexShrink:     0,
  },
  title: {
    flex:          1,
    fontSize:      fs(18),
    fontFamily:    "Inter_800ExtraBold",
    fontWeight:    "800",
    minWidth:      0,
    letterSpacing: -0.3,
  },
  badge: {
    borderRadius:      ms(20),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(5),
    flexShrink:        0,
  },
  badgeT: { fontSize: fs(11), fontFamily: "Inter_700Bold", fontWeight: "700" },
});

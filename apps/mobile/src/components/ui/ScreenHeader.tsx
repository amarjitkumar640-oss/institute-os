import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ms } from "../../utils/responsive";
import { useThemeColors } from "../../context/ThemeContext";
import { T } from "./typography";

interface Props {
  title:             string;
  subtitle?:         string;
  count?:            number;
  countLabel?:       string;
  onBack:            () => void;
  rightIcon?:        string;
  onRight?:          () => void;
  right?:            React.ReactNode;
  heroIllustration?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, count, countLabel = "total", onBack, rightIcon, onRight, right }: Props) {
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

      <View style={s.titleWrap}>
        <Text style={[s.title, { color: iconColor }]} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={[s.subtitle, { color: iconColor }]} numberOfLines={1}>{subtitle}</Text>}
      </View>

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
  titleWrap: {
    flex:     1,
    minWidth: 0,
  },
  title: {
    ...T.screenTitle,
  },
  subtitle: {
    ...T.caption,
    opacity:  0.85,
    marginTop: ms(1),
  },
  badge: {
    borderRadius:      ms(20),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(5),
    flexShrink:        0,
  },
  // Chip Text, not Badge Text — this shows natural-case dynamic content ("42 total"),
  // not a short static status word, so it shouldn't be forced uppercase.
  badgeT: { ...T.chipText },
});

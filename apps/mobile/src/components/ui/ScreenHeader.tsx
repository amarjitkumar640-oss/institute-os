import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ms, fs, sw } from "../../utils/responsive";

const BG = "#FFFBF0";
const WAVE_H = Math.round(ms(34));

function PolkaDots({ height }: { height: number }) {
  const sp = ms(22);
  const cols = Math.ceil(sw / sp) + 2;
  const rows = Math.ceil(height / sp) + 1;
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dots.push(
        <Circle
          key={`${r}-${c}`}
          cx={c * sp + (r % 2 ? sp / 2 : 0)}
          cy={r * sp}
          r={ms(1.5)}
          fill="rgba(255,255,255,0.12)"
        />
      );
  return (
    <Svg width={sw} height={height} style={StyleSheet.absoluteFill}>
      {dots}
    </Svg>
  );
}

function Wave() {
  return (
    <Svg
      width={sw}
      height={WAVE_H}
      viewBox={`0 0 ${sw} 34`}
      preserveAspectRatio="none"
    >
      <Path
        d={`M0 18 C${sw * 0.25} 36,${sw * 0.75} 2,${sw} 18 L${sw} 34 L0 34 Z`}
        fill={BG}
      />
    </Svg>
  );
}

interface Props {
  title:       string;
  count?:      number;
  countLabel?: string;
  onBack:      () => void;
  rightIcon?:  string;
  onRight?:    () => void;
}

export function ScreenHeader({ title, count, countLabel = "total", onBack, rightIcon, onRight }: Props) {
  const insets = useSafeAreaInsets();
  const dotAreaH = Math.round(ms(110));

  return (
    <LinearGradient
      colors={["#8B1E3F", "#A8264A", "#C64A3E", "#E8752C"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.header}
    >
      <PolkaDots height={dotAreaH} />
      <View style={[s.content, { paddingTop: insets.top + ms(10) }]}>
        <TouchableOpacity
          style={s.back}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={ms(20)} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {count !== undefined && (
          <View style={s.badge}>
            <Text style={s.badgeT}>{count} {countLabel}</Text>
          </View>
        )}
        {rightIcon && onRight && (
          <TouchableOpacity
            style={s.back}
            onPress={onRight}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={rightIcon as any} size={ms(20)} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
      <Wave />
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  header:  { overflow: "hidden" },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ms(16),
    paddingBottom: ms(14),
    gap: ms(12),
  },
  back: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(10),
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: fs(18),
    fontWeight: "700",
    color: "#fff",
    minWidth: 0,
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: ms(20),
    paddingHorizontal: ms(12),
    paddingVertical: ms(5),
    flexShrink: 0,
  },
  badgeT: { fontSize: fs(11), fontWeight: "700", color: "#fff" },
});

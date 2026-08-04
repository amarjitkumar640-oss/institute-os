import React from "react";
import { Dimensions, StyleSheet } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";

const { width: W } = Dimensions.get("window");

export const WAVE_H = Math.round(ms(40));

export function PolkaDots() {
  const sp = 22;
  const cols = Math.ceil(W / sp) + 2;
  const rows = 14;
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dots.push(<Circle key={`${r}-${c}`} cx={c * sp + (r % 2 ? sp / 2 : 0)} cy={r * sp} r={1.5} fill="rgba(255,255,255,0.12)" />);
  return <Svg width={W} height={rows * sp} style={StyleSheet.absoluteFill}>{dots}</Svg>;
}

export function Wave() {
  return (
    <Svg width={W} height={WAVE_H} viewBox={`0 0 ${W} 40`} preserveAspectRatio="none">
      <Path d={`M0 22 C${W * 0.23} 46,${W * 0.77} 4,${W} 22 L${W} 40 L0 40 Z`} fill={C.bg} />
    </Svg>
  );
}

import React from "react";
import Svg, {
  Path, Circle, Rect, Line, Ellipse,
  Text as SvgText, Defs, RadialGradient, Stop,
} from "react-native-svg";
import { ms } from "../../utils/responsive";

export function ListErrorIllustration() {
  const w = ms(172);
  const h = ms(158);
  return (
    <Svg width={w} height={h} viewBox="0 0 172 158">
      <Defs>
        <RadialGradient id="listErrGlow" cx="50%" cy="55%" r="50%">
          <Stop offset="0%" stopColor="#F5E6CE" stopOpacity="0.9" />
          <Stop offset="100%" stopColor="#FFFBF0" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Soft background glow */}
      <Ellipse cx={86} cy={95} rx={72} ry={62} fill="url(#listErrGlow)" />

      {/* ── Upside-down SAD WIFI ── */}
      <Circle cx={86} cy={28} r={6} fill="#C0A898" />
      <Path d="M 70 28 A 16 16 0 0 0 102 28"
        stroke="#C0A898" strokeWidth={5} fill="none" strokeLinecap="round" />
      <Path d="M 55 28 A 31 31 0 0 0 117 28"
        stroke="#D4C5BC" strokeWidth={4.5} fill="none" strokeLinecap="round" />
      <Path d="M 40 28 A 46 46 0 0 0 132 28"
        stroke="#E5DDD8" strokeWidth={4} fill="none" strokeLinecap="round" />

      {/* ── GRADUATION CAP ── */}
      <Rect x={58} y={60} width={56} height={9} rx={2} fill="#8B1E3F" />
      <Rect x={67} y={50} width={38} height={12} rx={2} fill="#8B1E3F" />
      <Line x1={114} y1={60} x2={126} y2={75}
        stroke="#E8752C" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={124} y1={73} x2={121} y2={83} stroke="#E8752C" strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={126} y1={74} x2={126} y2={84} stroke="#E8752C" strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={128} y1={73} x2={131} y2={82} stroke="#E8752C" strokeWidth={1.5} strokeLinecap="round" />

      {/* ── OPEN BOOK ── */}
      <Rect x={23} y={73} width={46} height={62} rx={5} fill="#E0D5C8" />
      <Rect x={104} y={73} width={46} height={62} rx={5} fill="#E0D5C8" />
      <Rect x={22} y={70} width={46} height={62} rx={5} fill="#FDFAF4" />
      <Rect x={104} y={70} width={46} height={62} rx={5} fill="#FDFAF4" />
      <Rect x={67} y={67} width={18} height={68} rx={4} fill="#8B1E3F" />
      <Rect x={69} y={67} width={5} height={68} rx={2} fill="#A52341" opacity={0.45} />
      <Rect x={22} y={129} width={128} height={7} rx={3.5} fill="#C4A89C" />

      {/* Left page text lines */}
      <Line x1={31} y1={86} x2={59} y2={86} stroke="#E4D8CC" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={31} y1={94} x2={59} y2={94} stroke="#E4D8CC" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={31} y1={102} x2={52} y2={102} stroke="#E4D8CC" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={31} y1={110} x2={59} y2={110} stroke="#E4D8CC" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={31} y1={118} x2={46} y2={118} stroke="#E4D8CC" strokeWidth={2.5} strokeLinecap="round" />

      {/* ── RIGHT PAGE CONFUSED FACE ── */}
      <Line x1={116} y1={86} x2={124} y2={94} stroke="#A08070" strokeWidth={3} strokeLinecap="round" />
      <Line x1={124} y1={86} x2={116} y2={94} stroke="#A08070" strokeWidth={3} strokeLinecap="round" />
      <Line x1={131} y1={86} x2={139} y2={94} stroke="#A08070" strokeWidth={3} strokeLinecap="round" />
      <Line x1={139} y1={86} x2={131} y2={94} stroke="#A08070" strokeWidth={3} strokeLinecap="round" />
      <Path d="M 114 116 Q 127 108 140 116"
        stroke="#A08070" strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M 143 88 Q 147 95 144 100 Q 140 103 137 99 Q 134 94 138 88 Z"
        fill="#95CCE0" opacity={0.75} />

      {/* ── FLOATING QUESTION MARKS ── */}
      <SvgText x={4} y={72} fontSize={22} fill="#E8C4A0" fontWeight="bold" opacity={0.75}>?</SvgText>
      <SvgText x={148} y={58} fontSize={18} fill="#E8C4A0" fontWeight="bold" opacity={0.65}>!</SvgText>
      <SvgText x={8} y={112} fontSize={14} fill="#D5C8C0" fontWeight="bold" opacity={0.55}>?</SvgText>
    </Svg>
  );
}

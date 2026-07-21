import React from "react";
import Svg, { Circle, Rect, Path, Line, Ellipse, G } from "react-native-svg";

interface SP { color: string; size?: number }

// ── Batches: Class schedule / timetable ──────────────────────────────────────

export function BatchesScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 160 140">
      {/* Drop shadow */}
      <Ellipse cx={80} cy={134} rx={52} ry={6} fill="rgba(0,0,0,0.06)" />

      {/* Card */}
      <Rect x={16} y={6} width={128} height={116} rx={14} fill="#FFFFFF" />

      {/* Card header fill */}
      <Rect x={16} y={6} width={128} height={32} rx={14} fill={color} />
      <Rect x={16} y={24} width={128} height={14} fill={color} />

      {/* Header dots */}
      <Circle cx={30} cy={22} r={4.5} fill="rgba(255,255,255,0.9)" />
      <Circle cx={43} cy={22} r={4.5} fill="rgba(255,255,255,0.5)" />
      <Circle cx={56} cy={22} r={4.5} fill="rgba(255,255,255,0.28)" />
      {/* Header label bar */}
      <Rect x={68} y={16} width={64} height={12} rx={6} fill="rgba(255,255,255,0.2)" />

      {/* Schedule row 1 — filled */}
      <Circle cx={30} cy={54} r={5} fill={color} />
      <Rect x={42} y={49} width={68} height={10} rx={5} fill={color} opacity={0.85} />
      <Rect x={114} y={49} width={26} height={10} rx={5} fill="#EAE4DE" />

      {/* Schedule row 2 */}
      <Circle cx={30} cy={72} r={5} fill="#CABFBA" />
      <Rect x={42} y={67} width={38} height={10} rx={5} fill="#EAE4DE" />
      <Rect x={84} y={67} width={56} height={10} rx={5} fill={color} opacity={0.52} />

      {/* Schedule row 3 — filled */}
      <Circle cx={30} cy={90} r={5} fill={color} opacity={0.72} />
      <Rect x={42} y={85} width={86} height={10} rx={5} fill={color} opacity={0.72} />

      {/* Schedule row 4 */}
      <Circle cx={30} cy={108} r={5} fill="#CABFBA" />
      <Rect x={42} y={103} width={50} height={10} rx={5} fill="#EAE4DE" />
      <Rect x={96} y={103} width={30} height={10} rx={5} fill="#EAE4DE" />

      {/* Clock (bottom-right of card) */}
      <Circle cx={129} cy={92} r={16} fill={color} opacity={0.08} />
      <Circle cx={129} cy={92} r={12} fill="white" stroke={color} strokeWidth={1.8} />
      <Line x1={129} y1={92} x2={129} y2={84} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={129} y1={92} x2={134} y2={96} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={129} cy={92} r={2} fill={color} />

      {/* Accent dots */}
      <Circle cx={9} cy={48} r={3.5} fill={color} opacity={0.3} />
      <Circle cx={152} cy={22} r={2.5} fill={color} opacity={0.2} />
      <Circle cx={8} cy={100} r={2} fill={color} opacity={0.18} />
    </Svg>
  );
}

// ── Students: Graduation scene ────────────────────────────────────────────────

export function StudentsScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 160 140">
      <Ellipse cx={80} cy={134} rx={55} ry={6} fill="rgba(0,0,0,0.06)" />

      {/* Diploma scroll — behind figures */}
      <Rect x={34} y={96} width={92} height={32} rx={9} fill="white" stroke={color} strokeWidth={1.4} opacity={0.88} />
      <Line x1={50} y1={109} x2={110} y2={109} stroke={color} strokeWidth={1.4} strokeLinecap="round" opacity={0.45} />
      <Line x1={56} y1={118} x2={104} y2={118} stroke={color} strokeWidth={1} strokeLinecap="round" opacity={0.28} />
      <Circle cx={80} cy={124} r={5} fill={color} opacity={0.35} />

      {/* Left grad (smaller / behind) */}
      <Rect x={26} y={72} width={20} height={26} rx={8} fill={color} opacity={0.18} stroke={color} strokeWidth={1.2} />
      <Circle cx={36} cy={64} r={10} fill="white" stroke={color} strokeWidth={1.4} />
      <Rect x={23} y={50} width={26} height={5} rx={2} fill={color} />
      <Rect x={27} y={44} width={18} height={8} rx={2} fill={color} opacity={0.88} />
      <Line x1={49} y1={52} x2={53} y2={62} stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.75} />
      <Circle cx={53} cy={64} r={2.5} fill={color} opacity={0.65} />

      {/* Right grad (smaller / behind) */}
      <Rect x={114} y={72} width={20} height={26} rx={8} fill={color} opacity={0.18} stroke={color} strokeWidth={1.2} />
      <Circle cx={124} cy={64} r={10} fill="white" stroke={color} strokeWidth={1.4} />
      <Rect x={111} y={50} width={26} height={5} rx={2} fill={color} />
      <Rect x={115} y={44} width={18} height={8} rx={2} fill={color} opacity={0.88} />
      <Line x1={107} y1={52} x2={103} y2={62} stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.75} />
      <Circle cx={103} cy={64} r={2.5} fill={color} opacity={0.65} />

      {/* Center grad (taller / in front) */}
      <Rect x={68} y={68} width={24} height={30} rx={9} fill={color} opacity={0.22} stroke={color} strokeWidth={1.5} />
      <Circle cx={80} cy={58} r={13} fill="white" stroke={color} strokeWidth={1.6} />
      <Rect x={66} y={42} width={28} height={6} rx={3} fill={color} />
      <Rect x={70} y={34} width={20} height={10} rx={2.5} fill={color} opacity={0.9} />
      <Line x1={94} y1={45} x2={99} y2={58} stroke={color} strokeWidth={1.8} strokeLinecap="round" opacity={0.8} />
      <Circle cx={99} cy={61} r={3} fill={color} opacity={0.7} />

      {/* Confetti / sparkles */}
      <Circle cx={12} cy={46} r={3.5} fill={color} opacity={0.28} />
      <Circle cx={150} cy={36} r={2.5} fill={color} opacity={0.22} />
      <Circle cx={14} cy={86} r={2} fill={color} opacity={0.18} />
      <Circle cx={148} cy={76} r={3} fill={color} opacity={0.22} />
      <Circle cx={80} cy={12} r={3.5} fill={color} opacity={0.3} />
      <Circle cx={32} cy={20} r={2} fill={color} opacity={0.18} />
      <Circle cx={132} cy={18} r={2.5} fill={color} opacity={0.22} />
    </Svg>
  );
}

// ── Faculty: Blackboard / teaching scene ─────────────────────────────────────

export function FacultyScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 160 140">
      <Ellipse cx={80} cy={134} rx={55} ry={6} fill="rgba(0,0,0,0.06)" />

      {/* Board frame */}
      <Rect x={10} y={10} width={140} height={96} rx={12} fill={color} opacity={0.9} />

      {/* Board inner (chalk surface) */}
      <Rect x={18} y={18} width={124} height={80} rx={8} fill="rgba(0,0,0,0.22)" />

      {/* Formula: y = mx */}
      <Rect x={30} y={36} width={8} height={10} rx={2} fill="white" opacity={0.9} />
      <Rect x={44} y={40} width={12} height={3} rx={1.5} fill="white" opacity={0.85} />
      <Rect x={62} y={36} width={6} height={10} rx={2} fill="white" opacity={0.9} />
      <Rect x={74} y={38} width={10} height={3} rx={1.5} fill="white" opacity={0.7} />
      <Rect x={72} y={34} width={3} height={10} rx={1.5} fill="white" opacity={0.7} />

      {/* Wavy chalk lines */}
      <Path
        d="M26 56 Q36 52 46 56 Q56 60 66 56 Q76 52 86 56 Q92 58 98 56"
        stroke="white" strokeWidth={1.8} fill="none" opacity={0.45} strokeLinecap="round"
      />
      <Path
        d="M28 68 Q42 64 58 68 Q74 72 90 68 Q104 64 118 68"
        stroke="white" strokeWidth={1.2} fill="none" opacity={0.28} strokeLinecap="round"
      />
      <Path
        d="M26 80 Q36 76 50 80 Q64 84 78 80 Q86 77 96 80"
        stroke="white" strokeWidth={1} fill="none" opacity={0.22} strokeLinecap="round"
      />

      {/* Diagram (circle + axis lines) — right side of board */}
      <Circle cx={122} cy={55} r={16} fill="none" stroke="white" strokeWidth={1.5} opacity={0.5} />
      <Line x1={122} y1={38} x2={122} y2={72} stroke="white" strokeWidth={1} opacity={0.35} />
      <Line x1={105} y1={55} x2={139} y2={55} stroke="white" strokeWidth={1} opacity={0.35} />
      <Circle cx={130} cy={46} r={3} fill="white" opacity={0.55} />

      {/* Board ledge */}
      <Rect x={10} y={104} width={140} height={8} rx={4} fill={color} opacity={0.6} />

      {/* Chalk on ledge */}
      <Rect x={48} y={106} width={18} height={4} rx={2} fill="rgba(255,255,255,0.6)" />
      <Rect x={72} y={106} width={12} height={4} rx={2} fill="rgba(255,255,255,0.4)" />

      {/* Teacher silhouette (right of board) */}
      <Circle cx={146} cy={88} r={8} fill="white" opacity={0.85} stroke={color} strokeWidth={1.2} />
      <Path d="M138 103 Q142 98 146 103 Q150 98 154 103 L156 122 Q146 126 136 122 Z"
        fill="white" opacity={0.8} stroke={color} strokeWidth={1} />
      <Line x1={138} y1={108} x2={110} y2={80} stroke={color} strokeWidth={2}
        strokeLinecap="round" opacity={0.65} />
      <Circle cx={109} cy={78} r={3} fill={color} opacity={0.6} />

      {/* Apple (top-left corner) */}
      <Circle cx={18} cy={12} r={6} fill="#E8752C" />
      <Rect x={17} y={5} width={2} height={5} rx={1} fill={color} opacity={0.5} />

      {/* Decorative dots */}
      <Circle cx={6} cy={60} r={2.5} fill={color} opacity={0.22} />
      <Circle cx={154} cy={116} r={2} fill={color} opacity={0.18} />
    </Svg>
  );
}

// ── Courses: Stacked books ────────────────────────────────────────────────────

export function CoursesScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 160 140">
      <Ellipse cx={80} cy={134} rx={52} ry={6} fill="rgba(0,0,0,0.06)" />

      {/* Back book (angled left) */}
      <G transform="rotate(-6, 48, 82)">
        <Rect x={22} y={44} width={52} height={76} rx={7} fill={color} opacity={0.38} />
        <Rect x={22} y={44} width={8} height={76} rx={4} fill={color} opacity={0.5} />
      </G>

      {/* Middle book (slight angle) */}
      <G transform="rotate(-2, 66, 80)">
        <Rect x={40} y={36} width={52} height={80} rx={7} fill={color} opacity={0.58} />
        <Rect x={40} y={36} width={8} height={80} rx={4} fill={color} opacity={0.72} />
        {/* Lines */}
        <Rect x={54} y={54} width={28} height={5} rx={2.5} fill="rgba(255,255,255,0.38)" />
        <Rect x={54} y={64} width={20} height={4} rx={2} fill="rgba(255,255,255,0.26)" />
      </G>

      {/* Front book (straight) */}
      <Rect x={62} y={30} width={58} height={88} rx={8} fill={color} />
      <Rect x={62} y={30} width={9} height={88} rx={4.5} fill="rgba(0,0,0,0.18)" />
      <Rect x={76} y={50} width={34} height={6} rx={3} fill="rgba(255,255,255,0.52)" />
      <Rect x={76} y={62} width={26} height={5} rx={2.5} fill="rgba(255,255,255,0.34)" />
      <Rect x={76} y={73} width={30} height={5} rx={2.5} fill="rgba(255,255,255,0.26)" />

      {/* Bookmark ribbon */}
      <Path d="M108 30 L115 30 L115 58 L111.5 53 L108 58 Z" fill="#F5B301" opacity={0.92} />

      {/* Open book on top */}
      <Rect x={38} y={12} width={84} height={24} rx={6} fill="white" stroke={color} strokeWidth={1.3} />
      <Line x1={80} y1={12} x2={80} y2={36} stroke={color} strokeWidth={1} opacity={0.28} />
      <Line x1={47} y1={20} x2={76} y2={20} stroke={color} strokeWidth={1} opacity={0.28} strokeLinecap="round" />
      <Line x1={47} y1={26} x2={72} y2={26} stroke={color} strokeWidth={1} opacity={0.2} strokeLinecap="round" />
      <Line x1={84} y1={20} x2={113} y2={20} stroke={color} strokeWidth={1} opacity={0.28} strokeLinecap="round" />
      <Line x1={84} y1={26} x2={110} y2={26} stroke={color} strokeWidth={1} opacity={0.2} strokeLinecap="round" />

      {/* Accent dots */}
      <Circle cx={14} cy={38} r={3.5} fill={color} opacity={0.28} />
      <Circle cx={150} cy={26} r={2.5} fill={color} opacity={0.2} />
      <Circle cx={152} cy={112} r={2} fill={color} opacity={0.16} />
    </Svg>
  );
}

// ── Subjects: Notebook + pencil ───────────────────────────────────────────────

export function SubjectsScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 160 140">
      <Ellipse cx={72} cy={134} rx={52} ry={6} fill="rgba(0,0,0,0.06)" />

      {/* Notebook */}
      <Rect x={14} y={12} width={96} height={112} rx={11} fill="white" stroke={color} strokeWidth={1.5} />

      {/* Spiral binding dots along top edge */}
      {([28, 40, 52, 64, 76, 88, 100] as number[]).map((x, i) => (
        <Circle key={i} cx={x} cy={12} r={4} fill={color} opacity={0.55} />
      ))}

      {/* Notebook color band (header area) */}
      <Rect x={14} y={12} width={96} height={28} rx={11} fill={color} opacity={0.1} />
      <Rect x={14} y={30} width={96} height={10} fill={color} opacity={0.1} />

      {/* Ruled lines */}
      {([52, 64, 76, 88, 100, 112] as number[]).map((y, i) => (
        <Line key={i} x1={26} y1={y} x2={98} y2={y} stroke={color} strokeWidth={1} opacity={0.14} />
      ))}

      {/* Written content bars */}
      <Rect x={26} y={48} width={58} height={7} rx={3.5} fill={color} opacity={0.38} />
      <Rect x={26} y={60} width={44} height={7} rx={3.5} fill={color} opacity={0.26} />
      <Rect x={26} y={72} width={64} height={7} rx={3.5} fill={color} opacity={0.32} />
      <Rect x={26} y={84} width={36} height={7} rx={3.5} fill={color} opacity={0.2} />
      <Rect x={26} y={96} width={52} height={7} rx={3.5} fill={color} opacity={0.22} />

      {/* Pencil (rotated group) */}
      <G transform="rotate(-18, 136, 76)">
        {/* Eraser */}
        <Rect x={130} y={22} width={12} height={11} rx={4} fill="#E8752C" />
        {/* Ferrule band */}
        <Rect x={130} y={31} width={12} height={5} fill="rgba(0,0,0,0.18)" />
        {/* Pencil body */}
        <Rect x={130} y={36} width={12} height={68} fill="#F5B301" />
        {/* Tip (wood) */}
        <Path d="M130 104 L136 122 L142 104 Z" fill="#F0E0B0" />
        {/* Lead */}
        <Path d="M134 118 L136 124 L138 118 Z" fill="#333" opacity={0.65} />
      </G>

      {/* Accent dots */}
      <Circle cx={8} cy={44} r={3} fill={color} opacity={0.28} />
      <Circle cx={155} cy={32} r={2.5} fill={color} opacity={0.2} />
    </Svg>
  );
}

// ── Staff: Team / org chart ───────────────────────────────────────────────────

export function StaffScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 160 140">
      <Ellipse cx={80} cy={134} rx={54} ry={6} fill="rgba(0,0,0,0.06)" />

      {/* Connecting lines */}
      <Line x1={80} y1={50} x2={30} y2={90} stroke={color} strokeWidth={1.6} opacity={0.35} />
      <Line x1={80} y1={50} x2={80} y2={90} stroke={color} strokeWidth={1.6} opacity={0.35} />
      <Line x1={80} y1={50} x2={130} y2={90} stroke={color} strokeWidth={1.6} opacity={0.35} />
      <Line x1={80} y1={8} x2={80} y2={50} stroke={color} strokeWidth={2} opacity={0.4} />

      {/* Top admin node */}
      <Circle cx={80} cy={28} r={22} fill={color} opacity={0.1} />
      <Circle cx={80} cy={28} r={18} fill="white" stroke={color} strokeWidth={2} />
      {/* Crown */}
      <Path
        d="M68 22 L72 28 L80 20 L88 28 L92 22 L92 26 Q80 33 68 26 Z"
        fill={color} opacity={0.72}
      />
      {/* Face */}
      <Circle cx={74} cy={31} r={2.2} fill={color} opacity={0.45} />
      <Circle cx={86} cy={31} r={2.2} fill={color} opacity={0.45} />

      {/* Left staff node */}
      <Circle cx={30} cy={108} r={19} fill={color} opacity={0.1} />
      <Circle cx={30} cy={108} r={15} fill="white" stroke={color} strokeWidth={1.6} />
      <Rect x={22} y={102} width={16} height={12} rx={4} fill={color} opacity={0.22} />
      <Rect x={24} y={105} width={12} height={2.5} rx={1.2} fill={color} opacity={0.5} />
      <Rect x={24} y={110} width={8} height={2} rx={1} fill={color} opacity={0.32} />

      {/* Center staff node */}
      <Circle cx={80} cy={108} r={19} fill={color} opacity={0.1} />
      <Circle cx={80} cy={108} r={15} fill="white" stroke={color} strokeWidth={1.6} />
      <Rect x={72} y={102} width={16} height={12} rx={4} fill={color} opacity={0.22} />
      <Rect x={74} y={105} width={12} height={2.5} rx={1.2} fill={color} opacity={0.5} />
      <Rect x={74} y={110} width={8} height={2} rx={1} fill={color} opacity={0.32} />

      {/* Right staff node */}
      <Circle cx={130} cy={108} r={19} fill={color} opacity={0.1} />
      <Circle cx={130} cy={108} r={15} fill="white" stroke={color} strokeWidth={1.6} />
      <Rect x={122} y={102} width={16} height={12} rx={4} fill={color} opacity={0.22} />
      <Rect x={124} y={105} width={12} height={2.5} rx={1.2} fill={color} opacity={0.5} />
      <Rect x={124} y={110} width={8} height={2} rx={1} fill={color} opacity={0.32} />

      {/* Decorative dots */}
      <Circle cx={8} cy={56} r={3} fill={color} opacity={0.24} />
      <Circle cx={152} cy={48} r={2.5} fill={color} opacity={0.18} />
    </Svg>
  );
}

// ── Centers: Building + location pin ─────────────────────────────────────────

export function CentersScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 160 140">
      <Ellipse cx={80} cy={134} rx={52} ry={6} fill="rgba(0,0,0,0.06)" />

      {/* Map grid (background) */}
      <Line x1={0} y1={80} x2={160} y2={80} stroke={color} strokeWidth={0.8} opacity={0.1} />
      <Line x1={0} y1={100} x2={160} y2={100} stroke={color} strokeWidth={0.8} opacity={0.1} />
      <Line x1={0} y1={120} x2={160} y2={120} stroke={color} strokeWidth={0.8} opacity={0.08} />
      <Line x1={38} y1={68} x2={38} y2={130} stroke={color} strokeWidth={0.8} opacity={0.1} />
      <Line x1={80} y1={68} x2={80} y2={130} stroke={color} strokeWidth={0.8} opacity={0.1} />
      <Line x1={122} y1={68} x2={122} y2={130} stroke={color} strokeWidth={0.8} opacity={0.08} />

      {/* Building body */}
      <Rect x={28} y={58} width={104} height={72} rx={9} fill="white" stroke={color} strokeWidth={1.5} />

      {/* Roof / gable triangle */}
      <Path d="M22 64 L80 26 L138 64 Z" fill={color} opacity={0.88} />
      <Line x1={22} y1={64} x2={138} y2={64} stroke={color} strokeWidth={1} opacity={0.4} />

      {/* Windows — 2 rows × 3 cols */}
      <Rect x={40} y={72} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />
      <Rect x={71} y={72} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />
      <Rect x={102} y={72} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />
      <Rect x={40} y={96} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />
      <Rect x={102} y={96} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />

      {/* Door */}
      <Rect x={68} y={96} width={24} height={34} rx={6} fill={color} opacity={0.28} stroke={color} strokeWidth={1} />
      <Circle cx={86} cy={114} r={2.2} fill={color} opacity={0.6} />

      {/* Location pin above building */}
      <Circle cx={80} cy={16} r={13} fill={color} />
      <Circle cx={80} cy={13} r={7} fill="white" opacity={0.88} />
      <Path d="M70 21 Q80 34 90 21 Z" fill={color} />

      {/* Decorative dots */}
      <Circle cx={12} cy={76} r={3} fill={color} opacity={0.24} />
      <Circle cx={150} cy={50} r={2.5} fill={color} opacity={0.18} />
    </Svg>
  );
}

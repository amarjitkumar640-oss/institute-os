import React from "react";
import Svg, {
  Circle, Rect, Path, Line, Ellipse, G, Polygon, Polyline,
} from "react-native-svg";

interface SP { color: string; size?: number }

// ── Leads: CRM funnel + enquiry form + contact card + chat + target ───────────

export function LeadsScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 780 / 680)} viewBox="0 0 680 780">
      <Circle cx="140" cy="150" r="120" fill={color} opacity={0.08} />
      <Circle cx="545" cy="650" r="130" fill="#94A3B8" opacity={0.10} />

      {/* connection lines */}
      <Path d="M240,155 Q265,270 295,395" fill="none" stroke="#D1D5DB" strokeWidth={1.5} strokeDasharray="5 5" opacity={0.7} />
      <Path d="M460,155 Q430,270 400,395" fill="none" stroke="#D1D5DB" strokeWidth={1.5} strokeDasharray="5 5" opacity={0.7} />
      <Path d="M200,575 Q255,540 300,505" fill="none" stroke="#D1D5DB" strokeWidth={1.5} strokeDasharray="5 5" opacity={0.7} />
      <Path d="M490,635 Q420,590 350,550" fill="none" stroke="#D1D5DB" strokeWidth={1.5} strokeDasharray="5 5" opacity={0.7} />

      {/* Funnel body */}
      <Polygon points="260,380 420,380 380,510 300,510" fill="#F1F5F9" />
      <Polygon points="260,380 420,380 380,510 300,510" fill="none" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="325" y="510" width="30" height="45" rx="6" fill="#F1F5F9" stroke="#E5E7EB" strokeWidth={1.5} />

      {/* Funnel dots (leads flowing in) */}
      <Circle cx="300" cy="400" r="9" fill={color} opacity={0.4} />
      <Circle cx="340" cy="393" r="9" fill={color} opacity={0.4} />
      <Circle cx="380" cy="400" r="9" fill={color} opacity={0.4} />
      <Circle cx="320" cy="430" r="7" fill={color} opacity={0.6} />
      <Circle cx="360" cy="432" r="7" fill={color} opacity={0.6} />
      <Circle cx="340" cy="465" r="6" fill={color} opacity={0.8} />
      <Circle cx="340" cy="560" r="16" fill={color} />
      <Path d="M333 560 L338 566 L349 553" fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Enquiry form card */}
      <Rect x="54" y="94" width="190" height="130" rx="14" fill="#F1F5F9" />
      <Rect x="50" y="90" width="190" height="130" rx="14" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="68" y="112" width="150" height="10" rx="5" fill="#E5E7EB" />
      <Rect x="68" y="134" width="150" height="10" rx="5" fill="#E5E7EB" />
      <Rect x="68" y="156" width="150" height="10" rx="5" fill="#E5E7EB" />
      <Rect x="68" y="182" width="80" height="24" rx="12" fill={color} />

      {/* Contact card */}
      <Rect x="464" y="94" width="170" height="130" rx="14" fill="#F1F5F9" />
      <Rect x="460" y="90" width="170" height="130" rx="14" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Circle cx="500" cy="145" r="24" fill={color} />
      <Rect x="540" y="130" width="70" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="540" y="148" width="55" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="478" y="188" width="130" height="18" rx="6" fill={color} opacity={0.12} />

      {/* Chat bubbles */}
      <Polygon points="120,530 220,530 220,600 190,600 165,620 165,600 120,600" fill={color} opacity={0.85} />
      <Polygon points="50,562 170,562 170,628 100,628 75,648 75,628 50,628" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />

      {/* Target rings */}
      <Circle cx="545" cy="650" r="70" fill="none" stroke={color} strokeWidth={8} opacity={0.25} />
      <Circle cx="545" cy="650" r="45" fill="none" stroke={color} strokeWidth={8} opacity={0.45} />
      <Circle cx="545" cy="650" r="20" fill={color} />
      <Line x1="620" y1="590" x2="565" y2="632" stroke="#94A3B8" strokeWidth={3} strokeLinecap="round" />
      <Polygon points="620,590 605,592 615,605" fill="#94A3B8" />
    </Svg>
  );
}

// ── Students: Graduation cap + ID card + backpack + docs ──────────────────────

export function StudentsScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 860 / 680)} viewBox="0 0 680 860">
      <Circle cx="150" cy="180" r="140" fill={color} opacity={0.08} />
      <Circle cx="520" cy="690" r="140" fill="#94A3B8" opacity={0.10} />
      <Circle cx="250" cy="650" r="9" fill={color} opacity={0.25} />
      <Circle cx="600" cy="330" r="7" fill={color} opacity={0.25} />
      <Circle cx="90" cy="480" r="6" fill={color} opacity={0.2} />

      {/* Student silhouette body */}
      <Rect x="270" y="520" width="140" height="180" rx="42" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth={1.5} />
      <Circle cx="340" cy="470" r="65" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth={1.5} />

      {/* Graduation cap board */}
      <Rect x="300" y="398" width="80" height="24" rx="7" fill={color} />
      <Polygon points="340,340 396,386 340,432 284,386" fill={color} />
      <Line x1="396" y1="386" x2="412" y2="428" stroke={color} strokeWidth={3} strokeLinecap="round" />
      <Circle cx="414" cy="432" r="5" fill={color} />

      {/* Student ID card */}
      <Rect x="55" y="115" width="190" height="130" rx="14" fill="#F1F5F9" />
      <Rect x="50" y="110" width="190" height="130" rx="14" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Circle cx="95" cy="152" r="20" fill={color} opacity={0.85} />
      <Rect x="128" y="140" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="128" y="156" width="70" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="128" y="172" width="50" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="50" y="210" width="190" height="20" rx="10" fill={color} opacity={0.85} />

      {/* Document stack */}
      <Rect x="55" y="565" width="170" height="140" rx="12" fill="#F1F5F9" />
      <Rect x="50" y="560" width="170" height="140" rx="12" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Polygon points="150,560 174,560 174,608 162,594 150,608" fill={color} />
      <Rect x="70" y="620" width="120" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="70" y="638" width="100" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="70" y="656" width="110" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="70" y="674" width="80" height="8" rx="4" fill="#E5E7EB" />

      {/* Backpack */}
      <Rect x="530" y="460" width="90" height="30" rx="14" fill="#F1F5F9" stroke="#D1D5DB" strokeWidth={1.5} />
      <Rect x="535" y="442" width="14" height="50" rx="7" fill="#D1D5DB" />
      <Rect x="596" y="442" width="14" height="50" rx="7" fill="#D1D5DB" />
      <Rect x="520" y="472" width="110" height="140" rx="30" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth={1.5} />
      <Rect x="545" y="540" width="60" height="52" rx="14" fill={color} opacity={0.85} />

      {/* Profile card */}
      <Rect x="445" y="105" width="190" height="130" rx="14" fill="#F1F5F9" />
      <Rect x="440" y="100" width="190" height="130" rx="14" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Circle cx="480" cy="147" r="22" fill={color} />
      <Rect x="516" y="134" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="516" y="150" width="70" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="460" y="190" width="80" height="22" rx="11" fill={color} opacity={0.15} stroke={color} strokeWidth={1.5} />

      {/* Document with folded corner */}
      <Rect x="465" y="655" width="130" height="160" rx="10" fill="#F1F5F9" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="450" y="640" width="130" height="160" rx="10" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Polygon points="560,640 580,640 580,660" fill="#E5E7EB" />
      <Rect x="470" y="672" width="60" height="14" rx="7" fill={color} />
      <Rect x="470" y="700" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="470" y="718" width="70" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="470" y="736" width="80" height="8" rx="4" fill="#E5E7EB" />
    </Svg>
  );
}

// ── Faculty: Classroom whiteboard + profile card + laptop + books + attendance ─

export function FacultyScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 780 / 680)} viewBox="0 0 680 780">
      <Circle cx="140" cy="150" r="120" fill={color} opacity={0.08} />
      <Circle cx="545" cy="650" r="130" fill="#94A3B8" opacity={0.10} />
      <Circle cx="440" cy="330" r="6" fill={color} opacity={0.25} />
      <Circle cx="60" cy="450" r="6" fill={color} opacity={0.2} />

      {/* Whiteboard stand legs */}
      <Rect x="230" y="580" width="220" height="10" rx="5" fill="#E5E7EB" />
      <Line x1="260" y1="530" x2="250" y2="580" stroke="#D1D5DB" strokeWidth={3} strokeLinecap="round" />
      <Line x1="420" y1="530" x2="420" y2="580" stroke="#D1D5DB" strokeWidth={3} strokeLinecap="round" />

      {/* Whiteboard */}
      <Rect x="244" y="384" width="200" height="150" rx="14" fill="#F1F5F9" />
      <Rect x="240" y="380" width="200" height="150" rx="14" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="270" y="470" width="20" height="40" rx="4" fill={color} opacity={0.5} />
      <Rect x="300" y="450" width="20" height="60" rx="4" fill={color} opacity={0.7} />
      <Rect x="330" y="430" width="20" height="80" rx="4" fill={color} />
      <Polyline points="270,460 300,440 330,415 370,405" fill="none" stroke="#D1D5DB" strokeWidth={2} strokeLinecap="round" />

      {/* Teacher profile card */}
      <Rect x="54" y="94" width="190" height="130" rx="14" fill="#F1F5F9" />
      <Rect x="50" y="90" width="190" height="130" rx="14" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Circle cx="95" cy="145" r="24" fill={color} />
      <Rect x="135" y="130" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="135" y="148" width="65" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="65" y="188" width="70" height="20" rx="10" fill={color} opacity={0.15} stroke={color} strokeWidth={1.5} />

      {/* Laptop */}
      <Rect x="464" y="94" width="170" height="110" rx="8" fill="#F1F5F9" />
      <Rect x="460" y="90" width="170" height="110" rx="8" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="475" y="103" width="140" height="70" rx="4" fill={color} opacity={0.12} />
      <Rect x="485" y="115" width="80" height="8" rx="4" fill={color} opacity={0.5} />
      <Rect x="485" y="132" width="60" height="8" rx="4" fill={color} opacity={0.3} />
      <Polygon points="430,215 660,215 640,200 450,200" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth={1.5} />

      {/* Book stack */}
      <Rect x="50" y="524" width="170" height="36" rx="6" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth={1.5} />
      <Rect x="60" y="488" width="150" height="36" rx="6" fill="#F1F5F9" stroke="#D1D5DB" strokeWidth={1.5} />
      <Rect x="70" y="452" width="130" height="36" rx="6" fill="#FFFFFF" stroke="#D1D5DB" strokeWidth={1.5} />
      <Polygon points="168,452 182,452 182,492 175,482 168,492" fill={color} />

      {/* Attendance register */}
      <Rect x="464" y="564" width="170" height="170" rx="12" fill="#F1F5F9" />
      <Rect x="460" y="560" width="170" height="170" rx="12" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Circle cx="490" cy="592" r="10" fill={color} />
      <Path d="M485 592 L489 597 L496 587" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="510" y="586" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Circle cx="490" cy="632" r="10" fill={color} opacity={0.7} />
      <Path d="M485 632 L489 637 L496 627" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="510" y="626" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Circle cx="490" cy="672" r="10" fill={color} opacity={0.4} />
      <Path d="M485 672 L489 677 L496 667" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="510" y="666" width="90" height="8" rx="4" fill="#E5E7EB" />
    </Svg>
  );
}

// ── Courses: Digital tablet + book stack + certificate + roadmap ──────────────

export function CoursesScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 800 / 680)} viewBox="0 0 680 800">
      <Circle cx="140" cy="150" r="120" fill={color} opacity={0.08} />
      <Circle cx="550" cy="650" r="130" fill="#94A3B8" opacity={0.10} />
      <Circle cx="230" cy="330" r="6" fill={color} opacity={0.25} />
      <Circle cx="440" cy="700" r="6" fill={color} opacity={0.2} />

      {/* Tablet */}
      <Rect x="254" y="384" width="180" height="240" rx="24" fill="#F1F5F9" />
      <Rect x="250" y="380" width="180" height="240" rx="24" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="266" y="400" width="148" height="180" rx="10" fill={color} opacity={0.08} />
      <Circle cx="340" cy="490" r="24" fill={color} />
      <Polygon points="333,478 333,502 355,490" fill="#FFFFFF" />
      <Circle cx="340" cy="600" r="9" fill={color} opacity={0.7} />

      {/* Book stack */}
      <Rect x="50" y="560" width="170" height="36" rx="6" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth={1.5} />
      <Rect x="60" y="524" width="150" height="36" rx="6" fill="#F1F5F9" stroke="#D1D5DB" strokeWidth={1.5} />
      <Rect x="70" y="488" width="130" height="36" rx="6" fill="#FFFFFF" stroke="#D1D5DB" strokeWidth={1.5} />
      <Polygon points="168,488 182,488 182,528 175,518 168,528" fill={color} />

      {/* Course card */}
      <Rect x="54" y="94" width="170" height="110" rx="12" fill="#F1F5F9" />
      <Rect x="50" y="90" width="170" height="110" rx="12" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="62" y="102" width="146" height="56" rx="8" fill={color} opacity={0.85} />
      <Rect x="62" y="170" width="100" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="62" y="186" width="70" height="8" rx="4" fill="#E5E7EB" />

      {/* Certificate */}
      <Rect x="464" y="94" width="170" height="130" rx="12" fill="#F1F5F9" />
      <Rect x="460" y="90" width="170" height="130" rx="12" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="478" y="108" width="120" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="478" y="124" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Circle cx="500" cy="200" r="18" fill={color} />
      <Polygon points="482,208 500,182 500,218" fill={color} opacity={0.6} />
      <Polygon points="518,208 500,182 500,218" fill={color} opacity={0.6} />

      {/* Learning roadmap */}
      <Polyline points="480,620 530,660 580,700 620,730" fill="none" stroke="#D1D5DB" strokeWidth={2} strokeDasharray="6 6" />
      <Circle cx="480" cy="620" r="16" fill={color} />
      <Circle cx="530" cy="660" r="14" fill={color} opacity={0.65} />
      <Circle cx="580" cy="700" r="14" fill={color} opacity={0.35} />
      <Circle cx="620" cy="730" r="14" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth={1.5} />
    </Svg>
  );
}

// ── Subjects: Learning board + open book + ruler + globe + calculator ─────────

export function SubjectsScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 800 / 680)} viewBox="0 0 680 800">
      <Circle cx="140" cy="150" r="120" fill={color} opacity={0.08} />
      <Circle cx="550" cy="650" r="130" fill="#94A3B8" opacity={0.10} />

      {/* Decorative plus marks */}
      <Line x1="425" y1="295" x2="425" y2="315" stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.3} />
      <Line x1="415" y1="305" x2="435" y2="305" stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.3} />
      <Line x1="58" y1="330" x2="70" y2="342" stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.3} />
      <Line x1="70" y1="330" x2="58" y2="342" stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.3} />

      {/* Learning board (center) */}
      <Rect x="254" y="384" width="180" height="220" rx="16" fill="#F1F5F9" />
      <Rect x="250" y="380" width="180" height="220" rx="16" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      {/* grid lines */}
      <Line x1="285" y1="400" x2="285" y2="580" stroke="#EEF2F7" strokeWidth={1} />
      <Line x1="320" y1="400" x2="320" y2="580" stroke="#EEF2F7" strokeWidth={1} />
      <Line x1="355" y1="400" x2="355" y2="580" stroke="#EEF2F7" strokeWidth={1} />
      <Line x1="390" y1="400" x2="390" y2="580" stroke="#EEF2F7" strokeWidth={1} />
      <Line x1="260" y1="420" x2="420" y2="420" stroke="#EEF2F7" strokeWidth={1} />
      <Line x1="260" y1="450" x2="420" y2="450" stroke="#EEF2F7" strokeWidth={1} />
      <Line x1="260" y1="480" x2="420" y2="480" stroke="#EEF2F7" strokeWidth={1} />
      <Line x1="260" y1="510" x2="420" y2="510" stroke="#EEF2F7" strokeWidth={1} />
      <Line x1="260" y1="540" x2="420" y2="540" stroke="#EEF2F7" strokeWidth={1} />
      <Circle cx="270" cy="390" r="8" fill={color} />
      <Circle cx="410" cy="390" r="8" fill={color} opacity={0.6} />

      {/* Open book */}
      <Polygon points="60,100 150,90 150,190 60,205" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Polygon points="150,90 240,100 240,205 150,190" fill="#F8FAFC" stroke="#E5E7EB" strokeWidth={1.5} />
      <Line x1="150" y1="90" x2="150" y2="190" stroke="#D1D5DB" strokeWidth={1.5} />
      <Polygon points="145,80 155,80 155,120 150,110 145,120" fill={color} />

      {/* Subject folder / tab */}
      <Rect x="475" y="95" width="140" height="100" rx="8" fill="#F1F5F9" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="460" y="90" width="70" height="28" rx="8" fill={color} />
      <Rect x="460" y="115" width="170" height="110" rx="10" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />

      {/* Ruler */}
      <Rect x="240" y="250" width="200" height="26" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Line x1="260" y1="250" x2="260" y2="262" stroke="#D1D5DB" strokeWidth={1.5} />
      <Line x1="280" y1="250" x2="280" y2="268" stroke={color} strokeWidth={1.5} opacity={0.6} />
      <Line x1="300" y1="250" x2="300" y2="262" stroke="#D1D5DB" strokeWidth={1.5} />
      <Line x1="320" y1="250" x2="320" y2="268" stroke={color} strokeWidth={1.5} opacity={0.6} />
      <Line x1="340" y1="250" x2="340" y2="262" stroke="#D1D5DB" strokeWidth={1.5} />
      <Line x1="360" y1="250" x2="360" y2="268" stroke={color} strokeWidth={1.5} opacity={0.6} />
      <Line x1="380" y1="250" x2="380" y2="262" stroke="#D1D5DB" strokeWidth={1.5} />
      <Line x1="400" y1="250" x2="400" y2="268" stroke={color} strokeWidth={1.5} opacity={0.6} />
      <Line x1="420" y1="250" x2="420" y2="262" stroke="#D1D5DB" strokeWidth={1.5} />

      {/* Globe */}
      <Ellipse cx="130" cy="735" rx="40" ry="8" fill="#E5E7EB" />
      <Rect x="120" y="718" width="20" height="12" rx="3" fill="#D1D5DB" />
      <Circle cx="130" cy="650" r="70" fill={color} opacity={0.08} stroke={color} strokeWidth={1.5} />
      <Ellipse cx="130" cy="650" rx="70" ry="22" fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
      <Ellipse cx="130" cy="650" rx="70" ry="45" fill="none" stroke={color} strokeWidth={1} opacity={0.3} />
      <Line x1="130" y1="580" x2="130" y2="720" stroke={color} strokeWidth={1} opacity={0.5} />

      {/* Chemistry flask */}
      <Rect x="560" y="560" width="20" height="40" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Polygon points="550,600 610,600 630,700 530,700" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Polygon points="535,660 625,660 630,700 530,700" fill={color} opacity={0.7} />
      <Circle cx="560" cy="640" r="4" fill={color} opacity={0.5} />
      <Circle cx="592" cy="650" r="3" fill={color} opacity={0.5} />

      {/* Calculator */}
      <Rect x="290" y="610" width="100" height="130" rx="10" fill="#F1F5F9" />
      <Rect x="286" y="606" width="100" height="130" rx="10" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="296" y="618" width="80" height="24" rx="4" fill="#E5E7EB" />
      <Rect x="296" y="654" width="20" height="20" rx="4" fill="#E5E7EB" />
      <Rect x="322" y="654" width="20" height="20" rx="4" fill="#E5E7EB" />
      <Rect x="348" y="654" width="20" height="20" rx="4" fill={color} opacity={0.8} />
      <Rect x="296" y="680" width="20" height="20" rx="4" fill="#E5E7EB" />
      <Rect x="322" y="680" width="20" height="20" rx="4" fill="#E5E7EB" />
      <Rect x="348" y="680" width="20" height="20" rx="4" fill={color} opacity={0.6} />
      <Rect x="296" y="706" width="20" height="20" rx="4" fill="#E5E7EB" />
      <Rect x="322" y="706" width="20" height="20" rx="4" fill="#E5E7EB" />
      <Rect x="348" y="706" width="20" height="20" rx="4" fill={color} opacity={0.4} />
    </Svg>
  );
}

// ── Batches: Class schedule grid + board + timetable + attendance + avatars ────

export function BatchesScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 820 / 680)} viewBox="0 0 680 820">
      <Circle cx="140" cy="150" r="120" fill={color} opacity={0.08} />
      <Circle cx="550" cy="700" r="130" fill="#94A3B8" opacity={0.10} />
      <Circle cx="420" cy="120" r="7" fill={color} opacity={0.25} />
      <Circle cx="80" cy="450" r="6" fill={color} opacity={0.22} />

      {/* Calendar / schedule grid */}
      <Rect x="234" y="384" width="220" height="260" rx="20" fill="#F1F5F9" />
      <Rect x="230" y="380" width="220" height="260" rx="20" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      {/* Header */}
      <Rect x="230" y="380" width="220" height="52" rx="18" fill={color} />
      <Polygon points="252,406 262,398 262,414" fill="#FFFFFF" opacity={0.9} />
      <Polygon points="428,406 418,398 418,414" fill="#FFFFFF" opacity={0.9} />

      {/* Grid cells */}
      <Rect x="250" y="450" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="298" y="450" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="346" y="450" width="40" height="40" rx="6" fill={color} opacity={0.85} />
      <Rect x="394" y="450" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="250" y="498" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="298" y="498" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="346" y="498" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="394" y="498" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="250" y="546" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="298" y="546" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="346" y="546" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="394" y="546" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="250" y="594" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="298" y="594" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="346" y="594" width="40" height="40" rx="6" fill="#E5E7EB" />
      <Rect x="394" y="594" width="40" height="40" rx="6" fill="#E5E7EB" />

      {/* Classroom board card */}
      <Rect x="54" y="94" width="180" height="120" rx="10" fill="#F1F5F9" />
      <Rect x="50" y="90" width="180" height="120" rx="10" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Line x1="120" y1="200" x2="90" y2="220" stroke="#D1D5DB" strokeWidth={3} strokeLinecap="round" />
      <Line x1="160" y1="200" x2="190" y2="220" stroke="#D1D5DB" strokeWidth={3} strokeLinecap="round" />
      <Rect x="70" y="115" width="90" height="8" rx="4" fill={color} opacity={0.7} />
      <Rect x="70" y="135" width="70" height="8" rx="4" fill={color} opacity={0.5} />
      <Rect x="70" y="155" width="100" height="8" rx="4" fill={color} opacity={0.3} />

      {/* Timetable card */}
      <Rect x="464" y="94" width="180" height="150" rx="14" fill="#F1F5F9" />
      <Rect x="460" y="90" width="180" height="150" rx="14" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Rect x="478" y="112" width="12" height="24" rx="4" fill={color} />
      <Rect x="500" y="116" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="478" y="156" width="12" height="24" rx="4" fill={color} opacity={0.6} />
      <Rect x="500" y="160" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Rect x="478" y="200" width="12" height="24" rx="4" fill={color} opacity={0.3} />
      <Rect x="500" y="204" width="90" height="8" rx="4" fill="#E5E7EB" />

      {/* Attendance sheet */}
      <Rect x="54" y="564" width="170" height="170" rx="12" fill="#F1F5F9" />
      <Rect x="50" y="560" width="170" height="170" rx="12" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={1.5} />
      <Circle cx="80" cy="592" r="10" fill={color} />
      <Path d="M75 592 L79 597 L86 587" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="100" y="586" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Circle cx="80" cy="632" r="10" fill={color} opacity={0.7} />
      <Path d="M75 632 L79 637 L86 627" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="100" y="626" width="90" height="8" rx="4" fill="#E5E7EB" />
      <Circle cx="80" cy="672" r="10" fill={color} opacity={0.4} />
      <Path d="M75 672 L79 677 L86 667" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="100" y="666" width="90" height="8" rx="4" fill="#E5E7EB" />

      {/* Student avatar cluster */}
      <Circle cx="520" cy="700" r="34" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth={1.5} />
      <Circle cx="560" cy="700" r="34" fill={color} opacity={0.85} />
      <Circle cx="540" cy="670" r="34" fill="#F1F5F9" stroke="#D1D5DB" strokeWidth={1.5} />
      <Circle cx="586" cy="656" r="14" fill={color} />
    </Svg>
  );
}

// ── Staff: Team / org chart (unchanged) ───────────────────────────────────────

export function StaffScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 160 140">
      <Ellipse cx={80} cy={134} rx={54} ry={6} fill="rgba(0,0,0,0.06)" />
      <Line x1={80} y1={50} x2={30} y2={90} stroke={color} strokeWidth={1.6} opacity={0.35} />
      <Line x1={80} y1={50} x2={80} y2={90} stroke={color} strokeWidth={1.6} opacity={0.35} />
      <Line x1={80} y1={50} x2={130} y2={90} stroke={color} strokeWidth={1.6} opacity={0.35} />
      <Line x1={80} y1={8} x2={80} y2={50} stroke={color} strokeWidth={2} opacity={0.4} />
      <Circle cx={80} cy={28} r={22} fill={color} opacity={0.1} />
      <Circle cx={80} cy={28} r={18} fill="white" stroke={color} strokeWidth={2} />
      <Path d="M68 22 L72 28 L80 20 L88 28 L92 22 L92 26 Q80 33 68 26 Z" fill={color} opacity={0.72} />
      <Circle cx={74} cy={31} r={2.2} fill={color} opacity={0.45} />
      <Circle cx={86} cy={31} r={2.2} fill={color} opacity={0.45} />
      <Circle cx={30} cy={108} r={19} fill={color} opacity={0.1} />
      <Circle cx={30} cy={108} r={15} fill="white" stroke={color} strokeWidth={1.6} />
      <Rect x={22} y={102} width={16} height={12} rx={4} fill={color} opacity={0.22} />
      <Rect x={24} y={105} width={12} height={2.5} rx={1.2} fill={color} opacity={0.5} />
      <Rect x={24} y={110} width={8} height={2} rx={1} fill={color} opacity={0.32} />
      <Circle cx={80} cy={108} r={19} fill={color} opacity={0.1} />
      <Circle cx={80} cy={108} r={15} fill="white" stroke={color} strokeWidth={1.6} />
      <Rect x={72} y={102} width={16} height={12} rx={4} fill={color} opacity={0.22} />
      <Rect x={74} y={105} width={12} height={2.5} rx={1.2} fill={color} opacity={0.5} />
      <Rect x={74} y={110} width={8} height={2} rx={1} fill={color} opacity={0.32} />
      <Circle cx={130} cy={108} r={19} fill={color} opacity={0.1} />
      <Circle cx={130} cy={108} r={15} fill="white" stroke={color} strokeWidth={1.6} />
      <Rect x={122} y={102} width={16} height={12} rx={4} fill={color} opacity={0.22} />
      <Rect x={124} y={105} width={12} height={2.5} rx={1.2} fill={color} opacity={0.5} />
      <Rect x={124} y={110} width={8} height={2} rx={1} fill={color} opacity={0.32} />
      <Circle cx={8} cy={56} r={3} fill={color} opacity={0.24} />
      <Circle cx={152} cy={48} r={2.5} fill={color} opacity={0.18} />
    </Svg>
  );
}

// ── Centers: Building + location pin (unchanged) ──────────────────────────────

export function CentersScene({ color, size = 160 }: SP) {
  return (
    <Svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 160 140">
      <Ellipse cx={80} cy={134} rx={52} ry={6} fill="rgba(0,0,0,0.06)" />
      <Line x1={0} y1={80} x2={160} y2={80} stroke={color} strokeWidth={0.8} opacity={0.1} />
      <Line x1={0} y1={100} x2={160} y2={100} stroke={color} strokeWidth={0.8} opacity={0.1} />
      <Line x1={0} y1={120} x2={160} y2={120} stroke={color} strokeWidth={0.8} opacity={0.08} />
      <Line x1={38} y1={68} x2={38} y2={130} stroke={color} strokeWidth={0.8} opacity={0.1} />
      <Line x1={80} y1={68} x2={80} y2={130} stroke={color} strokeWidth={0.8} opacity={0.1} />
      <Line x1={122} y1={68} x2={122} y2={130} stroke={color} strokeWidth={0.8} opacity={0.08} />
      <Rect x={28} y={58} width={104} height={72} rx={9} fill="white" stroke={color} strokeWidth={1.5} />
      <Path d="M22 64 L80 26 L138 64 Z" fill={color} opacity={0.88} />
      <Line x1={22} y1={64} x2={138} y2={64} stroke={color} strokeWidth={1} opacity={0.4} />
      <Rect x={40} y={72} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />
      <Rect x={71} y={72} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />
      <Rect x={102} y={72} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />
      <Rect x={40} y={96} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />
      <Rect x={102} y={96} width={18} height={16} rx={4} fill={color} opacity={0.2} stroke={color} strokeWidth={0.8} />
      <Rect x={68} y={96} width={24} height={34} rx={6} fill={color} opacity={0.28} stroke={color} strokeWidth={1} />
      <Circle cx={86} cy={114} r={2.2} fill={color} opacity={0.6} />
      <Circle cx={80} cy={16} r={13} fill={color} />
      <Circle cx={80} cy={13} r={7} fill="white" opacity={0.88} />
      <Path d="M70 21 Q80 34 90 21 Z" fill={color} />
      <Circle cx={12} cy={76} r={3} fill={color} opacity={0.24} />
      <Circle cx={150} cy={50} r={2.5} fill={color} opacity={0.18} />
    </Svg>
  );
}

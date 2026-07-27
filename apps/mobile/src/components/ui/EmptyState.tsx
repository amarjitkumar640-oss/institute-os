import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import {
  BatchesScene, StudentsScene, FacultyScene,
  CoursesScene, SubjectsScene, StaffScene, CentersScene,
} from "../illustrations/Scenes";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";

export type EmptyScene =
  | "batches" | "students" | "faculty"
  | "courses" | "subjects" | "staff" | "centers";

interface Props {
  scene:     EmptyScene;
  title:     string;
  subtitle?: string;
  color?:    string;
  action?:   { label: string; onPress: () => void };
}

type SceneComp = React.ComponentType<{ color: string; size?: number }>;

const SCENES: Record<EmptyScene, SceneComp> = {
  batches:  BatchesScene,
  students: StudentsScene,
  faculty:  FacultyScene,
  courses:  CoursesScene,
  subjects: SubjectsScene,
  staff:    StaffScene,
  centers:  CentersScene,
};

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return `rgba(0,0,0,${alpha})`;
  const [r, g, b] = m.map((x) => parseInt(x, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

export function EmptyState({ scene, title, subtitle, color, action }: Props) {
  const colors = useThemeColors();
  const resolvedColor = color ?? colors.primary;
  const Scene = SCENES[scene];
  return (
    <View style={s.wrap}>
      <View style={[s.illusWrap, { backgroundColor: hexToRgba(resolvedColor, 0.06) }]}>
        <Scene color={resolvedColor} size={160} />
      </View>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
      {action ? (
        <TouchableOpacity
          style={[s.btn, { backgroundColor: resolvedColor }]}
          onPress={action.onPress}
          activeOpacity={0.82}
        >
          <Text style={s.btnT}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems:      "center",
    paddingTop:      ms(48),
    paddingBottom:   ms(32),
    paddingHorizontal: ms(32),
    gap:             ms(8),
  },
  illusWrap: {
    borderRadius:    ms(28),
    padding:         ms(20),
    marginBottom:    ms(8),
  },
  title: {
    fontSize:   fs(16),
    fontWeight: "700",
    color:      C.text,
    textAlign:  "center",
  },
  sub: {
    fontSize:   fs(13),
    color:      C.muted,
    textAlign:  "center",
    lineHeight: fs(20),
  },
  btn: {
    marginTop:         ms(14),
    paddingHorizontal: ms(26),
    paddingVertical:   ms(12),
    borderRadius:      ms(26),
    shadowColor:       "#000",
    shadowOffset:      { width: 0, height: ms(2) },
    shadowOpacity:     0.14,
    shadowRadius:      ms(6),
    elevation:         3,
  },
  btnT: {
    fontSize:   fs(14),
    fontWeight: "700",
    color:      "white",
  },
});

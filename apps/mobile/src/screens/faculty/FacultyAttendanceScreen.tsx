import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { ListErrorState } from "../../components/ui/ListErrorState";
import {
  getFacultyAttendance, setFacultyAttendance,
  type FacultyAttendanceRow,
} from "../../api/facultyAttendance";
import type { AttendanceStatus } from "../../api/classSchedule";
import { AVATAR_SIZE, AVATAR_RADIUS, getAvatarFill } from "../../components/ui/avatarStyle";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { T } from "../../components/ui/typography";

type Props = NativeStackScreenProps<RootStackParamList, "FacultyAttendance">;

function fmtToday(): string {
  return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

export function FacultyAttendanceScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const fa = useThemedStyles(makeFaStyles);

  const [date, setDate]         = useState<string | null>(null);
  const [roster, setRoster]     = useState<FacultyAttendanceRow[]>([]);
  const [marks, setMarks]       = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getFacultyAttendance();
      setDate(res.date);
      setRoster(res.roster);
      setMarks(
        Object.fromEntries(
          res.roster.filter((r) => r.status !== null).map((r) => [r.facultyId, r.status as AttendanceStatus]),
        ),
      );
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const presentCount = Object.values(marks).filter((s) => s === "present").length;

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = Object.entries(marks).map(([facultyId, status]) => ({ facultyId, status }));
      const res = await setFacultyAttendance(date, payload);
      setRoster(res.roster);
    } catch {
      setSaveError("Could not save attendance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={fa.safe} edges={["bottom"]}>
      <ScreenHeader
        title="Faculty Attendance"
        onBack={() => navigation.goBack()}
      />

      <View style={fa.summaryRow}>
        <Text style={fa.summaryDate}>{fmtToday()}</Text>
        {!loading && !error && (
          <Text style={fa.summaryCount}>{presentCount}/{roster.length} present</Text>
        )}
      </View>

      {loading ? (
        <View style={fa.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <ListErrorState title="Failed to load faculty" onRetry={load} />
      ) : (
        <>
          {saveError && (
            <View style={fa.errorBox}>
              <Ionicons name="alert-circle-outline" size={ms(14)} color={C.red} />
              <Text style={fa.errorT}>{saveError}</Text>
            </View>
          )}

          <FlatList
            data={roster}
            keyExtractor={(r) => r.facultyId}
            contentContainerStyle={fa.listContent}
            ListEmptyComponent={
              <View style={fa.center}>
                <Text style={fa.emptyT}>No active faculty</Text>
              </View>
            }
            renderItem={({ item }) => {
              const mark  = marks[item.facultyId];
              const fill  = getAvatarFill(colors.primary);
              const ini   = item.fullName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
              return (
                <View style={fa.row}>
                  <View style={[fa.avatar, { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor }]}>
                    <Text style={[fa.avatarT, { color: fill.color }]}>{ini}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={fa.rowName} numberOfLines={1}>{item.fullName}</Text>
                    <Text style={fa.rowCode}>{item.employeeCode}</Text>
                  </View>
                  <View style={fa.toggle}>
                    <TouchableOpacity
                      style={[fa.toggleBtn, mark === "present" && { backgroundColor: C.green, borderColor: C.green }]}
                      onPress={() => setMarks((p) => ({ ...p, [item.facultyId]: "present" }))}
                    >
                      <Text style={[fa.toggleT, mark === "present" && { color: "#fff" }]}>Present</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[fa.toggleBtn, mark === "absent" && { backgroundColor: C.red, borderColor: C.red }]}
                      onPress={() => setMarks((p) => ({ ...p, [item.facultyId]: "absent" }))}
                    >
                      <Text style={[fa.toggleT, mark === "absent" && { color: "#fff" }]}>Absent</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />

          {roster.length > 0 && (
            <View style={fa.saveWrap}>
              <TouchableOpacity
                style={[fa.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
                disabled={saving}
                onPress={handleSave}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={fa.saveBtnT}>Save Attendance</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const makeFaStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.screenBg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: ms(60) },

  summaryRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: ms(16), paddingVertical: ms(12),
  },
  summaryDate:  { ...T.listItemTitle, color: C.text },
  summaryCount: { ...T.chipText, color: C.green },

  errorBox: {
    flexDirection: "row", gap: ms(8), alignItems: "flex-start",
    backgroundColor: C.redBg, borderRadius: ms(12), padding: ms(12),
    marginHorizontal: ms(16), marginBottom: ms(8),
  },
  errorT: { flex: 1, ...T.bodySmall, color: C.red },

  listContent: { paddingHorizontal: ms(16), paddingBottom: ms(100), gap: ms(8) },
  emptyT: { ...T.body, color: C.muted },

  row: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    padding: ms(12), borderRadius: ms(14),
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  avatar:  { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarT: { ...T.listItemTitle, includeFontPadding: false },
  rowName: { ...T.listItemTitle, color: C.text },
  rowCode: { ...T.caption, color: C.muted, marginTop: 1 },

  toggle:    { flexDirection: "row", gap: ms(6) },
  toggleBtn: {
    paddingHorizontal: ms(10), paddingVertical: ms(7), borderRadius: ms(8),
    borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg,
  },
  toggleT: { ...T.chipText, color: C.muted },

  saveWrap: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: ms(16), backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
  },
  saveBtn:  { height: ms(48), borderRadius: ms(12), alignItems: "center", justifyContent: "center" },
  saveBtnT: { ...T.buttonText, color: "#fff" },
});

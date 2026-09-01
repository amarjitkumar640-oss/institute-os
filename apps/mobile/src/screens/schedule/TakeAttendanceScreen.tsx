import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { T } from "../../components/ui/typography";
import { setSessionAttendance, type AttendanceStatus } from "../../api/classSchedule";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "TakeAttendance">;

function fmtDate(iso: string) {
  // Parse the date portion directly to avoid a UTC→local timezone shift
  // flipping the displayed day (same reasoning as SessionDetailScreen's
  // fmtFullDate/fmtSessionDate helpers).
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name: string, colors: ThemeColors) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  const palette = [colors.primary, C.blue, C.green, colors.accent, C.purple, C.orange];
  return palette[n % palette.length];
}

export function TakeAttendanceScreen({ route, navigation }: Props) {
  const { sessionId, sessionDate, roster } = route.params;
  const colors = useThemeColors();
  const ta = useThemedStyles(makeTaStyles);

  const [search, setSearch] = useState("");
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(
    Object.fromEntries(roster.filter((r) => r.status !== null).map((r) => [r.studentId, r.status as AttendanceStatus])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [roster, search]);

  const markedCount = Object.keys(marks).length;
  const presentCount = Object.values(marks).filter((m) => m === "present").length;
  const isEditing = roster.some((r) => r.status !== null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
      await setSessionAttendance(sessionId, payload);
      navigation.goBack();
    } catch {
      setError("Could not save attendance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={ta.safe} edges={["bottom"]}>
      <ScreenHeader
        title={isEditing ? "Edit Attendance" : "Take Attendance"}
        subtitle={`${fmtDate(sessionDate)} · ${presentCount}/${roster.length} present · ${markedCount}/${roster.length} marked`}
        onBack={() => navigation.goBack()}
      />

      <View style={ta.searchWrap}>
        <View style={ta.searchRow}>
          <Ionicons name="search-outline" size={ms(16)} color={C.muted} />
          <TextInput
            style={ta.searchInput}
            placeholder="Search students…"
            placeholderTextColor={C.placeholder}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={ms(16)} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {error && (
        <View style={ta.errorBox}>
          <Ionicons name="alert-circle-outline" size={ms(14)} color={C.red} />
          <Text style={ta.errorT}>{error}</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.studentId}
        contentContainerStyle={ta.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={ta.emptyWrap}>
            <Ionicons name="search-outline" size={ms(28)} color={C.muted} />
            <Text style={ta.emptyT}>No students match "{search}"</Text>
          </View>
        }
        renderItem={({ item }) => {
          const mark = marks[item.studentId];
          const color = avatarColor(item.fullName, colors);
          const initials = getInitials(item.fullName);
          return (
            <View style={ta.row}>
              <View style={[ta.avatar, { backgroundColor: color + "22" }]}>
                <Text style={[ta.avatarT, { color }]}>{initials}</Text>
              </View>
              <Text style={ta.rowName} numberOfLines={1}>{item.fullName}</Text>
              <View style={ta.toggle}>
                <TouchableOpacity
                  style={[ta.toggleBtn, mark === "present" && { backgroundColor: C.green, borderColor: C.green }]}
                  onPress={() => setMarks((p) => ({ ...p, [item.studentId]: "present" }))}
                >
                  <Text style={[ta.toggleT, mark === "present" && { color: "#fff" }]}>Present</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ta.toggleBtn, mark === "absent" && { backgroundColor: C.red, borderColor: C.red }]}
                  onPress={() => setMarks((p) => ({ ...p, [item.studentId]: "absent" }))}
                >
                  <Text style={[ta.toggleT, mark === "absent" && { color: "#fff" }]}>Absent</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      <View style={ta.saveWrap}>
        <TouchableOpacity
          style={[ta.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
          disabled={saving}
          onPress={handleSave}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={ta.saveBtnT}>Save Attendance</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeTaStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  searchWrap: { paddingHorizontal: ms(16), paddingTop: ms(10), paddingBottom: ms(6) },
  searchRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: ms(12),
    paddingHorizontal: ms(12), paddingVertical: ms(10), shadowColor: C.text, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 2, gap: ms(8),
  },
  searchInput: { flex: 1, ...T.body, color: C.text, padding: 0, includeFontPadding: false },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: C.redBg, borderRadius: ms(10),
    paddingHorizontal: ms(12), paddingVertical: ms(8), marginHorizontal: ms(16), marginBottom: ms(6),
  },
  errorT: { ...T.caption, color: C.red, flex: 1 },
  listContent: { paddingHorizontal: ms(16), paddingBottom: ms(16), gap: ms(8) },
  emptyWrap: { alignItems: "center", paddingTop: ms(60), gap: ms(8) },
  emptyT: { ...T.body, color: C.muted },
  row: { flexDirection: "row", alignItems: "center", gap: ms(10), backgroundColor: C.card, borderRadius: ms(14), padding: ms(10) },
  avatar: { width: ms(38), height: ms(38), borderRadius: ms(19), justifyContent: "center", alignItems: "center" },
  avatarT: { ...T.listItemTitle, fontSize: ms(13) },
  rowName: { ...T.body, color: C.text, flex: 1 },
  toggle: { flexDirection: "row", gap: ms(6) },
  toggleBtn: { paddingHorizontal: ms(10), paddingVertical: ms(6), borderRadius: ms(8), borderWidth: 1, borderColor: C.border },
  toggleT: { ...T.chipText, color: C.text },
  saveWrap: {
    paddingHorizontal: ms(16), paddingTop: ms(10), paddingBottom: ms(14),
    borderTopWidth: 1, borderTopColor: C.border, backgroundColor: colors.screenBg,
  },
  saveBtn: { borderRadius: ms(14), paddingVertical: ms(14), alignItems: "center" },
  saveBtnT: { ...T.buttonText, color: "#fff" },
});

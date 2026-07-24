import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "./BottomSheet";
import { apiClient } from "../../api/client";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";

interface CenterOption {
  id:   string;
  name: string;
}

interface Props {
  visible:  boolean;
  onClose:  () => void;
  onSelect: (centerId: string) => void;
}

// Fallback picker shown when a create/save action fails because the current
// session has no center pinned ("all-centers" mode) and none was supplied —
// lets the user pick one right there, without navigating away from the form
// (unlike the full-screen CenterSelectScreen used at login/switch-center,
// which would unmount the current screen and lose any in-progress input).
export function CenterPickerSheet({ visible, onClose, onSelect }: Props) {
  const [centers, setCenters] = useState<CenterOption[] | null>(null);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCenters(null);
    setError(false);
    apiClient
      .get<CenterOption[]>("/centers")
      .then(({ data }) => setCenters(data))
      .catch(() => setError(true));
  }, [visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.header}>
        <Text style={s.title}>Select a Center</Text>
        <Text style={s.sub}>Choose which center this record belongs to, then it'll be saved automatically.</Text>
      </View>

      {centers === null && !error && (
        <View style={s.state}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}

      {error && (
        <View style={s.state}>
          <Text style={s.errT}>Could not load centers. Please try again.</Text>
        </View>
      )}

      {centers?.length === 0 && (
        <View style={s.state}>
          <Text style={s.errT}>You're not assigned to any center yet.</Text>
        </View>
      )}

      {centers?.map((c) => (
        <TouchableOpacity
          key={c.id}
          style={s.row}
          onPress={() => onSelect(c.id)}
          activeOpacity={0.7}
        >
          <Ionicons name="business-outline" size={ms(18)} color={C.primary} />
          <Text style={s.rowT} numberOfLines={1}>{c.name}</Text>
          <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  header: { padding: ms(20), paddingBottom: ms(12) },
  title:  { fontSize: fs(17), fontWeight: "800", color: C.text },
  sub:    { fontSize: fs(12.5), color: C.muted, marginTop: ms(4), lineHeight: fs(17) },
  state:  { padding: ms(30), alignItems: "center" },
  errT:   { fontSize: fs(13), color: C.red, textAlign: "center" },
  row: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    paddingHorizontal: ms(20), paddingVertical: ms(14),
    borderTopWidth: 1, borderTopColor: C.border,
  },
  rowT: { flex: 1, fontSize: fs(14), fontWeight: "600", color: C.text },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "./BottomSheet";
import { apiClient } from "../../api/client";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

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
  const colors = useThemeColors();
  const s = useThemedStyles(makeStyles);
  const [centers,   setCenters]   = useState<CenterOption[] | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(false);

  // Kept in a ref (rather than a useCallback dependency) so `load` has a stable
  // identity across parent re-renders — onSelect is a new inline function every
  // render, and depending on it directly would re-run the effect below (and
  // re-fetch) on every unrelated re-render of the parent screen while the sheet
  // is open, not just when it's first opened.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const load = useCallback(() => {
    setCenters(null);
    setError(false);
    setLoading(true);
    apiClient
      .get<CenterOption[]>("/centers/assignable")
      .then(({ data }) => {
        if (data.length === 1) {
          // Only one center to choose from — nothing to actually pick, proceed silently
          // instead of making the user tap a list with a single row.
          onSelectRef.current(data[0].id);
        } else {
          setCenters(data);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  // Don't mount the sheet at all while loading or for the single-center case above —
  // it would otherwise flash open for a moment and then immediately close.
  const showSheet = visible && (error || (centers !== null && centers.length !== 1));

  return (
    <BottomSheet visible={showSheet} onClose={onClose}>
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="business-outline" size={ms(24)} color={colors.primary} />
        </View>
        <Text style={s.title}>Select a Center</Text>
        <Text style={s.sub}>Choose which center this record belongs to, then it'll be saved automatically.</Text>
      </View>

      {error && (
        <View style={s.state}>
          <Ionicons name="cloud-offline-outline" size={ms(28)} color={C.red} />
          <Text style={s.errT}>Could not load centers. Please check your connection and try again.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load} activeOpacity={0.8}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Ionicons name="refresh" size={ms(15)} color="#fff" />
                <Text style={s.retryBtnT}>Try Again</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {centers?.length === 0 && (
        <View style={s.state}>
          <Ionicons name="alert-circle-outline" size={ms(28)} color={C.muted} />
          <Text style={s.errT}>No active centers found. Please contact your admin.</Text>
        </View>
      )}

      {centers?.map((c, i) => (
        <TouchableOpacity
          key={c.id}
          style={[s.row, i === 0 && s.rowFirst]}
          onPress={() => onSelect(c.id)}
          activeOpacity={0.7}
        >
          <View style={s.rowIcon}>
            <Ionicons name="business" size={ms(16)} color={colors.primary} />
          </View>
          <Text style={s.rowT} numberOfLines={1}>{c.name}</Text>
          <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
        </TouchableOpacity>
      ))}

      <View style={s.bottomSpacer} />
    </BottomSheet>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  header: { alignItems: "center", padding: ms(20), paddingBottom: ms(16) },
  headerIcon: {
    width: ms(52), height: ms(52), borderRadius: ms(16),
    backgroundColor: colors.primary + "16", justifyContent: "center", alignItems: "center",
    marginBottom: ms(10),
  },
  title:  { fontSize: fs(17), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  sub:    { fontSize: fs(12.5), color: C.muted, marginTop: ms(4), lineHeight: fs(17), textAlign: "center" },
  state:  { paddingHorizontal: ms(28), paddingBottom: ms(26), alignItems: "center", gap: ms(10) },
  errT:   { fontSize: fs(13), color: C.text, textAlign: "center", lineHeight: fs(18) },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: ms(6),
    backgroundColor: colors.primary, borderRadius: ms(12),
    paddingHorizontal: ms(18), paddingVertical: ms(10), marginTop: ms(4),
  },
  retryBtnT: { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },
  row: {
    flexDirection: "row", alignItems: "center", gap: ms(12),
    paddingHorizontal: ms(20), paddingVertical: ms(13),
    borderTopWidth: 1, borderTopColor: C.border,
  },
  rowFirst: { borderTopWidth: 0 },
  rowIcon: {
    width: ms(34), height: ms(34), borderRadius: ms(10),
    backgroundColor: colors.primary + "14", justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  rowT: { flex: 1, fontSize: fs(14), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.text },
  bottomSpacer: { height: ms(20) },
});

import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";
import { useThemeColors } from "../../context/ThemeContext";

export interface SelectOption {
  label: string;
  value: string;
  /** Optional color accent for the chip when selected */
  color?: string;
}

interface SingleProps {
  label: string;
  options: SelectOption[];
  multiple?: false;
  value: string | undefined;
  onChange: (v: string) => void;
  error?: string;
  /** Allow horizontal scroll when there are many options (default false = wrap) */
  scrollable?: boolean;
}

interface MultiProps {
  label: string;
  options: SelectOption[];
  multiple: true;
  value: string[];
  onChange: (v: string[]) => void;
  error?: string;
  scrollable?: boolean;
}

type Props = SingleProps | MultiProps;

export function SelectChips(props: Props) {
  const colors = useThemeColors();
  const { label, options, error, scrollable = false } = props;
  const hasError = !!error;

  function isSelected(value: string): boolean {
    return props.multiple ? props.value.includes(value) : props.value === value;
  }

  function handlePress(value: string) {
    if (props.multiple) {
      const next = props.value.includes(value)
        ? props.value.filter((v) => v !== value)
        : [...props.value, value];
      props.onChange(next);
    } else {
      props.onChange(value);
    }
  }

  const chips = options.map((opt) => {
    const selected = isSelected(opt.value);
    const accentColor = opt.color ?? colors.primary;
    return (
      <TouchableOpacity
        key={opt.value}
        style={[
          s.chip,
          selected && { backgroundColor: accentColor, borderColor: accentColor },
          hasError && !selected && s.chipError,
        ]}
        onPress={() => handlePress(opt.value)}
        activeOpacity={0.75}
      >
        {selected && (
          <Ionicons name="checkmark-circle" size={13} color="#fff" style={s.chipIcon} />
        )}
        <Text style={[s.chipT, selected && s.chipTOn]}>{opt.label}</Text>
      </TouchableOpacity>
    );
  });

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>

      {scrollable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
        >
          {chips}
        </ScrollView>
      ) : (
        <View style={s.chipRow}>{chips}</View>
      )}

      {hasError && (
        <View style={s.errorRow}>
          <Ionicons name="alert-circle-outline" size={13} color="#C0392B" />
          <Text style={s.errorT}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:        { marginBottom: ms(20) },
  label:       { fontSize: fs(12.5), fontWeight: "700", color: "#2B1B1F", marginBottom: ms(9), letterSpacing: 0.3 },
  chipRow:     { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  scroll:      { flexShrink: 0 },
  scrollContent:{ flexDirection: "row", gap: ms(8), paddingRight: ms(4) },
  chip:        {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: ms(9),
    paddingHorizontal: ms(16),
    borderRadius: ms(20),
    borderWidth: 1.5,
    borderColor: "#E8E3DC",
    backgroundColor: "#FFFFFF",
    gap: ms(5),
  },
  chipError:   { borderColor: "#C0392B" },
  chipIcon:    { flexShrink: 0 },
  chipT:       { fontSize: fs(13), fontWeight: "600", color: "#8A7F82", includeFontPadding: false },
  chipTOn:     { color: "#FFFFFF" },
  errorRow:    { flexDirection: "row", alignItems: "center", marginTop: ms(5), gap: ms(4) },
  errorT:      { fontSize: fs(11.5), color: "#C0392B", flex: 1 },
});

import React, { useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardTypeOptions,
  TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";

interface Props extends Pick<TextInputProps, "returnKeyType" | "onSubmitEditing" | "blurOnSubmit"> {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  editable?: boolean;
  hint?: string;
  /** Optional icon name from Ionicons shown on the left */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Show clear button when field has a value */
  clearable?: boolean;
}

export function FormField({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  keyboardType = "default",
  maxLength,
  editable = true,
  hint,
  icon,
  clearable = false,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const hasError = !!error;

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>

      <TouchableOpacity
        activeOpacity={1}
        onPress={() => inputRef.current?.focus()}
        style={[s.inputRow, hasError && s.inputRowError, !editable && s.inputRowDisabled]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={16}
            color={hasError ? "#C0392B" : "#8A7F82"}
            style={s.icon}
          />
        )}
        <TextInput
          ref={inputRef}
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#C7BAB4"
          keyboardType={keyboardType}
          maxLength={maxLength}
          editable={editable}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
        />
        {clearable && !!value && editable && (
          <TouchableOpacity onPress={() => onChangeText("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color="#B0A9AC" />
          </TouchableOpacity>
        )}
        {maxLength && editable && (
          <Text style={s.counter}>
            {value.length}/{maxLength}
          </Text>
        )}
      </TouchableOpacity>

      {hasError && (
        <View style={s.errorRow}>
          <Ionicons name="alert-circle-outline" size={13} color="#C0392B" />
          <Text style={s.errorT}>{error}</Text>
        </View>
      )}
      {!hasError && hint && (
        <Text style={s.hint}>{hint}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:             { marginBottom: ms(20) },
  label:            { fontSize: fs(12.5), fontWeight: "700", color: "#2B1B1F", marginBottom: ms(7), letterSpacing: 0.3 },
  inputRow:         {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: ms(12),
    borderWidth: 1.5,
    borderColor: "#E8E3DC",
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
    gap: ms(8),
  },
  inputRowError:    { borderColor: "#C0392B", backgroundColor: "#FEF8F8" },
  inputRowDisabled: { backgroundColor: "#F5F2EE", opacity: 0.7 },
  icon:             { flexShrink: 0 },
  input:            { flex: 1, fontSize: fs(14), color: "#2B1B1F", includeFontPadding: false, padding: 0 },
  counter:          { fontSize: fs(10.5), color: "#B0A9AC", flexShrink: 0 },
  errorRow:         { flexDirection: "row", alignItems: "center", marginTop: ms(5), gap: ms(4) },
  errorT:           { fontSize: fs(11.5), color: "#C0392B", flex: 1 },
  hint:             { fontSize: fs(11.5), color: "#8A7F82", marginTop: ms(5) },
});

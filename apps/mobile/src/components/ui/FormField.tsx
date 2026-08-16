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
import { C } from "../../theme";
import { T } from "./typography";

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
  /** Show a red asterisk to mark this field as mandatory */
  required?: boolean;
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
  required = false,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const hasError = !!error;

  return (
    <View style={s.wrap}>
      <Text style={s.label}>
        {label}
        {required ? <Text style={s.asterisk}> *</Text> : null}
      </Text>

      <TouchableOpacity
        activeOpacity={1}
        onPress={() => inputRef.current?.focus()}
        style={[s.inputRow, hasError && s.inputRowError, !editable && s.inputRowDisabled]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={16}
            color={hasError ? C.red : C.muted}
            style={s.icon}
          />
        )}
        <TextInput
          ref={inputRef}
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.placeholder}
          keyboardType={keyboardType}
          maxLength={maxLength}
          editable={editable}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
        />
        {clearable && !!value && editable && (
          <TouchableOpacity onPress={() => onChangeText("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={C.placeholder} />
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
          <Ionicons name="alert-circle-outline" size={13} color={C.red} />
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
  label:            { ...T.chipText, color: C.text, marginBottom: ms(7) },
  asterisk:         { color: C.red, fontFamily: "Inter_700Bold", fontWeight: "700" },
  inputRow:         {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.inputBg,
    borderRadius: ms(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
    gap: ms(8),
  },
  inputRowError:    { borderColor: C.red, backgroundColor: C.red + "08" },
  inputRowDisabled: { backgroundColor: C.bg, opacity: 0.7 },
  icon:             { flexShrink: 0 },
  input:            { flex: 1, ...T.body, color: C.text, includeFontPadding: false, padding: 0 },
  counter:          { ...T.caption, color: C.placeholder, flexShrink: 0 },
  errorRow:         { flexDirection: "row", alignItems: "center", marginTop: ms(5), gap: ms(4) },
  errorT:           { ...T.helperText, color: C.red, flex: 1 },
  hint:             { ...T.helperText, color: C.muted, marginTop: ms(5) },
});

import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ms } from "../../utils/responsive";
import { useKeyboardScrollIntoView } from "../../hooks/useKeyboardScrollIntoView";
import { BottomSheet, SHEET_HEIGHT } from "../ui/BottomSheet";
import { T } from "../ui/typography";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { forgotPassword, resetPassword } from "../../api/auth";

type Step = "request" | "sent-sms" | "sent-email" | "done";

const SCREEN_H = Dimensions.get("window").height;

interface Props {
  visible: boolean;
  onClose: () => void;
  loginMethod: "phone" | "email_username";
}

export function ForgotPasswordSheet({ visible, onClose, loginMethod }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeStyles);
  const isPhone = loginMethod === "phone";

  const [step, setStep]         = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode]         = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");

  const { scrollRef, recordFieldY, scrollFieldIntoView, onScrollViewLayout, onScroll } =
    useKeyboardScrollIntoView({ sheetHeight: SCREEN_H * 0.65 });

  useEffect(() => {
    if (visible) {
      setStep("request"); setIdentifier(""); setCode("");
      setPassword(""); setConfirm(""); setError("");
    }
  }, [visible]);

  async function handleRequest() {
    if (!identifier.trim()) { setError(isPhone ? "Enter your phone number." : "Enter your email or username."); return; }
    setSubmitting(true); setError("");
    try {
      await forgotPassword(identifier.trim());
      setStep(isPhone ? "sent-sms" : "sent-email");
    } catch (err: any) {
      // A 502 means the account exists but the mail/SMS provider failed to
      // deliver (see auth.routes.ts) — surfaced with its real message so
      // the user isn't left waiting on something that was never sent.
      const apiMessage = err?.response?.data?.error;
      setError(typeof apiMessage === "string" ? apiMessage : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    if (!code.trim()) { setError("Enter the code we texted you."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setSubmitting(true); setError("");
    try {
      await resetPassword(identifier.trim(), code.trim(), password);
      setStep("done");
    } catch {
      setError("Invalid or expired code. Request a new one and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={SHEET_HEIGHT.short}>
      <ScrollView
        ref={scrollRef}
        style={{ flexShrink: 1 }}
        onLayout={onScrollViewLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.drag} />

        {step === "request" && (
          <>
            <Text style={s.title}>Reset Password</Text>
            <Text style={s.sub}>
              Enter your {isPhone ? "phone number" : "email or username"} and we'll send you a reset code.
            </Text>
            <TextInput
              style={s.input}
              placeholder={isPhone ? "Phone number" : "Email or username"}
              placeholderTextColor={C.muted}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              keyboardType={isPhone ? "phone-pad" : "default"}
            />
            {!!error && <Text style={s.errorT}>{error}</Text>}
            <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }, submitting && s.btnDim]} onPress={handleRequest} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnT}>Send Reset Code</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelT}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}

        {step === "sent-sms" && (
          <>
            <Text style={s.title}>Enter Reset Code</Text>
            {/* Deliberately conditional ("if...") rather than asserting a code
                was sent — we never confirm or deny that an account exists for
                a given identifier (see auth.routes.ts's forgot-password
                handler), so this copy can't claim delivery happened either. */}
            <Text style={s.sub}>If that phone number matches an account, we've texted a 6-digit code to it.</Text>
            <View onLayout={recordFieldY("code")}>
              <TextInput
                style={s.input}
                placeholder="6-digit code"
                placeholderTextColor={C.muted}
                value={code}
                onChangeText={setCode}
                onFocus={() => scrollFieldIntoView("code")}
                keyboardType="number-pad"
              />
            </View>
            <View style={s.pwRow} onLayout={recordFieldY("password")}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                placeholder="New password (min. 6 characters)"
                placeholderTextColor={C.muted}
                value={password}
                onChangeText={setPassword}
                onFocus={() => scrollFieldIntoView("password")}
                secureTextEntry={!showPw}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPw((v) => !v)}>
                <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={ms(20)} color={C.muted} />
              </TouchableOpacity>
            </View>
            <View onLayout={recordFieldY("confirm")}>
              <TextInput
                style={s.input}
                placeholder="Confirm new password"
                placeholderTextColor={C.muted}
                value={confirm}
                onChangeText={setConfirm}
                onFocus={() => scrollFieldIntoView("confirm")}
                secureTextEntry={!showPw}
              />
            </View>
            {!!error && <Text style={s.errorT}>{error}</Text>}
            <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }, submitting && s.btnDim]} onPress={handleReset} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnT}>Reset Password</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setStep("request")}>
              <Text style={s.cancelT}>Back</Text>
            </TouchableOpacity>
          </>
        )}

        {step === "sent-email" && (
          <>
            <View style={[s.iconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="mail-outline" size={ms(26)} color={colors.primary} />
            </View>
            <Text style={s.title}>Check Your Email</Text>
            <Text style={s.sub}>
              If an account matches what you entered, we've emailed a reset link. Open it on this
              device or a computer to finish resetting your password, then come back here to log in.
            </Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }]} onPress={onClose}>
              <Text style={s.btnT}>Done</Text>
            </TouchableOpacity>
          </>
        )}

        {step === "done" && (
          <>
            <View style={[s.iconWrap, { backgroundColor: C.green + "18" }]}>
              <Ionicons name="checkmark-circle" size={ms(26)} color={C.green} />
            </View>
            <Text style={s.title}>Password Reset</Text>
            <Text style={s.sub}>You can now sign in with your new password.</Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }]} onPress={onClose}>
              <Text style={s.btnT}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  drag:   { width: ms(36), height: ms(4), backgroundColor: C.border, borderRadius: ms(2), alignSelf: "center", marginBottom: ms(16) },
  title:  { ...T.displayMedium, color: C.text, marginBottom: ms(4) },
  sub:    { ...T.body, color: C.muted, marginBottom: ms(16) },

  input:  { backgroundColor: colors.inputBg, borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(12), ...T.body, color: C.text, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginBottom: ms(10) },
  pwRow:  { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(10) },
  eyeBtn: { padding: ms(4) },

  errorT: { ...T.bodySmall, color: C.red, marginTop: -ms(2), marginBottom: ms(8) },

  btn:       { borderRadius: ms(14), paddingVertical: ms(14), alignItems: "center", marginTop: ms(4) },
  btnDim:    { opacity: 0.6 },
  btnT:      { ...T.buttonText, color: "#fff" },
  cancelBtn: { alignItems: "center", marginTop: ms(12), paddingBottom: ms(8) },
  cancelT:   { ...T.buttonText, color: C.muted },

  iconWrap: { width: ms(52), height: ms(52), borderRadius: ms(16), justifyContent: "center", alignItems: "center", marginBottom: ms(12) },
});

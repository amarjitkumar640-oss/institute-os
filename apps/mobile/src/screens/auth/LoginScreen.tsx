import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Svg, { Path, SvgXml } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useOrg } from "../../context/OrgContext";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, useBrandLogoUrl, type ThemeColors } from "../../context/ThemeContext";
import { LOGIN_ILLUSTRATION_SVG } from "../../components/illustrations/LoginIllustration";

const { height: SCREEN_H } = Dimensions.get("window");
const CARD_H = Math.min(Math.round(SCREEN_H * 0.50), 420);

// ── Illustration ──────────────────────────────────────────────────────────────

function StudyIllustration() {
  return (
    <SvgXml xml={LOGIN_ILLUSTRATION_SVG} width="100%" height={SCREEN_H * 0.38} />
  );
}

// ── Inline field error ─────────────────────────────────────────────────────────

function FieldError({ message }: { message: string }) {
  const s = useThemedStyles(makeStyles);
  const opacity = useRef(new Animated.Value(0)).current;
  const slideY  = useRef(new Animated.Value(-6)).current;

  useEffect(() => {
    if (message) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideY,  { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      slideY.setValue(-6);
    }
  }, [message]);

  if (!message) return null;
  return (
    <Animated.View style={[s.fieldErrRow, { opacity, transform: [{ translateY: slideY }] }]}>
      <Ionicons name="alert-circle-outline" size={13} color={C.red} />
      <Text style={s.fieldErrText}>{message}</Text>
    </Animated.View>
  );
}

// ── Wave background (dynamic brand color) ─────────────────────────────────────
// Paths match the reference design exactly; background color comes from the
// configured tenant primary color via the parent View's backgroundColor.

function WaveOverlay({ color }: { color: string }) {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 430 340"
      preserveAspectRatio="none"
    >
      {/* Layer 1 */}
      <Path
        fill="rgba(255,255,255,.12)"
        d="M0 150 C60 210 140 230 220 205 C300 180 360 160 430 185 L430 340 L0 340 Z"
      />
      {/* Layer 2 */}
      <Path
        fill="rgba(255,255,255,.18)"
        d="M0 185 C70 250 150 260 240 220 C320 185 385 180 430 205 L430 340 L0 340 Z"
      />
      {/* Layer 3 */}
      <Path
        fill="rgba(255,255,255,.28)"
        d="M0 250 C90 295 170 265 220 225 C285 170 345 230 430 180 L430 340 L0 340 Z"
      />
      {/* White bottom — creates the wavy edge against the form section */}
      <Path
        fill="#fff"
        d="M0 315 C90 305 165 190 235 225 C315 260 365 305 430 250 L430 500 L0 500 Z"
      />
    </Svg>
  );
}

// ── Shake helper ──────────────────────────────────────────────────────────────

function doShake(anim: Animated.Value) {
  Animated.sequence([
    Animated.timing(anim, { toValue: 10, duration: 50, useNativeDriver: true, easing: Easing.linear }),
    Animated.timing(anim, { toValue: -9, duration: 50, useNativeDriver: true, easing: Easing.linear }),
    Animated.timing(anim, { toValue: 7,  duration: 45, useNativeDriver: true, easing: Easing.linear }),
    Animated.timing(anim, { toValue: -5, duration: 45, useNativeDriver: true, easing: Easing.linear }),
    Animated.timing(anim, { toValue: 0,  duration: 40, useNativeDriver: true, easing: Easing.linear }),
  ]).start();
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function LoginScreen() {
  const { login } = useAuth();
  const colors = useThemeColors();
  const s = useThemedStyles(makeStyles);
  const logoUrl = useBrandLogoUrl();
  const { name: orgName, loginMethod, isLoading: orgLoading, configError } = useOrg();
  const isPhone = loginMethod === "phone";

  const [identifier,      setIdentifier]      = useState("");
  const [password,        setPassword]        = useState("");
  const [showPassword,    setShowPassword]    = useState(false);
  const [focusedField,    setFocusedField]    = useState<"identifier" | "password" | null>(null);
  const [identifierError, setIdentifierError] = useState("");
  const [passwordError,   setPasswordError]   = useState("");
  const [serverError,     setServerError]     = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [rememberMe,      setRememberMe]      = useState(false);

  // ── Animated values ───────────────────────────────────────────────────────────
  const floatY        = useRef(new Animated.Value(0)).current;
  const heroOpacity   = useRef(new Animated.Value(0)).current;
  const heroY         = useRef(new Animated.Value(-20)).current;
  const sheetY        = useRef(new Animated.Value(80)).current;
  const sheetOpacity  = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY       = useRef(new Animated.Value(12)).current;
  const fieldsOpacity = useRef(new Animated.Value(0)).current;
  const fieldsY       = useRef(new Animated.Value(14)).current;
  const btnScale      = useRef(new Animated.Value(0.88)).current;
  const btnOpacity    = useRef(new Animated.Value(0)).current;
  const pressScale    = useRef(new Animated.Value(1)).current;
  const identifierShakeX = useRef(new Animated.Value(0)).current;
  const passwordShakeX   = useRef(new Animated.Value(0)).current;

  // RN auto-scrolls this ScrollView to keep a focused field visible above
  // the keyboard, but never scrolls it back down on dismiss — the scroll
  // offset (not KeyboardAvoidingView's padding, which does reset) is what's
  // left behind, reading as "content still lifted" after the keyboard closes.
  const scrollRef = useRef<ScrollView>(null);

  // ── Entrance sequence ─────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(heroY,       { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.spring(sheetY,       { toValue: 0, tension: 55, friction: 9, delay: 150, useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 1, duration: 280, delay: 150, useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 280, delay: 320, useNativeDriver: true }),
      Animated.timing(headerY,       { toValue: 0, duration: 300, delay: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.timing(fieldsOpacity, { toValue: 1, duration: 300, delay: 420, useNativeDriver: true }),
      Animated.timing(fieldsY,       { toValue: 0, duration: 320, delay: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.spring(btnScale,   { toValue: 1, tension: 70, friction: 7, delay: 520, useNativeDriver: true }),
      Animated.timing(btnOpacity, { toValue: 1, duration: 220, delay: 520, useNativeDriver: true }),
    ]).start();

    const floatLoop = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatY, { toValue: -7, duration: 2200, useNativeDriver: true }),
          Animated.timing(floatY, { toValue: 0,  duration: 2200, useNativeDriver: true }),
        ])
      ).start();
    }, 700);

    return () => clearTimeout(floatLoop);
  }, []);

  // Scroll back to the top once the keyboard is fully gone, undoing RN's
  // auto-scroll-to-focused-input so the form returns to its original position.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => sub.remove();
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────────
  function validateIdentifier(): boolean {
    const t = identifier.trim();
    if (!t) {
      setIdentifierError(isPhone ? "Phone number is required" : "Email or username is required");
      doShake(identifierShakeX);
      return false;
    }
    if (isPhone && t.replace(/\D/g, "").length < 7) {
      setIdentifierError("Enter a valid phone number");
      doShake(identifierShakeX);
      return false;
    }
    setIdentifierError("");
    return true;
  }

  function validatePassword(): boolean {
    if (!password) {
      setPasswordError("Password is required");
      doShake(passwordShakeX);
      return false;
    }
    setPasswordError("");
    return true;
  }

  async function handleSubmit() {
    setServerError("");
    const identOk = validateIdentifier();
    const passOk  = validatePassword();
    if (!identOk || !passOk) return;

    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setServerError(isPhone ? "Invalid phone number or password." : "Invalid credentials.");
        doShake(identifierShakeX);
        doShake(passwordShakeX);
      } else if (err?.code === "ERR_NETWORK" || err?.code === "ECONNREFUSED") {
        setServerError("Cannot reach server. Check your network or API URL.");
      } else {
        setServerError(err?.response?.data?.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onPressIn()  { Animated.spring(pressScale, { toValue: 0.96, useNativeDriver: true, tension: 200, friction: 10 }).start(); }
  function onPressOut() { Animated.spring(pressScale, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 10 }).start(); }

  const topInset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) + 8 : 52;

  if (orgLoading) {
    return (
      <View style={s.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (configError) {
    return (
      <View style={s.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <Ionicons name="alert-circle-outline" size={40} color={C.red} />
        <Text style={s.errorTitle}>Can't load app configuration</Text>
        <Text style={s.errorSub}>This app isn't set up correctly. Please contact support.</Text>
      </View>
    );
  }

  return (
    // Android already handles the keyboard natively via app.config.js's
    // softwareKeyboardLayoutMode: "pan" (windowSoftInputMode=adjustPan) — the
    // OS pans the whole window itself. Also applying KeyboardAvoidingView's
    // "height" behavior on top of that double-compensates, and the two don't
    // reliably un-shift in sync on dismiss (content stays partly lifted).
    // iOS has no such native mechanism, so it still needs "padding" here.
    <KeyboardAvoidingView
      style={s.kav}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={s.root}>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

          {/* ── Hero ── */}
          <Animated.View style={[s.heroWrap, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}>
            <View style={[s.hero, { backgroundColor: colors.primary }]}>
              {/* Wave overlay — dynamic brand color, white semi-transparent layers */}
              <WaveOverlay color={colors.primary} />

              <View style={[s.heroInner, { paddingTop: topInset }]}>
                {/* Logo + title row */}
                <Animated.View style={[s.heroTop, { opacity: headerOpacity, transform: [{ translateY: headerY }] }]}>
                  <Animated.View style={{ transform: [{ translateY: floatY }] }}>
                    <View style={[s.logoRing, { borderColor: "rgba(245,179,1,0.92)" }]}>
                      <View style={s.logoInner}>
                        <Image
                          source={logoUrl ? { uri: logoUrl } : require("../../../assets/institute-logo.png")}
                          style={s.logoImg}
                        />
                      </View>
                    </View>
                  </Animated.View>
                  <View style={s.heroTitleBlock}>
                    <Text style={s.heroTitle}>Log In</Text>
                    <Text style={s.heroSub}>Experience a better learning environment</Text>
                  </View>
                </Animated.View>

                {/* Illustration */}
                <View style={s.illustrationWrap}>
                  <StudyIllustration />
                </View>
              </View>
            </View>
          </Animated.View>

          {/* ── Form card ── */}
          <Animated.View style={[s.card, { opacity: sheetOpacity, transform: [{ translateY: sheetY }] }]}>
            <ScrollView
              ref={scrollRef}
              style={s.cardScroll}
              contentContainerStyle={s.cardContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Identifier */}
              <Animated.View style={{ opacity: fieldsOpacity, transform: [{ translateY: fieldsY }] }}>
                <Text style={s.fieldLabel}>{isPhone ? "Phone number" : "Email address"}</Text>
                <Animated.View style={[
                  s.field,
                  focusedField === "identifier" && s.fieldFocused,
                  !!identifierError && s.fieldError,
                  { transform: [{ translateX: identifierShakeX }] },
                ]}>
                  <Ionicons
                    name={isPhone ? "call-outline" : "mail-outline"}
                    size={18}
                    color={identifierError ? C.red : focusedField === "identifier" ? colors.primary : "#AAAAAA"}
                  />
                  <View style={s.fieldDivider} />
                  <TextInput
                    style={s.textInput}
                    placeholder={isPhone ? "Phone number" : "Email or username"}
                    placeholderTextColor="#BBBBBB"
                    value={identifier}
                    onChangeText={(v) => { setIdentifier(v); if (identifierError) setIdentifierError(""); setServerError(""); }}
                    onFocus={() => setFocusedField("identifier")}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    keyboardType={isPhone ? "phone-pad" : "default"}
                    returnKeyType="next"
                  />
                  {identifier.length > 0 && !identifierError && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </Animated.View>
                <FieldError message={identifierError} />
              </Animated.View>

              {/* Password */}
              <Animated.View style={{ opacity: fieldsOpacity, transform: [{ translateY: fieldsY }], marginTop: 14 }}>
                <Text style={s.fieldLabel}>Password</Text>
                <Animated.View style={[
                  s.field,
                  focusedField === "password" && s.fieldFocused,
                  !!passwordError && s.fieldError,
                  { transform: [{ translateX: passwordShakeX }] },
                ]}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={passwordError ? C.red : focusedField === "password" ? colors.primary : "#AAAAAA"}
                  />
                  <View style={s.fieldDivider} />
                  <TextInput
                    style={s.textInput}
                    placeholder="Password"
                    placeholderTextColor="#BBBBBB"
                    value={password}
                    onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(""); setServerError(""); }}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                  <TouchableOpacity
                    style={s.iconR}
                    onPress={() => setShowPassword(v => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#AAAAAA" />
                  </TouchableOpacity>
                </Animated.View>
                <FieldError message={passwordError} />
              </Animated.View>

              {/* Remember me + forgot */}
              <View style={s.row}>
                <TouchableOpacity style={s.rememberRow} onPress={() => setRememberMe(v => !v)} activeOpacity={0.7}>
                  <View style={[s.checkbox, rememberMe && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {rememberMe && <Ionicons name="checkmark" size={11} color="#fff" />}
                  </View>
                  <Text style={s.rememberLabel}>Remember me</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7}>
                  <Text style={[s.forgot, { color: colors.primary }]}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              {/* Server error */}
              {serverError ? (
                <View style={s.serverErrBox}>
                  <Ionicons name="information-circle-outline" size={15} color={C.red} />
                  <Text style={s.serverErrText}>{serverError}</Text>
                </View>
              ) : null}

            </ScrollView>

            {/* Login Now button — pinned to bottom of card */}
            <Animated.View style={[s.btnWrap, { opacity: btnOpacity, transform: [{ scale: btnScale }] }]}>
              <TouchableOpacity
                onPress={handleSubmit}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={submitting}
                activeOpacity={1}
              >
                <Animated.View style={{ transform: [{ scale: pressScale }] }}>
                  <View style={[s.btn, { backgroundColor: colors.primary }]}>
                    {submitting ? (
                      <>
                        <ActivityIndicator size="small" color="#fff" style={s.btnIcon} />
                        <Text style={s.btnLabel}>Signing in…</Text>
                      </>
                    ) : (
                      <>
                        <Text style={s.btnLabel}>Login Now</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" style={s.btnIconRight} />
                      </>
                    )}
                  </View>
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>

          </Animated.View>

        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  kav:          { flex: 1 },
  root:         { flex: 1, backgroundColor: C.card },
  centerScreen: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 10 },
  errorTitle:   { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text, textAlign: "center", marginTop: 4 },
  errorSub:     { fontSize: 12.5, color: C.muted, textAlign: "center" },

  // ── Hero ──────────────────────────────────────────────────────────────────────
  heroWrap: { flex: 1 },
  hero:     { flex: 1, overflow: "hidden", borderBottomLeftRadius: 45, borderBottomRightRadius: 45 },
  heroInner: { flex: 1, paddingHorizontal: 20, paddingBottom: 4 },

  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 6,
  },
  logoRing: {
    width: 58, height: 58, borderRadius: 29,
    borderWidth: 2.5, padding: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
    flexShrink: 0,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 10,
  },
  logoInner: { flex: 1, borderRadius: 24, overflow: "hidden", backgroundColor: C.card },
  logoImg:   { width: "100%", height: "100%", resizeMode: "cover" },

  heroTitleBlock: { flex: 1 },
  heroTitle: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  heroSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.78)",
    marginTop: 4,
    lineHeight: 17,
  },

  illustrationWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 20,
  },

  // ── Form section — flat white, flush below gradient ──────────────────────────
  card: {
    height: CARD_H,
    backgroundColor: C.card,
    flexDirection: "column",
  },
  cardScroll: { flex: 1 },
  cardContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  btnWrap: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 8,
  },

  // ── Field label + input ───────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: C.text,
    marginBottom: 7,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E0E0E0",
    // Light tinted fill, not white — root's background is white too, and a
    // hairline border alone was hard to spot against it.
    backgroundColor: "#F2F2F7",
    paddingLeft: 14,
    paddingRight: 12,
  },
  fieldFocused: { borderColor: colors.primary },
  fieldError:   { borderColor: C.red, backgroundColor: "#FFF8F8" },
  fieldDivider: { width: 1, height: 22, backgroundColor: "#E0E0E0", marginHorizontal: 10 },
  iconL: { marginRight: 10 },
  iconR: { padding: 4 },
  textInput: { flex: 1, height: "100%", fontSize: 14, color: C.text },

  fieldErrRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingLeft: 4, marginTop: 4,
  },
  fieldErrText: { fontSize: 11.5, color: C.red, flex: 1 },

  // ── Remember / forgot row ────────────────────────────────────────────────────
  row:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  rememberRow:   { flexDirection: "row", alignItems: "center" },
  checkbox:      { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: C.muted, alignItems: "center", justifyContent: "center" },
  rememberLabel: { fontSize: 12, color: C.muted, marginLeft: 7 },
  forgot:        { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },

  // ── Server error ──────────────────────────────────────────────────────────────
  serverErrBox: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "#FEF0F0",
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: "rgba(217,83,79,0.2)", marginTop: 12,
  },
  serverErrText: { fontSize: 12, color: C.red, flex: 1, lineHeight: 16 },

  // ── Button ───────────────────────────────────────────────────────────────────
  btn: {
    height: 52, borderRadius: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.20, shadowRadius: 12, elevation: 7,
  },
  btnIcon:      { marginRight: 8 },
  btnIconRight: { marginLeft: 8 },
  btnLabel:     { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },

});

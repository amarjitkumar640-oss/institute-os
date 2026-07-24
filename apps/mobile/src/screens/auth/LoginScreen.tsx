import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
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
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { C } from "../../theme";

// ── Hero illustration (unchanged) ────────────────────────────────────────────

function HeroIllustration() {
  return (
    <Svg width={248} height={174} viewBox="0 0 248 174">
      <Circle cx={124} cy={84} r={76} fill="rgba(255,255,255,0.04)" />
      <Circle cx={124} cy={84} r={56} fill="rgba(255,255,255,0.07)" />
      <Circle cx={124} cy={84} r={36} fill="rgba(255,255,255,0.10)" />
      <Line x1={124} y1={84} x2={28} y2={10} stroke="rgba(245,179,1,0.22)" strokeWidth={22} strokeLinecap="round" />
      <Line x1={124} y1={84} x2={220} y2={10} stroke="rgba(245,179,1,0.16)" strokeWidth={16} strokeLinecap="round" />
      <Line x1={124} y1={84} x2={22} y2={162} stroke="rgba(255,255,255,0.07)" strokeWidth={14} strokeLinecap="round" />
      <Line x1={124} y1={84} x2={226} y2={162} stroke="rgba(255,255,255,0.06)" strokeWidth={12} strokeLinecap="round" />
      <Ellipse cx={124} cy={158} rx={55} ry={5} fill="rgba(0,0,0,0.13)" />
      <Path d="M52 84 L124 56 L196 84 L124 112 Z" fill="rgba(255,255,255,0.95)" />
      <Rect x={100} y={56} width={48} height={34} rx={4} fill="rgba(255,255,255,0.88)" />
      <Rect x={100} y={53} width={48} height={8} rx={4} fill="#F5B301" />
      <Line x1={52} y1={84} x2={196} y2={84} stroke="rgba(139,30,63,0.10)" strokeWidth={1.2} />
      <Line x1={196} y1={84} x2={204} y2={112} stroke="#F5B301" strokeWidth={3} strokeLinecap="round" />
      <Circle cx={204} cy={116} r={6} fill="#F5B301" />
      <Line x1={200} y1={116} x2={194} y2={132} stroke="#F5B301" strokeWidth={2} strokeLinecap="round" opacity={0.80} />
      <Line x1={204} y1={116} x2={204} y2={134} stroke="#F5B301" strokeWidth={2} strokeLinecap="round" opacity={0.80} />
      <Line x1={208} y1={116} x2={214} y2={132} stroke="#F5B301" strokeWidth={2} strokeLinecap="round" opacity={0.80} />
      <G x={2} y={100}>
        <Rect x={0} y={0} width={34} height={26} rx={4} fill="rgba(255,255,255,0.78)" />
        <Rect x={0} y={0} width={6} height={26} rx={3} fill="rgba(245,179,1,0.88)" />
        <Line x1={10} y1={7} x2={30} y2={7} stroke="rgba(139,30,63,0.22)" strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={10} y1={13} x2={30} y2={13} stroke="rgba(139,30,63,0.22)" strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={10} y1={19} x2={22} y2={19} stroke="rgba(139,30,63,0.22)" strokeWidth={1.5} strokeLinecap="round" />
      </G>
      <G x={212} y={100}>
        <Rect x={0} y={0} width={34} height={26} rx={4} fill="rgba(255,255,255,0.65)" />
        <Rect x={0} y={0} width={6} height={26} rx={3} fill="rgba(232,117,44,0.85)" />
        <Line x1={10} y1={7} x2={30} y2={7} stroke="rgba(139,30,63,0.18)" strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={10} y1={13} x2={30} y2={13} stroke="rgba(139,30,63,0.18)" strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={10} y1={19} x2={22} y2={19} stroke="rgba(139,30,63,0.18)" strokeWidth={1.5} strokeLinecap="round" />
      </G>
      <G x={22} y={20}><Polygon points="0,-10 3.6,-3.6 10,0 3.6,3.6 0,10 -3.6,3.6 -10,0 -3.6,-3.6" fill="#F5B301" opacity={0.96} /></G>
      <G x={226} y={16}><Polygon points="0,-8 2.9,-2.9 8,0 2.9,2.9 0,8 -2.9,2.9 -8,0 -2.9,-2.9" fill="rgba(255,255,255,0.92)" /></G>
      <G x={10} y={62}><Polygon points="0,-6 2.1,-2.1 6,0 2.1,2.1 0,6 -2.1,2.1 -6,0 -2.1,-2.1" fill="rgba(255,255,255,0.74)" /></G>
      <G x={238} y={58}><Polygon points="0,-5.5 2,-2 5.5,0 2,2 0,5.5 -2,2 -5.5,0 -2,-2" fill="#F5B301" opacity={0.78} /></G>
      <Circle cx={52} cy={144} r={2.8} fill="#F5B301" opacity={0.65} />
      <Circle cx={196} cy={142} r={2.4} fill="rgba(255,255,255,0.58)" />
      <Circle cx={6} cy={142} r={1.8} fill="rgba(255,255,255,0.42)" />
      <Circle cx={242} cy={138} r={1.8} fill="#F5B301" opacity={0.44} />
      <Circle cx={110} cy={162} r={1.6} fill="rgba(255,255,255,0.36)" />
      <Circle cx={138} cy={164} r={1.4} fill="#F5B301" opacity={0.32} />
    </Svg>
  );
}

// ── Per-field inline error ────────────────────────────────────────────────────

function FieldError({ message }: { message: string }) {
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
    <Animated.View style={[styles.fieldErrRow, { opacity, transform: [{ translateY: slideY }] }]}>
      <Ionicons name="alert-circle-outline" size={13} color="#D9534F" />
      <Text style={styles.fieldErrText}>{message}</Text>
    </Animated.View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const [emailError,   setEmailError]   = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [serverError,  setServerError]  = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);

  // ── Animated values ─────────────────────────────────────────────────────────
  const floatY        = useRef(new Animated.Value(0)).current;
  const heroY         = useRef(new Animated.Value(-24)).current;
  const heroOpacity   = useRef(new Animated.Value(0)).current;
  const sheetY        = useRef(new Animated.Value(72)).current;
  const sheetOpacity  = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY       = useRef(new Animated.Value(14)).current;
  const fieldsOpacity = useRef(new Animated.Value(0)).current;
  const fieldsY       = useRef(new Animated.Value(16)).current;
  const btnScale      = useRef(new Animated.Value(0.88)).current;
  const btnOpacity    = useRef(new Animated.Value(0)).current;
  const pressScale    = useRef(new Animated.Value(1)).current;
  const emailShakeX   = useRef(new Animated.Value(0)).current;
  const passwordShakeX = useRef(new Animated.Value(0)).current;
  const keyboardLift  = useRef(new Animated.Value(0)).current;

  // ── Keyboard-aware sheet lift — slides the whole card upward over the hero,
  //    like a rising bottom sheet, instead of shrinking/scrolling its content.
  //    Native-driven so it's smooth and matches the entrance animation's driver. ──
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const animateTo = (toValue: number, duration?: number) => {
      Animated.timing(keyboardLift, {
        toValue,
        duration: duration && duration > 0 ? duration : 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, (e) => animateTo(-e.endCoordinates.height, e.duration));
    const hideSub = Keyboard.addListener(hideEvent, (e) => animateTo(0, e.duration));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Entrance sequence ────────────────────────────────────────────────────────
  useEffect(() => {
    // 1. Hero slides in
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(heroY,       { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    // 2. Sheet springs up (slight delay)
    Animated.parallel([
      Animated.spring(sheetY,      { toValue: 0, tension: 55, friction: 9, delay: 160, useNativeDriver: true }),
      Animated.timing(sheetOpacity,{ toValue: 1, duration: 280, delay: 160, useNativeDriver: true }),
    ]).start();

    // 3. Header text fades in
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 280, delay: 340, useNativeDriver: true }),
      Animated.timing(headerY,       { toValue: 0, duration: 300, delay: 340, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    // 4. Fields stagger in
    Animated.parallel([
      Animated.timing(fieldsOpacity, { toValue: 1, duration: 300, delay: 460, useNativeDriver: true }),
      Animated.timing(fieldsY,       { toValue: 0, duration: 320, delay: 460, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    // 5. Button pops in
    Animated.parallel([
      Animated.spring(btnScale,   { toValue: 1, tension: 70, friction: 7, delay: 560, useNativeDriver: true }),
      Animated.timing(btnOpacity, { toValue: 1, duration: 220, delay: 560, useNativeDriver: true }),
    ]).start();

    // 6. Logo float loop (starts after entrance)
    const floatLoop = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatY, { toValue: -8, duration: 2000, useNativeDriver: true }),
          Animated.timing(floatY, { toValue: 0,  duration: 2000, useNativeDriver: true }),
        ])
      ).start();
    }, 600);

    return () => clearTimeout(floatLoop);
  }, []);

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): boolean {
    let ok = true;

    if (!email.trim()) {
      setEmailError("Email address is required");
      doShake(emailShakeX);
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Enter a valid email address");
      doShake(emailShakeX);
      ok = false;
    } else {
      setEmailError("");
    }

    if (!password) {
      setPasswordError("Password is required");
      doShake(passwordShakeX);
      ok = false;
    } else {
      setPasswordError("");
    }

    return ok;
  }

  async function handleSubmit() {
    setServerError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setServerError("Invalid email or password.");
        doShake(emailShakeX);
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

  const topInset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) + 10 : 54;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Hero ── */}
      <Animated.View style={[styles.heroWrap, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}>
        <LinearGradient
          colors={["#5C0E23", "#8B1E3F", "#C0422E", "#E87830"]}
          start={{ x: 0.18, y: 0 }} end={{ x: 0.82, y: 1 }}
          style={styles.hero}
        >
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            {Array.from({ length: 30 }).flatMap((_, r) =>
              Array.from({ length: 22 }).map((_, c) => (
                <Circle
                  key={`${r}-${c}`}
                  cx={c * 20 + 10} cy={r * 20 + 10}
                  r={(r + c) % 3 === 0 ? 2.0 : (r + c) % 3 === 1 ? 1.2 : 0.7}
                  fill="rgba(255,255,255,0.08)"
                />
              ))
            )}
          </Svg>
          <View style={[styles.heroBody, { paddingTop: topInset }]}>
            <View style={styles.heroTop}>
              <Animated.View style={[styles.logoRing, { transform: [{ translateY: floatY }] }]}>
                <View style={styles.logoInner}>
                  <Image source={require("../../../assets/institute-logo.png")} style={styles.logoImg} />
                </View>
              </Animated.View>
              <Text style={styles.instName}>The Success Tutorial Classes</Text>
              <Text style={styles.instTag}>Quality Education Platform · Ghatsila</Text>
            </View>
            <View style={styles.heroMid}><HeroIllustration /></View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── Form sheet ── */}
      <Animated.View style={[styles.sheet, { opacity: sheetOpacity, transform: [{ translateY: sheetY }, { translateY: keyboardLift }] }]}>
       <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
       >
        <View style={styles.formTop}>
          {/* Header */}
          <Animated.View style={[styles.sheetHeader, { opacity: headerOpacity, transform: [{ translateY: headerY }] }]}>
            <Text style={styles.welcomeText}>Let's get you signed in</Text>
            <Text style={styles.welcomeSub}>Access classes, results &amp; schedules in one place.</Text>
          </Animated.View>

          {/* Fields */}
          <Animated.View style={[styles.fields, { opacity: fieldsOpacity, transform: [{ translateY: fieldsY }] }]}>

            {/* Email */}
            <View>
              <Animated.View style={[
                styles.field,
                focusedField === "email" && styles.fieldFocused,
                !!emailError && styles.fieldError,
                { transform: [{ translateX: emailShakeX }] },
              ]}>
                <Ionicons
                  name="mail-outline"
                  size={17}
                  color={emailError ? "#D9534F" : focusedField === "email" ? C.primary : C.placeholder}
                  style={styles.iconL}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Email address"
                  placeholderTextColor={C.placeholder}
                  value={email}
                  onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(""); setServerError(""); }}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </Animated.View>
              <FieldError message={emailError} />
            </View>

            {/* Password */}
            <View>
              <Animated.View style={[
                styles.field,
                focusedField === "password" && styles.fieldFocused,
                !!passwordError && styles.fieldError,
                { transform: [{ translateX: passwordShakeX }] },
              ]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={17}
                  color={passwordError ? "#D9534F" : focusedField === "password" ? C.primary : C.placeholder}
                  style={styles.iconL}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Password"
                  placeholderTextColor={C.placeholder}
                  value={password}
                  onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(""); setServerError(""); }}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
                <TouchableOpacity
                  style={styles.iconR}
                  onPress={() => setShowPassword(v => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={17} color={C.placeholder} />
                </TouchableOpacity>
              </Animated.View>
              <FieldError message={passwordError} />
            </View>

            {/* Remember me + forgot */}
            <View style={styles.row}>
              <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe(v => !v)} activeOpacity={0.7}>
                <View style={[styles.checkbox, rememberMe && styles.checkboxOn]}>
                  {rememberMe && <Ionicons name="checkmark" size={11} color="#fff" />}
                </View>
                <Text style={styles.rememberLabel}>Remember me</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.forgot}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* Server / network error */}
            {serverError ? (
              <View style={styles.serverErrBox}>
                <Ionicons name="information-circle-outline" size={15} color="#D9534F" />
                <Text style={styles.serverErrText}>{serverError}</Text>
              </View>
            ) : null}
          </Animated.View>
        </View>

        {/* Bottom: button + legal */}
        <Animated.View style={[styles.formBottom, { opacity: btnOpacity, transform: [{ scale: btnScale }] }]}>
          <TouchableOpacity
            onPress={handleSubmit}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={submitting}
            activeOpacity={1}
          >
            <Animated.View style={{ transform: [{ scale: pressScale }] }}>
              <LinearGradient
                colors={["#F5B301", "#E8752C"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                {submitting ? (
                  <>
                    <ActivityIndicator size="small" color={C.text} style={styles.btnIcon} />
                    <Text style={styles.btnLabel}>Signing in…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="arrow-forward" size={18} color={C.text} style={styles.btnIcon} />
                    <Text style={styles.btnLabel}>Continue</Text>
                  </>
                )}
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>

          <View style={styles.legal}>
            <Text style={styles.legalLink}>Privacy policy</Text>
            <Text style={styles.legalDot}> · </Text>
            <Text style={styles.legalLink}>Terms &amp; conditions</Text>
          </View>
        </Animated.View>
       </ScrollView>
      </Animated.View>
    </View>
    </TouchableWithoutFeedback>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#FFFFFF" },

  // Hero
  heroWrap: { flex: 1.15 },
  hero:     { flex: 1, overflow: "hidden" },
  heroBody: { flex: 1, paddingHorizontal: 24, paddingBottom: 18 },
  heroTop:  { alignItems: "center", paddingTop: 4 },
  heroMid:  { flex: 1, alignItems: "center", justifyContent: "center" },
  logoRing: {
    width: 74, height: 74, borderRadius: 37,
    borderWidth: 3, borderColor: "rgba(245,179,1,0.90)",
    padding: 4, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38, shadowRadius: 18, elevation: 14,
  },
  logoInner: { flex: 1, borderRadius: 31, overflow: "hidden", backgroundColor: "#fff" },
  logoImg:   { width: "100%", height: "100%", resizeMode: "cover" },
  instName:  { fontSize: 14.5, fontWeight: "700", color: "#fff", textAlign: "center", marginBottom: 3, letterSpacing: 0.2 },
  instTag:   { fontSize: 9, fontWeight: "600", letterSpacing: 1.1, textTransform: "uppercase", color: "rgba(255,255,255,0.68)" },

  // Sheet
  sheet: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    marginTop: -24,
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    shadowColor: "#3A1020", shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.10, shadowRadius: 14, elevation: 12,
  },
  sheetScroll: { flex: 1 },
  sheetScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22, paddingTop: 26, paddingBottom: 22,
    justifyContent: "space-between",
  },
  formTop:    { gap: 18 },
  sheetHeader: { gap: 4 },
  welcomeText: { fontSize: 20, fontWeight: "800", color: "#1E1014", letterSpacing: 0.1 },
  welcomeSub:  { fontSize: 12, color: "#7A6E70", lineHeight: 17 },
  fields:      { gap: 4 },
  formBottom:  { gap: 13 },

  // Input fields
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#EDE0DD",
    backgroundColor: "#FAF6F4",
    paddingHorizontal: 14,
    marginBottom: 2,
  },
  fieldFocused: {
    borderColor: "#8B1E3F",
    backgroundColor: "#FFF8FB",
  },
  fieldError: {
    borderColor: "#D9534F",
    backgroundColor: "#FFF8F8",
  },
  iconL: { marginRight: 10 },
  iconR: { padding: 4 },
  textInput: { flex: 1, height: "100%", fontSize: 14, color: "#1E1014" },

  // Per-field error
  fieldErrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 6,
    marginBottom: 8,
    marginTop: 2,
  },
  fieldErrText: { fontSize: 12, color: "#D9534F", flex: 1 },

  // Server error box
  serverErrBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FEF0F0",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(217,83,79,0.2)",
    marginTop: 4,
  },
  serverErrText: { fontSize: 12.5, color: "#D9534F", flex: 1, lineHeight: 17 },

  // Misc
  row:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 2 },
  rememberRow:  { flexDirection: "row", alignItems: "center" },
  checkbox:     { width: 17, height: 17, borderRadius: 4, borderWidth: 1.5, borderColor: "#7A6E70", alignItems: "center", justifyContent: "center" },
  checkboxOn:   { backgroundColor: "#8B1E3F", borderColor: "#8B1E3F" },
  rememberLabel: { fontSize: 12.5, color: "#7A6E70", marginLeft: 8 },
  forgot:       { fontSize: 12.5, fontWeight: "600", color: "#2CA6A4" },

  // Button
  btn: {
    height: 52, borderRadius: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    shadowColor: "#C05010", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 9,
  },
  btnIcon:  { marginRight: 8 },
  btnLabel: { fontSize: 15, fontWeight: "700", color: "#1E1014" },

  // Legal
  legal:     { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  legalLink: { fontSize: 10.5, color: "#C7BAB4", textDecorationLine: "underline" },
  legalDot:  { fontSize: 10.5, color: "#C7BAB4", marginHorizontal: 3 },
});

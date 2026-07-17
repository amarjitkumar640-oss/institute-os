import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";

const C = {
  primary: "#8B1E3F",
  secondary: "#F5B301",
  accent: "#2CA6A4",
  orange: "#E8752C",
  bg: "#FFFBF0",
  card: "#FFFFFF",
  textPrimary: "#1E1014",
  textMuted: "#7A6E70",
  placeholder: "#B8ACAF",
  border: "#EDE0DD",
  inputBg: "#FAF6F4",
};

/* ────────────────────────────────────────────────────────
   Graduation-cap illustration with rays, stars & books
──────────────────────────────────────────────────────── */
function HeroIllustration() {
  return (
    <Svg width={248} height={174} viewBox="0 0 248 174">
      {/* ── Soft glow rings ── */}
      <Circle cx={124} cy={84} r={76} fill="rgba(255,255,255,0.04)" />
      <Circle cx={124} cy={84} r={56} fill="rgba(255,255,255,0.07)" />
      <Circle cx={124} cy={84} r={36} fill="rgba(255,255,255,0.10)" />

      {/* ── Light rays emanating from cap centre ── */}
      {/* Upper-left ray */}
      <Line x1={124} y1={84} x2={28} y2={10}
        stroke="rgba(245,179,1,0.22)" strokeWidth={22} strokeLinecap="round" />
      {/* Upper-right ray */}
      <Line x1={124} y1={84} x2={220} y2={10}
        stroke="rgba(245,179,1,0.16)" strokeWidth={16} strokeLinecap="round" />
      {/* Lower-left ray */}
      <Line x1={124} y1={84} x2={22} y2={162}
        stroke="rgba(255,255,255,0.07)" strokeWidth={14} strokeLinecap="round" />
      {/* Lower-right ray */}
      <Line x1={124} y1={84} x2={226} y2={162}
        stroke="rgba(255,255,255,0.06)" strokeWidth={12} strokeLinecap="round" />

      {/* ── Ground shadow ── */}
      <Ellipse cx={124} cy={158} rx={55} ry={5} fill="rgba(0,0,0,0.13)" />

      {/* ── Graduation cap (flat, bold) ── */}
      {/* Diamond board */}
      <Path d="M52 84 L124 56 L196 84 L124 112 Z"
        fill="rgba(255,255,255,0.95)" />
      {/* Top cylinder */}
      <Rect x={100} y={56} width={48} height={34} rx={4}
        fill="rgba(255,255,255,0.88)" />
      {/* Gold crown band */}
      <Rect x={100} y={53} width={48} height={8} rx={4} fill="#F5B301" />
      {/* Diamond centre line (subtle) */}
      <Line x1={52} y1={84} x2={196} y2={84}
        stroke="rgba(139,30,63,0.10)" strokeWidth={1.2} />

      {/* Tassel cord */}
      <Line x1={196} y1={84} x2={204} y2={112}
        stroke="#F5B301" strokeWidth={3} strokeLinecap="round" />
      {/* Tassel ball */}
      <Circle cx={204} cy={116} r={6} fill="#F5B301" />
      {/* Tassel threads */}
      <Line x1={200} y1={116} x2={194} y2={132}
        stroke="#F5B301" strokeWidth={2} strokeLinecap="round" opacity={0.80} />
      <Line x1={204} y1={116} x2={204} y2={134}
        stroke="#F5B301" strokeWidth={2} strokeLinecap="round" opacity={0.80} />
      <Line x1={208} y1={116} x2={214} y2={132}
        stroke="#F5B301" strokeWidth={2} strokeLinecap="round" opacity={0.80} />

      {/* ── Floating book – left ── */}
      <G x={2} y={100}>
        <Rect x={0} y={0} width={34} height={26} rx={4}
          fill="rgba(255,255,255,0.78)" />
        <Rect x={0} y={0} width={6} height={26} rx={3}
          fill="rgba(245,179,1,0.88)" />
        <Line x1={10} y1={7}  x2={30} y2={7}
          stroke="rgba(139,30,63,0.22)" strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={10} y1={13} x2={30} y2={13}
          stroke="rgba(139,30,63,0.22)" strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={10} y1={19} x2={22} y2={19}
          stroke="rgba(139,30,63,0.22)" strokeWidth={1.5} strokeLinecap="round" />
      </G>

      {/* ── Floating book – right ── */}
      <G x={212} y={100}>
        <Rect x={0} y={0} width={34} height={26} rx={4}
          fill="rgba(255,255,255,0.65)" />
        <Rect x={0} y={0} width={6} height={26} rx={3}
          fill="rgba(232,117,44,0.85)" />
        <Line x1={10} y1={7}  x2={30} y2={7}
          stroke="rgba(139,30,63,0.18)" strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={10} y1={13} x2={30} y2={13}
          stroke="rgba(139,30,63,0.18)" strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={10} y1={19} x2={22} y2={19}
          stroke="rgba(139,30,63,0.18)" strokeWidth={1.5} strokeLinecap="round" />
      </G>

      {/* ── Stars / sparkles ── */}
      {/* Large gold star – top-left */}
      <G x={22} y={20}>
        <Polygon
          points="0,-10 3.6,-3.6 10,0 3.6,3.6 0,10 -3.6,3.6 -10,0 -3.6,-3.6"
          fill="#F5B301" opacity={0.96} />
      </G>
      {/* Large white star – top-right */}
      <G x={226} y={16}>
        <Polygon
          points="0,-8 2.9,-2.9 8,0 2.9,2.9 0,8 -2.9,2.9 -8,0 -2.9,-2.9"
          fill="rgba(255,255,255,0.92)" />
      </G>
      {/* Medium – left */}
      <G x={10} y={62}>
        <Polygon
          points="0,-6 2.1,-2.1 6,0 2.1,2.1 0,6 -2.1,2.1 -6,0 -2.1,-2.1"
          fill="rgba(255,255,255,0.74)" />
      </G>
      {/* Medium – right */}
      <G x={238} y={58}>
        <Polygon
          points="0,-5.5 2,-2 5.5,0 2,2 0,5.5 -2,2 -5.5,0 -2,-2"
          fill="#F5B301" opacity={0.78} />
      </G>
      {/* Small sparkle dots */}
      <Circle cx={52}  cy={144} r={2.8} fill="#F5B301"               opacity={0.65} />
      <Circle cx={196} cy={142} r={2.4} fill="rgba(255,255,255,0.58)" />
      <Circle cx={6}   cy={142} r={1.8} fill="rgba(255,255,255,0.42)" />
      <Circle cx={242} cy={138} r={1.8} fill="#F5B301"               opacity={0.44} />
      <Circle cx={110} cy={162} r={1.6} fill="rgba(255,255,255,0.36)" />
      <Circle cx={138} cy={164} r={1.4} fill="#F5B301"               opacity={0.32} />
    </Svg>
  );
}

/* ────────────────────────────────────────────────────────
   Login screen
──────────────────────────────────────────────────────── */
export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [submitting, setSubmitting]     = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);

  const floatY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -8, duration: 2000, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0,  duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [floatY]);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setError("Invalid email or password.");
      } else if (err?.code === "ERR_NETWORK" || err?.code === "ECONNREFUSED") {
        setError("Cannot reach server. Check your network or API URL.");
      } else {
        setError(err?.response?.data?.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const topInset =
    Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) + 10 : 54;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ═══════════ HERO ═══════════ */}
      <LinearGradient
        colors={["#5C0E23", "#8B1E3F", "#C0422E", "#E87830"]}
        start={{ x: 0.18, y: 0 }}
        end={{ x: 0.82, y: 1 }}
        style={styles.hero}
      >
        {/* Varying-size dot texture */}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          {Array.from({ length: 30 }).flatMap((_, r) =>
            Array.from({ length: 22 }).map((_, c) => (
              <Circle
                key={`${r}-${c}`}
                cx={c * 20 + 10}
                cy={r * 20 + 10}
                r={(r + c) % 3 === 0 ? 2.0 : (r + c) % 3 === 1 ? 1.2 : 0.7}
                fill="rgba(255,255,255,0.08)"
              />
            ))
          )}
        </Svg>

        <View style={[styles.heroBody, { paddingTop: topInset }]}>
          {/* ── Branding: logo + name + tagline ── */}
          <View style={styles.heroTop}>
            <Animated.View style={[styles.logoRing, { transform: [{ translateY: floatY }] }]}>
              <View style={styles.logoInner}>
                <Image
                  source={require("../../assets/institute-logo.png")}
                  style={styles.logoImg}
                />
              </View>
            </Animated.View>
            <Text style={styles.instName}>The Success Tutorial Classes</Text>
            <Text style={styles.instTag}>Quality Education Platform · Ghatsila</Text>
          </View>

          {/* ── Illustration ── */}
          <View style={styles.heroMid}>
            <HeroIllustration />
          </View>
        </View>
      </LinearGradient>

      {/* ═══════════ FORM SHEET ═══════════ */}
      <View style={styles.sheet}>
        {/* ── Welcome heading (now lives in sheet, not hero) ── */}
        <View style={styles.formTop}>
          <View style={styles.sheetHeader}>
            <Text style={styles.welcomeText}>Let's get you signed in</Text>
            <Text style={styles.welcomeSub}>
              Access classes, results &amp; schedules in one place.
            </Text>
          </View>

          <View style={styles.fields}>
            {/* Email */}
            <View style={styles.field}>
              <Ionicons name="mail-outline" size={17} color={C.placeholder} style={styles.iconL} />
              <TextInput
                style={styles.textInput}
                placeholder="Email address"
                placeholderTextColor={C.placeholder}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Ionicons name="lock-closed-outline" size={17} color={C.placeholder} style={styles.iconL} />
              <TextInput
                style={styles.textInput}
                placeholder="Password"
                placeholderTextColor={C.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                style={styles.iconR}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={17}
                  color={C.placeholder}
                />
              </TouchableOpacity>
            </View>

            {/* Remember me + Forgot */}
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.rememberRow}
                onPress={() => setRememberMe(v => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxOn]}>
                  {rememberMe && <Ionicons name="checkmark" size={11} color="#fff" />}
                </View>
                <Text style={styles.rememberLabel}>Remember me</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.forgot}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        </View>

        {/* ── Bottom: button + legal ── */}
        <View style={styles.formBottom}>
          <TouchableOpacity onPress={handleSubmit} disabled={submitting} activeOpacity={0.86}>
            <LinearGradient
              colors={["#F5B301", "#E8752C"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btn}
            >
              {!submitting && (
                <Ionicons name="arrow-forward" size={18} color={C.textPrimary} style={styles.btnIcon} />
              )}
              <Text style={styles.btnLabel}>{submitting ? "Signing in…" : "Continue"}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.legal}>
            <Text style={styles.legalLink}>Privacy policy</Text>
            <Text style={styles.legalDot}> · </Text>
            <Text style={styles.legalLink}>Terms &amp; conditions</Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ── */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.card,
  },

  /* hero */
  hero: {
    flex: 1.15,
    overflow: "hidden",
  },
  heroBody: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  heroTop: {
    alignItems: "center",
    paddingTop: 4,
  },
  heroMid: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  logoRing: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3,
    borderColor: "rgba(245,179,1,0.90)",
    padding: 4,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 14,
  },
  logoInner: {
    flex: 1,
    borderRadius: 31,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  logoImg: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  instName: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  instTag: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.68)",
  },

  /* sheet */
  sheet: {
    flex: 1,
    backgroundColor: C.card,
    marginTop: -24,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    justifyContent: "space-between",
    shadowColor: "#3A1020",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 12,
  },

  formTop: {
    gap: 18,
  },
  sheetHeader: {
    gap: 4,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: "800",
    color: C.textPrimary,
    letterSpacing: 0.1,
  },
  welcomeSub: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 17,
  },
  fields: {
    gap: 14,
  },
  formBottom: {
    gap: 13,
  },

  /* inputs */
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.inputBg,
    paddingHorizontal: 14,
  },
  iconL: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: C.textPrimary,
  },
  iconR: {
    padding: 4,
  },

  /* remember / forgot */
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  rememberLabel: {
    fontSize: 12.5,
    color: C.textMuted,
    marginLeft: 8,
  },
  forgot: {
    fontSize: 12.5,
    fontWeight: "600",
    color: C.accent,
  },

  /* error */
  errorText: {
    fontSize: 13,
    color: "#D9534F",
    textAlign: "center",
  },

  /* button */
  btn: {
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#C05010",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 9,
  },
  btnIcon: {
    marginRight: 8,
  },
  btnLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: C.textPrimary,
  },

  /* legal */
  legal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  legalLink: {
    fontSize: 10.5,
    color: "#C7BAB4",
    textDecorationLine: "underline",
  },
  legalDot: {
    fontSize: 10.5,
    color: "#C7BAB4",
    marginHorizontal: 3,
  },
});

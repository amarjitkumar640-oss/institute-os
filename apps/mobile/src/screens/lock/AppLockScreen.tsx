import React, { useEffect, useRef, useState } from "react";
import {
  Animated, StyleSheet, Text, TouchableOpacity, Vibration, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ms, fs } from "../../utils/responsive";
import { useThemeColors, useThemedStyles, darken, lighten, type ThemeColors } from "../../context/ThemeContext";
import { useAppLock } from "../../context/AppLockContext";
import { useAuth } from "../../context/AuthContext";
import { C } from "../../theme"

const PIN_LENGTH = 4;

// ── Shared sub-components ─────────────────────────────────────────────────────

function PinDots({ filled, shake }: { filled: number; shake: Animated.Value }) {
  const s = useThemedStyles(makeSStyles);
  return (
    <Animated.View style={[s.dots, { transform: [{ translateX: shake }] }]}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View key={i} style={[s.dot, i < filled && s.dotFilled]} />
      ))}
    </Animated.View>
  );
}

function Key({
  label, sub, onPress, variant = "digit",
}: {
  label: string | React.ReactNode;
  sub?: string;
  onPress: () => void;
  variant?: "digit" | "action" | "ghost";
}) {
  const s = useThemedStyles(makeSStyles);
  if (variant === "ghost") return <View style={s.keyGhost} />;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[s.key, variant === "action" && s.keyAction]}
    >
      {typeof label === "string" ? (
        <>
          <Text style={s.keyNum}>{label}</Text>
          {sub ? <Text style={s.keySub}>{sub}</Text> : null}
        </>
      ) : label}
    </TouchableOpacity>
  );
}

const DIGIT_SUB: Record<string, string> = {
  "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO",
  "7": "PQRS", "8": "TUV", "9": "WXYZ", "0": "+",
};

function Keypad({ onDigit, onDelete }: { onDigit: (d: string) => void; onDelete: () => void }) {
  const s = useThemedStyles(makeSStyles);
  const rows = [["1","2","3"],["4","5","6"],["7","8","9"]];
  return (
    <View style={s.keypad}>
      {rows.map((row) => (
        <View key={row[0]} style={s.keyRow}>
          {row.map((d) => <Key key={d} label={d} sub={DIGIT_SUB[d]} onPress={() => onDigit(d)} />)}
        </View>
      ))}
      <View style={s.keyRow}>
        <Key variant="ghost" label="" onPress={() => {}} />
        <Key label="0" onPress={() => onDigit("0")} />
        <Key
          variant="action"
          label={<Ionicons name="backspace-outline" size={ms(22)} color="rgba(255,255,255,0.85)" />}
          onPress={onDelete}
        />
      </View>
    </View>
  );
}

// ── STEP: Enter / Confirm PIN ──────────────────────────────────────────────────

function PinEntryStep({
  title, subtitle, onComplete, error, clearError,
}: {
  title:    string;
  subtitle?: string;
  onComplete: (pin: string) => void;
  error:    string;
  clearError: () => void;
}) {
  const s = useThemedStyles(makeSStyles);
  const [pin, setPin] = useState("");
  const shake = useRef(new Animated.Value(0)).current;

  // Expose shake so parent can trigger it
  useEffect(() => {
    if (error) {
      Vibration.vibrate(400);
      Animated.sequence([
        Animated.timing(shake, { toValue: 12,  duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -12, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 8,   duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -8,  duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0,   duration: 55, useNativeDriver: true }),
      ]).start(() => setPin(""));
    }
  }, [error]);

  function pressDigit(d: string) {
    if (pin.length >= PIN_LENGTH) return;
    clearError();
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) setTimeout(() => onComplete(next), 80);
  }

  function pressDelete() {
    clearError();
    setPin((p) => p.slice(0, -1));
  }

  return (
    <View style={s.stepWrap}>
      <View style={s.stepHeader}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        <PinDots filled={pin.length} shake={shake} />
        {error ? <Text style={s.error}>{error}</Text> : <View style={s.errorSpacer} />}
      </View>
      <Keypad onDigit={pressDigit} onDelete={pressDelete} />
    </View>
  );
}

// ── STEP: Biometric choice (after PIN setup) ───────────────────────────────────

function BiometricChoiceStep({
  biometricType, onEnable, onSkip,
}: {
  biometricType: "face" | "fingerprint";
  onEnable: () => void;
  onSkip:   () => void;
}) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const icon  = biometricType === "face" ? "scan-outline"       : "finger-print-outline";
  const label = biometricType === "face" ? "Face ID"            : "Fingerprint";
  const desc  = biometricType === "face"
    ? "Unlock the app instantly by looking at your phone"
    : "Unlock the app instantly with your fingerprint";

  return (
    <View style={s.bioStepWrap}>
      <View style={[s.bioIconCircle]}>
        <Ionicons name={icon} size={ms(48)} color="#fff" />
      </View>
      <Text style={s.title}>Enable {label}?</Text>
      <Text style={s.subtitle}>{desc}</Text>

      <TouchableOpacity style={s.bioEnableBtn} onPress={onEnable} activeOpacity={0.8}>
        <Ionicons name={icon} size={ms(18)} color={colors.primary} />
        <Text style={s.bioEnableText}>Enable {label}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.bioSkipBtn} onPress={onSkip} activeOpacity={0.7}>
        <Text style={s.bioSkipText}>Skip — use PIN only</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── STEP: Biometric unlock prompt ──────────────────────────────────────────────

function BiometricUnlockStep({
  biometricType, onFallback,
}: {
  biometricType: "face" | "fingerprint";
  onFallback: () => void;
}) {
  const s = useThemedStyles(makeSStyles);
  const icon  = biometricType === "face" ? "scan-outline"       : "finger-print-outline";
  const label = biometricType === "face" ? "Face ID"            : "Fingerprint";

  return (
    <View style={s.bioStepWrap}>
      <View style={s.bioIconCircle}>
        <Ionicons name={icon} size={ms(48)} color="#fff" />
      </View>
      <Text style={s.title}>Unlock with {label}</Text>
      <Text style={s.subtitle}>Look at your phone to unlock</Text>

      <TouchableOpacity style={s.bioSkipBtn} onPress={onFallback} activeOpacity={0.7}>
        <Text style={s.bioSkipText}>Enter PIN instead</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

type Screen =
  | "setup-enter"       // create new PIN
  | "setup-confirm"     // re-enter to confirm
  | "setup-biometric"   // offer biometric after PIN set
  | "unlock-biometric"  // show biometric prompt (auto-triggered)
  | "unlock-pin";       // PIN keypad fallback

export function AppLockScreen() {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { hasPin, isLocked, biometricType, setupPin, verifyPin, biometricUnlock, removePin } =
    useAppLock();
  const { logout } = useAuth();

  // By the time AppLockGate renders this screen, pinLoaded=true so hasPin is correct
  // AppLockScreen only renders when hasPin=true and isLocked=true
  const initialScreen: Screen = biometricType ? "unlock-biometric" : "unlock-pin";
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [firstPin,    setFirstPin]   = useState("");
  const [pinError,    setPinError]   = useState("");
  const [unlockAttempts, setUnlockAttempts] = useState(0);

  // Auto-trigger biometric on the biometric unlock screen
  useEffect(() => {
    if (screen === "unlock-biometric") {
      triggerBiometric();
    }
  }, [screen]);

  async function triggerBiometric() {
    const ok = await biometricUnlock();
    if (!ok) {
      // Failed → fall back to PIN so user can still unlock
      setScreen("unlock-pin");
    }
  }

  // ── Setup flow ──

  async function handleSetupEnter(pin: string) {
    setFirstPin(pin);
    setScreen("setup-confirm");
  }

  async function handleSetupConfirm(pin: string) {
    if (pin !== firstPin) {
      setPinError("PINs don't match. Try again.");
      return;
    }
    // Save with biometric disabled for now; biometric step follows
    await setupPin(pin, false);
    if (biometricType) {
      setScreen("setup-biometric");
    }
    // If no biometric, setupPin already sets isLocked=false → AppLockGate unmounts this screen
  }

  async function handleEnableBiometric() {
    await setupPin(firstPin, true);
    // isLocked = false → gate unmounts
  }

  async function handleSkipBiometric() {
    // PIN already saved without biometric (from handleSetupConfirm)
    // isLocked = false → gate unmounts
  }

  // ── Unlock flow ──

  async function handleUnlockPin(pin: string) {
    const ok = await verifyPin(pin);
    if (!ok) {
      const next = unlockAttempts + 1;
      setUnlockAttempts(next);
      setPinError(
        next >= 5 ? "Too many attempts. Log out to reset." : "Incorrect PIN",
      );
    }
  }

  // ── Render ──

  return (
    <LinearGradient colors={[colors.safeArea, colors.primary, darken(colors.primary, 0.05)]} style={s.fill}>
      <SafeAreaView style={s.fill} edges={["top", "bottom"]}>

        {/* Branding */}
        <View style={s.brand}>
          <View style={s.logoWrap}>
            <Ionicons name="school" size={ms(28)} color="#fff" />
          </View>
          <Text style={s.appName}>Institute OS</Text>
        </View>

        {/* Screen content */}
        <View style={s.content}>
          {screen === "setup-enter" && (
            <PinEntryStep
              title="Create a PIN"
              subtitle="Set a 4-digit PIN to protect the app"
              onComplete={handleSetupEnter}
              error={pinError}
              clearError={() => setPinError("")}
            />
          )}

          {screen === "setup-confirm" && (
            <PinEntryStep
              title="Confirm your PIN"
              subtitle="Enter the same PIN again"
              onComplete={handleSetupConfirm}
              error={pinError}
              clearError={() => setPinError("")}
            />
          )}

          {screen === "setup-biometric" && biometricType && (
            <BiometricChoiceStep
              biometricType={biometricType}
              onEnable={handleEnableBiometric}
              onSkip={handleSkipBiometric}
            />
          )}

          {screen === "unlock-biometric" && biometricType && (
            <BiometricUnlockStep
              biometricType={biometricType}
              onFallback={() => setScreen("unlock-pin")}
            />
          )}

          {screen === "unlock-pin" && (
            <PinEntryStep
              title="Enter PIN"
              onComplete={handleUnlockPin}
              error={pinError}
              clearError={() => setPinError("")}
            />
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          {(screen === "unlock-pin" || screen === "unlock-biometric") && (
            <TouchableOpacity onPress={() => { removePin(); logout(); }}>
              <Text style={s.footerLink}>Forgot PIN? Log out</Text>
            </TouchableOpacity>
          )}
          {screen === "unlock-pin" && biometricType && (
            <TouchableOpacity
              style={s.footerBio}
              onPress={() => setScreen("unlock-biometric")}
            >
              <Ionicons
                name={biometricType === "face" ? "scan-outline" : "finger-print-outline"}
                size={ms(16)}
                color="rgba(255,255,255,0.5)"
              />
              <Text style={s.footerBioText}>
                Use {biometricType === "face" ? "Face ID" : "Fingerprint"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const KEY_SIZE = ms(72);

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  fill: { flex: 1 },

  brand: {
    alignItems:  "center",
    paddingTop:  ms(28),
    gap:         ms(8),
  },
  logoWrap: {
    width:           ms(56),
    height:          ms(56),
    borderRadius:    ms(16),
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems:      "center",
    justifyContent:  "center",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.18)",
  },
  appName: {
    fontSize:   fs(16),
    fontFamily: "Inter_700Bold", fontWeight: "700",
    color:      "#fff",
    letterSpacing: 0.4,
  },

  content: {
    flex:           1,
    justifyContent: "center",
  },

  // ── PIN entry step ──
  stepWrap: {
    alignItems: "center",
    gap:        ms(0),
  },
  stepHeader: {
    alignItems:    "center",
    paddingBottom: ms(20),
    gap:           ms(6),
  },
  title: {
    fontSize:   fs(20),
    fontFamily: "Inter_700Bold", fontWeight: "700",
    color:      "#fff",
  },
  subtitle: {
    fontSize:   fs(13),
    color:      "rgba(255,255,255,0.5)",
    textAlign:  "center",
    paddingHorizontal: ms(32),
  },
  dots: {
    flexDirection: "row",
    gap:           ms(18),
    marginTop:     ms(14),
  },
  dot: {
    width:           ms(14),
    height:          ms(14),
    borderRadius:    ms(7),
    borderWidth:     2,
    borderColor:     "rgba(255,255,255,0.35)",
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: C.card,
    borderColor:     "#fff",
  },
  error: {
    fontSize:  fs(12.5),
    color:     "#FFB3B3",
    textAlign: "center",
    minHeight: ms(18),
  },
  errorSpacer: { height: ms(18) },

  // ── Keypad ──
  keypad: {
    paddingHorizontal: ms(28),
    gap:               ms(10),
    width:             "100%",
  },
  keyRow: {
    flexDirection:  "row",
    justifyContent: "space-between",
    gap:            ms(10),
  },
  key: {
    flex:            1,
    height:          KEY_SIZE,
    borderRadius:    KEY_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems:      "center",
    justifyContent:  "center",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.07)",
  },
  keyAction: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor:     "transparent",
  },
  keyGhost: {
    flex:   1,
    height: KEY_SIZE,
  },
  keyNum: {
    fontSize:   fs(22),
    fontWeight: "300",
    color:      "#fff",
  },
  keySub: {
    fontSize:    fs(8.5),
    color:       "rgba(255,255,255,0.4)",
    letterSpacing: 1.2,
    marginTop:   ms(-3),
  },

  // ── Biometric steps ──
  bioStepWrap: {
    alignItems:        "center",
    paddingHorizontal: ms(32),
    gap:               ms(14),
  },
  bioIconCircle: {
    width:           ms(96),
    height:          ms(96),
    borderRadius:    ms(48),
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems:      "center",
    justifyContent:  "center",
    borderWidth:     1.5,
    borderColor:     "rgba(255,255,255,0.2)",
    marginBottom:    ms(8),
  },
  bioEnableBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(8),
    backgroundColor: C.card,
    borderRadius:      ms(14),
    paddingVertical:   ms(14),
    paddingHorizontal: ms(32),
    marginTop:         ms(12),
  },
  bioEnableText: {
    fontSize:   fs(15),
    fontFamily: "Inter_700Bold", fontWeight: "700",
    color:      colors.primary,
  },
  bioSkipBtn: {
    paddingVertical: ms(10),
  },
  bioSkipText: {
    fontSize: fs(13),
    color:    "rgba(255,255,255,0.4)",
  },

  // ── Footer ──
  footer: {
    alignItems:    "center",
    paddingBottom: ms(8),
    gap:           ms(4),
  },
  footerLink: {
    fontSize: fs(13),
    color:    "rgba(255,255,255,0.4)",
    padding:  ms(8),
  },
  footerBio: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           ms(5),
    padding:       ms(8),
  },
  footerBioText: {
    fontSize: fs(13),
    color:    "rgba(255,255,255,0.4)",
  },
});

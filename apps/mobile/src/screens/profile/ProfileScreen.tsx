import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Modal, StatusBar, ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ms, fs, sw } from "../../utils/responsive";
import { C } from "../../theme";
import { ROLE_META } from "../../constants/roleMeta";
import { useAuth } from "../../context/AuthContext";
import { useAppLock } from "../../context/AppLockContext";
import { useAlert } from "../../context/AlertContext";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WAVE_H   = Math.round(ms(40));
const GRAD     = ["#8B1E3F", "#A8264A", "#C64A3E", "#E8752C"] as const;
const BG       = "#FFFBF0";

// ── Shared SVG decorations (same as ScreenHeader) ────────────────────────────

function PolkaDots({ height }: { height: number }) {
  const sp = ms(22);
  const cols = Math.ceil(sw / sp) + 2;
  const rows = Math.ceil(height / sp) + 1;
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dots.push(
        <Circle
          key={`${r}-${c}`}
          cx={c * sp + (r % 2 ? sp / 2 : 0)}
          cy={r * sp}
          r={ms(1.5)}
          fill="rgba(255,255,255,0.12)"
        />
      );
  return <Svg width={sw} height={height} style={StyleSheet.absoluteFill}>{dots}</Svg>;
}

function Wave() {
  return (
    <Svg width={sw} height={WAVE_H} viewBox={`0 0 ${sw} 34`} preserveAspectRatio="none">
      <Path d={`M0 18 C${sw * 0.25} 36,${sw * 0.75} 2,${sw} 18 L${sw} 34 L0 34 Z`} fill={BG} />
    </Svg>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={s.sectionLabel}>{label}</Text>;
}

// ── Settings row ──────────────────────────────────────────────────────────────

interface RowProps {
  icon:      string;
  iconColor: string;
  label:     string;
  sub?:      string;
  right?:    React.ReactNode;
  onPress?:  () => void;
  danger?:   boolean;
  last?:     boolean;
}

function Row({ icon, iconColor, label, sub, right, onPress, danger, last }: RowProps) {
  const Wrap: React.ElementType = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      style={[s.row, last && s.rowLast]}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <View style={[s.rowIcon, { backgroundColor: iconColor + "18" }]}>
        <Ionicons name={icon as any} size={ms(18)} color={iconColor} />
      </View>
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, danger && { color: C.red }]}>{label}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      {right !== undefined
        ? right
        : onPress
          ? <Ionicons name="chevron-forward" size={ms(15)} color={C.muted} />
          : null}
    </Wrap>
  );
}

// ── PIN setup modal ───────────────────────────────────────────────────────────

const PIN_LENGTH = 4;

function PinPad({ onDigit, onDelete }: { onDigit: (d: string) => void; onDelete: () => void }) {
  const rows = [["1","2","3"],["4","5","6"],["7","8","9"]];
  return (
    <View style={pm.pad}>
      {rows.map((row) => (
        <View key={row[0]} style={pm.row}>
          {row.map((d) => (
            <TouchableOpacity key={d} style={pm.key} activeOpacity={0.6} onPress={() => onDigit(d)}>
              <Text style={pm.keyN}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={pm.row}>
        <View style={pm.keyGhost} />
        <TouchableOpacity style={pm.key} activeOpacity={0.6} onPress={() => onDigit("0")}>
          <Text style={pm.keyN}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity style={pm.key} activeOpacity={0.6} onPress={onDelete}>
          <Ionicons name="backspace-outline" size={ms(22)} color={C.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PinDots({ filled, error }: { filled: number; error: boolean }) {
  return (
    <View style={pm.dots}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[pm.dot, i < filled && pm.dotFilled, error && pm.dotError]}
        />
      ))}
    </View>
  );
}

type PinStep = "enter" | "confirm";

interface PinSetupModalProps {
  visible:    boolean;
  mode:       "setup" | "change";   // "change" = already has PIN, just overwrite
  onDone:     (pin: string) => void;
  onCancel:   () => void;
}

function PinSetupModal({ visible, mode, onDone, onCancel }: PinSetupModalProps) {
  const [step,      setStep]    = useState<PinStep>("enter");
  const [first,     setFirst]   = useState("");
  const [pin,       setPin]     = useState("");
  const [error,     setError]   = useState(false);

  function reset() { setStep("enter"); setFirst(""); setPin(""); setError(false); }

  function handleDigit(d: string) {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === PIN_LENGTH) {
      setTimeout(() => advance(next), 80);
    }
  }

  function advance(entered: string) {
    if (step === "enter") {
      setFirst(entered);
      setStep("confirm");
      setPin("");
    } else {
      if (entered === first) {
        onDone(entered);
        reset();
      } else {
        setError(true);
        setPin("");
        setTimeout(() => { setStep("enter"); setFirst(""); setError(false); }, 700);
      }
    }
  }

  function handleDelete() { setPin((p) => p.slice(0, -1)); setError(false); }

  function handleCancel() { reset(); onCancel(); }

  const title = step === "enter"
    ? (mode === "setup" ? "Create PIN" : "New PIN")
    : "Confirm PIN";
  const sub   = step === "enter"
    ? "Enter a 4-digit PIN"
    : "Re-enter the same PIN";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleCancel}>
      <SafeAreaView style={pm.sheet} edges={["top", "bottom"]}>
        <View style={pm.sheetHeader}>
          <TouchableOpacity onPress={handleCancel} style={pm.cancelBtn}>
            <Text style={pm.cancelT}>Cancel</Text>
          </TouchableOpacity>
          <Text style={pm.sheetTitle}>{mode === "setup" ? "Set Up PIN" : "Change PIN"}</Text>
          <View style={{ width: ms(60) }} />
        </View>

        <View style={pm.sheetBody}>
          <View style={[pm.stepIcon, { backgroundColor: C.primary + "15" }]}>
            <Ionicons name="lock-closed-outline" size={ms(28)} color={C.primary} />
          </View>
          <Text style={pm.stepTitle}>{title}</Text>
          <Text style={pm.stepSub}>{sub}</Text>
          <PinDots filled={pin.length} error={error} />
          {error && <Text style={pm.errMsg}>PINs don't match — try again</Text>}
        </View>

        <PinPad onDigit={handleDigit} onDelete={handleDelete} />
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const { staff, currentCenter, isAllCenters, logout, switchCenter } = useAuth();
  const {
    hasPin, isBiometricEnabled, biometricType,
    setupPin, toggleBiometric, removePin,
  } = useAppLock();
  const { showConfirm, showAlert } = useAlert();

  const [pinModal,    setPinModal]    = useState<"setup" | "change" | null>(null);
  const [loggingOut,  setLoggingOut]  = useState(false);

  const name     = staff?.fullName ?? "";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const role     = staff?.role ?? "admin";
  const roleMeta = ROLE_META[role];
  const center   = isAllCenters ? "All Centers" : currentCenter?.name ?? "—";

  const bioLabel = biometricType === "face" ? "Face ID" : biometricType === "fingerprint" ? "Fingerprint" : null;
  const dotAreaH = Math.round(ms(190));

  async function handleSwitchCenter() {
    try { await switchCenter(); }
    catch { showAlert("Error", "Could not load centers. Please try again.", "error"); }
  }

  async function handlePinDone(pin: string) {
    await setupPin(pin, isBiometricEnabled);
    setPinModal(null);
  }

  async function handleRemovePin() {
    showConfirm(
      "Remove PIN Lock?",
      "The app will no longer be locked when closed. You can set up a new PIN anytime.",
      async () => { await removePin(); },
      { confirmLabel: "Remove", destructive: true },
    );
  }

  async function handleLogout() {
    showConfirm(
      "Log out?",
      "You'll need to sign in again.",
      async () => {
        setLoggingOut(true);
        await logout();
      },
      { confirmLabel: "Log out", destructive: true },
    );
  }

  return (
    <SafeAreaView style={s.root} edges={["bottom"]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Hero header ─────────────────────────────────────────────────────── */}
      <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <PolkaDots height={dotAreaH} />

        {/* Back + title bar */}
        <View style={[s.topBar, { paddingTop: insets.top + ms(10) }]}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={ms(20)} color="#fff" />
          </TouchableOpacity>
          <Text style={s.heroTitle}>Profile</Text>
        </View>

        {/* Avatar + name + chips */}
        <View style={s.heroBody}>
          <View style={[s.avatar, { borderColor: roleMeta.color }]}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.heroName}>{name}</Text>
          <View style={s.chipRow}>
            <View style={[s.roleChip, { backgroundColor: roleMeta.color }]}>
              <Ionicons name={roleMeta.icon as any} size={ms(11)} color="#fff" />
              <Text style={s.roleChipT}>{roleMeta.label}</Text>
            </View>
            <View style={s.centerChip}>
              <Ionicons name="business-outline" size={ms(11)} color="rgba(255,255,255,0.8)" />
              <Text style={s.centerChipT}>{center}</Text>
            </View>
          </View>
        </View>

        <Wave />
      </LinearGradient>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
      >

        {/* Account */}
        <SectionLabel label="ACCOUNT" />
        <View style={s.card}>
          <Row
            icon="shield-outline"
            iconColor={roleMeta.color}
            label="Role"
            sub={roleMeta.desc}
            right={
              <View style={[s.pill, { backgroundColor: roleMeta.color + "18" }]}>
                <Text style={[s.pillT, { color: roleMeta.color }]}>{roleMeta.label}</Text>
              </View>
            }
          />
          <Row
            icon="business-outline"
            iconColor={C.blue}
            label="Center"
            sub="Currently active"
            right={
              <View style={[s.pill, { backgroundColor: C.blue + "14" }]}>
                <Text style={[s.pillT, { color: C.blue }]} numberOfLines={1}>{center}</Text>
              </View>
            }
          />
          <Row
            icon="swap-horizontal-outline"
            iconColor={C.accent}
            label="Switch Center"
            sub="Change your active center"
            onPress={handleSwitchCenter}
            last
          />
        </View>

        {/* Admin tools */}
        {role === "admin" && (
          <>
            <SectionLabel label="ADMIN" />
            <View style={s.card}>
              <Row
                icon="git-branch-outline"
                iconColor={C.purple}
                label="Center Management"
                sub="Add, edit, or deactivate centers"
                onPress={() => navigation.navigate("CenterManagement")}
              />
              <Row
                icon="people-outline"
                iconColor={C.orange}
                label="Staff Management"
                sub="Manage roles and access"
                onPress={() => navigation.navigate("StaffManagement")}
                last
              />
            </View>
          </>
        )}

        {/* Security */}
        <SectionLabel label="SECURITY" />
        <View style={s.card}>
          <Row
            icon="keypad-outline"
            iconColor={C.primary}
            label={hasPin ? "Change PIN" : "Set up PIN Lock"}
            sub={hasPin ? "Update your 4-digit unlock PIN" : "Protect the app when closed"}
            onPress={() => setPinModal(hasPin ? "change" : "setup")}
          />
          {hasPin && (
            <Row
              icon="lock-open-outline"
              iconColor={C.red}
              label="Remove PIN Lock"
              sub="Disable app lock entirely"
              onPress={handleRemovePin}
              danger
              last={!bioLabel}
            />
          )}
          {bioLabel && hasPin && (
            <Row
              icon={biometricType === "face" ? "scan-outline" : "finger-print-outline"}
              iconColor={C.green}
              label={`${bioLabel} Unlock`}
              sub={isBiometricEnabled ? "Tap to disable" : "Tap to enable"}
              right={
                <Switch
                  value={isBiometricEnabled}
                  onValueChange={(v) => toggleBiometric(v)}
                  trackColor={{ false: C.border, true: C.green + "66" }}
                  thumbColor={isBiometricEnabled ? C.green : "#bbb"}
                />
              }
              last
            />
          )}
          {bioLabel && !hasPin && (
            <Row
              icon={biometricType === "face" ? "scan-outline" : "finger-print-outline"}
              iconColor={C.muted}
              label={`${bioLabel} Unlock`}
              sub="Set up a PIN first to enable"
              right={<Switch value={false} disabled trackColor={{ false: C.border }} thumbColor="#bbb" />}
              last
            />
          )}
        </View>

        {/* Session */}
        <SectionLabel label="SESSION" />
        <View style={s.card}>
          <Row
            icon="log-out-outline"
            iconColor={C.red}
            label="Log out"
            onPress={handleLogout}
            danger
            last
          />
        </View>

        <View style={{ height: ms(24) }} />
      </ScrollView>

      {/* PIN setup modal */}
      {pinModal && (
        <PinSetupModal
          visible
          mode={pinModal}
          onDone={handlePinDone}
          onCancel={() => setPinModal(null)}
        />
      )}

      {/* Logout overlay */}
      {loggingOut && (
        <View style={s.logoutOverlay}>
          <View style={s.logoutBox}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.logoutText}>Signing out…</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  body:   { paddingHorizontal: ms(16), paddingTop: ms(20) },

  // Hero
  hero: { overflow: "hidden" },
  topBar: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: ms(16),
    paddingBottom:     ms(6),
    gap:               ms(12),
  },
  backBtn: {
    width:           ms(36),
    height:          ms(36),
    borderRadius:    ms(10),
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  heroTitle: {
    flex:          1,
    fontSize:      fs(18),
    fontWeight:    "700",
    color:         "#fff",
    letterSpacing: 0.3,
    minWidth:      0,
  },
  heroBody: {
    alignItems:    "center",
    paddingBottom: ms(22),
    gap:           ms(8),
  },
  avatar: {
    width:           ms(80),
    height:          ms(80),
    borderRadius:    ms(40),
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth:     3,
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    ms(2),
  },
  avatarText: {
    fontSize:   fs(30),
    fontWeight: "800",
    color:      "#fff",
    letterSpacing: 1,
  },
  heroName: {
    fontSize:   fs(22),
    fontWeight: "800",
    color:      "#fff",
    letterSpacing: 0.2,
  },
  chipRow: {
    flexDirection: "row",
    gap:           ms(8),
    flexWrap:      "wrap",
    justifyContent: "center",
  },
  roleChip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    borderRadius:      ms(20),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(5),
  },
  roleChipT: { fontSize: fs(12), fontWeight: "700", color: "#fff" },
  centerChip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(4),
    borderRadius:      ms(20),
    paddingHorizontal: ms(12),
    paddingVertical:   ms(5),
    backgroundColor:   "rgba(255,255,255,0.18)",
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.25)",
  },
  centerChipT: { fontSize: fs(12), fontWeight: "600", color: "rgba(255,255,255,0.9)" },

  // Section
  sectionLabel: {
    fontSize:     fs(11),
    fontWeight:   "700",
    color:        C.muted,
    letterSpacing: 1.1,
    marginBottom:  ms(8),
    marginTop:     ms(4),
    paddingLeft:   ms(4),
  },
  card: {
    backgroundColor: C.card,
    borderRadius:    ms(16),
    marginBottom:    ms(20),
    overflow:        "hidden",
    borderWidth:     1,
    borderColor:     C.border,
  },

  // Row
  row: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: ms(14),
    paddingVertical:   ms(13),
    gap:               ms(12),
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width:           ms(38),
    height:          ms(38),
    borderRadius:    ms(11),
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
  },
  rowBody:  { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: fs(14.5), fontWeight: "600", color: C.text },
  rowSub:   { fontSize: fs(12), color: C.muted, marginTop: ms(1) },

  // Logout overlay
  logoutOverlay: {
    position:  "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(43,27,31,0.55)",
    alignItems:      "center",
    justifyContent:  "center",
    zIndex:          999,
  },
  logoutBox: {
    backgroundColor: C.card,
    borderRadius:    ms(20),
    paddingVertical:   ms(28),
    paddingHorizontal: ms(36),
    alignItems:      "center",
    gap:             ms(14),
    shadowColor:     "#000",
    shadowOffset:    { width: 0, height: ms(8) },
    shadowOpacity:   0.18,
    shadowRadius:    ms(20),
    elevation:       12,
  },
  logoutText: {
    fontSize:   fs(15),
    fontWeight: "600",
    color:      C.text,
  },

  // Pill badge
  pill: {
    borderRadius:      ms(20),
    paddingHorizontal: ms(10),
    paddingVertical:   ms(4),
    maxWidth:          ms(120),
  },
  pillT: { fontSize: fs(12), fontWeight: "700", textAlign: "center" },
});

// ── PIN modal styles ───────────────────────────────────────────────────────────

const pm = StyleSheet.create({
  sheet: {
    flex:            1,
    backgroundColor: BG,
  },
  sheetHeader: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: ms(16),
    paddingVertical:   ms(14),
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  cancelBtn: { width: ms(60) },
  cancelT: { fontSize: fs(15), color: C.primary, fontWeight: "600" },
  sheetTitle: {
    fontSize:   fs(16),
    fontWeight: "700",
    color:      C.text,
  },

  sheetBody: {
    flex:       1,
    alignItems: "center",
    justifyContent: "center",
    gap:        ms(8),
    paddingHorizontal: ms(32),
  },
  stepIcon: {
    width:           ms(64),
    height:          ms(64),
    borderRadius:    ms(20),
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    ms(4),
  },
  stepTitle: {
    fontSize:   fs(20),
    fontWeight: "800",
    color:      C.text,
  },
  stepSub: {
    fontSize:  fs(13.5),
    color:     C.muted,
    textAlign: "center",
  },
  dots: {
    flexDirection: "row",
    gap:           ms(18),
    marginTop:     ms(20),
    marginBottom:  ms(4),
  },
  dot: {
    width:           ms(16),
    height:          ms(16),
    borderRadius:    ms(8),
    borderWidth:     2,
    borderColor:     C.border,
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: C.primary,
    borderColor:     C.primary,
  },
  dotError: {
    backgroundColor: C.red,
    borderColor:     C.red,
  },
  errMsg: {
    fontSize: fs(12.5),
    color:    C.red,
    textAlign: "center",
    marginTop: ms(6),
  },

  // Keypad
  pad: {
    paddingHorizontal: ms(24),
    paddingBottom:     ms(16),
    gap:               ms(8),
  },
  row: {
    flexDirection:  "row",
    justifyContent: "space-between",
    gap:            ms(10),
  },
  key: {
    flex:            1,
    height:          ms(64),
    borderRadius:    ms(14),
    backgroundColor: C.inputBg,
    alignItems:      "center",
    justifyContent:  "center",
    borderWidth:     1,
    borderColor:     C.border,
  },
  keyGhost: { flex: 1, height: ms(64) },
  keyN: {
    fontSize:   fs(22),
    fontWeight: "400",
    color:      C.text,
  },
});

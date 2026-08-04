import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Modal, StatusBar, ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, contrastColor, type ThemeColors } from "../../context/ThemeContext";
import { ROLE_META } from "../../constants/roleMeta";
import { useAuth } from "../../context/AuthContext";
import { useAppLock } from "../../context/AppLockContext";
import { useAlert } from "../../context/AlertContext";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Stat cell ──────────────────────────────────────────────────────────────────

function StatCell({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <View style={ss.statCell}>
      <Text style={[ss.statValue, accent ? { color: accent } : undefined]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={ss.statLabel}>{label}</Text>
    </View>
  );
}

// ── Action row ─────────────────────────────────────────────────────────────────

interface ActionRowProps {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}

function ActionRow({
  icon, iconColor, title, subtitle, badge, badgeColor, right, onPress, danger, last,
}: ActionRowProps) {
  const Wrap: React.ElementType = onPress ? TouchableOpacity : View;
  const ic = danger ? C.red : iconColor;
  return (
    <>
      <Wrap style={ss.row} onPress={onPress} activeOpacity={0.7}>
        <View style={[ss.rowIcon, { backgroundColor: ic + "18" }]}>
          <Ionicons name={icon as any} size={ms(22)} color={ic} />
        </View>
        <View style={ss.rowMid}>
          <Text style={[ss.rowTitle, danger && { color: C.red }]} numberOfLines={1}>{title}</Text>
          <Text style={ss.rowSub} numberOfLines={1}>{subtitle}</Text>
        </View>
        <View style={ss.rowRight}>
          {right !== undefined ? right
            : badge ? (
              <View style={[ss.badge, { backgroundColor: (badgeColor ?? C.green) + "18" }]}>
                <Text style={[ss.badgeT, { color: badgeColor ?? C.green }]}>{badge}</Text>
              </View>
            ) : onPress ? (
              <Ionicons name="chevron-forward" size={ms(14)} color={C.placeholder} />
            ) : null}
        </View>
      </Wrap>
      {!last && <View style={ss.divider} />}
    </>
  );
}

// ── Grouped card ───────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <View style={ss.card}>{children}</View>;
}

// ── PIN modal ──────────────────────────────────────────────────────────────────

const PIN_LENGTH = 4;

function PinDots({ filled, error }: { filled: number; error: boolean }) {
  const pm = useThemedStyles(makePmStyles);
  return (
    <View style={pm.dots}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View key={i} style={[pm.dot, i < filled && pm.dotFilled, error && pm.dotError]} />
      ))}
    </View>
  );
}

function PinPad({ onDigit, onDelete }: { onDigit: (d: string) => void; onDelete: () => void }) {
  const pm = useThemedStyles(makePmStyles);
  const rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];
  return (
    <View style={pm.pad}>
      {rows.map((row) => (
        <View key={row[0]} style={pm.padRow}>
          {row.map((d) => (
            <TouchableOpacity key={d} style={pm.key} activeOpacity={0.6} onPress={() => onDigit(d)}>
              <Text style={pm.keyN}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={pm.padRow}>
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

type PinStep = "enter" | "confirm";

interface PinSetupModalProps {
  visible: boolean;
  mode: "setup" | "change";
  onDone: (pin: string) => void;
  onCancel: () => void;
}

function PinSetupModal({ visible, mode, onDone, onCancel }: PinSetupModalProps) {
  const colors = useThemeColors();
  const pm = useThemedStyles(makePmStyles);
  const [step, setStep] = useState<PinStep>("enter");
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  function reset() { setStep("enter"); setFirst(""); setPin(""); setError(false); }

  function handleDigit(d: string) {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === PIN_LENGTH) setTimeout(() => advance(next), 80);
  }

  function advance(entered: string) {
    if (step === "enter") {
      setFirst(entered); setStep("confirm"); setPin("");
    } else {
      if (entered === first) { onDone(entered); reset(); }
      else {
        setError(true); setPin("");
        setTimeout(() => { setStep("enter"); setFirst(""); setError(false); }, 700);
      }
    }
  }

  function handleDelete() { setPin((p) => p.slice(0, -1)); setError(false); }
  function handleCancel() { reset(); onCancel(); }

  const title = step === "enter" ? (mode === "setup" ? "Create PIN" : "New PIN") : "Confirm PIN";
  const sub = step === "enter" ? "Enter a 4-digit PIN" : "Re-enter the same PIN";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleCancel}>
      <SafeAreaView style={[pm.sheet, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
        <View style={pm.sheetHeader}>
          <TouchableOpacity onPress={handleCancel} style={pm.cancelBtn}>
            <Text style={[pm.cancelT, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={pm.sheetTitle}>{mode === "setup" ? "Set Up PIN" : "Change PIN"}</Text>
          <View style={{ width: ms(60) }} />
        </View>
        <View style={pm.sheetBody}>
          <View style={[pm.stepIcon, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name="lock-closed-outline" size={ms(28)} color={colors.primary} />
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
  const colors = useThemeColors();
  const t = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { staff, currentCenter, isAllCenters, logout, switchCenter } = useAuth();
  const { hasPin, isBiometricEnabled, biometricType, setupPin, toggleBiometric, removePin } = useAppLock();
  const { showConfirm, showAlert } = useAlert();

  const [pinModal, setPinModal] = useState<"setup" | "change" | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const name = staff?.fullName ?? "";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const role = staff?.role ?? "admin";
  const roleMeta = ROLE_META[role];
  const center = isAllCenters ? "All Centers" : currentCenter?.name ?? "—";
  const bioLabel = biometricType === "face" ? "Face ID" : biometricType === "fingerprint" ? "Fingerprint" : null;

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
      "The app will no longer be locked when closed.",
      async () => { await removePin(); },
      { confirmLabel: "Remove", destructive: true },
    );
  }

  async function handleLogout() {
    showConfirm(
      "Log out?",
      "You'll need to sign in again.",
      async () => { setLoggingOut(true); await logout(); },
      { confirmLabel: "Log out", brand: true, icon: "log-out-outline" },
    );
  }

  return (
    <View style={[t.root, { backgroundColor: colors.screenBg }]}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: ms(40) }} showsVerticalScrollIndicator={false}>

        {/* ── Header band ───────────────────────────────────────────────────── */}
        <View style={[t.coloredBand, { backgroundColor: colors.bg, paddingTop: insets.top + ms(6) }]}>
          <View style={t.heroNav}>
            <TouchableOpacity
              style={t.backBtn}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-back" size={ms(20)} color={contrastColor(colors.bg)} />
            </TouchableOpacity>
            <Text style={t.heroNavTitle}>Profile</Text>
          </View>
        </View>

        {/* ── Identity — avatar straddles the seam ─────────────────────────── */}
        <View style={t.identity}>
          <View style={t.avatarRing}>
            <View style={[t.avatarInner, { backgroundColor: colors.primary }]}>
              <Text style={t.avatarText}>{initials}</Text>
            </View>
          </View>

          <Text style={t.heroName}>{name}</Text>

          <View style={t.pillRow}>
            <View style={[t.pill, { backgroundColor: roleMeta.color + "18" }]}>
              <Ionicons name={roleMeta.icon as any} size={ms(11)} color={roleMeta.color} />
              <Text style={[t.pillT, { color: roleMeta.color }]}>{roleMeta.label}</Text>
            </View>
            <View style={t.pillDot} />
            <View style={[t.pill, { backgroundColor: colors.primary + "12" }]}>
              <Ionicons name="business-outline" size={ms(11)} color={colors.primary} />
              <Text style={[t.pillT, { color: colors.primary }]} numberOfLines={1}>{center}</Text>
            </View>
          </View>

          {/* <View style={[t.statsStrip, { backgroundColor: colors.bg }]}>
            <StatCell value={center} label="Center" accent={colors.primary} />
            <View style={t.statDivider} />
            <StatCell value={roleMeta.label} label="Role" />
            <View style={t.statDivider} />
            <StatCell value={hasPin ? "Protected" : "No PIN"} label="Security" accent={hasPin ? C.green : C.muted} />
          </View> */}
        </View>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <View style={t.body}>

          <Card>
            <ActionRow
              icon="shield-checkmark-outline"
              iconColor={roleMeta.color}
              title={roleMeta.label}
              subtitle={roleMeta.desc}
              badge="Verified"
              badgeColor={roleMeta.color}
            />
            <ActionRow
              icon="swap-horizontal-outline"
              iconColor={colors.accent}
              title="Switch Center"
              subtitle={`Currently: ${center}`}
              onPress={handleSwitchCenter}
              last
            />
          </Card>

          {role === "admin" && (
            <>
              <Card>
                <ActionRow
                  icon="git-branch-outline"
                  iconColor={C.purple}
                  title="Center Management"
                  subtitle="Add and configure branch centers"
                  onPress={() => navigation.navigate("CenterManagement")}
                />
                <ActionRow
                  icon="people-outline"
                  iconColor={C.orange}
                  title="Staff Management"
                  subtitle="Manage staff accounts and roles"
                  onPress={() => navigation.navigate("StaffManagement")}
                />
                <ActionRow
                  icon="color-palette-outline"
                  iconColor={colors.primary}
                  title="Organization Settings"
                  subtitle="Branding, login method and more"
                  onPress={() => navigation.navigate("OrganizationSettings")}
                  last
                />
              </Card>
            </>
          )}

          <Card>
            <ActionRow
              icon="keypad-outline"
              iconColor={colors.primary}
              title={hasPin ? "Change PIN" : "Set Up PIN Lock"}
              subtitle={hasPin ? "Update your 4-digit app PIN" : "Secure the app with a 4-digit code"}
              badge={hasPin ? "Active" : "Off"}
              badgeColor={hasPin ? C.green : C.muted}
              onPress={() => setPinModal(hasPin ? "change" : "setup")}
              last={!hasPin && !bioLabel}
            />
            {hasPin && (
              <ActionRow
                icon="lock-open-outline"
                iconColor={C.red}
                title="Remove PIN Lock"
                subtitle="Disable PIN protection for this app"
                onPress={handleRemovePin}
                danger
                last={!bioLabel}
              />
            )}
            {bioLabel && (
              <ActionRow
                icon={biometricType === "face" ? "scan-outline" : "finger-print-outline"}
                iconColor={hasPin ? C.green : C.muted}
                title={`${bioLabel} Unlock`}
                subtitle={hasPin ? "Use biometrics to unlock the app" : "Set a PIN first to enable this"}
                right={
                  <Switch
                    value={isBiometricEnabled && hasPin}
                    disabled={!hasPin}
                    onValueChange={(v) => toggleBiometric(v)}
                    trackColor={{ false: C.border, true: C.green + "66" }}
                    thumbColor={isBiometricEnabled && hasPin ? C.green : "#bbb"}
                  />
                }
                last
              />
            )}
          </Card>

          <Card>
            <ActionRow
              icon="log-out-outline"
              iconColor={C.red}
              title="Sign Out"
              subtitle="End your current session"
              onPress={handleLogout}
              danger
              last
            />
          </Card>

        </View>
      </ScrollView>

      {/* PIN modal */}
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
        <View style={ss.overlay}>
          <View style={ss.overlayBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={ss.overlayText}>Signing out…</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Static styles (no color tokens) ───────────────────────────────────────────

const ss = StyleSheet.create({
  // Stats strip cells
  statCell: { flex: 1, alignItems: "center", gap: ms(3) },
  statValue: {
    fontSize: fs(13),
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: C.text,
    textAlign: "center",
  },
  statLabel: {
    fontSize: fs(10.5),
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
    color: C.muted,
    textAlign: "center",
  },

  // Action row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ms(16),
    paddingVertical: ms(10),
    gap: ms(13),
  },
  rowIcon: {
    width: ms(44),
    height: ms(44),
    borderRadius: ms(13),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowMid: { flex: 1 },
  rowTitle: {
    fontSize: fs(14.5),
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: C.text,
    marginBottom: ms(2),
  },
  rowSub: {
    fontSize: fs(12),
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
    color: C.muted,
  },
  rowRight: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    borderRadius: ms(20),
    paddingHorizontal: ms(9),
    paddingVertical: ms(4),
  },
  badgeT: {
    fontSize: fs(11),
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },

  // Hairline divider
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: ms(73),
  },

  // Grouped card
  card: {
    backgroundColor: C.card,
    borderRadius: ms(18),
    overflow: "hidden",
    marginBottom: ms(10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: ms(2) },
    shadowOpacity: 0.06,
    shadowRadius: ms(10),
    elevation: 3,
  },

  // Logout overlay
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  overlayBox: {
    backgroundColor: C.card,
    borderRadius: ms(20),
    paddingVertical: ms(28),
    paddingHorizontal: ms(36),
    alignItems: "center",
    gap: ms(14),
  },
  overlayText: {
    fontSize: fs(15),
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: C.text,
  },
});

// ── Themed styles ──────────────────────────────────────────────────────────────

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1 },

  // Header band (same bg as all other screen headers)
  coloredBand: {
    paddingHorizontal: ms(16),
    paddingBottom: ms(52),
  },
  heroNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: ms(10),
  },
  // Theme-derived, matching ScreenHeader's back button — tint/icon come from
  // the contrast color against this band's own background (colors.bg),
  // instead of the fixed C.card/C.border/C.text used before.
  backBtn: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(13),
    backgroundColor: contrastColor(colors.bg) + "18",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: contrastColor(colors.bg) + "20",
  },
  heroNavTitle: {
    flex:       1,
    marginLeft: ms(12),
    fontSize:   fs(17),
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color:      C.text,
  },

  // Identity section (screenBg, avatar pulls up into band)
  identity: {
    backgroundColor: colors.screenBg,
    alignItems: "center",
    paddingBottom: ms(12),
  },
  avatarRing: {
    width: ms(96),
    height: ms(96),
    borderRadius: ms(48),
    borderWidth: 4,
    borderColor: colors.screenBg,
    backgroundColor: colors.screenBg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -ms(48),
    marginBottom: ms(14),
    zIndex: 10,
  },
  avatarInner: {
    width: ms(84),
    height: ms(84),
    borderRadius: ms(42),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: fs(32),
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  heroName: {
    fontSize: fs(24),
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.4,
    marginBottom: ms(8),
    textAlign: "center",
    paddingHorizontal: ms(24),
  },
  pillRow: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            ms(6),
    marginBottom:   ms(20),
    paddingHorizontal: ms(16),
  },
  pill: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               ms(5),
    borderRadius:      ms(20),
    paddingHorizontal: ms(11),
    paddingVertical:   ms(5),
    flexShrink:        1,
  },
  pillT: {
    fontSize:   fs(12),
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    flexShrink: 1,
  },
  pillDot: {
    width:           ms(4),
    height:          ms(4),
    borderRadius:    ms(2),
    backgroundColor: C.muted,
    flexShrink:      0,
  },
  // kept for TS compatibility — unused after refactor
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
  },
  rolePillT: {
    fontSize: fs(12.5),
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },

  // Stats strip
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: ms(16),
    marginHorizontal: ms(20),
    paddingVertical: ms(14),
    paddingHorizontal: ms(8),
  },
  statDivider: {
    width: 1,
    height: ms(32),
    backgroundColor: colors.primary + "28",
  },

  // Body
  body: {
    paddingHorizontal: ms(16),
  },
});

// ── PIN modal styles ───────────────────────────────────────────────────────────

const makePmStyles = (colors: ThemeColors) => StyleSheet.create({
  sheet: { flex: 1 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: ms(16),
    paddingVertical: ms(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  cancelBtn: { width: ms(60) },
  cancelT: { fontSize: fs(15), fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  sheetTitle: { fontSize: fs(16), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },

  sheetBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: ms(8),
    paddingHorizontal: ms(32),
  },
  stepIcon: {
    width: ms(64),
    height: ms(64),
    borderRadius: ms(20),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: ms(4),
  },
  stepTitle: { fontSize: fs(20), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text },
  stepSub: { fontSize: fs(13.5), color: C.muted, textAlign: "center" },

  dots: { flexDirection: "row", gap: ms(18), marginTop: ms(20), marginBottom: ms(4) },
  dot: {
    width: ms(16),
    height: ms(16),
    borderRadius: ms(8),
    borderWidth: 2,
    borderColor: C.border,
    backgroundColor: "transparent",
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotError: { backgroundColor: C.red, borderColor: C.red },
  errMsg: { fontSize: fs(12.5), color: C.red, textAlign: "center", marginTop: ms(6) },

  pad: { paddingHorizontal: ms(24), paddingBottom: ms(16), gap: ms(8) },
  padRow: { flexDirection: "row", justifyContent: "space-between", gap: ms(10) },
  key: {
    flex: 1,
    height: ms(64),
    borderRadius: ms(14),
    backgroundColor: C.inputBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  keyGhost: { flex: 1, height: ms(64) },
  keyN: { fontSize: fs(22), fontFamily: "Inter_400Regular", fontWeight: "400", color: C.text },
});

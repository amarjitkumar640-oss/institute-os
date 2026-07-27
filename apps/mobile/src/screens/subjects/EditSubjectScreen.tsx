import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView,
  Platform, StatusBar, Animated, Easing, TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { updateSubject, type SubjectItem } from "../../api/subjects";
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { ms, fs, sw } from "../../utils/responsive";
import { useAlert } from "../../context/AlertContext";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "EditSubject">;

type CategoryOption = { key: string | null; label: string; sub: string; color: string; icon: string };

const CONTENT_H_PAD = ms(20);
const SECTION_PAD   = ms(16);
const CAT_GAP       = ms(8);
// Fallback estimate for the very first render, before the grid has been
// measured — avoids a flash of zero-width cards.
const CAT_CARD_W_FALLBACK = (sw - 2 * CONTENT_H_PAD - 2 * SECTION_PAD - CAT_GAP) / 2;

const CATEGORY_ICON: Record<string, string> = {
  ssc:        "document-text-outline",
  banking:    "card-outline",
  railway:    "train-outline",
  foundation: "school-outline",
};
const CATEGORY_SUB: Record<string, string> = {
  ssc:        "Staff Selection Commission",
  banking:    "IBPS, SBI, RBI & other bank exams",
  railway:    "RRB & Railway Recruitment Board",
  foundation: "School-level foundation courses",
};

interface UpdatedSubject {
  name: string;
  examCategories: ExamCategoryItem[];
  facultyCount: number;
}

export function EditSubjectScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { showConfirm } = useAlert();
  const insets = useSafeAreaInsets();
  const { subject } = route.params;

  const [name, setName]           = useState(subject.name);
  const [nameError, setNameError] = useState<string | undefined>();
  const [categoryIds, setCategoryIds] = useState<string[]>(subject.examCategories.map((c) => c.id));
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [loading, setLoading]     = useState(false);
  const [updated, setUpdated]     = useState<UpdatedSubject | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [examCategories, setExamCategories] = useState<ExamCategoryItem[]>([]);
  const catCardW = gridWidth > 0 ? (gridWidth - CAT_GAP) / 2 : CAT_CARD_W_FALLBACK;

  useEffect(() => {
    listExamCategories().then(setExamCategories).catch(() => {});
  }, []);

  const CATEGORIES: CategoryOption[] = [
    { key: null, label: "Shared", sub: "Applies to all exam categories", color: "#E8752C", icon: "grid-outline" },
    ...examCategories.map((c) => ({
      key:   c.id,
      label: c.label,
      sub:   CATEGORY_SUB[c.key] ?? `${c.label} exam category`,
      color: c.color,
      icon:  CATEGORY_ICON[c.key] ?? "school-outline",
    })),
  ];

  const checkScale     = useRef(new Animated.Value(0)).current;
  const cardSlide      = useRef(new Animated.Value(ms(60))).current;
  const cardOpacity    = useRef(new Animated.Value(0)).current;
  const ringScale      = useRef(new Animated.Value(0)).current;
  const ringOpacity    = useRef(new Animated.Value(0)).current;
  const sparkle        = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY       = useRef(new Animated.Value(ms(10))).current;

  const initialCategoryIds = useMemo(
    () => subject.examCategories.map((c) => c.id).sort(),
    [subject.examCategories]
  );
  const sortedCategoryIds = useMemo(() => [...categoryIds].sort(), [categoryIds]);
  const isDirty =
    name.trim() !== subject.name ||
    sortedCategoryIds.length !== initialCategoryIds.length ||
    sortedCategoryIds.some((id, i) => id !== initialCategoryIds[i]);

  function toggleCategory(key: string | null) {
    if (key === null) {
      setCategoryIds([]);
    } else {
      setCategoryIds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    }
  }

  function validate(): boolean {
    if (!name.trim()) { setNameError("Subject name is required."); return false; }
    if (name.trim().length > 120) { setNameError("Name must be 120 characters or fewer."); return false; }
    setNameError(undefined);
    return true;
  }

  function showSuccess(s: SubjectItem) {
    setUpdated({ name: s.name, examCategories: s.examCategories, facultyCount: s.facultyCount });
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 40 }),
      Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 62, friction: 6, delay: 160 }),
      Animated.sequence([
        Animated.timing(ringOpacity, { toValue: 0.4, duration: 1,   useNativeDriver: true, delay: 170 }),
        Animated.timing(ringOpacity, { toValue: 0,   duration: 550, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.timing(ringScale, { toValue: 1, duration: 650, easing: Easing.out(Easing.ease), useNativeDriver: true, delay: 170 }),
      Animated.spring(sparkle,   { toValue: 1, useNativeDriver: true, tension: 90, friction: 8, delay: 320 }),
      Animated.timing(contentOpacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true, delay: 260 }),
      Animated.spring(contentY,       { toValue: 0, useNativeDriver: true, tension: 80, friction: 11, delay: 260 }),
    ]).start();
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setSubmitError(undefined);
    try {
      const result = await updateSubject(subject.id, {
        name:            name.trim(),
        examCategoryIds: categoryIds,
      });
      if (result.ok) {
        showSuccess(result.subject);
      } else if ("conflict" in result) {
        setNameError(result.message);
      } else {
        setSubmitError("Subject not found. It may have been deleted.");
      }
    } catch {
      setSubmitError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (isDirty) {
      showConfirm("Discard Changes?", "You have unsaved changes. Go back?", () => navigation.goBack(), { confirmLabel: "Discard", cancelLabel: "Stay", destructive: true });
    } else {
      navigation.goBack();
    }
  }

  const catLabel = updated && updated.examCategories.length
    ? updated.examCategories.map((c) => c.label).join(", ")
    : "Shared";
  const catColor = updated?.examCategories[0]?.color ?? "#E8752C";

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="Edit Subject" onBack={handleBack} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.content}>

          {/* ── Name ── */}
          <View style={s.section}>
            <SectionHead dot={colors.primary} title="Subject Name" />
            <FormField
              label="NAME"
              value={name}
              onChangeText={(v) => { setName(v); setNameError(undefined); }}
              placeholder="e.g. Quantitative Aptitude"
              error={nameError}
              icon="book-outline"
              maxLength={120}
              clearable
              returnKeyType="done"
            />
          </View>

          {/* ── Category ── */}
          <View style={s.section}>
            <SectionHead dot={colors.primary} title="Exam Category" />
            <Text style={s.catHint}>Choose one or more exams this subject belongs to (or leave as Shared).</Text>
            <View style={s.catGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
              {CATEGORIES.map((opt) => {
                const active = opt.key === null
                  ? categoryIds.length === 0
                  : categoryIds.includes(opt.key);
                return (
                  <TouchableOpacity
                    key={String(opt.key)}
                    style={[s.catCard, { width: catCardW }, active && { borderColor: opt.color, borderWidth: 2, backgroundColor: opt.color + "0C" }]}
                    onPress={() => toggleCategory(opt.key)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.catIcon, { backgroundColor: active ? opt.color : opt.color + "22" }]}>
                      <Ionicons name={opt.icon as any} size={ms(20)} color={active ? "#fff" : opt.color} />
                    </View>
                    <Text style={[s.catName, active && { color: opt.color }]}>{opt.label}</Text>
                    <Text style={s.catSub} numberOfLines={2}>{opt.sub}</Text>
                    {active && (
                      <View style={[s.catCheck, { backgroundColor: opt.color }]}>
                        <Ionicons name="checkmark" size={ms(10)} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Faculty count info */}
          {subject.facultyCount > 0 && (
            <View style={s.infoBox}>
              <Ionicons name="information-circle-outline" size={ms(16)} color="#2563A8" />
              <Text style={s.infoT}>
                {subject.facultyCount} faculty member{subject.facultyCount > 1 ? "s are" : " is"} currently teaching this subject.
              </Text>
            </View>
          )}

          {submitError && (
            <View style={s.submitError}>
              <Text style={s.submitErrorT}>{submitError}</Text>
            </View>
          )}

          <View style={s.buttonGroup}>
            <PrimaryButton
              label="Save Changes"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading || !isDirty}
              icon="checkmark-circle-outline"
            />
            {isDirty && !loading && (
              <PrimaryButton
                label="Reset Changes"
                onPress={() => { setName(subject.name); setCategoryIds(subject.examCategories.map((c) => c.id)); setNameError(undefined); setSubmitError(undefined); }}
                variant="outline"
                icon="refresh-outline"
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Full-screen loader */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderTitle}>Saving Changes…</Text>
            <Text style={s.loaderSub}>Please wait</Text>
          </View>
        </View>
      )}

      {/* Full-screen success card */}
      {updated !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
          <View style={[s.successStatusBarBg, { height: insets.top }]} />
          <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>

            <View style={s.checkStage}>
              <Animated.View
                pointerEvents="none"
                style={[
                  s.pingRing,
                  {
                    opacity: ringOpacity,
                    transform: [{ scale: ringScale.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.55] }) }],
                  },
                ]}
              />
              <View style={s.checkGlow} />

              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <LinearGradient colors={[C.green, "#16A085"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
                  <Ionicons name="checkmark" size={ms(42)} color="#fff" />
                </LinearGradient>
              </Animated.View>

              <Animated.View style={[s.sparkleTL, { opacity: sparkle, transform: [{ scale: sparkle }] }]}>
                <Ionicons name="sparkles" size={ms(14)} color={colors.secondary} />
              </Animated.View>
              <Animated.View style={[s.sparkleBR, { opacity: sparkle, transform: [{ scale: sparkle }] }]}>
                <Ionicons name="sparkles" size={ms(10)} color={colors.accent} />
              </Animated.View>
            </View>

            <Animated.View style={[s.successContent, { opacity: contentOpacity, transform: [{ translateY: contentY }] }]}>
              <Text style={s.successTitle}>Subject Updated!</Text>
              <Text style={s.successSub}>Changes saved successfully</Text>

              <View style={s.detailBox}>
                <DetailRow icon="book-outline"    label="Subject Name"     value={updated.name} color={colors.primary} />
                <DetailRow icon="layers-outline"  label="Category"        value={catLabel}      color={catColor} />
                <DetailRow icon="people-outline"  label="Faculty Teaching" value={`${updated.facultyCount} faculty member${updated.facultyCount !== 1 ? "s" : ""}`} color={C.green} last />
              </View>

              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
                <LinearGradient colors={[colors.primary, "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.doneBtn}>
                  <Ionicons name="list-outline" size={ms(18)} color="#fff" />
                  <Text style={s.doneBtnT}>View All Subjects</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHead({ dot, title }: { dot: string; title: string }) {
  const s = useThemedStyles(makeSStyles);
  return (
    <View style={s.sectionHeader}>
      <View style={[s.sectionDot, { backgroundColor: dot }]} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function DetailRow({ icon, label, value, color, last = false }: {
  icon: string; label: string; value: string; color: string; last?: boolean;
}) {
  return (
    <View style={[dr.row, !last && dr.rowBorder]}>
      <View style={[dr.iconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(14)} color={color} />
      </View>
      <View style={dr.textWrap}>
        <Text style={dr.label}>{label}</Text>
        <Text style={dr.value}>{value}</Text>
      </View>
    </View>
  );
}

const dr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), gap: ms(12) },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  iconWrap:  { width: ms(32), height: ms(32), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },
  textWrap:  { flex: 1 },
  label:     { fontSize: fs(10), color: C.muted, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: ms(1) },
  value:     { fontSize: fs(13), color: C.text, fontWeight: "700" },
});

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.primary },
  flex:          { flex: 1 },
  content:       { flex: 1, backgroundColor: "#FFFBF0", paddingHorizontal: CONTENT_H_PAD, paddingTop: ms(8), paddingBottom: ms(16) },

  section:       { backgroundColor: "#FFFFFF", borderRadius: ms(18), padding: SECTION_PAD, marginBottom: ms(10), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(10) },
  sectionDot:    { width: ms(4), height: ms(18), borderRadius: ms(2) },
  sectionTitle:  { fontSize: fs(12), fontWeight: "800", color: "#8A7F82", letterSpacing: 1, textTransform: "uppercase" },

  catHint:       { fontSize: fs(12), color: "#8A7F82", marginBottom: ms(8) },
  catGrid:       { flexDirection: "row", flexWrap: "wrap", gap: CAT_GAP },
  catCard:       { borderRadius: ms(12), padding: ms(10), backgroundColor: "#FAFAFA", borderWidth: 1.5, borderColor: "#E8E0DC", gap: ms(4), position: "relative" },
  catIcon:       { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center", marginBottom: ms(2) },
  catName:       { fontSize: fs(13), fontWeight: "800", color: "#2B1B1F" },
  catSub:        { fontSize: fs(10), color: "#8A7F82", lineHeight: fs(13) },
  catCheck:      { position: "absolute", top: ms(8), right: ms(8), width: ms(16), height: ms(16), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },

  infoBox:       { flexDirection: "row", alignItems: "flex-start", gap: ms(10), backgroundColor: "#EFF4FF", borderRadius: ms(12), padding: ms(10), marginBottom: ms(10), borderWidth: 1, borderColor: "#BFD0F5" },
  infoT:         { fontSize: fs(12), color: "#2563A8", flex: 1, lineHeight: fs(16) },

  submitError:   { backgroundColor: "#FEF0EE", borderRadius: ms(12), borderWidth: 1, borderColor: "#F5C6C0", padding: ms(12), marginBottom: ms(10) },
  submitErrorT:  { fontSize: fs(13), color: "#C0392B", lineHeight: fs(18) },
  buttonGroup:   { gap: ms(12) },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,251,240,0.96)", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: "#FFFFFF", borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F" },
  loaderSub:     { fontSize: fs(12), color: "#8A7F82" },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successStatusBarBg: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: colors.primary },
  successCard:    { width: "100%", backgroundColor: C.card, borderRadius: ms(30), padding: ms(26), alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(10) }, shadowOpacity: 0.14, shadowRadius: ms(28), elevation: 12 },

  checkStage:   { width: ms(130), height: ms(130), justifyContent: "center", alignItems: "center", marginBottom: ms(14) },
  checkGlow:    { position: "absolute", width: ms(112), height: ms(112), borderRadius: ms(56), backgroundColor: C.greenBg },
  pingRing:     { position: "absolute", width: ms(88), height: ms(88), borderRadius: ms(44), borderWidth: 2, borderColor: C.green },
  checkCircle:  { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  sparkleTL:    { position: "absolute", top: ms(4), left: ms(12) },
  sparkleBR:    { position: "absolute", bottom: ms(10), right: ms(6) },

  successContent: { width: "100%", alignItems: "center" },
  successTitle:   { fontSize: fs(23), fontWeight: "800", color: C.text, letterSpacing: 0.1, marginBottom: ms(6) },
  successSub:     { fontSize: fs(13), color: C.muted, marginBottom: ms(24), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(24), borderWidth: 1, borderColor: C.border },
  doneBtnWrap:    { width: "100%" },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  doneBtnT:       { fontSize: fs(15), fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
});

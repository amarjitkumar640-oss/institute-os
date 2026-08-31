import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet,
  TextInput, Animated, Easing, TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { KeyboardAvoidingScroll } from "../../components/ui/KeyboardAvoidingScroll";
import { FormField } from "../../components/ui/FormField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { T } from "../../components/ui/typography";
import { createSubject, type SubjectItem } from "../../api/subjects";
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { ms, fs, sw } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "CreateSubject">;

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

interface CreatedSubject {
  name: string;
  examCategories: ExamCategoryItem[];
}

export function CreateSubjectScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const insets = useSafeAreaInsets();

  const [name, setName]                   = useState("");
  const [nameError, setNameError]         = useState<string | undefined>();
  const [categoryIds, setCategoryIds]     = useState<string[]>([]);
  const [categoryError, setCategoryError] = useState<string | undefined>();
  const [submitError, setSubmitError]     = useState<string | undefined>();
  const [loading, setLoading]             = useState(false);
  const [created, setCreated]             = useState<CreatedSubject | null>(null);
  const [gridWidth, setGridWidth]         = useState(0);
  const [examCategories, setExamCategories] = useState<ExamCategoryItem[]>([]);
  const catCardW = gridWidth > 0 ? (gridWidth - CAT_GAP) / 2 : CAT_CARD_W_FALLBACK;

  useEffect(() => {
    listExamCategories().then(setExamCategories).catch(() => {});
  }, []);

  const CATEGORIES: CategoryOption[] = [
    { key: null, label: "Shared", sub: "Applies to all exam categories", color: C.orange, icon: "grid-outline" },
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

  // track whether the user has explicitly made a choice (shared, or one-or-more categories)
  const [categoryChosen, setCategoryChosen] = useState(false);

  function toggleCategory(key: string | null) {
    setCategoryChosen(true);
    setCategoryError(undefined);
    if (key === null) {
      setCategoryIds([]); // "Shared" — mutually exclusive with specific categories
    } else {
      setCategoryIds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    }
  }

  function validate(): boolean {
    let ok = true;
    if (!name.trim()) { setNameError("Subject name is required."); ok = false; }
    else if (name.trim().length > 120) { setNameError("Name must be 120 characters or fewer."); ok = false; }
    else setNameError(undefined);

    if (!categoryChosen) { setCategoryError("Please select a category."); ok = false; }
    else setCategoryError(undefined);

    return ok;
  }

  function showSuccess(s: SubjectItem) {
    setCreated({ name: s.name, examCategories: s.examCategories });
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
      const result = await createSubject({ name: name.trim(), examCategoryIds: categoryIds });
      if (result.ok) {
        showSuccess(result.subject);
      } else if ("conflict" in result) {
        setNameError(result.message);
      }
    } catch {
      setSubmitError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const catLabel = created && created.examCategories.length
    ? created.examCategories.map((c) => c.label).join(", ")
    : "Shared";
  const catColor = created?.examCategories[0]?.color ?? C.orange;

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="Add Subject" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingScroll
        style={s.flex}
        contentContainerStyle={s.content}
        footer={
          <View style={s.footer}>
            <PrimaryButton
              label="Add Subject"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              icon="add-circle-outline"
            />
          </View>
        }
      >
        <View>

          {/* ── Name ── */}
          <View style={s.section}>
            <SectionHead icon="book-outline" title="Subject Name" color={colors.primary} />
            <FormField
              label="NAME"
              value={name}
              onChangeText={(v) => { setName(v); setNameError(undefined); }}
              placeholder="e.g. Quantitative Aptitude"
              error={nameError}
              required
              icon="book-outline"
              maxLength={120}
              clearable
              returnKeyType="done"
            />
          </View>

          {/* ── Category ── */}
          <View style={s.section}>
            <SectionHead icon="layers-outline" title="Exam Category" color={colors.primary} />
            <Text style={s.catHint}>Choose one or more exams this subject belongs to (or leave as Shared).</Text>
            <View style={s.catGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
              {CATEGORIES.map((opt) => {
                const active = opt.key === null
                  ? categoryChosen && categoryIds.length === 0
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
            {categoryError && <Text style={s.fieldErr}>{categoryError}</Text>}
          </View>

          {submitError && (
            <View style={s.submitError}>
              <Text style={s.submitErrorT}>{submitError}</Text>
            </View>
          )}

        </View>
      </KeyboardAvoidingScroll>

      {/* Full-screen loader */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderTitle}>Adding Subject…</Text>
            <Text style={s.loaderSub}>Please wait</Text>
          </View>
        </View>
      )}

      {/* Full-screen success card */}
      {created !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
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
              <Text style={s.successTitle}>Subject Added!</Text>
              <Text style={s.successSub}>The subject has been created successfully</Text>

              <View style={s.detailBox}>
                <DetailRow icon="book-outline"   label="Subject Name" value={created.name}  color={colors.primary} />
                <DetailRow icon="layers-outline" label="Category"     value={catLabel}       color={catColor} last />
              </View>

              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
                <View style={[s.doneBtn, { backgroundColor: colors.primary }]}>
                  <Ionicons name="list-outline" size={ms(18)} color="#fff" />
                  <Text style={s.doneBtnT}>View All Subjects</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>

          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHead({ icon, title, color }: { icon: string; title: string; color: string }) {
  return (
    <View style={sh.wrap}>
      <View style={[sh.iconBox, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(16)} color={color} />
      </View>
      <Text style={[sh.label, { color }]}>{title.toUpperCase()}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap:    { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(12) },
  iconBox: { width: ms(34), height: ms(34), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  label:   { ...T.sectionHeading, letterSpacing: 1 },
});

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
  label:     { ...T.sectionHeading, color: C.muted, marginBottom: ms(1) },
  value:     { ...T.listItemTitle, color: C.text },
});

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.screenBg },
  flex:          { flex: 1 },
  content:       { backgroundColor: colors.screenBg, paddingHorizontal: CONTENT_H_PAD, paddingTop: ms(8), paddingBottom: ms(20) },
  footer:        { paddingHorizontal: CONTENT_H_PAD, paddingTop: ms(12), paddingBottom: ms(14), backgroundColor: colors.screenBg, borderTopWidth: 1, borderTopColor: C.border },

  section:       { backgroundColor: C.card, borderRadius: ms(18), padding: SECTION_PAD, marginBottom: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  catHint:       { ...T.bodySmall, color: C.muted, marginBottom: ms(10) },
  catGrid:       { flexDirection: "row", flexWrap: "wrap", gap: CAT_GAP },
  catCard:       { borderRadius: ms(12), padding: ms(10), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border, gap: ms(4), position: "relative" },
  catIcon:       { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center", marginBottom: ms(2) },
  catName:       { ...T.listItemTitle, color: C.text },
  catSub:        { ...T.caption, color: C.muted },
  catCheck:      { position: "absolute", top: ms(8), right: ms(8), width: ms(16), height: ms(16), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },
  fieldErr:      { ...T.bodySmall, color: C.red, marginTop: ms(10) },

  submitError:   { backgroundColor: C.red + "0F", borderRadius: ms(12), borderWidth: 1, borderColor: C.red + "30", padding: ms(14), marginBottom: ms(16) },
  submitErrorT:  { ...T.body, color: C.red },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg + "EE", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { ...T.cardTitle, color: C.text },
  loaderSub:     { ...T.bodySmall, color: C.muted },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successStatusBarBg: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: colors.primary },
  successCard:    { width: "100%", backgroundColor: C.card, borderRadius: ms(30), padding: ms(26), alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(10) }, shadowOpacity: 0.14, shadowRadius: ms(28), elevation: 12 },

  checkStage:   { width: ms(130), height: ms(130), justifyContent: "center", alignItems: "center", marginBottom: ms(14) },
  checkGlow:    { position: "absolute", width: ms(112), height: ms(112), borderRadius: ms(56), backgroundColor: C.greenBg },
  pingRing:     { position: "absolute", width: ms(88), height: ms(88), borderRadius: ms(44), borderWidth: 2, borderColor: C.green },
  checkCircle:  { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  sparkleTL:    { position: "absolute", top: ms(4), left: ms(12) },
  sparkleBR:    { position: "absolute", bottom: ms(10), right: ms(6) },

  successContent: { width: "100%", alignItems: "center" },
  successTitle:   { ...T.displayMedium, color: C.text, marginBottom: ms(6) },
  successSub:     { ...T.body, color: C.muted, marginBottom: ms(24), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(24), borderWidth: 1, borderColor: C.border },
  doneBtnWrap:    { width: "100%" },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(17), paddingVertical: ms(16) },
  doneBtnT:       { ...T.buttonText, color: "#FFFFFF" },
});

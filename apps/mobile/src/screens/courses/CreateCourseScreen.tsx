import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Animated,
  ActivityIndicator,
  TouchableOpacity,
  Keyboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { SelectChips } from "../../components/ui/SelectChips";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { T } from "../../components/ui/typography";
import { createCourse } from "../../api/courses";
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { ms, fs } from "../../utils/responsive";
import { useAlert } from "../../context/AlertContext";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "CreateCourse">;

const GENERAL_VALUE = "general";

interface FormState {
  name: string;
  examCategoryIds: string[];
  durationMonths: string;
  defaultFee: string;
}

interface FormErrors {
  name?: string;
  examCategory?: string;
  durationMonths?: string;
  defaultFee?: string;
  submit?: string;
}

interface CreatedCourse {
  name: string;
  examCategories: ExamCategoryItem[];
  durationMonths: number;
  defaultFee: number;
}

const INITIAL_FORM: FormState = {
  name: "", examCategoryIds: [], durationMonths: "", defaultFee: "",
};

// "General" and specific categories are mutually exclusive. `displayValue` is
// what was shown to SelectChips before the tap; `next` is what it computed
// after toggling — comparing General's presence across the two tells us
// whether the user tapped General itself vs. a specific category.
function resolveCategorySelection(displayValue: string[], next: string[]): string[] {
  const wasGeneral = displayValue.includes(GENERAL_VALUE);
  const nowGeneral = next.includes(GENERAL_VALUE);
  if (!wasGeneral && nowGeneral) return [];
  return next.filter((v) => v !== GENERAL_VALUE);
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Course name is required.";
  else if (name.length > 120) errors.name = "Course name must be 120 characters or fewer.";

  const months = Number(form.durationMonths);
  if (!form.durationMonths.trim()) errors.durationMonths = "Duration is required.";
  else if (!Number.isInteger(months) || months < 1 || months > 60)
    errors.durationMonths = "Duration must be a whole number between 1 and 60.";

  const fee = Number(form.defaultFee);
  if (form.defaultFee.trim() === "") errors.defaultFee = "Default fee is required.";
  else if (isNaN(fee) || fee < 0) errors.defaultFee = "Fee must be 0 or a positive number.";
  else if (fee > 10_000_000) errors.defaultFee = "Fee cannot exceed ₹1,00,00,000.";

  return errors;
}

export function CreateCourseScreen({ navigation }: Props) {
  const { showConfirm } = useAlert();
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const scrollRef = useRef<ScrollView>(null);

  // RN auto-scrolls to keep a focused field visible above the keyboard but
  // never scrolls back on dismiss — undo that so the form returns to its
  // original scroll position once the keyboard is fully gone.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => sub.remove();
  }, []);

  const [form, setForm]               = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors]           = useState<FormErrors>({});
  const [loading, setLoading]         = useState(false);
  const [createdCourse, setCreatedCourse] = useState<CreatedCourse | null>(null);
  const [categories, setCategories]   = useState<ExamCategoryItem[]>([]);

  useEffect(() => {
    listExamCategories().then(setCategories).catch(() => {});
  }, []);

  const examOptions = [
    { label: "General (All Categories)", value: GENERAL_VALUE, color: C.muted },
    ...categories.map((c) => ({ label: c.label, value: c.id, color: c.color })),
  ];

  const durationRef   = useRef<TextInput>(null);
  const feeRef        = useRef<TextInput>(null);
  const checkScale    = useRef(new Animated.Value(0)).current;
  const cardSlide     = useRef(new Animated.Value(ms(60))).current;
  const cardOpacity   = useRef(new Animated.Value(0)).current;

  function showSuccessCard(course: CreatedCourse) {
    setCreatedCourse(course);
    // Animate checkmark bounce + card slide up
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 70,
        friction: 7,
        delay: 100,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.spring(cardSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
        delay: 60,
      }),
    ]).start();
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  async function handleSubmit() {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});

    try {
      const result = await createCourse({
        name:            form.name.trim(),
        examCategoryIds: form.examCategoryIds,
        durationMonths:  Number(form.durationMonths),
        defaultFee:      Number(form.defaultFee),
      });

      if (!result.ok) {
        setErrors({ name: result.message });
        return;
      }

      showSuccessCard({
        name:           result.course.name,
        examCategories: result.course.examCategories,
        durationMonths: result.course.durationMonths,
        defaultFee:     result.course.defaultFee,
      });
    } catch {
      setErrors({ submit: "Network error — please check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setForm(INITIAL_FORM);
    setErrors({});
  }

  const isDirty =
    form.name !== "" || form.examCategoryIds.length > 0 ||
    form.durationMonths !== "" || form.defaultFee !== "";

  function handleBack() {
    if (isDirty) {
      showConfirm("Discard Changes?", "You have unsaved changes. Are you sure you want to go back?", () => navigation.goBack(), { confirmLabel: "Discard", cancelLabel: "Stay", brand: true, icon: "arrow-undo-outline" });
    } else {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>

      <ScreenHeader title="New Course" onBack={handleBack} />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Basic Info */}
          <View style={s.section}>
            <SectionHead icon="document-text-outline" title="Basic Information" color={colors.primary} />

            <FormField
              label="COURSE NAME"
              value={form.name}
              onChangeText={(v) => setField("name", v)}
              placeholder="e.g. SSC CGL Complete Course"
              error={errors.name}
              required
              maxLength={120}
              clearable
              icon="book-outline"
              returnKeyType="next"
              onSubmitEditing={() => durationRef.current?.focus()}
              blurOnSubmit={false}
            />

            <SelectChips
              label="EXAM CATEGORY"
              options={examOptions}
              multiple
              value={form.examCategoryIds.length ? form.examCategoryIds : [GENERAL_VALUE]}
              onChange={(next) => setField("examCategoryIds", resolveCategorySelection(
                form.examCategoryIds.length ? form.examCategoryIds : [GENERAL_VALUE],
                next,
              ))}
              error={errors.examCategory}
            />
          </View>

          {/* Schedule & Fee */}
          <View style={s.section}>
            <SectionHead icon="calendar-outline" title="Schedule & Fee" color={colors.primary} />

            <FormField
              label="DURATION (MONTHS)"
              value={form.durationMonths}
              onChangeText={(v) => setField("durationMonths", v.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 12"
              keyboardType="number-pad"
              error={errors.durationMonths}
              required
              icon="time-outline"
              hint="Enter number of months (1 – 60)"
              returnKeyType="next"
              onSubmitEditing={() => feeRef.current?.focus()}
              blurOnSubmit={false}
            />

            <FormField
              label="DEFAULT FEE (₹)"
              value={form.defaultFee}
              onChangeText={(v) => setField("defaultFee", v.replace(/[^0-9.]/g, ""))}
              placeholder="e.g. 15000"
              keyboardType="decimal-pad"
              error={errors.defaultFee}
              required
              icon="wallet-outline"
              hint="This fee will be the default for new enrollments"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {errors.submit && (
            <View style={s.submitError}>
              <Text style={s.submitErrorT}>{errors.submit}</Text>
            </View>
          )}
        </ScrollView>

        <View style={s.footer}>
          <PrimaryButton
            label="Create Course"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            icon="checkmark-circle-outline"
          />
          {isDirty && !loading && (
            <PrimaryButton
              label="Reset Form"
              onPress={handleReset}
              variant="outline"
              icon="refresh-outline"
            />
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Full-screen loader overlay ─────────────────────────────── */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderTitle}>Creating Course…</Text>
            <Text style={s.loaderSub}>Please wait a moment</Text>
          </View>
        </View>
      )}

      {/* ── Full-screen success card ──────────────────────────────── */}
      {createdCourse !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>

            {/* Animated checkmark */}
            <Animated.View style={[s.checkWrap, { transform: [{ scale: checkScale }] }]}>
              <LinearGradient
                colors={[C.green, "#16A085"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.checkCircle}
              >
                <Ionicons name="checkmark" size={ms(44)} color="#fff" />
              </LinearGradient>
            </Animated.View>

            <Text style={s.successTitle}>Course Created!</Text>
            <Text style={s.successSub}>Your course has been added successfully</Text>

            {/* Details */}
            <View style={s.detailBox}>
              <DetailRow icon="book-outline"   label="Course Name" value={createdCourse.name} color={colors.primary} />
              <DetailRow icon="layers-outline" label="Category"    value={createdCourse.examCategories.length ? createdCourse.examCategories.map((c) => c.label).join(", ") : "General (All Categories)"} color={C.blue} />
              <DetailRow icon="time-outline"   label="Duration"    value={`${createdCourse.durationMonths} months`} color={C.orange} />
              <DetailRow icon="wallet-outline" label="Default Fee" value={`₹${createdCourse.defaultFee.toLocaleString("en-IN")}`} color={C.green} last />
            </View>

            {/* CTA button */}
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
              <View style={[s.doneBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="list-outline" size={ms(18)} color="#fff" />
                <Text style={s.doneBtnT}>View All Courses</Text>
              </View>
            </TouchableOpacity>

          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

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

function DetailRow({
  icon, label, value, color, last = false,
}: {
  icon: string; label: string; value: string; color: string; last?: boolean;
}) {
  return (
    <View style={[dr.row, !last && dr.rowBorder]}>
      <View style={[dr.iconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(14)} color={color} />
      </View>
      <View style={dr.textWrap}>
        <Text style={dr.label}>{label}</Text>
        <Text style={dr.value} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

const dr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(10), gap: ms(12) },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  iconWrap:  { width: ms(32), height: ms(32), borderRadius: ms(8), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  textWrap:  { flex: 1 },
  label:     { ...T.sectionHeading, color: C.muted, marginBottom: ms(1) },
  value:     { ...T.listItemTitle, color: C.text },
});

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.screenBg },
  flex:          { flex: 1 },
  scroll:        { flex: 1, backgroundColor: colors.screenBg },
  scrollContent: { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(20) },

  section:       { backgroundColor: C.card, borderRadius: ms(18), padding: ms(14), marginBottom: ms(12), shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  submitError:   { backgroundColor: "#FEF0EE", borderRadius: ms(12), borderWidth: 1, borderColor: "#F5C6C0", padding: ms(14), marginBottom: ms(16) },
  submitErrorT:  { ...T.body, color: C.red },

  footer:        { gap: ms(12), paddingHorizontal: ms(20), paddingTop: ms(12), paddingBottom: ms(14), backgroundColor: colors.screenBg, borderTopWidth: 1, borderTopColor: C.border },

  // Full-screen loader
  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg + "EE", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { ...T.cardTitle, color: C.text, marginTop: ms(4) },
  loaderSub:     { ...T.bodySmall, color: C.muted },

  // Full-screen success
  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successCard:    { width: "100%", backgroundColor: C.card, borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },

  checkWrap:     { marginBottom: ms(20) },
  checkCircle:   { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },

  successTitle:  { ...T.displayMedium, color: C.text, marginBottom: ms(6) },
  successSub:    { ...T.body, color: C.muted, marginBottom: ms(24), textAlign: "center" },

  detailBox:     { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(24), borderWidth: 1, borderColor: C.border },

  doneBtnWrap:   { width: "100%" },
  doneBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  doneBtnT:      { ...T.buttonText, color: "#FFFFFF" },
});

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  TextInput,
  Animated,
  ActivityIndicator,
  TouchableOpacity,
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
import { updateCourse } from "../../api/courses";
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { ms, fs } from "../../utils/responsive";
import { useAlert } from "../../context/AlertContext";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "EditCourse">;

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

interface UpdatedCourse {
  name: string;
  examCategories: ExamCategoryItem[];
  durationMonths: number;
  defaultFee: number;
}

// "General" and specific categories are mutually exclusive — see the same
// helper in CreateCourseScreen.tsx for the reasoning.
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

export function EditCourseScreen({ navigation, route }: Props) {
  const { showConfirm } = useAlert();
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { course } = route.params;

  const initialForm: FormState = {
    name:            course.name,
    examCategoryIds: course.examCategories.map((c) => c.id),
    durationMonths:  String(course.durationMonths),
    defaultFee:      String(course.defaultFee),
  };

  const [form, setForm]               = useState<FormState>(initialForm);
  const [errors, setErrors]           = useState<FormErrors>({});
  const [loading, setLoading]         = useState(false);
  const [updatedCourse, setUpdatedCourse] = useState<UpdatedCourse | null>(null);
  const [categories, setCategories]   = useState<ExamCategoryItem[]>([]);

  useEffect(() => {
    listExamCategories().then(setCategories).catch(() => {});
  }, []);

  const examOptions = [
    { label: "General (All Categories)", value: GENERAL_VALUE, color: "#8A7F82" },
    ...categories.map((c) => ({ label: c.label, value: c.id, color: c.color })),
  ];

  const durationRef = useRef<TextInput>(null);
  const feeRef      = useRef<TextInput>(null);
  const checkScale  = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(ms(60))).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  function showSuccessCard(updated: UpdatedCourse) {
    setUpdatedCourse(updated);
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 70, friction: 7, delay: 100 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(cardSlide,  { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 60 }),
    ]).start();
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  const sortedCategoryIds        = useMemo(() => [...form.examCategoryIds].sort(), [form.examCategoryIds]);
  const initialSortedCategoryIds = useMemo(() => [...initialForm.examCategoryIds].sort(), [initialForm.examCategoryIds]);
  const categoriesChanged =
    sortedCategoryIds.length !== initialSortedCategoryIds.length ||
    sortedCategoryIds.some((id, i) => id !== initialSortedCategoryIds[i]);

  const isDirty =
    form.name           !== initialForm.name ||
    categoriesChanged ||
    form.durationMonths !== initialForm.durationMonths ||
    form.defaultFee     !== initialForm.defaultFee;

  async function handleSubmit() {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});

    try {
      const result = await updateCourse(course.id, {
        name:            form.name.trim(),
        examCategoryIds: form.examCategoryIds,
        durationMonths:  Number(form.durationMonths),
        defaultFee:      Number(form.defaultFee),
      });

      if (!result.ok) {
        if ("conflict" in result) { setErrors({ name: result.message }); return; }
        if ("notFound" in result) { setErrors({ submit: "Course not found. It may have been deleted." }); return; }
      } else {
        showSuccessCard({
          name:           result.course.name,
          examCategories: result.course.examCategories,
          durationMonths: result.course.durationMonths,
          defaultFee:     result.course.defaultFee,
        });
      }
    } catch {
      setErrors({ submit: "Network error — please check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (isDirty) {
      showConfirm("Discard Changes?", "You have unsaved changes. Are you sure you want to go back?", () => navigation.goBack(), { confirmLabel: "Discard", cancelLabel: "Stay", destructive: true });
    } else {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScreenHeader title="Edit Course" onBack={handleBack} />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Basic Info */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionDot} />
              <Text style={s.sectionTitle}>Basic Information</Text>
            </View>

            <FormField
              label="COURSE NAME"
              value={form.name}
              onChangeText={(v) => setField("name", v)}
              placeholder="e.g. SSC CGL Complete Course"
              error={errors.name}
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
            <View style={s.sectionHeader}>
              <View style={s.sectionDot} />
              <Text style={s.sectionTitle}>Schedule & Fee</Text>
            </View>

            <FormField
              label="DURATION (MONTHS)"
              value={form.durationMonths}
              onChangeText={(v) => setField("durationMonths", v.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 12"
              keyboardType="number-pad"
              error={errors.durationMonths}
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

          {/* Changed-fields preview */}
          {isDirty && (
            <View style={s.preview}>
              <Text style={s.previewTitle}>Changes Preview</Text>
              <View style={s.previewRow}>
                <Text style={s.previewKey}>Name</Text>
                <Text style={s.previewVal} numberOfLines={1}>{form.name.trim() || "—"}</Text>
              </View>
              <View style={s.previewRow}>
                <Text style={s.previewKey}>Category</Text>
                <Text style={s.previewVal}>
                  {form.examCategoryIds.length
                    ? form.examCategoryIds.map((id) => examOptions.find((o) => o.value === id)?.label ?? "—").join(", ")
                    : "General (All Categories)"}
                </Text>
              </View>
              <View style={s.previewRow}>
                <Text style={s.previewKey}>Duration</Text>
                <Text style={s.previewVal}>{form.durationMonths ? `${form.durationMonths} months` : "—"}</Text>
              </View>
              <View style={[s.previewRow, { borderBottomWidth: 0 }]}>
                <Text style={s.previewKey}>Default Fee</Text>
                <Text style={s.previewVal}>{form.defaultFee ? `₹${Number(form.defaultFee).toLocaleString("en-IN")}` : "—"}</Text>
              </View>
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
                onPress={() => { setForm(initialForm); setErrors({}); }}
                variant="outline"
                icon="refresh-outline"
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Full-screen loader */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderTitle}>Saving Changes…</Text>
            <Text style={s.loaderSub}>Please wait a moment</Text>
          </View>
        </View>
      )}

      {/* Full-screen success card */}
      {updatedCourse !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>

            <Animated.View style={[s.checkWrap, { transform: [{ scale: checkScale }] }]}>
              <LinearGradient
                colors={["#2563A8", "#1A4F8A"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.checkCircle}
              >
                <Ionicons name="pencil" size={ms(38)} color="#fff" />
              </LinearGradient>
            </Animated.View>

            <Text style={s.successTitle}>Course Updated!</Text>
            <Text style={s.successSub}>Changes have been saved successfully</Text>

            <View style={s.detailBox}>
              <DetailRow icon="book-outline"   label="Course Name" value={updatedCourse.name} color={colors.primary} />
              <DetailRow icon="layers-outline" label="Category"    value={updatedCourse.examCategories.length ? updatedCourse.examCategories.map((c) => c.label).join(", ") : "General (All Categories)"} color="#2563A8" />
              <DetailRow icon="time-outline"   label="Duration"    value={`${updatedCourse.durationMonths} months`} color="#E8752C" />
              <DetailRow icon="wallet-outline" label="Default Fee" value={`₹${updatedCourse.defaultFee.toLocaleString("en-IN")}`} color="#1B9C63" last />
            </View>

            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
              <LinearGradient
                colors={[colors.primary, "#A52341"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.doneBtn}
              >
                <Ionicons name="list-outline" size={ms(18)} color="#fff" />
                <Text style={s.doneBtnT}>View All Courses</Text>
              </LinearGradient>
            </TouchableOpacity>

          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

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
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  iconWrap:  { width: ms(32), height: ms(32), borderRadius: ms(8), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  textWrap:  { flex: 1 },
  label:     { fontSize: fs(10), color: "#8A7F82", fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: ms(1) },
  value:     { fontSize: fs(13), color: "#2B1B1F", fontWeight: "700" },
});

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.primary },
  flex:          { flex: 1 },
  scroll:        { flex: 1, backgroundColor: "#FFFBF0" },
  scrollContent: { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(40) },

  section:       { backgroundColor: "#FFFFFF", borderRadius: ms(18), padding: ms(18), marginBottom: ms(16), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(18) },
  sectionDot:    { width: ms(4), height: ms(18), borderRadius: ms(2), backgroundColor: colors.primary },
  sectionTitle:  { fontSize: fs(12), fontWeight: "800", color: "#8A7F82", letterSpacing: 1, textTransform: "uppercase" },

  submitError:   { backgroundColor: "#FEF0EE", borderRadius: ms(12), borderWidth: 1, borderColor: "#F5C6C0", padding: ms(14), marginBottom: ms(16) },
  submitErrorT:  { fontSize: fs(13), color: "#C0392B", lineHeight: fs(18) },

  preview:       { backgroundColor: "#FFFFFF", borderRadius: ms(18), padding: ms(18), marginBottom: ms(20), borderWidth: 1.5, borderColor: "#EDE8E3" },
  previewTitle:  { fontSize: fs(11), fontWeight: "800", color: "#2563A8", letterSpacing: 1, textTransform: "uppercase", marginBottom: ms(12) },
  previewRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: ms(8), borderBottomWidth: 1, borderBottomColor: "#F5F0EA" },
  previewKey:    { fontSize: fs(12), color: "#8A7F82", fontWeight: "600" },
  previewVal:    { fontSize: fs(13), color: "#2B1B1F", fontWeight: "700", flex: 1, textAlign: "right", marginLeft: ms(12) },

  buttonGroup:   { gap: ms(12) },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,251,240,0.96)", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: "#FFFFFF", borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F", marginTop: ms(4) },
  loaderSub:     { fontSize: fs(12), color: "#8A7F82" },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFBF0", justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successCard:    { width: "100%", backgroundColor: "#FFFFFF", borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },

  checkWrap:     { marginBottom: ms(20) },
  checkCircle:   { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },

  successTitle:  { fontSize: fs(22), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(6) },
  successSub:    { fontSize: fs(13), color: "#8A7F82", marginBottom: ms(24), textAlign: "center" },

  detailBox:     { width: "100%", backgroundColor: "#FAFAFA", borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(24), borderWidth: 1, borderColor: "#F0EDE8" },

  doneBtnWrap:   { width: "100%" },
  doneBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  doneBtnT:      { fontSize: fs(15), fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
});

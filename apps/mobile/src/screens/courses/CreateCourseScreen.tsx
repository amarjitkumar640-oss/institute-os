import React, { useRef, useState } from "react";
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
import { createCourse, type ExamCategory } from "../../api/courses";
import { ms, fs } from "../../utils/responsive";
import { useAlert } from "../../context/AlertContext";

type Props = NativeStackScreenProps<RootStackParamList, "CreateCourse">;

interface FormState {
  name: string;
  examCategory: ExamCategory | "";
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
  examCategory: ExamCategory;
  durationMonths: number;
  defaultFee: number;
}

const EXAM_OPTIONS = [
  { label: "SSC",        value: "ssc",        color: "#8B1E3F" },
  { label: "Banking",    value: "banking",     color: "#2563A8" },
  { label: "Railway",    value: "railway",     color: "#1B9C63" },
  { label: "Foundation", value: "foundation",  color: "#7B3FA0" },
];

const CATEGORY_LABEL: Record<string, string> = {
  ssc: "SSC", banking: "Banking", railway: "Railway", foundation: "Foundation",
};

const INITIAL_FORM: FormState = {
  name: "", examCategory: "", durationMonths: "", defaultFee: "",
};

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Course name is required.";
  else if (name.length > 120) errors.name = "Course name must be 120 characters or fewer.";

  if (!form.examCategory) errors.examCategory = "Please select an exam category.";

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
  const [form, setForm]               = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors]           = useState<FormErrors>({});
  const [loading, setLoading]         = useState(false);
  const [createdCourse, setCreatedCourse] = useState<CreatedCourse | null>(null);

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
        name:           form.name.trim(),
        examCategory:   form.examCategory as ExamCategory,
        durationMonths: Number(form.durationMonths),
        defaultFee:     Number(form.defaultFee),
      });

      if (!result.ok) {
        setErrors({ name: result.message });
        return;
      }

      showSuccessCard({
        name:           result.course.name,
        examCategory:   result.course.examCategory,
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
    form.name !== "" || form.examCategory !== "" ||
    form.durationMonths !== "" || form.defaultFee !== "";

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

      <ScreenHeader title="New Course" onBack={handleBack} />

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
              options={EXAM_OPTIONS}
              value={form.examCategory || undefined}
              onChange={(v) => setField("examCategory", v as ExamCategory)}
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

          <View style={s.buttonGroup}>
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
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Full-screen loader overlay ─────────────────────────────── */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color="#8B1E3F" />
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
                colors={["#1B9C63", "#16A085"]}
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
              <DetailRow icon="book-outline"   label="Course Name" value={createdCourse.name} color="#8B1E3F" />
              <DetailRow icon="layers-outline" label="Category"    value={CATEGORY_LABEL[createdCourse.examCategory] ?? createdCourse.examCategory} color="#2563A8" />
              <DetailRow icon="time-outline"   label="Duration"    value={`${createdCourse.durationMonths} months`} color="#E8752C" />
              <DetailRow icon="wallet-outline" label="Default Fee" value={`₹${createdCourse.defaultFee.toLocaleString("en-IN")}`} color="#1B9C63" last />
            </View>

            {/* CTA button */}
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
              <LinearGradient
                colors={["#8B1E3F", "#A52341"]}
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

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: "#8B1E3F" },
  flex:          { flex: 1 },
  scroll:        { flex: 1, backgroundColor: "#FFFBF0" },
  scrollContent: { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(20) },

  section:       { backgroundColor: "#FFFFFF", borderRadius: ms(18), padding: ms(14), marginBottom: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(12) },
  sectionDot:    { width: ms(4), height: ms(18), borderRadius: ms(2), backgroundColor: "#8B1E3F" },
  sectionTitle:  { fontSize: fs(12), fontWeight: "800", color: "#8A7F82", letterSpacing: 1, textTransform: "uppercase" },

  submitError:   { backgroundColor: "#FEF0EE", borderRadius: ms(12), borderWidth: 1, borderColor: "#F5C6C0", padding: ms(14), marginBottom: ms(16) },
  submitErrorT:  { fontSize: fs(13), color: "#C0392B", lineHeight: fs(18) },

  buttonGroup:   { gap: ms(12) },

  // Full-screen loader
  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,251,240,0.96)", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: "#FFFFFF", borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F", marginTop: ms(4) },
  loaderSub:     { fontSize: fs(12), color: "#8A7F82" },

  // Full-screen success
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

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Animated,
  ActivityIndicator, TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { KeyboardAvoidingScroll } from "../../components/ui/KeyboardAvoidingScroll";
import { FormField } from "../../components/ui/FormField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { CenterPickerSheet } from "../../components/ui/CenterPickerSheet";
import { T } from "../../components/ui/typography";
import { createFaculty } from "../../api/faculty";
import { listSubjects, type SubjectItem } from "../../api/subjects";
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { ms, fs } from "../../utils/responsive";
import { useAlert } from "../../context/AlertContext";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "CreateFaculty">;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function autoFormatDate(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function parseDisplayDate(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const num_d = +dd, num_m = +mm, num_y = +yyyy;
  if (num_m < 1 || num_m > 12 || num_d < 1 || num_d > 31 || num_y < 1950 || num_y > 2099) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Form types ───────────────────────────────────────────────────────────────

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  qualification: string;
  experienceYears: string;
  joiningDate: string; // "DD/MM/YYYY" display format
}

interface FormErrors {
  fullName?: string;
  phone?: string;
  email?: string;
  qualification?: string;
  experienceYears?: string;
  joiningDate?: string;
  submit?: string;
}

interface CreatedFaculty {
  employeeCode: string;
  fullName: string;
  qualification: string;
  experienceYears: number;
  subjectCount: number;
}

const INITIAL_FORM: FormState = {
  fullName: "", phone: "", email: "",
  qualification: "", experienceYears: "", joiningDate: "",
};

function validate(form: FormState, selectedIds: Set<string>): FormErrors {
  const errors: FormErrors = {};
  if (!form.fullName.trim()) errors.fullName = "Full name is required.";
  else if (form.fullName.trim().length > 120) errors.fullName = "Name must be 120 characters or fewer.";

  if (!form.phone.trim()) errors.phone = "Phone number is required.";
  else if (!/^\d{7,15}$/.test(form.phone.trim())) errors.phone = "Enter a valid phone number (digits only, 7–15 digits).";

  if (!form.email.trim()) errors.email = "Email address is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address.";

  if (!form.qualification.trim()) errors.qualification = "Qualification is required.";

  const exp = Number(form.experienceYears);
  if (form.experienceYears.trim() === "") errors.experienceYears = "Experience is required.";
  else if (!Number.isInteger(exp) || exp < 0 || exp > 50) errors.experienceYears = "Enter a whole number between 0 and 50.";

  if (!form.joiningDate.trim()) errors.joiningDate = "Joining date is required.";
  else if (!parseDisplayDate(form.joiningDate)) errors.joiningDate = "Enter a valid date in DD/MM/YYYY format.";

  return errors;
}

// ─── Subject Picker ───────────────────────────────────────────────────────────

function SubjectPicker({
  subjects, categories, loading, selectedIds, onToggle,
}: {
  subjects: SubjectItem[];
  categories: ExamCategoryItem[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const colors = useThemeColors();
  const groups = useMemo(() => {
    const totalCats = categories.length;
    // Shared: uncategorised (0) OR linked to every exam category
    const sharedItems = subjects.filter(
      (s) => s.examCategories.length === 0 || (totalCats > 0 && s.examCategories.length === totalCats)
    );
    const sharedSet = new Set(sharedItems.map((s) => s.id));
    // Subjects with 1 to (N-1) categories appear under each of their categories (accurate, may duplicate)
    const catGroups = categories.map((c) => ({
      key:   c.id,
      label: c.label,
      color: c.color,
      items: subjects.filter((s) => !sharedSet.has(s.id) && s.examCategories.some((ec) => ec.id === c.id)),
    }));
    return [
      { key: "shared", label: "Shared (All Exams)", color: C.orange, items: sharedItems },
      ...catGroups,
    ];
  }, [subjects, categories]);

  if (loading) {
    return (
      <View style={sp.center}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={sp.loadingT}>Loading subjects…</Text>
      </View>
    );
  }

  function renderGroup(key: string, label: string, items: SubjectItem[], color: string) {
    if (items.length === 0) return null;
    return (
      <View key={key} style={sp.group}>
        <View style={sp.groupLabel}>
          <Text style={[sp.groupLabelT, { color }]}>{label}</Text>
        </View>
        <View style={sp.chipRow}>
          {items.map((s) => {
            const active = selectedIds.has(s.id);
            return (
              <TouchableOpacity
                key={s.id}
                style={[sp.chip, active && { backgroundColor: color, borderColor: color }]}
                onPress={() => onToggle(s.id)}
                activeOpacity={0.75}
              >
                {active && <Ionicons name="checkmark" size={ms(11)} color="#fff" />}
                <Text style={[sp.chipT, active && sp.chipTActive]} numberOfLines={2}>
                  {s.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={sp.wrap}>
      {groups.map((g) => renderGroup(g.key, g.label, g.items, g.color))}
    </View>
  );
}

const sp = StyleSheet.create({
  wrap:        { gap: ms(16) },
  center:      { alignItems: "center", paddingVertical: ms(20), gap: ms(8) },
  loadingT:    { ...T.bodySmall, color: C.muted },
  group:       { gap: ms(10) },
  groupLabel:  { paddingLeft: ms(8) },
  groupLabelT: { ...T.sectionHeading, letterSpacing: 0.5 },
  chipRow:     { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  chip:        { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(10), paddingVertical: ms(7), borderRadius: ms(8), backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  chipT:       { ...T.chipText, color: C.muted, flexShrink: 1 },
  chipTActive: { color: "#FFFFFF" },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export function CreateFacultyScreen({ navigation }: Props) {
  const { showConfirm } = useAlert();
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);

  const [form, setForm]       = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors]   = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [createdFaculty, setCreatedFaculty] = useState<CreatedFaculty | null>(null);

  const [subjects, setSubjects]         = useState<SubjectItem[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [centerPickerVisible, setCenterPickerVisible] = useState(false);
  const [categories, setCategories]     = useState<ExamCategoryItem[]>([]);

  useEffect(() => {
    listExamCategories().then(setCategories).catch(() => {});
  }, []);

  const phoneRef  = useRef<TextInput>(null);
  const emailRef  = useRef<TextInput>(null);
  const qualRef   = useRef<TextInput>(null);
  const expRef    = useRef<TextInput>(null);
  const dateRef   = useRef<TextInput>(null);

  const checkScale  = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(ms(60))).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listSubjects()
      .then(setSubjects)
      .catch(() => {})
      .finally(() => setSubjectsLoading(false));
  }, []);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key as keyof FormErrors]) setErrors((p) => ({ ...p, [key]: undefined }));
  }

  function toggleSubject(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function showSuccessCard(f: CreatedFaculty) {
    setCreatedFaculty(f);
    Animated.parallel([
      Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7, delay: 100 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 60 }),
    ]).start();
  }

  async function handleSubmit(overrideCenterId?: string) {
    const errs = validate(form, selectedIds);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});
    try {
      const result = await createFaculty({
        fullName:        form.fullName.trim(),
        phone:           form.phone.trim(),
        email:           form.email.trim().toLowerCase(),
        qualification:   form.qualification.trim(),
        experienceYears: Number(form.experienceYears),
        joiningDate:     parseDisplayDate(form.joiningDate)!,
        subjectIds:      Array.from(selectedIds),
        ...(overrideCenterId ? { centerId: overrideCenterId } : {}),
      });
      if (!result.ok) {
        if ("conflict" in result) {
          setErrors({ [result.field]: result.message });
        }
        return;
      }
      showSuccessCard({
        employeeCode:    result.faculty.employeeCode,
        fullName:        result.faculty.fullName,
        qualification:   result.faculty.qualification,
        experienceYears: result.faculty.experienceYears,
        subjectCount:    result.faculty.subjects.length,
      });
    } catch (err: any) {
      if (
        err?.response?.status === 400 &&
        typeof err?.response?.data?.error === "string" &&
        err.response.data.error.includes("centerId") &&
        !overrideCenterId
      ) {
        // Only offer the fallback picker on the first attempt — if we already supplied
        // a centerId (manually or via the single-center auto-select) and it still
        // failed, retrying again would loop forever instead of surfacing the real problem.
        setCenterPickerVisible(true);
        return;
      }
      const message =
        err?.response?.data?.error ??
        (err?.code === "ERR_NETWORK" || err?.code === "ECONNREFUSED"
          ? "Cannot reach server. Check your network or API URL."
          : "Something went wrong. Please try again.");
      setErrors({ submit: message });
    } finally {
      setLoading(false);
    }
  }

  const isDirty = Object.values(form).some((v) => v !== "") || selectedIds.size > 0;

  function handleBack() {
    if (isDirty) {
      showConfirm("Discard Changes?", "You have unsaved changes. Go back?", () => navigation.goBack(), { confirmLabel: "Discard", cancelLabel: "Stay", brand: true, icon: "arrow-undo-outline" });
    } else {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="Add Faculty" onBack={handleBack} />

      <KeyboardAvoidingScroll
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        footer={
          <View style={s.footer}>
            <PrimaryButton label="Add Faculty" onPress={() => handleSubmit()} loading={loading} disabled={loading} icon="person-add-outline" />
          </View>
        }
      >

          {/* ── Personal Info ── */}
          <View style={s.section}>
            <SectionHead icon="person-outline" title="Personal Information" color={colors.primary} />
            <FormField label="FULL NAME" value={form.fullName} onChangeText={(v) => setField("fullName", v)}
              placeholder="e.g. Dr. Priya Sharma" error={errors.fullName} icon="person-outline" required
              maxLength={120} clearable returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="PHONE NUMBER" value={form.phone} onChangeText={(v) => setField("phone", v.replace(/\D/g, ""))}
              placeholder="e.g. 9876543210" keyboardType="phone-pad" error={errors.phone} icon="call-outline" required
              returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="EMAIL ADDRESS" value={form.email} onChangeText={(v) => setField("email", v)}
              placeholder="e.g. priya@institute.com" keyboardType="email-address" error={errors.email} icon="mail-outline" required
              returnKeyType="next" onSubmitEditing={() => qualRef.current?.focus()} blurOnSubmit={false} />
          </View>

          {/* ── Professional Info ── */}
          <View style={s.section}>
            <SectionHead icon="briefcase-outline" title="Professional Details" color={colors.primary} />
            <FormField label="QUALIFICATION" value={form.qualification} onChangeText={(v) => setField("qualification", v)}
              placeholder="e.g. M.Sc Mathematics, B.Ed" error={errors.qualification} icon="school-outline" required
              maxLength={200} clearable returnKeyType="next" onSubmitEditing={() => expRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="EXPERIENCE (YEARS)" value={form.experienceYears}
              onChangeText={(v) => setField("experienceYears", v.replace(/\D/g, ""))}
              placeholder="e.g. 5" keyboardType="number-pad" error={errors.experienceYears} icon="briefcase-outline" required
              hint="Total years of teaching experience" returnKeyType="next" onSubmitEditing={() => dateRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="JOINING DATE" value={form.joiningDate}
              onChangeText={(v) => setField("joiningDate", autoFormatDate(v))}
              placeholder="DD/MM/YYYY" keyboardType="number-pad" error={errors.joiningDate} required
              icon="calendar-outline" hint="Date faculty joined the institute"
              returnKeyType="done" onSubmitEditing={() => handleSubmit()} />
          </View>

          {/* ── Subjects ── */}
          <View style={s.section}>
            <SectionHead icon="book-outline" title="Subjects to Teach" color={colors.primary} />
            <Text style={s.subjectHint}>Select subjects this faculty member is qualified to teach.</Text>
            <SubjectPicker
              subjects={subjects}
              categories={categories}
              loading={subjectsLoading}
              selectedIds={selectedIds}
              onToggle={toggleSubject}
            />
            {selectedIds.size > 0 && (
              <Text style={s.selectedCount}>{selectedIds.size} subject{selectedIds.size > 1 ? "s" : ""} selected</Text>
            )}
          </View>

          {errors.submit && (
            <View style={s.submitError}>
              <Text style={s.submitErrorT}>{errors.submit}</Text>
            </View>
          )}

      </KeyboardAvoidingScroll>

      {/* Full-screen loader */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderTitle}>Adding Faculty…</Text>
            <Text style={s.loaderSub}>Please wait a moment</Text>
          </View>
        </View>
      )}

      {/* Full-screen success card */}
      {createdFaculty !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>
            <Animated.View style={{ transform: [{ scale: checkScale }], marginBottom: ms(20) }}>
              <LinearGradient colors={[C.green, "#16A085"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
                <Ionicons name="checkmark" size={ms(44)} color="#fff" />
              </LinearGradient>
            </Animated.View>

            <Text style={s.successTitle}>Faculty Added!</Text>
            <Text style={s.successSub}>The faculty member has been registered successfully</Text>

            <View style={s.detailBox}>
              <DetailRow icon="person-outline"   label="Name"          value={createdFaculty.fullName}                                  color={colors.primary} />
              <DetailRow icon="id-card-outline"  label="Employee Code" value={createdFaculty.employeeCode}                              color={C.blue} />
              <DetailRow icon="school-outline"   label="Qualification" value={createdFaculty.qualification}                             color={C.orange} />
              <DetailRow icon="briefcase-outline" label="Experience"   value={`${createdFaculty.experienceYears} year${createdFaculty.experienceYears !== 1 ? "s" : ""}`} color={colors.accent} />
              <DetailRow icon="book-outline"     label="Subjects"      value={`${createdFaculty.subjectCount} subject${createdFaculty.subjectCount !== 1 ? "s" : ""} assigned`} color={C.green} last />
            </View>

            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
              <View style={[s.doneBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="people-outline" size={ms(18)} color="#fff" />
                <Text style={s.doneBtnT}>View All Faculty</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      <CenterPickerSheet
        visible={centerPickerVisible}
        onClose={() => setCenterPickerVisible(false)}
        onSelect={(centerId) => {
          setCenterPickerVisible(false);
          handleSubmit(centerId);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

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
  wrap:    { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(16) },
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
  scrollContent: { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(40) },

  section:       { backgroundColor: C.card, borderRadius: ms(18), padding: ms(18), marginBottom: ms(16), shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  subjectHint:   { ...T.bodySmall, color: C.muted, marginBottom: ms(14) },
  selectedCount: { ...T.chipText, color: C.green, marginTop: ms(14), textAlign: "center" },

  submitError:   { backgroundColor: C.red + "0F", borderRadius: ms(12), borderWidth: 1, borderColor: C.red + "30", padding: ms(14), marginBottom: ms(16) },
  submitErrorT:  { ...T.body, color: C.red },
  footer:        { gap: ms(12), paddingHorizontal: ms(20), paddingTop: ms(12), paddingBottom: ms(14), backgroundColor: colors.screenBg, borderTopWidth: 1, borderTopColor: C.border },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg + "EE", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { ...T.cardTitle, color: C.text, marginTop: ms(4) },
  loaderSub:     { ...T.bodySmall, color: C.muted },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successCard:    { width: "100%", backgroundColor: C.card, borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { ...T.displayMedium, color: C.text, marginBottom: ms(6) },
  successSub:     { ...T.body, color: C.muted, marginBottom: ms(24), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(24), borderWidth: 1, borderColor: C.border },
  doneBtnWrap:    { width: "100%" },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  doneBtnT:       { ...T.buttonText, color: "#FFFFFF" },
});

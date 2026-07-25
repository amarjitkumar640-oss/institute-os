import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, StatusBar, TextInput, Animated,
  ActivityIndicator, TouchableOpacity, Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { updateFaculty } from "../../api/faculty";
import { listSubjects, type SubjectItem } from "../../api/subjects";
import { ms, fs } from "../../utils/responsive";
import { useAlert } from "../../context/AlertContext";

type Props = NativeStackScreenProps<RootStackParamList, "EditFaculty">;

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
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31 || +yyyy < 1950 || +yyyy > 2099) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  qualification: string;
  experienceYears: string;
  joiningDate: string; // DD/MM/YYYY display
  isActive: boolean;
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

interface UpdatedFaculty {
  employeeCode: string;
  fullName: string;
  qualification: string;
  experienceYears: number;
  subjectCount: number;
  isActive: boolean;
}

function validate(form: FormState): FormErrors {
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

// ─── Subject Picker (same logic as Create) ───────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  ssc: "#8B1E3F", banking: "#2563A8", railway: "#2CA6A4",
};
const CAT_LABEL: Record<string, string> = {
  shared: "Shared (All Exams)", ssc: "SSC", banking: "Banking", railway: "Railway",
};

function SubjectPicker({
  subjects, loading, selectedIds, onToggle,
}: {
  subjects: SubjectItem[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const grouped = useMemo(() => ({
    shared:  subjects.filter((s) => s.examCategory === null),
    ssc:     subjects.filter((s) => s.examCategory === "ssc"),
    banking: subjects.filter((s) => s.examCategory === "banking"),
    railway: subjects.filter((s) => s.examCategory === "railway"),
  }), [subjects]);

  if (loading) {
    return (
      <View style={sp.center}>
        <ActivityIndicator size="small" color="#8B1E3F" />
        <Text style={sp.loadingT}>Loading subjects…</Text>
      </View>
    );
  }

  function renderGroup(key: string, items: SubjectItem[], color: string) {
    if (items.length === 0) return null;
    return (
      <View key={key} style={sp.group}>
        <View style={[sp.groupLabel, { borderLeftColor: color }]}>
          <Text style={[sp.groupLabelT, { color }]}>{CAT_LABEL[key]}</Text>
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
      {renderGroup("shared",  grouped.shared,  "#E8752C")}
      {renderGroup("ssc",     grouped.ssc,     "#8B1E3F")}
      {renderGroup("banking", grouped.banking, "#2563A8")}
      {renderGroup("railway", grouped.railway, "#2CA6A4")}
    </View>
  );
}

const sp = StyleSheet.create({
  wrap:        { gap: ms(16) },
  center:      { alignItems: "center", paddingVertical: ms(20), gap: ms(8) },
  loadingT:    { fontSize: fs(12), color: "#8A7F82" },
  group:       { gap: ms(10) },
  groupLabel:  { borderLeftWidth: ms(3), paddingLeft: ms(8) },
  groupLabelT: { fontSize: fs(11), fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  chipRow:     { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  chip:        { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(10), paddingVertical: ms(7), borderRadius: ms(8), backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#E0D8D4" },
  chipT:       { fontSize: fs(12), fontWeight: "600", color: "#8A7F82", flexShrink: 1 },
  chipTActive: { color: "#FFFFFF" },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export function EditFacultyScreen({ navigation, route }: Props) {
  const { showConfirm } = useAlert();
  const { faculty } = route.params;

  const initialForm: FormState = {
    fullName:        faculty.fullName,
    phone:           faculty.phone,
    email:           faculty.email,
    qualification:   faculty.qualification,
    experienceYears: String(faculty.experienceYears),
    joiningDate:     isoToDisplay(faculty.joiningDate),
    isActive:        faculty.isActive,
  };
  const initialSubjectIds = new Set(faculty.subjects.map((s) => s.id));

  const [form, setForm]         = useState<FormState>(initialForm);
  const [errors, setErrors]     = useState<FormErrors>({});
  const [loading, setLoading]   = useState(false);
  const [updatedFaculty, setUpdatedFaculty] = useState<UpdatedFaculty | null>(null);

  const [subjects, setSubjects]               = useState<SubjectItem[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set(initialSubjectIds));

  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const qualRef  = useRef<TextInput>(null);
  const expRef   = useRef<TextInput>(null);
  const dateRef  = useRef<TextInput>(null);

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

  // Compare current vs initial to detect changes
  const setsEqual = (a: Set<string>, b: Set<string>) =>
    a.size === b.size && [...a].every((v) => b.has(v));

  const isDirty =
    form.fullName        !== initialForm.fullName        ||
    form.phone           !== initialForm.phone           ||
    form.email           !== initialForm.email           ||
    form.qualification   !== initialForm.qualification   ||
    form.experienceYears !== initialForm.experienceYears ||
    form.joiningDate     !== initialForm.joiningDate     ||
    form.isActive        !== initialForm.isActive        ||
    !setsEqual(selectedIds, initialSubjectIds);

  function showSuccessCard(f: UpdatedFaculty) {
    setUpdatedFaculty(f);
    Animated.parallel([
      Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7, delay: 100 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 60 }),
    ]).start();
  }

  async function handleSubmit() {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});
    try {
      const result = await updateFaculty(faculty.id, {
        fullName:        form.fullName.trim(),
        phone:           form.phone.trim(),
        email:           form.email.trim().toLowerCase(),
        qualification:   form.qualification.trim(),
        experienceYears: Number(form.experienceYears),
        joiningDate:     parseDisplayDate(form.joiningDate)!,
        isActive:        form.isActive,
        subjectIds:      Array.from(selectedIds),
      });
      if (!result.ok) {
        if ("conflict" in result) setErrors({ [result.field]: result.message });
        else if ("notFound" in result) setErrors({ submit: "Faculty not found. It may have been deleted." });
        return;
      }
      showSuccessCard({
        employeeCode:    result.faculty.employeeCode,
        fullName:        result.faculty.fullName,
        qualification:   result.faculty.qualification,
        experienceYears: result.faculty.experienceYears,
        subjectCount:    result.faculty.subjects.length,
        isActive:        result.faculty.isActive,
      });
    } catch (err: any) {
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

  function handleBack() {
    if (isDirty) {
      showConfirm("Discard Changes?", "You have unsaved changes. Go back?", () => navigation.goBack(), { confirmLabel: "Discard", cancelLabel: "Stay", destructive: true });
    } else {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="Edit Faculty" onBack={handleBack} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Personal Info ── */}
          <View style={s.section}>
            <SectionHead dot="#8B1E3F" title="Personal Information" />
            <FormField label="FULL NAME" value={form.fullName} onChangeText={(v) => setField("fullName", v)}
              placeholder="e.g. Dr. Priya Sharma" error={errors.fullName} icon="person-outline"
              maxLength={120} clearable returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="PHONE NUMBER" value={form.phone} onChangeText={(v) => setField("phone", v.replace(/\D/g, ""))}
              placeholder="e.g. 9876543210" keyboardType="phone-pad" error={errors.phone} icon="call-outline"
              returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="EMAIL ADDRESS" value={form.email} onChangeText={(v) => setField("email", v)}
              placeholder="e.g. priya@institute.com" keyboardType="email-address" error={errors.email} icon="mail-outline"
              returnKeyType="next" onSubmitEditing={() => qualRef.current?.focus()} blurOnSubmit={false} />
          </View>

          {/* ── Professional Info ── */}
          <View style={s.section}>
            <SectionHead dot="#8B1E3F" title="Professional Details" />
            <FormField label="QUALIFICATION" value={form.qualification} onChangeText={(v) => setField("qualification", v)}
              placeholder="e.g. M.Sc Mathematics, B.Ed" error={errors.qualification} icon="school-outline"
              maxLength={200} clearable returnKeyType="next" onSubmitEditing={() => expRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="EXPERIENCE (YEARS)" value={form.experienceYears}
              onChangeText={(v) => setField("experienceYears", v.replace(/\D/g, ""))}
              placeholder="e.g. 5" keyboardType="number-pad" error={errors.experienceYears} icon="briefcase-outline"
              hint="Total years of teaching experience" returnKeyType="next" onSubmitEditing={() => dateRef.current?.focus()} blurOnSubmit={false} />
            <FormField label="JOINING DATE" value={form.joiningDate}
              onChangeText={(v) => setField("joiningDate", autoFormatDate(v))}
              placeholder="DD/MM/YYYY" keyboardType="number-pad" error={errors.joiningDate}
              icon="calendar-outline" hint="Date faculty joined the institute" returnKeyType="done" />

            {/* Active / Inactive toggle */}
            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={s.toggleLabel}>ACTIVE STATUS</Text>
                <Text style={s.toggleSub}>
                  {form.isActive ? "Currently accepting assignments" : "Marked as inactive"}
                </Text>
              </View>
              <Switch
                value={form.isActive}
                onValueChange={(v) => setField("isActive", v)}
                trackColor={{ false: "#E0D8D4", true: "#1B9C6340" }}
                thumbColor={form.isActive ? "#1B9C63" : "#B0A9AC"}
              />
            </View>
          </View>

          {/* ── Subjects ── */}
          <View style={s.section}>
            <SectionHead dot="#8B1E3F" title="Subjects to Teach" />
            <Text style={s.subjectHint}>Tap to add or remove subjects.</Text>
            <SubjectPicker
              subjects={subjects}
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

          <View style={s.buttonGroup}>
            <PrimaryButton label="Save Changes" onPress={handleSubmit} loading={loading} disabled={loading || !isDirty} icon="checkmark-circle-outline" />
            {isDirty && !loading && (
              <PrimaryButton label="Reset Changes" onPress={() => { setForm(initialForm); setSelectedIds(new Set(initialSubjectIds)); setErrors({}); }} variant="outline" icon="refresh-outline" />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Full-screen loader */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color="#8B1E3F" />
            <Text style={s.loaderTitle}>Saving Changes…</Text>
            <Text style={s.loaderSub}>Please wait a moment</Text>
          </View>
        </View>
      )}

      {/* Full-screen success card */}
      {updatedFaculty !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>
            <Animated.View style={{ transform: [{ scale: checkScale }], marginBottom: ms(20) }}>
              <LinearGradient colors={["#2563A8", "#1A4F8A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
                <Ionicons name="pencil" size={ms(38)} color="#fff" />
              </LinearGradient>
            </Animated.View>

            <Text style={s.successTitle}>Faculty Updated!</Text>
            <Text style={s.successSub}>Changes have been saved successfully</Text>

            <View style={s.detailBox}>
              <DetailRow icon="person-outline"    label="Name"          value={updatedFaculty.fullName} color="#8B1E3F" />
              <DetailRow icon="id-card-outline"   label="Employee Code" value={updatedFaculty.employeeCode} color="#2563A8" />
              <DetailRow icon="school-outline"    label="Qualification" value={updatedFaculty.qualification} color="#E8752C" />
              <DetailRow icon="briefcase-outline" label="Experience"    value={`${updatedFaculty.experienceYears} year${updatedFaculty.experienceYears !== 1 ? "s" : ""}`} color="#2CA6A4" />
              <DetailRow icon="book-outline"      label="Subjects"      value={`${updatedFaculty.subjectCount} subject${updatedFaculty.subjectCount !== 1 ? "s" : ""} assigned`} color="#1B9C63" />
              <DetailRow icon="ellipse-outline"   label="Status"        value={updatedFaculty.isActive ? "Active" : "Inactive"} color={updatedFaculty.isActive ? "#1B9C63" : "#8A7F82"} last />
            </View>

            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
              <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.doneBtn}>
                <Ionicons name="people-outline" size={ms(18)} color="#fff" />
                <Text style={s.doneBtnT}>View All Faculty</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionHead({ dot, title }: { dot: string; title: string }) {
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
  scrollContent: { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(40) },

  section:       { backgroundColor: "#FFFFFF", borderRadius: ms(18), padding: ms(18), marginBottom: ms(16), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(18) },
  sectionDot:    { width: ms(4), height: ms(18), borderRadius: ms(2) },
  sectionTitle:  { fontSize: fs(12), fontWeight: "800", color: "#8A7F82", letterSpacing: 1, textTransform: "uppercase" },

  toggleRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: ms(6) },
  toggleInfo:    { flex: 1, marginRight: ms(12) },
  toggleLabel:   { fontSize: fs(12.5), fontWeight: "700", color: "#2B1B1F", letterSpacing: 0.3 },
  toggleSub:     { fontSize: fs(11.5), color: "#8A7F82", marginTop: ms(2) },

  subjectHint:   { fontSize: fs(12), color: "#8A7F82", marginBottom: ms(14) },
  selectedCount: { fontSize: fs(12), color: "#1B9C63", fontWeight: "700", marginTop: ms(14), textAlign: "center" },

  submitError:   { backgroundColor: "#FEF0EE", borderRadius: ms(12), borderWidth: 1, borderColor: "#F5C6C0", padding: ms(14), marginBottom: ms(16) },
  submitErrorT:  { fontSize: fs(13), color: "#C0392B", lineHeight: fs(18) },
  buttonGroup:   { gap: ms(12) },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,251,240,0.96)", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: "#FFFFFF", borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F", marginTop: ms(4) },
  loaderSub:     { fontSize: fs(12), color: "#8A7F82" },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFBF0", justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successCard:    { width: "100%", backgroundColor: "#FFFFFF", borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { fontSize: fs(22), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(6) },
  successSub:     { fontSize: fs(13), color: "#8A7F82", marginBottom: ms(24), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: "#FAFAFA", borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(24), borderWidth: 1, borderColor: "#F0EDE8" },
  doneBtnWrap:    { width: "100%" },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  doneBtnT:       { fontSize: fs(15), fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
});

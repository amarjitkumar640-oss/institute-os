import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TextInput, Animated, Keyboard,
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
import { listExamCategories, type ExamCategoryItem } from "../../api/examCategories";
import { fetchAllStaffDetailed, createStaffMember, type StaffMember } from "../../api/staff";
import { ms, fs } from "../../utils/responsive";
import { useAlert } from "../../context/AlertContext";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { C } from "../../theme";

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
  loadingT:    { fontSize: fs(12), color: C.muted },
  group:       { gap: ms(10) },
  groupLabel:  { paddingLeft: ms(8) },
  groupLabelT: { fontSize: fs(11), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  chipRow:     { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  chip:        { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(10), paddingVertical: ms(7), borderRadius: ms(8), backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  chipT:       { fontSize: fs(12), fontFamily: "Inter_600SemiBold", fontWeight: "600", color: C.muted, flexShrink: 1 },
  chipTActive: { color: "#FFFFFF" },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export function EditFacultyScreen({ navigation, route }: Props) {
  const { showConfirm } = useAlert();
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { faculty } = route.params;
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
  const [categories, setCategories]           = useState<ExamCategoryItem[]>([]);

  useEffect(() => {
    listExamCategories().then(setCategories).catch(() => {});
  }, []);

  // ── Login access (link this Faculty record to a Staff login) ────────────────
  const [staffList, setStaffList]         = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading]   = useState(true);
  const [linkedStaffId, setLinkedStaffId] = useState<string | null>(faculty.staffId);
  const [pickerOpen, setPickerOpen]       = useState(false);
  const [linking, setLinking]             = useState(false);
  const [linkError, setLinkError]         = useState("");

  const [createOpen, setCreateOpen]     = useState(false);
  const [newEmail, setNewEmail]         = useState(faculty.email);
  const [newPhone, setNewPhone]         = useState(faculty.phone);
  const [newPassword, setNewPassword]   = useState("");
  const [showNewPw, setShowNewPw]       = useState(false);
  const [creatingLogin, setCreatingLogin] = useState(false);

  useEffect(() => {
    fetchAllStaffDetailed()
      .then(setStaffList)
      .catch(() => {})
      .finally(() => setStaffLoading(false));
  }, []);

  const linkedStaff = staffList.find((m) => m.id === linkedStaffId) ?? null;
  const eligibleTeachers = staffList.filter(
    (m) => m.role === "teacher" && m.isActive && (!m.linkedFaculty || m.linkedFaculty.id === faculty.id)
  );

  async function handleLink(staffId: string | null) {
    setLinking(true);
    setLinkError("");
    try {
      const result = await updateFaculty(faculty.id, { staffId });
      if (!result.ok) {
        if ("staffConflict" in result)  setLinkError(result.message);
        else if ("staffNotFound" in result) setLinkError(result.message);
        else if ("conflict" in result)  setLinkError(result.message);
        else if ("notFound" in result)  setLinkError("Faculty not found. It may have been deleted.");
        return;
      }
      setLinkedStaffId(result.faculty.staffId);
      setPickerOpen(false);
    } catch {
      setLinkError("Could not update login access. Please try again.");
    } finally {
      setLinking(false);
    }
  }

  // Creates a brand-new Staff(role: teacher) account from this Faculty's own
  // contact details, then links it — so the admin never has to jump to
  // Staff & Roles and back just to grant this person app access.
  async function handleCreateAndLink() {
    if (!newEmail.trim() || !newPhone.trim() || newPassword.length < 6) {
      setLinkError("Enter a valid email, phone, and a password of at least 6 characters.");
      return;
    }
    setCreatingLogin(true);
    setLinkError("");
    try {
      const newStaff = await createStaffMember({
        fullName: faculty.fullName,
        email:    newEmail.trim().toLowerCase(),
        phone:    newPhone.trim(),
        role:     "teacher",
        password: newPassword,
      });
      setStaffList((prev) => [...prev, { ...newStaff, centerAssignments: [] }]);

      const result = await updateFaculty(faculty.id, { staffId: newStaff.id });
      if (!result.ok) {
        if ("staffConflict" in result)      setLinkError(result.message);
        else if ("staffNotFound" in result) setLinkError(result.message);
        else if ("conflict" in result)      setLinkError(result.message);
        else if ("notFound" in result)      setLinkError("Faculty not found. It may have been deleted.");
        return;
      }
      setLinkedStaffId(result.faculty.staffId);
      setCreateOpen(false);
      setPickerOpen(false);
      setNewPassword("");
    } catch (err: any) {
      const msg = err?.response?.data?.error;
      setLinkError(typeof msg === "string" ? msg : "Could not create login. Please try again.");
    } finally {
      setCreatingLogin(false);
    }
  }

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
      showConfirm("Discard Changes?", "You have unsaved changes. Go back?", () => navigation.goBack(), { confirmLabel: "Discard", cancelLabel: "Stay", brand: true, icon: "arrow-undo-outline" });
    } else {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="Edit Faculty" onBack={handleBack} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Personal Info ── */}
          <View style={s.section}>
            <SectionHead icon="person-outline" title="Personal Information" color={colors.primary} />
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
            <SectionHead icon="briefcase-outline" title="Professional Details" color={colors.primary} />
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
                trackColor={{ false: C.border, true: C.green + "40" }}
                thumbColor={form.isActive ? C.green : C.placeholder}
              />
            </View>
          </View>

          {/* ── Login Access ── */}
          <View style={s.section}>
            <SectionHead icon="shield-checkmark-outline" title="Login Access" color={colors.primary} />
            {staffLoading ? (
              <View style={sp.center}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : linkedStaff ? (
              <View style={s.linkedRow}>
                <View style={s.linkedIcon}>
                  <Ionicons name="checkmark-circle" size={ms(18)} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.linkedName}>{linkedStaff.fullName}</Text>
                  <Text style={s.linkedSub}>Can log in as this teacher · {linkedStaff.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => handleLink(null)} disabled={linking} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  {linking ? <ActivityIndicator size="small" color={C.red} /> : <Text style={s.unlinkT}>Unlink</Text>}
                </TouchableOpacity>
              </View>
            ) : linkedStaffId && !linkedStaff ? (
              // Linked, but the matching teacher account isn't in the fetched list (e.g. inactive)
              <View style={s.linkedRow}>
                <Ionicons name="link-outline" size={ms(18)} color={C.muted} />
                <Text style={[s.linkedSub, { flex: 1, marginLeft: ms(10) }]}>Linked to a teacher account</Text>
                <TouchableOpacity onPress={() => handleLink(null)} disabled={linking} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  {linking ? <ActivityIndicator size="small" color={C.red} /> : <Text style={s.unlinkT}>Unlink</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={s.subjectHint}>
                  No teacher login linked yet. Create a new login for {faculty.fullName.split(" ")[0]}, or link an existing "Teacher" staff account.
                </Text>

                <View style={s.linkBtnRow}>
                  <TouchableOpacity
                    style={[s.linkBtn, { flex: 1 }]}
                    onPress={() => { setCreateOpen((v) => !v); setPickerOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="person-add-outline" size={ms(15)} color={colors.primary} />
                    <Text style={[s.linkBtnT, { color: colors.primary }]}>
                      {createOpen ? "Cancel" : "Create New Login"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.linkBtn, s.linkBtnSecondary, { flex: 1 }]}
                    onPress={() => { setPickerOpen((v) => !v); setCreateOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="people-outline" size={ms(15)} color={C.muted} />
                    <Text style={[s.linkBtnT, { color: C.muted }]}>
                      {pickerOpen ? "Hide" : "Link Existing"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {createOpen && (
                  <View style={s.createForm}>
                    <FormField label="EMAIL ADDRESS" value={newEmail} onChangeText={setNewEmail}
                      placeholder="e.g. priya@institute.com" keyboardType="email-address" icon="mail-outline" />
                    <FormField label="PHONE NUMBER" value={newPhone} onChangeText={(v) => setNewPhone(v.replace(/\D/g, ""))}
                      placeholder="e.g. 9876543210" keyboardType="phone-pad" icon="call-outline" />

                    <Text style={s.pwLabel}>PASSWORD</Text>
                    <View style={s.pwRow}>
                      <TextInput
                        style={s.pwInput}
                        placeholder="Min. 6 characters"
                        placeholderTextColor={C.placeholder}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry={!showNewPw}
                      />
                      <TouchableOpacity onPress={() => setShowNewPw((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name={showNewPw ? "eye-off-outline" : "eye-outline"} size={ms(18)} color={C.muted} />
                      </TouchableOpacity>
                    </View>
                    <Text style={s.pwHint}>{faculty.fullName} can change this after first login.</Text>

                    <PrimaryButton
                      label="Create & Link Account"
                      onPress={handleCreateAndLink}
                      loading={creatingLogin}
                      disabled={creatingLogin}
                      icon="checkmark-circle-outline"
                    />
                  </View>
                )}

                {pickerOpen && (
                  eligibleTeachers.length === 0 ? (
                    <Text style={[s.linkedSub, { marginTop: ms(12) }]}>
                      No unlinked teacher accounts found.
                    </Text>
                  ) : (
                    <View style={[sp.chipRow, { marginTop: ms(12) }]}>
                      {eligibleTeachers.map((m) => (
                        <TouchableOpacity
                          key={m.id}
                          style={sp.chip}
                          onPress={() => handleLink(m.id)}
                          disabled={linking}
                          activeOpacity={0.75}
                        >
                          <Text style={sp.chipT}>{m.fullName}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )
                )}
              </>
            )}
            {!!linkError && <Text style={[s.submitErrorT, { marginTop: ms(10) }]}>{linkError}</Text>}
          </View>

          {/* ── Subjects ── */}
          <View style={s.section}>
            <SectionHead icon="book-outline" title="Subjects to Teach" color={colors.primary} />
            <Text style={s.subjectHint}>Tap to add or remove subjects.</Text>
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
            <ActivityIndicator size="large" color={colors.primary} />
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
              <LinearGradient colors={[C.blue, "#1A4F8A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
                <Ionicons name="pencil" size={ms(38)} color="#fff" />
              </LinearGradient>
            </Animated.View>

            <Text style={s.successTitle}>Faculty Updated!</Text>
            <Text style={s.successSub}>Changes have been saved successfully</Text>

            <View style={s.detailBox}>
              <DetailRow icon="person-outline"    label="Name"          value={updatedFaculty.fullName} color={colors.primary} />
              <DetailRow icon="id-card-outline"   label="Employee Code" value={updatedFaculty.employeeCode} color={C.blue} />
              <DetailRow icon="school-outline"    label="Qualification" value={updatedFaculty.qualification} color={C.orange} />
              <DetailRow icon="briefcase-outline" label="Experience"    value={`${updatedFaculty.experienceYears} year${updatedFaculty.experienceYears !== 1 ? "s" : ""}`} color={colors.accent} />
              <DetailRow icon="book-outline"      label="Subjects"      value={`${updatedFaculty.subjectCount} subject${updatedFaculty.subjectCount !== 1 ? "s" : ""} assigned`} color={C.green} />
              <DetailRow icon="ellipse-outline"   label="Status"        value={updatedFaculty.isActive ? "Active" : "Inactive"} color={updatedFaculty.isActive ? C.green : C.muted} last />
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
  label:   { fontSize: fs(11), fontFamily: "Inter_800ExtraBold", fontWeight: "800", letterSpacing: 1 },
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
  label:     { fontSize: fs(10), color: C.muted, fontFamily: "Inter_700Bold", fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: ms(1) },
  value:     { fontSize: fs(13), color: C.text, fontFamily: "Inter_700Bold", fontWeight: "700" },
});

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.screenBg },
  flex:          { flex: 1 },
  scroll:        { flex: 1, backgroundColor: colors.screenBg },
  scrollContent: { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(40) },

  section:       { backgroundColor: C.card, borderRadius: ms(18), padding: ms(18), marginBottom: ms(16), shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  toggleRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: ms(6) },
  toggleInfo:    { flex: 1, marginRight: ms(12) },
  toggleLabel:   { fontSize: fs(12.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text, letterSpacing: 0.3 },
  toggleSub:     { fontSize: fs(11.5), color: C.muted, marginTop: ms(2) },

  subjectHint:   { fontSize: fs(12), color: C.muted, marginBottom: ms(14) },
  selectedCount: { fontSize: fs(12), color: C.green, fontFamily: "Inter_700Bold", fontWeight: "700", marginTop: ms(14), textAlign: "center" },

  linkedRow:   { flexDirection: "row", alignItems: "center", gap: ms(10), backgroundColor: C.green + "0F", borderRadius: ms(12), padding: ms(12), borderWidth: 1, borderColor: C.green + "40" },
  linkedIcon:  { flexShrink: 0 },
  linkedName:  { fontSize: fs(13.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text },
  linkedSub:   { fontSize: fs(11.5), color: C.muted, marginTop: ms(1) },
  unlinkT:     { fontSize: fs(12.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.red },
  linkBtnRow:  { flexDirection: "row", gap: ms(10) },
  linkBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(7), paddingVertical: ms(11), borderRadius: ms(12), backgroundColor: colors.primary + "10", borderWidth: 1, borderColor: colors.primary + "30" },
  linkBtnSecondary: { backgroundColor: C.bg, borderColor: C.border },
  linkBtnT:    { fontSize: fs(13), fontFamily: "Inter_700Bold", fontWeight: "700" },

  createForm: { marginTop: ms(16), gap: ms(2) },
  pwLabel:    { fontSize: fs(12.5), fontFamily: "Inter_700Bold", fontWeight: "700", color: C.text, marginBottom: ms(7), letterSpacing: 0.3 },
  pwRow:      { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.card, borderRadius: ms(12), borderWidth: 1.5, borderColor: C.border, paddingHorizontal: ms(14), paddingVertical: ms(12), marginBottom: ms(6) },
  pwInput:    { flex: 1, fontSize: fs(14), color: C.text, padding: 0 },
  pwHint:     { fontSize: fs(11.5), color: C.muted, marginBottom: ms(16) },

  submitError:   { backgroundColor: C.red + "0F", borderRadius: ms(12), borderWidth: 1, borderColor: C.red + "30", padding: ms(14), marginBottom: ms(16) },
  submitErrorT:  { fontSize: fs(13), color: C.red, lineHeight: fs(18) },
  buttonGroup:   { gap: ms(12) },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg + "EE", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { fontSize: fs(16), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, marginTop: ms(4) },
  loaderSub:     { fontSize: fs(12), color: C.muted },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successCard:    { width: "100%", backgroundColor: C.card, borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { fontSize: fs(22), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: C.text, marginBottom: ms(6) },
  successSub:     { fontSize: fs(13), color: C.muted, marginBottom: ms(24), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(24), borderWidth: 1, borderColor: C.border },
  doneBtnWrap:    { width: "100%" },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  doneBtnT:       { fontSize: fs(15), fontFamily: "Inter_800ExtraBold", fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
});

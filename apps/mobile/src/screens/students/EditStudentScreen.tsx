import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, StatusBar, Animated, TouchableOpacity, ActivityIndicator, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { updateStudent, uploadStudentPhoto } from "../../api/students";
import type {
  Gender, Qualification, CoursePreference, DurationPref, BatchTiming, PaymentMode, StudentItem,
} from "../../api/students";
import { ms, fs } from "../../utils/responsive";

type Props = NativeStackScreenProps<RootStackParamList, "EditStudent">;

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoToDisplay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return [
    String(d.getUTCDate()).padStart(2, "0"),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCFullYear()),
  ].join("/");
}

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

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Personal", icon: "person-outline"   },
  { label: "Family",   icon: "people-outline"   },
  { label: "Academic", icon: "book-outline"      },
  { label: "Contact",  icon: "call-outline"      },
  { label: "Office",   icon: "business-outline"  },
] as const;

// ── Step bar (identical to admission) ────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <View style={sb.wrap}>
      {STEPS.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        const color  = done || active ? "#8B1E3F" : "#D5CCC8";
        return (
          <React.Fragment key={i}>
            <View style={sb.stepCol}>
              <View style={[sb.circle, { borderColor: color, backgroundColor: done ? "#8B1E3F" : active ? "#FEF4F4" : "#F7F4F2" }]}>
                {done
                  ? <Ionicons name="checkmark" size={ms(12)} color="#fff" />
                  : <Text style={[sb.num, { color }]}>{i + 1}</Text>}
              </View>
              <Text style={[sb.lbl, { color: active ? "#8B1E3F" : done ? "#8B1E3F" : "#B0A9AC", fontWeight: active ? "800" : "600" }]} numberOfLines={1}>
                {step.label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[sb.line, { backgroundColor: done ? "#8B1E3F" : "#E0D8D4" }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const sb = StyleSheet.create({
  wrap:    { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: ms(16), paddingVertical: ms(14), backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  stepCol: { alignItems: "center", gap: ms(4), width: ms(52) },
  circle:  { width: ms(28), height: ms(28), borderRadius: ms(14), borderWidth: 2, justifyContent: "center", alignItems: "center" },
  num:     { fontSize: fs(11), fontWeight: "800" },
  lbl:     { fontSize: fs(9), textAlign: "center" },
  line:    { flex: 1, height: 2, alignSelf: "center", marginBottom: ms(16), marginHorizontal: ms(-2) },
});

// ── Option row (identical to admission) ──────────────────────────────────────

function OptionRow<T extends string>({ options, value, onSelect, color = "#8B1E3F" }: {
  options: { key: T; label: string }[];
  value: T | null | undefined;
  onSelect: (k: T) => void;
  color?: string;
}) {
  return (
    <View style={or.row}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <TouchableOpacity key={opt.key} style={[or.pill, active && { backgroundColor: color, borderColor: color }]} onPress={() => onSelect(opt.key)} activeOpacity={0.75}>
            <View style={[or.radio, { borderColor: active ? "#fff" : "#C0B8B4" }]}>
              {active && <View style={or.radioDot} />}
            </View>
            <Text style={[or.label, active && or.labelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const or = StyleSheet.create({
  row:         { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  pill:        { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(12), paddingVertical: ms(8), borderRadius: ms(10), backgroundColor: "#FAFAFA", borderWidth: 1.5, borderColor: "#E0D8D4" },
  radio:       { width: ms(14), height: ms(14), borderRadius: ms(7), borderWidth: 2, justifyContent: "center", alignItems: "center" },
  radioDot:    { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: "#fff" },
  label:       { fontSize: fs(12.5), fontWeight: "600", color: "#8A7F82" },
  labelActive: { color: "#fff", fontWeight: "700" },
});

// ── Section heading (identical to admission) ──────────────────────────────────

function SectionHead({ icon, label, color, sub }: { icon: string; label: string; color: string; sub?: string }) {
  return (
    <View style={sh.wrap}>
      <View style={[sh.iconBox, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(16)} color={color} />
      </View>
      <View style={sh.col}>
        <Text style={[sh.label, { color }]}>{label.toUpperCase()}</Text>
        {sub && <Text style={sh.sub}>{sub}</Text>}
      </View>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap:   { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(16) },
  iconBox:{ width: ms(36), height: ms(36), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  col:    { flex: 1 },
  label:  { fontSize: fs(12), fontWeight: "800", letterSpacing: 0.8 },
  sub:    { fontSize: fs(11), color: "#8A7F82", marginTop: ms(2) },
});

// ── Detail row (success card) ─────────────────────────────────────────────────

function DetailRow({ icon, label, value, color, last }: { icon: string; label: string; value: string; color: string; last?: boolean }) {
  return (
    <View style={[s.detailRow, !last && s.detailRowBorder]}>
      <View style={[s.detailIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(14)} color={color} />
      </View>
      <View style={s.detailMeta}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text style={s.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GENDER_OPTIONS:   { key: Gender;           label: string }[] = [{ key: "male", label: "Male" }, { key: "female", label: "Female" }];
const QUAL_OPTIONS:     { key: Qualification;    label: string }[] = [{ key: "class10", label: "Class 10" }, { key: "class12", label: "Class 12" }, { key: "graduation", label: "Graduation" }, { key: "post_graduation", label: "Post Graduation" }];
const COURSE_OPTIONS:   { key: CoursePreference; label: string }[] = [{ key: "ssc", label: "SSC" }, { key: "banking", label: "Banking" }, { key: "railway", label: "Railway" }, { key: "foundation", label: "Foundation" }, { key: "others", label: "Others" }];
const DURATION_OPTIONS: { key: DurationPref;     label: string }[] = [{ key: "3months", label: "3 Months" }, { key: "6months", label: "6 Months" }, { key: "1year", label: "1 Year" }];
const TIMING_OPTIONS:   { key: BatchTiming;      label: string }[] = [{ key: "morning", label: "Morning" }, { key: "midday", label: "Mid Day" }, { key: "evening", label: "Evening" }];
const PAYMENT_OPTIONS:  { key: PaymentMode;      label: string }[] = [{ key: "cash", label: "Cash" }, { key: "online", label: "Online Payment" }];

// ── Main screen ───────────────────────────────────────────────────────────────

export function EditStudentScreen({ navigation, route }: Props) {
  const { student } = route.params;

  const [step, setStep]   = useState(0);
  const slideAnim         = useRef(new Animated.Value(0)).current;
  const cardOpacity       = useRef(new Animated.Value(0)).current;
  const cardSlide         = useRef(new Animated.Value(ms(40))).current;
  const checkScale        = useRef(new Animated.Value(0)).current;

  // ── Photo ──
  const [photoUri, setPhotoUri]           = useState<string | null>(student.photoUrl ?? null);
  const [photoLoading, setPhotoLoading]   = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [photoError, setPhotoError]       = useState<string | null>(null);

  async function handlePickPhoto(fromCamera: boolean) {
    setShowPhotoPicker(false);
    setPhotoError(null);
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { setPhotoError("Camera permission is required."); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { setPhotoError("Gallery permission is required."); return; }
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPhotoLoading(true);
    const res = await uploadStudentPhoto(student.id, asset.uri, asset.mimeType ?? "image/jpeg");
    setPhotoLoading(false);
    if (res.ok) {
      setPhotoUri(res.student.photoUrl ?? asset.uri);
    } else {
      setPhotoError(res.error);
    }
  }

  // ── Step 0: Personal ──
  const [fullName, setFullName] = useState(student.fullName);
  const [dob, setDob]           = useState(isoToDisplay(student.dob));
  const [gender, setGender]     = useState<Gender | null>(student.gender);
  const [aadhaar, setAadhaar]   = useState(student.aadhaar ?? "");
  const [address, setAddress]   = useState(student.address ?? "");
  const [phone, setPhone]       = useState(student.phone);

  // ── Step 1: Family ──
  const [fatherName, setFatherName]                 = useState(student.fatherName ?? "");
  const [motherName, setMotherName]                 = useState(student.motherName ?? "");
  const [guardianOccupation, setGuardianOccupation] = useState(student.guardianOccupation ?? "");
  const [guardianEmail, setGuardianEmail]           = useState(student.guardianEmail ?? "");

  // ── Step 2: Academic ──
  const [coursePreference, setCoursePreference]     = useState<CoursePreference | null>(student.coursePreference);
  const [durationPreference, setDurationPreference] = useState<DurationPref | null>(student.durationPreference);
  const [qualification, setQualification]           = useState<Qualification | null>(student.qualification);
  const [passYear, setPassYear]                     = useState(student.passYear ?? "");
  const [board, setBoard]                           = useState(student.board ?? "");

  // ── Step 3: Contact ──
  const [whatsapp, setWhatsapp]           = useState(student.whatsapp ?? "");
  const [guardianPhone, setGuardianPhone] = useState(student.guardianPhone ?? "");

  // ── Step 4: Office ──
  const [preferredTiming, setPreferredTiming] = useState<BatchTiming | null>(student.preferredTiming);
  const [paymentMode, setPaymentMode]         = useState<PaymentMode | null>(student.paymentMode);
  const [amountPaid, setAmountPaid]           = useState(
    student.amountPaid ? String(Number(student.amountPaid)) : ""
  );

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<StudentItem | null>(null);

  function animateStep(direction: 1 | -1, targetStep: number) {
    slideAnim.setValue(direction * ms(60));
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 120, friction: 12 }).start();
    setStep(targetStep);
  }

  function validateStep(): boolean {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!fullName.trim()) errs.fullName = "Full name is required.";
      if (!phone.trim())    errs.phone    = "Phone number is required.";
      if (dob.trim() && !parseDisplayDate(dob)) errs.dob = "Enter date in DD/MM/YYYY format.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) animateStep(1, step + 1);
    else handleSubmit();
  }

  function handlePrev() {
    if (step > 0) animateStep(-1, step - 1);
    else navigation.goBack();
  }

  async function handleSubmit() {
    setLoading(true);
    setErrors({});
    try {
      const response = await updateStudent(student.id, {
        fullName:           fullName.trim(),
        phone:              phone.trim(),
        dob:                parseDisplayDate(dob) ?? null,
        gender,
        aadhaar:            aadhaar.trim() || null,
        address:            address.trim() || null,
        fatherName:         fatherName.trim() || null,
        motherName:         motherName.trim() || null,
        guardianOccupation: guardianOccupation.trim() || null,
        guardianEmail:      guardianEmail.trim() || null,
        qualification,
        passYear:           passYear.trim() || null,
        board:              board.trim() || null,
        coursePreference,
        durationPreference,
        whatsapp:           whatsapp.trim() || null,
        guardianPhone:      guardianPhone.trim() || null,
        preferredTiming,
        paymentMode,
        amountPaid:         amountPaid.trim() ? Number(amountPaid) : null,
      });

      if (response.ok) {
        setUpdated(response.student);
        Animated.parallel([
          Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7, delay: 100 }),
          Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 60 }),
        ]).start();
      } else {
        setErrors({ submit: response.error });
      }
    } catch {
      setErrors({ submit: "Network error — please check your connection." });
    } finally {
      setLoading(false);
    }
  }

  // ── Step content ──────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      case 0: {
        const initials = fullName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "S";
        return (
          <View style={s.stepContent}>
            {/* Photo avatar */}
            <View style={s.avatarWrap}>
              <TouchableOpacity onPress={() => setShowPhotoPicker(true)} activeOpacity={0.85} disabled={photoLoading}>
                <View style={s.avatarCircle}>
                  {photoUri
                    ? <Image source={{ uri: photoUri }} style={s.avatarImg} />
                    : <Text style={s.avatarInitials}>{initials}</Text>
                  }
                </View>
                <View style={s.avatarBadge}>
                  {photoLoading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="camera" size={ms(14)} color="#fff" />
                  }
                </View>
              </TouchableOpacity>
              <Text style={s.avatarHint}>Tap to update photo</Text>
              {photoError ? <Text style={s.photoError}>{photoError}</Text> : null}
            </View>
            <SectionHead icon="person-circle-outline" label="Personal Details" color="#8B1E3F" sub="Basic identity information" />
            <FormField label="FULL NAME" value={fullName} onChangeText={(v) => { setFullName(v); setErrors((p) => ({ ...p, fullName: "" })); }}
              placeholder="e.g. Rahul Kumar Sharma" error={errors.fullName} icon="person-outline" maxLength={120} clearable />
            <FormField label="DATE OF BIRTH" value={dob} onChangeText={(v) => { setDob(autoFormatDate(v)); setErrors((p) => ({ ...p, dob: "" })); }}
              placeholder="DD/MM/YYYY" keyboardType="number-pad" error={errors.dob} icon="calendar-outline" />
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>GENDER</Text>
              <OptionRow options={GENDER_OPTIONS} value={gender} onSelect={setGender} />
            </View>
            <FormField label="AADHAAR NUMBER" value={aadhaar} onChangeText={(v) => setAadhaar(v.replace(/\D/g, "").slice(0, 12))}
              placeholder="12-digit Aadhaar number" keyboardType="number-pad" icon="card-outline" />
            <FormField label="ADDRESS" value={address} onChangeText={setAddress}
              placeholder="House, Street, City, State" icon="location-outline" />
            <FormField label="PHONE NUMBER" value={phone} onChangeText={(v) => { setPhone(v.replace(/\D/g, "")); setErrors((p) => ({ ...p, phone: "" })); }}
              placeholder="e.g. 9876543210" keyboardType="phone-pad" error={errors.phone} icon="call-outline" />
          </View>
        );
      }

      case 1:
        return (
          <View style={s.stepContent}>
            <SectionHead icon="people-outline" label="Family Details" color="#7C3AED" sub="Parent & guardian information" />
            <FormField label="FATHER'S NAME" value={fatherName} onChangeText={setFatherName}
              placeholder="Father's full name" icon="person-outline" maxLength={120} />
            <FormField label="MOTHER'S NAME" value={motherName} onChangeText={setMotherName}
              placeholder="Mother's full name" icon="person-outline" maxLength={120} />
            <FormField label="GUARDIAN OCCUPATION" value={guardianOccupation} onChangeText={setGuardianOccupation}
              placeholder="e.g. Government Employee, Business" icon="briefcase-outline" />
            <FormField label="GUARDIAN EMAIL" value={guardianEmail} onChangeText={setGuardianEmail}
              placeholder="guardian@email.com" keyboardType="email-address" icon="mail-outline" />
          </View>
        );

      case 2:
        return (
          <View style={s.stepContent}>
            <SectionHead icon="school-outline" label="Academic Details" color="#1B9C63" sub="Education & course preference" />
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>COURSE PREFERENCE</Text>
              <OptionRow options={COURSE_OPTIONS} value={coursePreference} onSelect={setCoursePreference} color="#2563A8" />
            </View>
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>DURATION PREFERENCE</Text>
              <OptionRow options={DURATION_OPTIONS} value={durationPreference} onSelect={setDurationPreference} color="#1B9C63" />
            </View>
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>HIGHEST QUALIFICATION</Text>
              <OptionRow options={QUAL_OPTIONS} value={qualification} onSelect={setQualification} color="#7C3AED" />
            </View>
            <FormField label="PASS YEAR" value={passYear} onChangeText={(v) => setPassYear(v.replace(/\D/g, "").slice(0, 4))}
              placeholder="e.g. 2023" keyboardType="number-pad" icon="trophy-outline" />
            <FormField label="BOARD / UNIVERSITY" value={board} onChangeText={setBoard}
              placeholder="e.g. CBSE, UP Board" icon="business-outline" maxLength={100} />
          </View>
        );

      case 3:
        return (
          <View style={s.stepContent}>
            <SectionHead icon="call-outline" label="Contact Details" color="#E8752C" sub="WhatsApp & emergency contact" />
            <FormField label="WHATSAPP NUMBER" value={whatsapp} onChangeText={(v) => setWhatsapp(v.replace(/\D/g, ""))}
              placeholder="WhatsApp number (if different)" keyboardType="phone-pad" icon="logo-whatsapp" hint="Leave blank if same as phone" />
            <FormField label="GUARDIAN PHONE" value={guardianPhone} onChangeText={(v) => setGuardianPhone(v.replace(/\D/g, ""))}
              placeholder="Parent or guardian contact" keyboardType="phone-pad" icon="call-outline" />
          </View>
        );

      case 4:
        return (
          <View style={s.stepContent}>
            <View style={[s.officeBanner, { backgroundColor: "#8B1E3F" }]}>
              <Ionicons name="business-outline" size={ms(15)} color="#fff" />
              <Text style={s.officeBannerT}>FOR OFFICE USE ONLY</Text>
            </View>

            <SectionHead icon="time-outline" label="Batch Timing" color="#2563A8" />
            <View style={s.fieldBlock}>
              <Text style={[s.fieldLabel, { color: "#2563A8" }]}>PREFERRED BATCH TIMING</Text>
              <OptionRow options={TIMING_OPTIONS} value={preferredTiming} onSelect={setPreferredTiming} color="#2563A8" />
            </View>

            <View style={s.divider} />

            <SectionHead icon="cash-outline" label="Payment Details" color="#1B9C63" />
            <View style={s.fieldBlock}>
              <Text style={[s.fieldLabel, { color: "#1B9C63" }]}>MODE OF PAYMENT</Text>
              <OptionRow options={PAYMENT_OPTIONS} value={paymentMode} onSelect={setPaymentMode} color="#1B9C63" />
            </View>
            <FormField label="AMOUNT PAID (₹)" value={amountPaid}
              onChangeText={(v) => setAmountPaid(v.replace(/[^0-9.]/g, ""))}
              placeholder="e.g. 5000" keyboardType="decimal-pad" icon="cash-outline"
              hint="Update if additional fee was collected" />

            {errors.submit && (
              <View style={s.submitError}>
                <Text style={s.submitErrorT}>{errors.submit}</Text>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  }

  // ── Success overlay ───────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="Edit Student" onBack={handlePrev} />
      <StepBar current={step} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
            <View style={s.card}>
              {renderStep()}
            </View>
          </Animated.View>

          {/* Navigation buttons */}
          <View style={s.navRow}>
            {step > 0 && (
              <TouchableOpacity style={s.prevBtn} onPress={handlePrev} activeOpacity={0.75}>
                <Ionicons name="chevron-back" size={ms(18)} color="#8B1E3F" />
                <Text style={s.prevBtnT}>Back</Text>
              </TouchableOpacity>
            )}
            <View style={s.navSpacer} />
            {step < STEPS.length - 1 ? (
              <TouchableOpacity style={[s.nextBtn, s.nextBtnGrad, { backgroundColor: "#8B1E3F" }]} onPress={handleNext} activeOpacity={0.85}>
                <Text style={s.nextBtnT}>Next</Text>
                <Ionicons name="chevron-forward" size={ms(18)} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.nextBtn, s.nextBtnGrad, { backgroundColor: "#1B9C63" }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Text style={s.nextBtnT}>Save Changes</Text>
                      <Ionicons name="checkmark-circle-outline" size={ms(18)} color="#fff" />
                    </>
                }
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.stepPill}>Step {step + 1} of {STEPS.length} — {STEPS[step].label}</Text>
          <View style={{ height: ms(24) }} />
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

      {/* Photo picker bottom sheet */}
      <BottomSheet visible={showPhotoPicker} onClose={() => setShowPhotoPicker(false)}>
        <View style={s.photoSheet}>
          <Text style={s.photoSheetTitle}>Update Photo</Text>
          <TouchableOpacity style={s.photoOption} onPress={() => handlePickPhoto(true)} activeOpacity={0.8}>
            <View style={[s.photoOptionIcon, { backgroundColor: "#8B1E3F18" }]}>
              <Ionicons name="camera-outline" size={ms(22)} color="#8B1E3F" />
            </View>
            <Text style={s.photoOptionLabel}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.photoOption} onPress={() => handlePickPhoto(false)} activeOpacity={0.8}>
            <View style={[s.photoOptionIcon, { backgroundColor: "#2563A818" }]}>
              <Ionicons name="image-outline" size={ms(22)} color="#2563A8" />
            </View>
            <Text style={s.photoOptionLabel}>Choose from Gallery</Text>
          </TouchableOpacity>
          <View style={{ height: ms(20) }} />
        </View>
      </BottomSheet>

      {/* Full-screen success card */}
      {updated !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <ScrollView contentContainerStyle={s.successScroll} showsVerticalScrollIndicator={false}>
            <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>
              <Animated.View style={{ transform: [{ scale: checkScale }], marginBottom: ms(20) }}>
                <View style={[s.checkCircle, { backgroundColor: "#8B1E3F" }]}>
                  <Ionicons name="pencil" size={ms(44)} color="#fff" />
                </View>
              </Animated.View>

              <Text style={s.successTitle}>Student Updated!</Text>
              <View style={s.regCodeRow}>
                <Ionicons name="id-card-outline" size={ms(14)} color="#8B1E3F" />
                <Text style={s.regCode}>{updated.studentCode}</Text>
              </View>
              <Text style={s.successSub}>Profile updated successfully</Text>

              <View style={s.detailBox}>
                <DetailRow icon="person-outline"   label="Student Name" value={updated.fullName}  color="#8B1E3F" />
                <DetailRow icon="call-outline"     label="Phone"        value={updated.phone}      color="#2CA6A4" />
                {updated.coursePreference && (
                  <DetailRow icon="book-outline"   label="Course Pref." value={updated.coursePreference.toUpperCase()} color="#2563A8" />
                )}
                {updated.amountPaid && (
                  <DetailRow icon="cash-outline"   label="Amount Paid"  value={`₹ ${Number(updated.amountPaid).toLocaleString("en-IN")}`} color="#1B9C63" />
                )}
                {updated.paymentMode && (
                  <DetailRow icon="card-outline"   label="Payment Mode" value={updated.paymentMode === "cash" ? "Cash" : "Online Payment"} color="#E8752C" last />
                )}
              </View>

              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={[s.doneBtnWrap, s.doneBtn]}>
                <Ionicons name="people-outline" size={ms(18)} color="#fff" />
                <Text style={s.doneBtnT}>View All Students</Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: "#8B1E3F" },
  flex:        { flex: 1 },
  scroll:      { flex: 1, backgroundColor: "#FFFBF0" },
  body:        { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(40) },

  stepContent: { gap: ms(2) },
  card:        { backgroundColor: "#FFFFFF", borderRadius: ms(20), padding: ms(18), marginBottom: ms(14), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  fieldBlock:  { marginBottom: ms(16) },
  fieldLabel:  { fontSize: fs(11), fontWeight: "800", color: "#8A7F82", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: ms(10) },

  officeBanner:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(10), paddingVertical: ms(10), marginBottom: ms(16) },
  officeBannerT: { fontSize: fs(11), fontWeight: "800", color: "#fff", letterSpacing: 1.5 },
  divider:       { height: 1, backgroundColor: "#EFF4FF", marginVertical: ms(16) },

  submitError:   { backgroundColor: "#FEF0EE", borderRadius: ms(12), borderWidth: 1, borderColor: "#F5C6C0", padding: ms(14), marginTop: ms(8) },
  submitErrorT:  { fontSize: fs(13), color: "#C0392B", lineHeight: fs(18) },

  navRow:       { flexDirection: "row", alignItems: "center", marginBottom: ms(10) },
  navSpacer:    { flex: 1 },
  prevBtn:      { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(16), paddingVertical: ms(12), borderRadius: ms(14), backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#E0D8D4" },
  prevBtnT:     { fontSize: fs(14), fontWeight: "700", color: "#8B1E3F" },
  nextBtn:      { borderRadius: ms(14) },
  nextBtnGrad:  { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(22), paddingVertical: ms(13), borderRadius: ms(14) },
  nextBtnT:     { fontSize: fs(14), fontWeight: "800", color: "#fff" },
  stepPill:     { textAlign: "center", fontSize: fs(11), color: "#B0A9AC", marginTop: ms(2) },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,251,240,0.96)", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: "#FFFFFF", borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F" },
  loaderSub:     { fontSize: fs(12), color: "#8A7F82" },

  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFBF0" },
  successScroll:  { flexGrow: 1, justifyContent: "center", paddingHorizontal: ms(20), paddingVertical: ms(32) },
  successCard:    { backgroundColor: "#FFFFFF", borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { fontSize: fs(22), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(8) },
  regCodeRow:     { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: "#FEF4F4", borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(6), marginBottom: ms(8) },
  regCode:        { fontSize: fs(14), fontWeight: "800", color: "#8B1E3F", letterSpacing: 1 },
  successSub:     { fontSize: fs(13), color: "#8A7F82", marginBottom: ms(20), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: "#FAFAFA", borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(16), borderWidth: 1, borderColor: "#F0EDE8" },
  detailRow:      { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), gap: ms(12) },
  detailRowBorder:{ borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  detailIcon:     { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  detailMeta:     { flex: 1 },
  detailLabel:    { fontSize: fs(10.5), color: "#8A7F82", fontWeight: "600" },
  detailValue:    { fontSize: fs(13.5), fontWeight: "700", color: "#1A1214" },
  doneBtnWrap:    { width: "100%" },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  doneBtnT:       { fontSize: fs(15), fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },

  avatarWrap:     { alignItems: "center", paddingVertical: ms(16), marginBottom: ms(8) },
  avatarCircle:   { width: ms(88), height: ms(88), borderRadius: ms(44), backgroundColor: "#8B1E3F18", borderWidth: 2.5, borderColor: "#8B1E3F", overflow: "hidden", justifyContent: "center", alignItems: "center" },
  avatarImg:      { width: ms(88), height: ms(88), borderRadius: ms(44) },
  avatarInitials: { fontSize: fs(28), fontWeight: "800", color: "#8B1E3F" },
  avatarBadge:    { position: "absolute", bottom: 0, right: 0, width: ms(28), height: ms(28), borderRadius: ms(14), backgroundColor: "#8B1E3F", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  avatarHint:     { fontSize: fs(11), color: "#8A7F82", marginTop: ms(6) },
  photoError:     { fontSize: fs(11), color: "#C0392B", marginTop: ms(4), textAlign: "center" },

  photoSheet:       { paddingTop: ms(8), paddingHorizontal: ms(20), paddingBottom: ms(8) },
  photoSheetTitle:  { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(20), textAlign: "center" },
  photoOption:      { flexDirection: "row", alignItems: "center", gap: ms(14), paddingVertical: ms(14), borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  photoOptionIcon:  { width: ms(44), height: ms(44), borderRadius: ms(12), justifyContent: "center", alignItems: "center" },
  photoOptionLabel: { fontSize: fs(15), fontWeight: "700", color: "#2B1B1F" },
});

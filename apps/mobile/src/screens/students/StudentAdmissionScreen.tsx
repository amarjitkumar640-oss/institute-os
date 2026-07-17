import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, StatusBar, TextInput, Animated, TouchableOpacity,
  ActivityIndicator, Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { admitStudent, type AdmitStudentPayload, type AdmitStudentResult } from "../../api/students";
import { listBatches, type BatchItem } from "../../api/batches";
import { ms, fs } from "../../utils/responsive";
import type {
  Gender, Qualification, CoursePreference, DurationPref, BatchTiming, PaymentMode,
} from "../../api/students";

type Props = NativeStackScreenProps<RootStackParamList, "NewAdmission">;

// ── Aadhaar QR parsing ────────────────────────────────────────────────────────

interface AadhaarData {
  fullName: string;
  dob:      string;
  gender:   Gender | null;
  address:  string;
  aadhaar:  string;
}

function parseAadhaarQR(raw: string): AadhaarData | null {
  try {
    const attr = (name: string) => {
      const m = raw.match(new RegExp(`${name}="([^"]*)"`, "i"));
      return m ? m[1].trim() : null;
    };
    const name = attr("name");
    if (!name) return null;

    const dob    = attr("dob");
    const uid    = attr("uid");
    const gender = attr("gender");
    const house  = attr("house");
    const street = attr("street");
    const lm     = attr("lm");
    const loc    = attr("loc");
    const vtc    = attr("vtc");
    const dist   = attr("dist");
    const state  = attr("state");
    const pc     = attr("pc");

    // Convert DOB → DD/MM/YYYY display format
    // Handles: DD/MM/YYYY (slash), DD-MM-YYYY (dash), YYYY-MM-DD (ISO)
    let formattedDob = "";
    if (dob) {
      const slashParts = dob.split("/");
      const dashParts  = dob.split("-");
      if (slashParts.length === 3) {
        // Already DD/MM/YYYY — use as-is
        formattedDob = dob;
      } else if (dashParts.length === 3) {
        formattedDob = dashParts[0].length === 4
          ? `${dashParts[2]}/${dashParts[1]}/${dashParts[0]}`  // YYYY-MM-DD
          : `${dashParts[0]}/${dashParts[1]}/${dashParts[2]}`; // DD-MM-YYYY
      }
    }

    const genderVal: Gender | null =
      gender === "M" || gender === "MALE"   ? "male"   :
      gender === "F" || gender === "FEMALE" ? "female" : null;

    const addrParts = [house, street, lm, loc, vtc, dist, state, pc].filter(Boolean);

    return {
      fullName: name,
      dob:      formattedDob,
      gender:   genderVal,
      address:  addrParts.join(", "),
      aadhaar:  uid ?? "",
    };
  } catch {
    return null;
  }
}

// ── Date helper ───────────────────────────────────────────────────────────────

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

// ── Step progress bar ─────────────────────────────────────────────────────────

const STEPS = [
  { label: "Personal", icon: "person-outline"   },
  { label: "Family",   icon: "people-outline"   },
  { label: "Course",   icon: "book-outline"      },
  { label: "Contact",  icon: "call-outline"      },
  { label: "Office",   icon: "business-outline"  },
] as const;

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
                  : <Text style={[sb.num, { color }]}>{i + 1}</Text>
                }
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

// ── Option row ────────────────────────────────────────────────────────────────

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
          <TouchableOpacity
            key={opt.key}
            style={[or.pill, active && { backgroundColor: color, borderColor: color }]}
            onPress={() => onSelect(opt.key)}
            activeOpacity={0.75}
          >
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

// ── Section heading ───────────────────────────────────────────────────────────

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
  wrap:    { flexDirection: "row", alignItems: "center", gap: ms(10), marginBottom: ms(16) },
  iconBox: { width: ms(34), height: ms(34), borderRadius: ms(10), justifyContent: "center", alignItems: "center" },
  col:     { flex: 1 },
  label:   { fontSize: fs(11), fontWeight: "800", letterSpacing: 1 },
  sub:     { fontSize: fs(10.5), color: "#8A7F82", marginTop: ms(1) },
});

// ── QR Scanner modal ──────────────────────────────────────────────────────────

function QRScannerModal({ onClose, onScan }: { onClose: () => void; onScan: (data: string) => void }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);

  if (!permission) {
    return (
      <View style={qr.center}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={qr.center}>
        <Ionicons name="camera-outline" size={ms(48)} color="#fff" style={{ marginBottom: ms(16) }} />
        <Text style={qr.permT}>Camera access is needed{"\n"}to scan the Aadhaar QR code.</Text>
        <TouchableOpacity style={qr.permBtn} onPress={requestPermission}>
          <Text style={qr.permBtnT}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={{ marginTop: ms(12) }}>
          <Text style={[qr.permBtnT, { opacity: 0.7 }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function handleScan({ data }: { data: string }) {
    if (scanned.current) return;
    scanned.current = true;
    onScan(data);
  }

  return (
    <View style={qr.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handleScan}
      />

      {/* Dark overlay with cutout */}
      <View style={qr.overlay}>
        <View style={[qr.topBar, { paddingTop: insets.top + ms(8) }]}>
          <TouchableOpacity style={qr.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={ms(22)} color="#fff" />
          </TouchableOpacity>
          <Text style={qr.title}>Scan Aadhaar QR Code</Text>
          <View style={{ width: ms(36) }} />
        </View>

        <View style={qr.cutoutRow}>
          <View style={qr.darkSide} />
          <View style={qr.cutout}>
            {/* Corner brackets */}
            <View style={[qr.corner, qr.tl]} />
            <View style={[qr.corner, qr.tr]} />
            <View style={[qr.corner, qr.bl]} />
            <View style={[qr.corner, qr.br]} />
          </View>
          <View style={qr.darkSide} />
        </View>

        <View style={qr.bottom}>
          <Text style={qr.hint}>Point the camera at the QR code{"\n"}on the back of the Aadhaar card</Text>
          <View style={qr.uidPill}>
            <Ionicons name="shield-checkmark-outline" size={ms(14)} color="#1B9C63" />
            <Text style={qr.uidT}>Your data stays on your device — not uploaded</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const CUTOUT = ms(230);
const qr = StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#000" },
  center:     { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center", padding: ms(32) },
  permT:      { color: "#fff", fontSize: fs(15), textAlign: "center", lineHeight: fs(22), marginBottom: ms(24) },
  permBtn:    { backgroundColor: "#8B1E3F", borderRadius: ms(12), paddingHorizontal: ms(28), paddingVertical: ms(12) },
  permBtnT:   { color: "#fff", fontWeight: "700", fontSize: fs(14) },

  overlay:    { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  topBar:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ms(16), paddingBottom: ms(12), backgroundColor: "rgba(0,0,0,0.6)" },
  closeBtn:   { width: ms(36), height: ms(36), borderRadius: ms(18), backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  title:      { color: "#fff", fontSize: fs(15), fontWeight: "700" },

  cutoutRow:  { flexDirection: "row", height: CUTOUT },
  darkSide:   { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  cutout:     { width: CUTOUT, height: CUTOUT },

  corner:     { position: "absolute", width: ms(24), height: ms(24), borderColor: "#8B1E3F" },
  tl:         { top: 0, left: 0, borderTopWidth: ms(3), borderLeftWidth: ms(3), borderTopLeftRadius: ms(4) },
  tr:         { top: 0, right: 0, borderTopWidth: ms(3), borderRightWidth: ms(3), borderTopRightRadius: ms(4) },
  bl:         { bottom: 0, left: 0, borderBottomWidth: ms(3), borderLeftWidth: ms(3), borderBottomLeftRadius: ms(4) },
  br:         { bottom: 0, right: 0, borderBottomWidth: ms(3), borderRightWidth: ms(3), borderBottomRightRadius: ms(4) },

  bottom:     { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", gap: ms(16), paddingHorizontal: ms(24) },
  hint:       { color: "rgba(255,255,255,0.85)", fontSize: fs(13), textAlign: "center", lineHeight: fs(20) },
  uidPill:    { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: "rgba(27,156,99,0.18)", borderRadius: ms(20), paddingHorizontal: ms(14), paddingVertical: ms(8), borderWidth: 1, borderColor: "rgba(27,156,99,0.35)" },
  uidT:       { color: "#80EFBC", fontSize: fs(11.5), fontWeight: "600" },
});

// ── Batch picker ──────────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = { ssc: "#8B1E3F", banking: "#2563A8", railway: "#2CA6A4" };

function BatchPicker({ batches, selectedId, onSelect }: { batches: BatchItem[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const active = batches.filter((b) => b.status !== "completed");
  if (active.length === 0) return <Text style={bp.empty}>No active batches — assign later</Text>;
  return (
    <View style={bp.list}>
      <TouchableOpacity style={[bp.card, !selectedId && bp.cardSel]} onPress={() => onSelect(null)} activeOpacity={0.75}>
        <Ionicons name="close-circle-outline" size={ms(18)} color={!selectedId ? "#8B1E3F" : "#B0A9AC"} />
        <Text style={[bp.cardName, !selectedId && { color: "#8B1E3F" }]}>Assign batch later</Text>
      </TouchableOpacity>
      {active.map((b) => {
        const color = CAT_COLOR[b.course.examCategory] ?? "#8A7F82";
        const sel   = selectedId === b.id;
        return (
          <TouchableOpacity key={b.id} style={[bp.card, sel && { borderColor: color, backgroundColor: color + "08" }]} onPress={() => onSelect(b.id)} activeOpacity={0.75}>
            <View style={[bp.dot, { backgroundColor: color }]} />
            <View style={bp.cardBody}>
              <Text style={[bp.cardName, sel && { color }]} numberOfLines={1}>{b.name}</Text>
              <Text style={bp.cardSub}>{b.course.name}</Text>
            </View>
            {sel && <Ionicons name="checkmark-circle" size={ms(18)} color={color} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const bp = StyleSheet.create({
  list:     { gap: ms(8) },
  empty:    { fontSize: fs(12), color: "#B0A9AC", textAlign: "center", paddingVertical: ms(12) },
  card:     { flexDirection: "row", alignItems: "center", gap: ms(10), padding: ms(12), borderRadius: ms(12), borderWidth: 1.5, borderColor: "#E0D8D4", backgroundColor: "#FAFAFA" },
  cardSel:  { borderColor: "#8B1E3F", backgroundColor: "#8B1E3F08" },
  dot:      { width: ms(8), height: ms(8), borderRadius: ms(4), flexShrink: 0 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontSize: fs(13), fontWeight: "700", color: "#2B1B1F" },
  cardSub:  { fontSize: fs(11), color: "#8A7F82", marginTop: ms(2) },
});

// ── Success detail row ────────────────────────────────────────────────────────

function DetailRow({ icon, label, value, color, last = false }: { icon: string; label: string; value: string; color: string; last?: boolean }) {
  return (
    <View style={[dr.row, !last && dr.rowBorder]}>
      <View style={[dr.iconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={ms(13)} color={color} />
      </View>
      <View style={dr.col}>
        <Text style={dr.label}>{label}</Text>
        <Text style={dr.value} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

const dr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(10), gap: ms(10) },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  iconWrap:  { width: ms(28), height: ms(28), borderRadius: ms(7), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  col:       { flex: 1 },
  label:     { fontSize: fs(9.5), color: "#8A7F82", fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  value:     { fontSize: fs(12.5), color: "#2B1B1F", fontWeight: "700", marginTop: ms(1) },
});

// ── Option constants ──────────────────────────────────────────────────────────

const GENDER_OPTIONS:   { key: Gender;          label: string }[] = [{ key: "male", label: "Male" }, { key: "female", label: "Female" }];
const QUAL_OPTIONS:     { key: Qualification;   label: string }[] = [{ key: "class10", label: "Class 10" }, { key: "class12", label: "Class 12" }, { key: "graduation", label: "Graduation" }, { key: "post_graduation", label: "Post Graduation" }];
const COURSE_OPTIONS:   { key: CoursePreference; label: string }[] = [{ key: "ssc", label: "SSC" }, { key: "banking", label: "Banking" }, { key: "railway", label: "Railway" }, { key: "foundation", label: "Foundation" }, { key: "others", label: "Others" }];
const DURATION_OPTIONS: { key: DurationPref;    label: string }[] = [{ key: "3months", label: "3 Months" }, { key: "6months", label: "6 Months" }, { key: "1year", label: "1 Year" }];
const TIMING_OPTIONS:   { key: BatchTiming;     label: string }[] = [{ key: "morning", label: "Morning" }, { key: "midday", label: "Mid Day" }, { key: "evening", label: "Evening" }];
const PAYMENT_OPTIONS:  { key: PaymentMode;     label: string }[] = [{ key: "cash", label: "Cash" }, { key: "online", label: "Online Payment" }];

// ── Main Screen ───────────────────────────────────────────────────────────────

export function StudentAdmissionScreen({ navigation }: Props) {
  const [step, setStep]  = useState(0);
  const slideAnim        = useRef(new Animated.Value(0)).current;

  // ── QR Scanner ──
  const [scannerOpen, setScannerOpen]     = useState(false);
  const [aadhaarFilled, setAadhaarFilled] = useState(false);

  // ── Discard confirm ──
  const [discardVisible, setDiscardVisible] = useState(false);

  // ── Info modal (replaces native Alert) ──
  const [infoModal, setInfoModal] = useState<{
    type: "success" | "error" | "warning";
    title: string;
    body: string;
    onClose?: () => void;
  } | null>(null);
  function showInfo(type: "success" | "error" | "warning", title: string, body: string, onClose?: () => void) {
    setInfoModal({ type, title, body, onClose });
  }

  // ── Step 1: Personal ──
  const [fullName, setFullName] = useState("");
  const [phone, setPhone]       = useState("");
  const [dob, setDob]           = useState("");
  const [gender, setGender]     = useState<Gender | null>(null);
  const [aadhaar, setAadhaar]   = useState("");
  const [address, setAddress]   = useState("");

  // ── Step 2: Family ──
  const [fatherName, setFatherName]               = useState("");
  const [motherName, setMotherName]               = useState("");
  const [guardianOccupation, setGuardianOccupation] = useState("");
  const [email, setEmail]                         = useState("");

  // ── Step 3: Course ──
  const [coursePreference, setCoursePreference]   = useState<CoursePreference | null>(null);
  const [durationPreference, setDurationPreference] = useState<DurationPref | null>(null);
  const [qualification, setQualification]         = useState<Qualification | null>(null);
  const [passYear, setPassYear]                   = useState("");
  const [board, setBoard]                         = useState("");

  // ── Step 4: Contact ──
  const [whatsapp, setWhatsapp]           = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");

  // ── Step 5: Office ──
  const [batches, setBatches]             = useState<BatchItem[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchId, setBatchId]             = useState<string | null>(null);
  const [preferredTiming, setPreferredTiming] = useState<BatchTiming | null>(null);
  const [paymentMode, setPaymentMode]     = useState<PaymentMode | null>(null);
  const [amountPaid, setAmountPaid]       = useState("");

  // ── Submit ──
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [admitted, setAdmitted] = useState<AdmitStudentResult | null>(null);

  const checkScale  = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(ms(60))).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listBatches()
      .then(setBatches)
      .catch(() => {})
      .finally(() => setBatchesLoading(false));
  }, []);

  // ── Step navigation ────────────────────────────────────────────────────────

  function animateStep(direction: 1 | -1, targetStep: number) {
    slideAnim.setValue(direction * ms(60));
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 120, friction: 12 }).start();
    setStep(targetStep);
  }

  function validateStep(): boolean {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!fullName.trim()) errs.fullName = "Full name is required.";
      if (!phone.trim() || !/^\d{7,15}$/.test(phone.trim())) errs.phone = "Valid phone number required (digits only, 7–15 digits).";
      if (dob.trim() && !parseDisplayDate(dob)) errs.dob = "Enter date in DD/MM/YYYY format.";
    }
    if (step === 1) {
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    }
    if (step === 4) {
      if (amountPaid.trim() && isNaN(Number(amountPaid))) errs.amountPaid = "Enter a valid amount.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (!validateStep()) return;
    animateStep(1, step + 1);
  }

  function handlePrev() {
    setErrors({});
    animateStep(-1, step - 1);
  }

  // ── Aadhaar QR ────────────────────────────────────────────────────────────

  function handleQRScan(rawData: string) {
    setScannerOpen(false);
    console.log("[Aadhaar QR] raw data:", rawData);
    const parsed = parseAadhaarQR(rawData);
    console.log("[Aadhaar QR] parsed:", parsed);
    if (!parsed) {
      showInfo("error", "Unrecognised QR", "This doesn't look like an Aadhaar QR code.\nTry scanning the QR on the back of the card.");
      return;
    }
    if (parsed.fullName) setFullName(parsed.fullName);
    if (parsed.dob)      setDob(parsed.dob);
    if (parsed.gender)   setGender(parsed.gender);
    if (parsed.address)  setAddress(parsed.address);
    if (parsed.aadhaar)  setAadhaar(parsed.aadhaar);
    setAadhaarFilled(true);
    showInfo("success", "Details Auto-filled!", "Name, DOB, gender and address have been filled from your Aadhaar card.\n\nPlease verify and edit if needed.");
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validateStep()) return;
    setLoading(true);
    try {
      const payload: AdmitStudentPayload = {
        fullName:           fullName.trim(),
        phone:              phone.trim(),
        email:              email.trim() || null,
        dob:                parseDisplayDate(dob) ?? null,
        address:            address.trim() || null,
        aadhaar:            aadhaar.trim() || null,
        gender,
        fatherName:         fatherName.trim() || null,
        motherName:         motherName.trim() || null,
        guardianOccupation: guardianOccupation.trim() || null,
        guardianPhone:      guardianPhone.trim() || null,
        qualification,
        passYear:           passYear.trim() || null,
        board:              board.trim() || null,
        whatsapp:           whatsapp.trim() || null,
        coursePreference,
        durationPreference,
        batchId:            batchId ?? null,
        preferredTiming,
        paymentMode,
        amountPaid:         amountPaid.trim() ? Number(amountPaid) : null,
      };

      const response = await admitStudent(payload);
      if (response.ok) {
        setAdmitted(response.result);
        Animated.parallel([
          Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7, delay: 100 }),
          Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 60 }),
        ]).start();
      } else if ("batchFull" in response) {
        showInfo("warning", "Batch is Full", response.message);
      } else {
        setErrors({ submit: "Admission failed. Please try again." });
      }
    } catch {
      setErrors({ submit: "Network error — please check your connection." });
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    const hasInput = fullName || phone || dob || address || fatherName || motherName;
    if (hasInput) {
      setDiscardVisible(true);
    } else {
      navigation.goBack();
    }
  }

  // ── Step content ──────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      // ─── Step 1: Personal ────────────────────────────────────────────────
      case 0: return (
        <View style={s.stepContent}>
          <SectionHead icon="person-outline" label="Personal Details" color="#8B1E3F" />

          {/* Aadhaar QR scan button */}
          <TouchableOpacity
            style={[s.scanBtn, s.scanBtnGrad, aadhaarFilled && s.scanBtnDone, { backgroundColor: aadhaarFilled ? "#1B9C63" : "#8B1E3F" }]}
            onPress={() => setScannerOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name={aadhaarFilled ? "checkmark-circle" : "qr-code-outline"} size={ms(20)} color="#fff" />
            <View>
              <Text style={s.scanBtnTitle}>
                {aadhaarFilled ? "Aadhaar Scanned ✓" : "Scan Aadhaar Card"}
              </Text>
              <Text style={s.scanBtnSub}>
                {aadhaarFilled ? "Tap to re-scan if needed" : "Auto-fill name, DOB & address from QR"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={ms(16)} color="rgba(255,255,255,0.7)" style={{ marginLeft: "auto" }} />
          </TouchableOpacity>

          <FormField label="FULL NAME" value={fullName} onChangeText={(v) => { setFullName(v); setErrors((p) => ({ ...p, fullName: "" })); }}
            placeholder="e.g. Rahul Kumar Sharma" error={errors.fullName} icon="person-outline" maxLength={120} clearable returnKeyType="next" />
          <FormField label="DATE OF BIRTH" value={dob} onChangeText={(v) => { setDob(autoFormatDate(v)); setErrors((p) => ({ ...p, dob: "" })); }}
            placeholder="DD/MM/YYYY" keyboardType="number-pad" error={errors.dob} icon="calendar-outline" hint="Auto-filled from Aadhaar if scanned" />

          <View style={s.fieldBlock}>
            <Text style={s.fieldLabel}>GENDER</Text>
            <OptionRow options={GENDER_OPTIONS} value={gender} onSelect={setGender} color="#8B1E3F" />
          </View>

          <FormField label="AADHAAR NUMBER" value={aadhaar} onChangeText={(v) => setAadhaar(v.replace(/\D/g, "").slice(0, 12))}
            placeholder="12-digit Aadhaar number" keyboardType="number-pad" icon="card-outline" hint="Auto-filled from Aadhaar if scanned" />
          <FormField label="ADDRESS" value={address} onChangeText={setAddress}
            placeholder="House, Street, City, State" icon="location-outline" hint="Auto-filled from Aadhaar if scanned" />
          <FormField label="PHONE NUMBER" value={phone} onChangeText={(v) => { setPhone(v.replace(/\D/g, "")); setErrors((p) => ({ ...p, phone: "" })); }}
            placeholder="e.g. 9876543210" keyboardType="phone-pad" error={errors.phone} icon="call-outline" />
        </View>
      );

      // ─── Step 2: Family ──────────────────────────────────────────────────
      case 1: return (
        <View style={s.stepContent}>
          <SectionHead icon="people-outline" label="Family Details" color="#E8752C" sub="Optional — fill what's available" />
          <FormField label="FATHER'S NAME" value={fatherName} onChangeText={setFatherName}
            placeholder="e.g. Rajesh Kumar Sharma" icon="person-outline" returnKeyType="next" />
          <FormField label="MOTHER'S NAME" value={motherName} onChangeText={setMotherName}
            placeholder="e.g. Sunita Devi" icon="person-outline" returnKeyType="next" />
          <FormField label="OCCUPATION OF PARENT / GUARDIAN" value={guardianOccupation} onChangeText={setGuardianOccupation}
            placeholder="e.g. Business, Govt. Employee, Farmer" icon="briefcase-outline" returnKeyType="next" />
          <FormField label="EMAIL (PARENT / GUARDIAN)" value={email} onChangeText={(v) => { setEmail(v); setErrors((p) => ({ ...p, email: "" })); }}
            placeholder="e.g. parent@gmail.com" keyboardType="email-address" error={errors.email} icon="mail-outline" />
        </View>
      );

      // ─── Step 3: Course ──────────────────────────────────────────────────
      case 2: return (
        <View style={s.stepContent}>
          <SectionHead icon="book-outline" label="Course Preference" color="#2563A8" sub="Optional — student's choice" />

          <View style={s.fieldBlock}>
            <Text style={s.fieldLabel}>COURSE APPLIED FOR</Text>
            <OptionRow options={COURSE_OPTIONS} value={coursePreference} onSelect={setCoursePreference} color="#8B1E3F" />
          </View>

          <View style={s.fieldBlock}>
            <Text style={s.fieldLabel}>DURATION OF THE COURSE</Text>
            <OptionRow options={DURATION_OPTIONS} value={durationPreference} onSelect={setDurationPreference} color="#2563A8" />
          </View>

          <View style={s.fieldBlock}>
            <Text style={s.fieldLabel}>QUALIFICATION</Text>
            <OptionRow options={QUAL_OPTIONS} value={qualification} onSelect={setQualification} color="#2CA6A4" />
          </View>

          <View style={s.twoCol}>
            <View style={{ flex: 1 }}>
              <FormField label="PASS YEAR" value={passYear} onChangeText={(v) => setPassYear(v.replace(/\D/g, "").slice(0, 4))}
                placeholder="e.g. 2023" keyboardType="number-pad" icon="calendar-outline" />
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="BOARD / UNIVERSITY" value={board} onChangeText={setBoard}
                placeholder="e.g. CBSE" icon="school-outline" />
            </View>
          </View>
        </View>
      );

      // ─── Step 4: Contact ─────────────────────────────────────────────────
      case 3: return (
        <View style={s.stepContent}>
          <SectionHead icon="chatbubble-outline" label="Contact Details" color="#2CA6A4" />
          <FormField label="SELF WHATSAPP NUMBER" value={whatsapp} onChangeText={(v) => setWhatsapp(v.replace(/\D/g, ""))}
            placeholder="e.g. 9876543210" keyboardType="phone-pad" icon="logo-whatsapp" />
          <FormField label="PARENTS CONTACT NUMBER" value={guardianPhone} onChangeText={(v) => setGuardianPhone(v.replace(/\D/g, ""))}
            placeholder="e.g. 9876543210" keyboardType="phone-pad" icon="call-outline" hint="Emergency / alternate contact" />

          {/* T&C preview */}
          <View style={s.tcBox}>
            <Text style={s.tcTitle}>Terms & Conditions</Text>
            {[
              "Admission is subject to availability of seats in the selected batch.",
              "Fees once paid are non-refundable.",
              "The institute reserves the right to change batch timings or course details.",
              "The student must attend all classes regularly and on time.",
            ].map((t, i) => (
              <View key={i} style={s.tcRow}>
                <Text style={s.tcNum}>{i + 1}.</Text>
                <Text style={s.tcT}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      );

      // ─── Step 5: Office Use ──────────────────────────────────────────────
      case 4: return (
        <View style={s.stepContent}>
          <View style={[s.officeBanner, { backgroundColor: "#2563A8" }]}>
            <Ionicons name="business-outline" size={ms(15)} color="#fff" />
            <Text style={s.officeBannerT}>FOR OFFICE USE ONLY</Text>
          </View>

          <SectionHead icon="layers-outline" label="Batch Assignment" color="#2563A8" />
          {batchesLoading
            ? <View style={s.batchLoad}><ActivityIndicator size="small" color="#2563A8" /><Text style={s.batchLoadT}>Loading batches…</Text></View>
            : <BatchPicker batches={batches} selectedId={batchId} onSelect={setBatchId} />
          }

          <View style={[s.fieldBlock, { marginTop: ms(20) }]}>
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
            onChangeText={(v) => { setAmountPaid(v.replace(/[^0-9.]/g, "")); setErrors((p) => ({ ...p, amountPaid: "" })); }}
            placeholder="e.g. 5000" keyboardType="decimal-pad" icon="cash-outline"
            error={errors.amountPaid} hint="Initial fee collected at admission" />

          {errors.submit && (
            <View style={s.submitError}>
              <Text style={s.submitErrorT}>{errors.submit}</Text>
            </View>
          )}
        </View>
      );

      default: return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="New Admission" onBack={handleBack} />

      {/* Step progress bar */}
      <StepBar current={step} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Animated step wrapper */}
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
            {step < 4 ? (
              <TouchableOpacity style={[s.nextBtn, s.nextBtnGrad, { backgroundColor: "#8B1E3F" }]} onPress={handleNext} activeOpacity={0.85}>
                <Text style={s.nextBtnT}>Next</Text>
                <Ionicons name="chevron-forward" size={ms(18)} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.nextBtn, s.nextBtnGrad, { backgroundColor: "#1B9C63" }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Text style={s.nextBtnT}>Complete Admission</Text>
                      <Ionicons name="checkmark-circle-outline" size={ms(18)} color="#fff" />
                    </>
                }
              </TouchableOpacity>
            )}
          </View>

          {/* Step indicator pill */}
          <Text style={s.stepPill}>Step {step + 1} of {STEPS.length} — {STEPS[step].label}</Text>

          <View style={{ height: ms(24) }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* QR Scanner modal */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <QRScannerModal onClose={() => setScannerOpen(false)} onScan={handleQRScan} />
      </Modal>

      {/* Discard Admission modal */}
      <Modal visible={discardVisible} transparent animationType="fade" onRequestClose={() => setDiscardVisible(false)}>
        <View style={s.discardOverlay}>
          <View style={s.discardCard}>
            {/* Icon circle */}
            <View style={s.discardIconCircle}>
              <Ionicons name="trash-outline" size={ms(30)} color="#8B1E3F" />
            </View>

            <Text style={s.discardTitle}>Discard Admission?</Text>
            <Text style={s.discardBody}>
              All the details you've entered across{"\n"}
              <Text style={{ fontWeight: "700", color: "#8B1E3F" }}>
                {step + 1} step{step > 0 ? "s" : ""}
              </Text>{" "}
              will be lost permanently.{"\n"}This action cannot be undone.
            </Text>

            {/* Divider */}
            <View style={s.discardDivider} />

            <TouchableOpacity
              style={s.discardDestructiveBtn}
              onPress={() => { setDiscardVisible(false); navigation.goBack(); }}
              activeOpacity={0.82}
            >
              <Ionicons name="trash-outline" size={ms(16)} color="#fff" />
              <Text style={s.discardDestructiveTxt}>Yes, Discard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.discardCancelBtn}
              onPress={() => setDiscardVisible(false)}
              activeOpacity={0.82}
            >
              <Ionicons name="arrow-back-outline" size={ms(16)} color="#8B1E3F" />
              <Text style={s.discardCancelTxt}>Continue Filling</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Info / Alert modal */}
      <Modal visible={!!infoModal} transparent animationType="fade" onRequestClose={() => { infoModal?.onClose?.(); setInfoModal(null); }}>
        {infoModal && (() => {
          const cfg = {
            success: { bg: "#F0FDF8", border: "#A7F3D0", iconBg: "#D1FAE5", iconColor: "#1B9C63", icon: "checkmark-circle-outline" as const },
            error:   { bg: "#FFF5F5", border: "#FECACA", iconBg: "#FEE2E2", iconColor: "#DC2626", icon: "alert-circle-outline" as const },
            warning: { bg: "#FFFBEB", border: "#FDE68A", iconBg: "#FEF3C7", iconColor: "#D97706", icon: "warning-outline" as const },
          }[infoModal.type];
          return (
            <View style={s.infoOverlay}>
              <View style={[s.infoCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                <View style={[s.infoIconCircle, { backgroundColor: cfg.iconBg }]}>
                  <Ionicons name={cfg.icon} size={ms(32)} color={cfg.iconColor} />
                </View>
                <Text style={s.infoTitle}>{infoModal.title}</Text>
                <Text style={s.infoBody}>{infoModal.body}</Text>
                <TouchableOpacity
                  style={[s.infoBtn, { backgroundColor: cfg.iconColor }]}
                  onPress={() => { infoModal.onClose?.(); setInfoModal(null); }}
                  activeOpacity={0.82}
                >
                  <Text style={s.infoBtnTxt}>Got it</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}
      </Modal>

      {/* Full-screen loader */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color="#8B1E3F" />
            <Text style={s.loaderTitle}>Processing Admission…</Text>
            <Text style={s.loaderSub}>Please wait a moment</Text>
          </View>
        </View>
      )}

      {/* Full-screen success card */}
      {admitted !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <ScrollView contentContainerStyle={s.successScroll} showsVerticalScrollIndicator={false}>
            <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>
              <Animated.View style={{ transform: [{ scale: checkScale }], marginBottom: ms(20) }}>
                <View style={[s.checkCircle, { backgroundColor: "#1B9C63" }]}>
                  <Ionicons name="checkmark" size={ms(44)} color="#fff" />
                </View>
              </Animated.View>

              <Text style={s.successTitle}>Admission Complete!</Text>
              <View style={s.regCodeRow}>
                <Ionicons name="id-card-outline" size={ms(14)} color="#8B1E3F" />
                <Text style={s.regCode}>{admitted.student.studentCode}</Text>
              </View>
              <Text style={s.successSub}>Student registered successfully</Text>

              <View style={s.detailBox}>
                <DetailRow icon="person-outline"    label="Student Name"    value={admitted.student.fullName}                                                                   color="#8B1E3F" />
                <DetailRow icon="call-outline"      label="Phone"           value={admitted.student.phone}                                                                       color="#2CA6A4" />
                {admitted.student.coursePreference && (
                  <DetailRow icon="book-outline"    label="Course Pref."    value={admitted.student.coursePreference.toUpperCase()}                                              color="#2563A8" />
                )}
                {admitted.enrollment && (
                  <DetailRow icon="layers-outline"  label="Batch Assigned"  value={batches.find((b) => b.id === admitted.enrollment?.batchId)?.name ?? "Assigned"}              color="#1B9C63" />
                )}
                {admitted.student.amountPaid && (
                  <DetailRow icon="cash-outline"    label="Amount Paid"     value={`₹ ${Number(admitted.student.amountPaid).toLocaleString("en-IN")}`}                          color="#1B9C63" />
                )}
                {admitted.student.paymentMode && (
                  <DetailRow icon="card-outline"    label="Payment Mode"    value={admitted.student.paymentMode === "cash" ? "Cash" : "Online Payment"}          color="#E8752C" last />
                )}
              </View>

              <View style={s.termsBox}>
                <Text style={s.termsT}>📋 Terms & Conditions acknowledged</Text>
                <Text style={s.termsSub}>Fees once paid are non-refundable. Student must attend all classes regularly.</Text>
              </View>

              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={[s.doneBtnWrap, s.doneBtn]}>
                <Ionicons name="school-outline" size={ms(18)} color="#fff" />
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
  body:        { paddingHorizontal: ms(16), paddingTop: ms(16), paddingBottom: ms(40) },

  stepContent: { gap: ms(2) },
  card:        { backgroundColor: "#FFFFFF", borderRadius: ms(20), padding: ms(18), marginBottom: ms(14), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  // Aadhaar scan
  scanBtn:        { marginBottom: ms(18), borderRadius: ms(14) },
  scanBtnDone:    {},
  scanBtnGrad:    { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: ms(16), paddingVertical: ms(14) },
  scanBtnTitle:   { fontSize: fs(14), fontWeight: "800", color: "#fff" },
  scanBtnSub:     { fontSize: fs(11), color: "rgba(255,255,255,0.8)", marginTop: ms(2) },

  // Field blocks
  fieldBlock:  { marginBottom: ms(16) },
  fieldLabel:  { fontSize: fs(11), fontWeight: "800", color: "#8A7F82", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: ms(10) },
  twoCol:      { flexDirection: "row", gap: ms(10) },

  // T&C
  tcBox:  { backgroundColor: "#FAFAF8", borderRadius: ms(12), padding: ms(14), borderWidth: 1, borderColor: "#EDE8E3", gap: ms(8) },
  tcTitle: { fontSize: fs(12), fontWeight: "800", color: "#8B1E3F", marginBottom: ms(4) },
  tcRow:  { flexDirection: "row", gap: ms(6) },
  tcNum:  { fontSize: fs(11.5), color: "#8A7F82", fontWeight: "700", width: ms(14) },
  tcT:    { fontSize: fs(11.5), color: "#8A7F82", flex: 1, lineHeight: fs(16) },

  // Office banner
  officeBanner:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(10), paddingVertical: ms(10), marginBottom: ms(16) },
  officeBannerT: { fontSize: fs(11), fontWeight: "800", color: "#fff", letterSpacing: 1.5 },
  divider:       { height: 1, backgroundColor: "#EFF4FF", marginVertical: ms(16) },
  batchLoad:     { flexDirection: "row", alignItems: "center", gap: ms(10), paddingVertical: ms(12) },
  batchLoadT:    { fontSize: fs(12), color: "#8A7F82" },

  // Errors
  submitError:   { backgroundColor: "#FEF0EE", borderRadius: ms(12), borderWidth: 1, borderColor: "#F5C6C0", padding: ms(14), marginTop: ms(8) },
  submitErrorT:  { fontSize: fs(13), color: "#C0392B", lineHeight: fs(18) },

  // Nav buttons
  navRow:       { flexDirection: "row", alignItems: "center", marginBottom: ms(10) },
  navSpacer:    { flex: 1 },
  prevBtn:      { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(16), paddingVertical: ms(12), borderRadius: ms(14), backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#E0D8D4" },
  prevBtnT:     { fontSize: fs(14), fontWeight: "700", color: "#8B1E3F" },
  nextBtn:      { borderRadius: ms(14) },
  nextBtnGrad:  { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(22), paddingVertical: ms(13), borderRadius: ms(14) },
  nextBtnT:     { fontSize: fs(14), fontWeight: "800", color: "#fff" },
  stepPill:     { textAlign: "center", fontSize: fs(11), color: "#B0A9AC", marginTop: ms(2) },

  // Loader
  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,251,240,0.96)", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: "#FFFFFF", borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F" },
  loaderSub:     { fontSize: fs(12), color: "#8A7F82" },

  // Success
  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFBF0" },
  successScroll:  { flexGrow: 1, justifyContent: "center", paddingHorizontal: ms(20), paddingVertical: ms(32) },
  successCard:    { backgroundColor: "#FFFFFF", borderRadius: ms(28), padding: ms(24), alignItems: "center", shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(24), elevation: 12 },
  checkCircle:    { width: ms(88), height: ms(88), borderRadius: ms(44), justifyContent: "center", alignItems: "center" },
  successTitle:   { fontSize: fs(22), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(8) },
  regCodeRow:     { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: "#FEF4F4", borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(6), marginBottom: ms(8) },
  regCode:        { fontSize: fs(14), fontWeight: "800", color: "#8B1E3F", letterSpacing: 1 },
  successSub:     { fontSize: fs(13), color: "#8A7F82", marginBottom: ms(20), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: "#FAFAFA", borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(16), borderWidth: 1, borderColor: "#F0EDE8" },
  termsBox:       { width: "100%", backgroundColor: "#FFFBF0", borderRadius: ms(12), padding: ms(12), marginBottom: ms(20), borderWidth: 1, borderColor: "#F5E6CE" },
  termsT:         { fontSize: fs(12), fontWeight: "700", color: "#8B1E3F", marginBottom: ms(4) },
  termsSub:       { fontSize: fs(11), color: "#8A7F82", lineHeight: fs(16) },
  doneBtnWrap:    { width: "100%" },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(16) },
  doneBtnT:       { fontSize: fs(15), fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },

  // ── Discard modal ──
  discardOverlay:       { flex: 1, backgroundColor: "rgba(16,4,8,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: ms(28) },
  discardCard:          { width: "100%", backgroundColor: "#FFFFFF", borderRadius: ms(24), paddingHorizontal: ms(24), paddingTop: ms(32), paddingBottom: ms(24), alignItems: "center", shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(12) }, shadowOpacity: 0.22, shadowRadius: ms(28), elevation: 18 },
  discardIconCircle:    { width: ms(64), height: ms(64), borderRadius: ms(32), backgroundColor: "#FFF0F3", borderWidth: 2, borderColor: "#F5C2CE", justifyContent: "center", alignItems: "center", marginBottom: ms(18) },
  discardTitle:         { fontSize: fs(18), fontWeight: "800", color: "#2B1B1F", marginBottom: ms(10), letterSpacing: 0.2 },
  discardBody:          { fontSize: fs(13), color: "#6B5B5F", textAlign: "center", lineHeight: fs(20), marginBottom: ms(20) },
  discardDivider:       { width: "100%", height: 1, backgroundColor: "#F2EAE8", marginBottom: ms(16) },
  discardDestructiveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), width: "100%", backgroundColor: "#8B1E3F", borderRadius: ms(14), paddingVertical: ms(14), marginBottom: ms(10) },
  discardDestructiveTxt: { fontSize: fs(14), fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
  discardCancelBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), width: "100%", backgroundColor: "#FFF0F3", borderRadius: ms(14), paddingVertical: ms(13), borderWidth: 1.5, borderColor: "#F5C2CE" },
  discardCancelTxt:     { fontSize: fs(14), fontWeight: "700", color: "#8B1E3F" },

  // ── Info modal ──
  infoOverlay:   { flex: 1, backgroundColor: "rgba(16,4,8,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: ms(28) },
  infoCard:      { width: "100%", borderRadius: ms(24), borderWidth: 1.5, paddingHorizontal: ms(24), paddingTop: ms(32), paddingBottom: ms(24), alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: ms(10) }, shadowOpacity: 0.18, shadowRadius: ms(24), elevation: 16 },
  infoIconCircle: { width: ms(68), height: ms(68), borderRadius: ms(34), justifyContent: "center", alignItems: "center", marginBottom: ms(16) },
  infoTitle:     { fontSize: fs(17), fontWeight: "800", color: "#1A1214", marginBottom: ms(10), textAlign: "center", letterSpacing: 0.2 },
  infoBody:      { fontSize: fs(13), color: "#5A4F53", textAlign: "center", lineHeight: fs(20), marginBottom: ms(24) },
  infoBtn:       { width: "100%", borderRadius: ms(14), paddingVertical: ms(14), alignItems: "center" },
  infoBtnTxt:    { fontSize: fs(14), fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.4 },
});

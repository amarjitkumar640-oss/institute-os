import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, Animated, Easing, TouchableOpacity,
  ActivityIndicator, Modal, Linking, Share, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { KeyboardAvoidingScroll } from "../../components/ui/KeyboardAvoidingScroll";
import { FormField } from "../../components/ui/FormField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { BottomSheet, SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { CenterPickerSheet } from "../../components/ui/CenterPickerSheet";
import { T } from "../../components/ui/typography";
import {
  admitStudent, uploadStudentPhoto, deleteStudentPhoto,
  type AdmitStudentPayload, type AdmitStudentResult,
} from "../../api/students";
import { getAdmissionApplication } from "../../api/admissionApplications";
import {
  listDocumentTypes, uploadStudentDocument, deleteStudentDocument,
  type DocumentType,
} from "../../api/documents";
import { listBatches, type BatchItem } from "../../api/batches";
import { listCourses, type CourseItem } from "../../api/courses";
import { apiClient } from "../../api/client";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { usePermission } from "../../hooks/usePermission";
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

// ── Silent single-center resolution ────────────────────────────────────────────
// Used by handleSubmit to auto-resolve a centerId when the session has none
// pinned, without ever closing the loading overlay — if it fetches and finds
// exactly one center, the retry happens immediately under the same spinner
// instead of flashing it closed and reopening it.

async function resolveSingleCenter(): Promise<string | null> {
  try {
    const { data } = await apiClient.get<{ id: string; name: string }[]>("/centers/assignable");
    return data.length === 1 ? data[0].id : null;
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

function isoToDisplayDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
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
  const colors = useThemeColors();
  return (
    <View style={sb.wrap}>
      {STEPS.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        const color  = done || active ? colors.primary : C.border;
        return (
          <React.Fragment key={i}>
            <View style={sb.stepCol}>
              <View style={[sb.circle, { borderColor: color, backgroundColor: done ? colors.primary : C.inputBg }]}>
                {done
                  ? <Ionicons name="checkmark" size={ms(12)} color="#fff" />
                  : <Text style={[sb.num, { color }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[sb.lbl, { color: active ? colors.primary : done ? colors.primary : C.placeholder, fontWeight: active ? "700" : "600" }]} numberOfLines={1}>
                {step.label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[sb.line, { backgroundColor: done ? colors.primary : C.border }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const sb = StyleSheet.create({
  wrap:    { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: ms(16), paddingVertical: ms(14), backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  stepCol: { alignItems: "center", gap: ms(4), width: ms(52) },
  circle:  { width: ms(28), height: ms(28), borderRadius: ms(14), borderWidth: 2, justifyContent: "center", alignItems: "center" },
  num:     { ...T.badgeText },
  lbl:     { fontSize: fs(9), textAlign: "center" },
  line:    { flex: 1, height: 2, alignSelf: "center", marginBottom: ms(16), marginHorizontal: ms(-2) },
});

// ── Option row ────────────────────────────────────────────────────────────────

function OptionRow<T extends string>({ options, value, onSelect, color }: {
  options: { key: T; label: string }[];
  value: T | null | undefined;
  onSelect: (k: T) => void;
  color?: string;
}) {
  const colors = useThemeColors();
  const resolvedColor = color ?? colors.primary;
  return (
    <View style={or.row}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[or.pill, active && { backgroundColor: resolvedColor, borderColor: resolvedColor }]}
            onPress={() => onSelect(opt.key)}
            activeOpacity={0.75}
          >
            <View style={[or.radio, { borderColor: active ? "#fff" : C.border }]}>
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
  pill:        { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(12), paddingVertical: ms(8), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border },
  radio:       { width: ms(14), height: ms(14), borderRadius: ms(7), borderWidth: 2, justifyContent: "center", alignItems: "center" },
  radioDot:    { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: C.card },
  label:       { ...T.chipText, color: C.muted },
  labelActive: { color: "#fff", fontFamily: "Inter_700Bold", fontWeight: "700" },
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
  label:   { ...T.sectionHeading },
  sub:     { ...T.caption, color: C.muted, marginTop: ms(1) },
});

// ── QR Scanner modal ──────────────────────────────────────────────────────────

function QRScannerModal({ onClose, onScan }: { onClose: () => void; onScan: (data: string) => void }) {
  const qr = useThemedStyles(makeQrStyles);
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
            <Ionicons name="shield-checkmark-outline" size={ms(14)} color={C.green} />
            <Text style={qr.uidT}>Your data stays on your device — not uploaded</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const CUTOUT = ms(230);
const makeQrStyles = (colors: ThemeColors) => StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#000" },
  center:     { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center", padding: ms(32) },
  permT:      { color: "#fff", fontSize: fs(15), textAlign: "center", lineHeight: fs(22), marginBottom: ms(24) },
  permBtn:    { backgroundColor: colors.primary, borderRadius: ms(12), paddingHorizontal: ms(28), paddingVertical: ms(12) },
  permBtnT:   { color: "#fff", fontFamily: "Inter_700Bold", fontWeight: "700", fontSize: fs(14) },

  overlay:    { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  topBar:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ms(16), paddingBottom: ms(12), backgroundColor: "rgba(0,0,0,0.6)" },
  closeBtn:   { width: ms(36), height: ms(36), borderRadius: ms(18), backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  title:      { color: "#fff", fontSize: fs(15), fontFamily: "Inter_700Bold", fontWeight: "700" },

  cutoutRow:  { flexDirection: "row", height: CUTOUT },
  darkSide:   { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  cutout:     { width: CUTOUT, height: CUTOUT },

  corner:     { position: "absolute", width: ms(24), height: ms(24), borderColor: colors.primary },
  tl:         { top: 0, left: 0, borderTopWidth: ms(3), borderLeftWidth: ms(3), borderTopLeftRadius: ms(4) },
  tr:         { top: 0, right: 0, borderTopWidth: ms(3), borderRightWidth: ms(3), borderTopRightRadius: ms(4) },
  bl:         { bottom: 0, left: 0, borderBottomWidth: ms(3), borderLeftWidth: ms(3), borderBottomLeftRadius: ms(4) },
  br:         { bottom: 0, right: 0, borderBottomWidth: ms(3), borderRightWidth: ms(3), borderBottomRightRadius: ms(4) },

  bottom:     { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", gap: ms(16), paddingHorizontal: ms(24) },
  hint:       { color: "rgba(255,255,255,0.85)", fontSize: fs(13), textAlign: "center", lineHeight: fs(20) },
  uidPill:    { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: C.green + "2E", borderRadius: ms(20), paddingHorizontal: ms(14), paddingVertical: ms(8), borderWidth: 1, borderColor: C.green + "59" },
  uidT:       { color: "#80EFBC", fontSize: fs(11.5), fontFamily: "Inter_600SemiBold", fontWeight: "600" },

});

// ── Batch picker ──────────────────────────────────────────────────────────────

function monthsToDurationPref(months: number): DurationPref {
  if (months <= 3) return "3months";
  if (months <= 6) return "6months";
  return "1year";
}

// ── Batch picker modal — same full-screen concept as Course/Qualification ─────

function BatchPickerModal({ visible, batches, selectedId, onSelect, onClose }: {
  visible:    boolean;
  batches:    BatchItem[];
  selectedId: string | null;
  onSelect:   (id: string | null) => void;
  onClose:    () => void;
}) {
  const colors = useThemeColors();
  const bpm = useThemedStyles(makeBpmStyles);
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  useEffect(() => { if (!visible) setSearch(""); }, [visible]);

  const active = batches.filter((b) => b.status !== "completed");
  const filtered = active.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.course.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <TouchableOpacity style={ps.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[ps.panel, { paddingBottom: insets.bottom + ms(8) }]}>
        <View style={ps.handle} />

        <View style={ps.headerRow}>
          <View style={[ps.headerIco, { backgroundColor: C.blue + "18" }]}>
            <Ionicons name="layers-outline" size={ms(18)} color={C.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ps.headerTitle}>Select Batch</Text>
            <Text style={ps.headerSub}>{active.length} batch{active.length !== 1 ? "es" : ""} available</Text>
          </View>
          <TouchableOpacity style={ps.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>

        <View style={ps.searchWrap}>
          <View style={ps.searchRow}>
            <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
            <TextInput
              style={ps.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search batches…"
              placeholderTextColor={C.placeholder}
              returnKeyType="search"
              autoCorrect={false}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={ms(15)} color={C.placeholder} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView style={ps.list} contentContainerStyle={ps.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={[bpm.laterCard, !selectedId && bpm.laterCardSel]}
            onPress={() => { onSelect(null); onClose(); }}
            activeOpacity={0.75}
          >
            <Ionicons name="close-circle-outline" size={ms(18)} color={!selectedId ? colors.primary : C.muted} />
            <Text style={[bpm.laterCardT, !selectedId && { color: colors.primary }]}>Assign batch later</Text>
            {!selectedId && <Ionicons name="checkmark-circle" size={ms(16)} color={colors.primary} />}
          </TouchableOpacity>

          {filtered.length === 0 ? (
            <View style={ps.empty}>
              <Ionicons name="layers-outline" size={ms(32)} color={C.placeholder} />
              <Text style={ps.emptyT}>No batches found</Text>
              <Text style={ps.emptySub}>Try a different search term</Text>
            </View>
          ) : (
            <View style={bpm.list}>
              {filtered.map((b) => {
                const color = b.course.examCategories[0]?.color ?? C.muted;
                const label = b.course.examCategories.length ? b.course.examCategories.map((ec) => ec.label).join(", ") : "General";
                const sel   = selectedId === b.id;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[bpm.card, { borderColor: sel ? color : C.border }, sel && { backgroundColor: color + "0A" }]}
                    onPress={() => { onSelect(b.id); onClose(); }}
                    activeOpacity={0.75}
                  >
                    <View style={[bpm.cardDot, { backgroundColor: color }]} />
                    <View style={bpm.cardBody}>
                      <Text style={[bpm.cardName, sel && { color }]} numberOfLines={1}>{b.name}</Text>
                      <Text style={bpm.cardCourse} numberOfLines={1}>{b.course.name}</Text>
                      <View style={bpm.cardMetaRow}>
                        <View style={[bpm.catPill, { backgroundColor: color + "16" }]}>
                          <Text style={[bpm.catPillT, { color }]}>{label}</Text>
                        </View>
                        <View style={bpm.seatsRow}>
                          <Ionicons name="people-outline" size={ms(11)} color={C.muted} />
                          <Text style={bpm.seatsT}>{b.enrolledCount}/{b.capacity} seats</Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons
                      name={sel ? "checkmark-circle" : "chevron-forward"}
                      size={ms(sel ? 20 : 16)}
                      color={sel ? color : C.muted}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
      </View>
    </Modal>
  );
}

const makeBpmStyles = (colors: ThemeColors) => StyleSheet.create({
  laterCard:    { flexDirection: "row", alignItems: "center", gap: ms(10), backgroundColor: C.card, borderRadius: ms(14), borderWidth: 1.5, borderColor: C.border, padding: ms(14), marginBottom: ms(14) },
  laterCardSel: { borderColor: colors.primary, backgroundColor: colors.primary + "0C" },
  laterCardT:   { flex: 1, ...T.listItemTitle, color: C.text },

  list: { gap: ms(10) },
  card: {
    flexDirection: "row", alignItems: "center", gap: ms(12),
    backgroundColor: C.card, borderRadius: ms(14), borderWidth: 1.5,
    paddingHorizontal: ms(14), paddingVertical: ms(12),
  },
  cardDot:  { width: ms(9), height: ms(9), borderRadius: ms(5), flexShrink: 0 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { ...T.listItemTitle, color: C.text },
  cardCourse: { ...T.caption, color: C.muted, marginTop: ms(1) },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: ms(8), marginTop: ms(6) },
  catPill:   { borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  catPillT:  { ...T.badgeText },
  seatsRow:  { flexDirection: "row", alignItems: "center", gap: ms(4) },
  seatsT:    { ...T.caption, color: C.muted },
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
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(7), gap: ms(10) },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  iconWrap:  { width: ms(28), height: ms(28), borderRadius: ms(7), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  col:       { flex: 1 },
  label:     { ...T.sectionHeading, color: C.muted },
  value:     { ...T.listItemTitle, color: C.text, marginTop: ms(1) },
});

// ── Option constants ──────────────────────────────────────────────────────────

// ── Terms & Conditions ────────────────────────────────────────────────────────

const TERMS_LIST = [
  "The admission fee and course fee once paid are strictly non-refundable under any circumstances.",
  "Admission is subject to availability of seats in the selected batch.",
  "The institute reserves the right to change batch timings, schedule, or course content without prior notice.",
  "Students must maintain regular attendance. Irregular attendance will not entitle them to any refund or fee adjustment.",
  "Students are responsible for the safety of their personal belongings on institute premises.",
  "Any misconduct or misbehavior will result in immediate cancellation of admission without refund.",
  "All information provided in this admission form is accurate and true to the best of our knowledge.",
];

function buildWhatsAppText(result: AdmitStudentResult, batchName?: string): string {
  const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const lines: string[] = [
    `📚 *Admission Confirmed*`,
    ``,
    `Dear ${result.student.fullName},`,
    `Your admission has been successfully registered.`,
    ``,
    `*Student Code:* ${result.student.studentCode}`,
    ...(batchName        ? [`*Batch:* ${batchName}`] : []),
    ...(result.student.amountPaid ? [`*Amount Paid:* ₹${Number(result.student.amountPaid).toLocaleString("en-IN")}`] : []),
    `*Date:* ${date}`,
    ``,
    `*Terms & Conditions:*`,
    ...TERMS_LIST.map((t, i) => `${i + 1}. ${t}`),
    ``,
    `_By enrolling, you have agreed to all the above terms and conditions._`,
  ];
  return lines.join("\n");
}

function openWhatsApp(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const intl   = digits.length === 10 ? `91${digits}` : digits;
  const url    = `whatsapp://send?phone=${intl}&text=${encodeURIComponent(text)}`;
  Linking.openURL(url).catch(() => Share.share({ message: text }));
}

// ── Option constants ──────────────────────────────────────────────────────────

const GENDER_OPTIONS:   { key: Gender;          label: string }[] = [{ key: "male", label: "Male" }, { key: "female", label: "Female" }];
const QUAL_OPTIONS:     { key: Qualification;   label: string }[] = [{ key: "class10", label: "Class 10" }, { key: "class12", label: "Class 12" }, { key: "graduation", label: "Graduation" }, { key: "post_graduation", label: "Post Graduation" }];
const COURSE_OPTIONS:   { key: CoursePreference; label: string }[] = [{ key: "ssc", label: "SSC" }, { key: "banking", label: "Banking" }, { key: "railway", label: "Railway" }, { key: "foundation", label: "Foundation" }, { key: "others", label: "Others" }];
const DURATION_OPTIONS: { key: DurationPref;    label: string }[] = [{ key: "3months", label: "3 Months" }, { key: "6months", label: "6 Months" }, { key: "1year", label: "1 Year" }];
const TIMING_OPTIONS:   { key: BatchTiming;     label: string }[] = [{ key: "morning", label: "Morning" }, { key: "midday", label: "Mid Day" }, { key: "evening", label: "Evening" }];
const PAYMENT_OPTIONS:  { key: PaymentMode;     label: string }[] = [{ key: "cash", label: "Cash" }, { key: "online", label: "Online Payment" }];

// ── Terms modal — full-screen readable view, front desk turns phone to student ─

function TermsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  const tm = useThemedStyles(makeTmStyles);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={tm.safe} edges={["bottom"]}>

        <View style={[tm.header, { paddingTop: insets.top + ms(8) }]}>
          <View style={tm.headerIcon}>
            <Ionicons name="document-text-outline" size={ms(20)} color={colors.primary} />
          </View>
          <Text style={tm.headerTitle}>Terms &amp; Conditions</Text>
          <TouchableOpacity style={tm.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(20)} color={C.text} />
          </TouchableOpacity>
        </View>
        <View style={tm.divider} />

        <ScrollView contentContainerStyle={tm.body} showsVerticalScrollIndicator={false}>
          {/* Non-refund alert — most important rule, shown first */}
          <View style={tm.alertBox}>
            <Ionicons name="warning" size={ms(22)} color={C.red} />
            <View style={{ flex: 1 }}>
              <Text style={tm.alertTitle}>Important Notice</Text>
              <Text style={tm.alertBody}>
                Fees once paid are strictly non-refundable under any circumstances.
              </Text>
            </View>
          </View>

          {TERMS_LIST.map((term, i) => (
            <View key={i} style={tm.termRow}>
              <View style={tm.termNum}>
                <Text style={tm.termNumT}>{i + 1}</Text>
              </View>
              <Text style={tm.termText}>{term}</Text>
            </View>
          ))}

          <View style={tm.footerBox}>
            <Ionicons name="information-circle-outline" size={ms(15)} color={C.muted} />
            <Text style={tm.footerT}>
              Show this screen to the student / parent and confirm they have read and understood all terms before proceeding.
            </Text>
          </View>
        </ScrollView>

        <View style={tm.btnWrap}>
          <TouchableOpacity style={tm.btn} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle-outline" size={ms(18)} color="#fff" />
            <Text style={tm.btnT}>Understood — Close</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Step error banner ─────────────────────────────────────────────────────────

function StepErrorBanner({ errors }: { errors: Record<string, string> }) {
  const msgs = Object.entries(errors)
    .filter(([k, v]) => k !== "submit" && !!v)
    .map(([, v]) => v);
  if (!msgs.length) return null;
  return (
    <View style={eb.wrap}>
      <Ionicons name="alert-circle" size={ms(16)} color={C.red} style={{ flexShrink: 0, marginTop: ms(1) }} />
      <View style={{ flex: 1 }}>
        <Text style={eb.title}>Please fix the following:</Text>
        {msgs.map((msg, i) => (
          <Text key={i} style={eb.msg}>• {msg}</Text>
        ))}
      </View>
    </View>
  );
}

const eb = StyleSheet.create({
  wrap:  { flexDirection: "row", alignItems: "flex-start", gap: ms(8), backgroundColor: C.red + "10", borderRadius: ms(12), padding: ms(12), marginBottom: ms(16), borderWidth: 1, borderColor: C.red + "30" },
  title: { ...T.chipText, color: C.red, marginBottom: ms(4) },
  msg:   { ...T.body, color: C.red },
});

// ── Shared picker-sheet styles ────────────────────────────────────────────────

const ps = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  panel:       { backgroundColor: C.card, borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), maxHeight: SHEET_HEIGHT.tall, paddingTop: ms(10) },
  handle:      { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginBottom: ms(12) },
  headerRow:   { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: ms(16), paddingBottom: ms(14), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  headerIco:   { width: ms(40), height: ms(40), borderRadius: ms(13), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  headerTitle: { ...T.cardTitle, color: C.text },
  headerSub:   { ...T.caption, color: C.muted, marginTop: ms(2) },
  closeBtn:    { width: ms(36), height: ms(36), borderRadius: ms(11), backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  searchWrap:  { paddingHorizontal: ms(16), paddingTop: ms(12), paddingBottom: ms(4) },
  searchRow:   { flexDirection: "row", alignItems: "center", gap: ms(8), backgroundColor: C.inputBg, borderRadius: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  searchInput: { flex: 1, ...T.body, color: C.text, includeFontPadding: false, padding: 0 },
  list:        { flexGrow: 0 },
  listContent: { paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(24) },
  empty:       { alignItems: "center", gap: ms(8), paddingVertical: ms(32) },
  emptyT:      { ...T.listItemTitle, color: C.muted },
  emptySub:    { ...T.bodySmall, color: C.placeholder },
});

// ── Course picker modal (Step 3) ──────────────────────────────────────────────

function CoursePickerModal({ visible, courses, selectedId, onSelect, onClose }: {
  visible:    boolean;
  courses:    CourseItem[];
  selectedId: string | null;
  onSelect:   (course: CourseItem) => void;
  onClose:    () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  useEffect(() => { if (!visible) setSearch(""); }, [visible]);

  const filtered = courses.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.examCategories.length ? c.examCategories.map((ec) => ec.label).join(", ") : "General").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <TouchableOpacity style={ps.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[ps.panel, { paddingBottom: insets.bottom + ms(8) }]}>
        <View style={ps.handle} />

        <View style={ps.headerRow}>
          <View style={[ps.headerIco, { backgroundColor: C.purple + "18" }]}>
            <Ionicons name="book-outline" size={ms(18)} color={C.purple} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ps.headerTitle}>Select Course</Text>
            <Text style={ps.headerSub}>{courses.length} course{courses.length !== 1 ? "s" : ""} available</Text>
          </View>
          <TouchableOpacity style={ps.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>

        <View style={ps.searchWrap}>
          <View style={ps.searchRow}>
            <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
            <TextInput
              style={ps.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search courses…"
              placeholderTextColor={C.placeholder}
              returnKeyType="search"
              autoCorrect={false}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={ms(15)} color={C.placeholder} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView style={ps.list} contentContainerStyle={cp.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            <View style={ps.empty}>
              <Ionicons name="search-outline" size={ms(32)} color={C.placeholder} />
              <Text style={ps.emptyT}>No courses found</Text>
              <Text style={ps.emptySub}>Try a different search term</Text>
            </View>
          ) : (
            <View style={cp.grid}>
              {filtered.map((course) => {
                const color = course.examCategories[0]?.color ?? C.muted;
                const label = course.examCategories.length ? course.examCategories.map((ec) => ec.label).join(", ") : "General";
                const sel   = selectedId === course.id;
                return (
                  <TouchableOpacity
                    key={course.id}
                    style={[cp.gridCard, { borderColor: sel ? color : C.border }, sel && { backgroundColor: color + "10" }]}
                    onPress={() => onSelect(course)}
                    activeOpacity={0.75}
                  >
                    <View style={cp.gridNameRow}>
                      <Text style={[cp.gridName, sel && { color }]} numberOfLines={2}>{course.name}</Text>
                      {sel && <Ionicons name="checkmark-circle" size={ms(16)} color={color} style={{ marginLeft: ms(4), flexShrink: 0 }} />}
                    </View>
                    <View style={cp.gridCatRow}>
                      <View style={[cp.gridCatPill, { backgroundColor: color + "16" }]}>
                        <View style={[cp.gridDot, { backgroundColor: color }]} />
                        <Text style={[cp.gridCat, { color }]}>{label}</Text>
                      </View>
                    </View>
                    <View style={cp.gridMeta}>
                      <Text style={cp.gridDur}>{course.durationMonths}mo</Text>
                      {course.defaultFee > 0 && (
                        <Text style={cp.gridFee}>₹{Number(course.defaultFee / 1000).toFixed(0)}k</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
      </View>
    </Modal>
  );
}

const cp = StyleSheet.create({
  listContent: { paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(40) },
  grid:        { flexDirection: "row", flexWrap: "wrap", gap: ms(10) },
  gridCard:    { width: "47%", backgroundColor: C.card, borderRadius: ms(14), borderWidth: 1.5, overflow: "hidden" },
  gridNameRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: ms(10), paddingTop: ms(10), paddingBottom: ms(4) },
  gridCatRow:  { paddingHorizontal: ms(10), paddingBottom: ms(8) },
  gridCatPill: { flexDirection: "row", alignItems: "center", gap: ms(5), borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3) },
  gridDot:     { width: ms(6), height: ms(6), borderRadius: ms(3) },
  gridCat:     { ...T.chipText },
  gridName:    { flex: 1, ...T.cardTitle, color: C.text },
  gridMeta:    { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(10), paddingBottom: ms(10) },
  gridDur:     { ...T.caption, color: C.muted },
  gridFee:     { ...T.caption, color: C.green },
});

// ── Duration picker (Step 3) ──────────────────────────────────────────────────

function DurationPicker({ value, onSelect, error }: {
  value: string | null | undefined;
  onSelect: (k: DurationPref) => void;
  error?: string;
}) {
  const BLUE  = C.blue;
  const items: { key: DurationPref; label: string; hint: string }[] = [
    { key: "3months", label: "3 Months", hint: "Short-term"  },
    { key: "6months", label: "6 Months", hint: "Standard"    },
    { key: "1year",   label: "1 Year",   hint: "Long-term"   },
  ];
  return (
    <View>
      <View style={dp.row}>
        {items.map(({ key, label, hint }) => {
          const active = value === key;
          return (
            <TouchableOpacity
              key={key}
              style={[dp.card, active && { backgroundColor: BLUE, borderColor: BLUE }]}
              onPress={() => onSelect(key)}
              activeOpacity={0.75}
            >
              <Text style={[dp.label, active && { color: "#fff" }]}>{label}</Text>
              <Text style={[dp.hint,  active && { color: "rgba(255,255,255,0.72)" }]}>{hint}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!error && (
        <View style={dp.err}>
          <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
          <Text style={dp.errT}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const dp = StyleSheet.create({
  row:   { flexDirection: "row", gap: ms(8) },
  card:  { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(12), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border, gap: ms(3) },
  label: { ...T.listItemTitle, color: C.text },
  hint:  { ...T.caption, color: C.muted },
  err:   { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(8) },
  errT:  { ...T.helperText, color: C.red, flex: 1 },
});

// ── Qualification grid (Step 3) ───────────────────────────────────────────────

const QUAL_DISPLAY: Record<string, { icon: string; label: string }> = {
  class10:         { icon: "book-outline",    label: "Class 10"   },
  class12:         { icon: "library-outline", label: "Class 12"   },
  graduation:      { icon: "star-outline",    label: "Graduation" },
  post_graduation: { icon: "ribbon-outline",  label: "Post Grad"  },
};

function QualGrid({ value, onSelect, error }: {
  value: string | null | undefined;
  onSelect: (k: Qualification) => void;
  error?: string;
}) {
  const colors = useThemeColors();
  const TEAL = colors.accent;
  const keys = Object.keys(QUAL_DISPLAY) as Qualification[];
  return (
    <View>
      <View style={qg.grid}>
        {keys.map((key) => {
          const { icon, label } = QUAL_DISPLAY[key];
          const active = value === key;
          return (
            <TouchableOpacity
              key={key}
              style={[qg.card, active && { backgroundColor: TEAL, borderColor: TEAL }]}
              onPress={() => onSelect(key)}
              activeOpacity={0.75}
            >
              <Ionicons name={icon as any} size={ms(22)} color={active ? "#fff" : TEAL} />
              <Text style={[qg.name, active && { color: "#fff" }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!error && (
        <View style={qg.err}>
          <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
          <Text style={qg.errT}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const qg = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: ms(10) },
  card: { width: "47%", alignItems: "center", justifyContent: "center", paddingVertical: ms(14), paddingHorizontal: ms(8), borderRadius: ms(14), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border, gap: ms(6) },
  name: { ...T.listItemTitle, color: C.text, textAlign: "center" },
  err:  { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(8) },
  errT: { ...T.helperText, color: C.red, flex: 1 },
});

// ── Qualification picker modal (Step 3) ──────────────────────────────────────

function QualPickerModal({ visible, value, onSelect, onClose }: {
  visible:  boolean;
  value:    string | null | undefined;
  onSelect: (k: Qualification) => void;
  onClose:  () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const TEAL   = colors.accent;
  const items: { key: Qualification; icon: string; label: string; sub: string }[] = [
    { key: "class10",         icon: "book-outline",    label: "Class 10",        sub: "Secondary"        },
    { key: "class12",         icon: "library-outline", label: "Class 12",        sub: "Senior Secondary" },
    { key: "graduation",      icon: "star-outline",    label: "Graduation",      sub: "Bachelor's Degree" },
    { key: "post_graduation", icon: "ribbon-outline",  label: "Post Graduation", sub: "Master's Degree"  },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <TouchableOpacity style={ps.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[ps.panel, { paddingBottom: insets.bottom + ms(8) }]}>
        <View style={ps.handle} />

        <View style={ps.headerRow}>
          <View style={[ps.headerIco, { backgroundColor: TEAL + "18" }]}>
            <Ionicons name="ribbon-outline" size={ms(18)} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ps.headerTitle}>Highest Qualification</Text>
            <Text style={ps.headerSub}>Select your most recent education level</Text>
          </View>
          <TouchableOpacity style={ps.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={qpm.body} showsVerticalScrollIndicator={false}>
          <View style={qpm.grid}>
            {items.map(({ key, icon, label, sub }) => {
              const active = value === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[qpm.card, active && { borderColor: TEAL, backgroundColor: TEAL + "12" }]}
                  onPress={() => { onSelect(key); onClose(); }}
                  activeOpacity={0.75}
                >
                  <View style={[qpm.iconWrap, { backgroundColor: active ? TEAL : TEAL + "18" }]}>
                    <Ionicons name={icon as any} size={ms(26)} color={active ? "#fff" : TEAL} />
                  </View>
                  <Text style={[qpm.cardLabel, active && { color: TEAL }]}>{label}</Text>
                  <Text style={qpm.cardSub}>{sub}</Text>
                  {active && (
                    <View style={qpm.checkBadge}>
                      <Ionicons name="checkmark-circle" size={ms(18)} color={TEAL} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
      </View>
    </Modal>
  );
}

const qpm = StyleSheet.create({
  body:       { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(48) },
  grid:       { flexDirection: "row", flexWrap: "wrap", gap: ms(14) },
  card:       { width: "47%", alignItems: "center", paddingTop: ms(22), paddingBottom: ms(16), paddingHorizontal: ms(8), borderRadius: ms(18), backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, gap: ms(8), position: "relative" },
  iconWrap:   { width: ms(56), height: ms(56), borderRadius: ms(18), justifyContent: "center", alignItems: "center" },
  cardLabel:  { ...T.cardTitle, color: C.text, textAlign: "center" },
  cardSub:    { ...T.caption, color: C.muted, textAlign: "center" },
  checkBadge: { position: "absolute", top: ms(8), right: ms(8) },
});

// ── Timing picker (Step 5) ────────────────────────────────────────────────────

function TimingPicker({ value, onSelect }: {
  value:    BatchTiming | null | undefined;
  onSelect: (k: BatchTiming) => void;
}) {
  const BLUE  = C.blue;
  const items: { key: BatchTiming; icon: string; label: string; sub: string }[] = [
    { key: "morning", icon: "sunny-outline",        label: "Morning", sub: "6am – 10am"  },
    { key: "midday",  icon: "partly-sunny-outline", label: "Mid Day", sub: "11am – 2pm"  },
    { key: "evening", icon: "moon-outline",         label: "Evening", sub: "4pm – 8pm"   },
  ];
  return (
    <View style={tp.row}>
      {items.map(({ key, icon, label, sub }) => {
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            style={[tp.card, active && { backgroundColor: BLUE, borderColor: BLUE }]}
            onPress={() => onSelect(key)}
            activeOpacity={0.75}
          >
            <Ionicons name={icon as any} size={ms(20)} color={active ? "#fff" : BLUE} />
            <Text style={[tp.label, active && { color: "#fff" }]}>{label}</Text>
            <Text style={[tp.sub, active && { color: "rgba(255,255,255,0.72)" }]}>{sub}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tp = StyleSheet.create({
  row:   { flexDirection: "row", gap: ms(8) },
  card:  { flex: 1, alignItems: "center", paddingVertical: ms(14), borderRadius: ms(14), backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border, gap: ms(4) },
  label: { ...T.listItemTitle, color: C.blue },
  sub:   { ...T.caption, color: C.muted },
});

// ── Payment mode picker (Step 5) ──────────────────────────────────────────────

function PaymentModePicker({ value, onSelect, error }: {
  value:    PaymentMode | null | undefined;
  onSelect: (k: PaymentMode) => void;
  error?:   string;
}) {
  const GREEN = C.green;
  const modes: { key: PaymentMode; icon: string; label: string; sub: string }[] = [
    { key: "cash",   icon: "cash-outline", label: "Cash",   sub: "Collect physically" },
    { key: "online", icon: "card-outline", label: "Online", sub: "UPI / NEFT / IMPS"  },
  ];
  return (
    <View>
      <View style={pmp.row}>
        {modes.map(({ key, icon, label, sub }) => {
          const active = value === key;
          return (
            <TouchableOpacity
              key={key}
              style={[pmp.card, active && { borderColor: GREEN, backgroundColor: GREEN + "10" }]}
              onPress={() => onSelect(key)}
              activeOpacity={0.75}
            >
              <View style={[pmp.iconWrap, { backgroundColor: active ? GREEN : GREEN + "18" }]}>
                <Ionicons name={icon as any} size={ms(16)} color={active ? "#fff" : GREEN} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[pmp.label, active && { color: GREEN }]} numberOfLines={1}>{label}</Text>
                <Text style={pmp.sub} numberOfLines={1}>{sub}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={ms(15)} color={GREEN} />}
            </TouchableOpacity>
          );
        })}
      </View>
      {!!error && (
        <View style={pmp.err}>
          <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
          <Text style={pmp.errT}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const pmp = StyleSheet.create({
  row:     { flexDirection: "row", gap: ms(10) },
  card:    { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: ms(10), paddingHorizontal: ms(10), borderRadius: ms(12), backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, gap: ms(8) },
  iconWrap: { width: ms(32), height: ms(32), borderRadius: ms(10), justifyContent: "center", alignItems: "center", flexShrink: 0 },
  label:   { ...T.listItemTitle, color: C.text },
  sub:     { ...T.caption, color: C.muted, marginTop: ms(1) },
  err:     { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(8) },
  errT:    { ...T.helperText, color: C.red, flex: 1 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export function StudentAdmissionScreen({ navigation, route }: Props) {
  const applicationId = route.params?.applicationId;
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const insets = useSafeAreaInsets();

  // Nothing links here for a role without students.write today (the FABs
  // that open this screen — from the dashboard and the student list — are
  // themselves hidden), but nothing stops a direct navigation.navigate
  // either — RootNavigator registers every route unconditionally. The
  // underlying POST /students/admit call requires students.write regardless
  // of whether this is a fresh admission or reviewing an existing
  // application (applicationId), so one gate covers both entry points.
  const { canWrite } = usePermission("students");
  useEffect(() => { if (!canWrite) navigation.goBack(); }, [canWrite]);

  const [step, setStep]  = useState(0);
  const slideAnim        = useRef(new Animated.Value(0)).current;
  const scrollRef        = useRef<ScrollView>(null);

  // ── QR Scanner ──
  const [scannerOpen, setScannerOpen]     = useState(false);
  const [aadhaarFilled, setAadhaarFilled] = useState(false);

  // ── Discard confirm ──
  const [discardVisible, setDiscardVisible] = useState(false);

  // ── Terms & Conditions ──
  const [termsOpen,      setTermsOpen]      = useState(false);
  const [tcAcknowledged, setTcAcknowledged] = useState(false);
  const [applicantAcceptedTc, setApplicantAcceptedTc] = useState(false);

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
  const [coursePreference, setCoursePreference]     = useState<CoursePreference | null>(null);
  const [selectedCourseId, setSelectedCourseId]     = useState<string | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(null);
  const [coursePickerOpen, setCoursePickerOpen]     = useState(false);
  const [qualPickerOpen, setQualPickerOpen]         = useState(false);
  const [courses, setCourses]                       = useState<CourseItem[]>([]);
  const [coursesLoading, setCoursesLoading]         = useState(true);
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
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const selectedBatch = batches.find((b) => b.id === batchId) ?? null;
  const [preferredTiming, setPreferredTiming] = useState<BatchTiming | null>(null);
  const [paymentMode, setPaymentMode]     = useState<PaymentMode | null>(null);
  const [amountPaid, setAmountPaid]       = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  // ── Submit ──
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [admitted, setAdmitted] = useState<AdmitStudentResult | null>(null);
  const [docsStepDone, setDocsStepDone] = useState(false);
  const [centerPickerVisible, setCenterPickerVisible] = useState(false);

  const checkScale     = useRef(new Animated.Value(0)).current;
  const cardSlide      = useRef(new Animated.Value(ms(60))).current;
  const cardOpacity    = useRef(new Animated.Value(0)).current;
  const ringScale      = useRef(new Animated.Value(0)).current;
  const ringOpacity    = useRef(new Animated.Value(0)).current;
  const sparkle        = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY       = useRef(new Animated.Value(ms(10))).current;

  useEffect(() => {
    listBatches()
      .then(setBatches)
      .catch(() => {})
      .finally(() => setBatchesLoading(false));
  }, []);

  useEffect(() => {
    listCourses({ limit: 100 })
      .then((r) => setCourses(r.data))
      .catch(() => {})
      .finally(() => setCoursesLoading(false));
  }, []);

  // Opened via "Review" from the Admission Applications inbox — prefill only
  // the student-fillable fields; office-use ones (batch/payment/etc.) are
  // still left for frontdesk to fill in on the Office step below.
  useEffect(() => {
    if (!applicationId) return;
    getAdmissionApplication(applicationId)
      .then((app) => {
        setFullName(app.fullName);
        setPhone(app.phone);
        if (app.dob) setDob(isoToDisplayDate(app.dob));
        setGender((app.gender as Gender | null) ?? null);
        setAddress(app.address ?? "");
        setFatherName(app.fatherName ?? "");
        setMotherName(app.motherName ?? "");
        setGuardianOccupation(app.guardianOccupation ?? "");
        setEmail(app.email ?? "");
        setGuardianPhone(app.guardianPhone ?? "");
        setQualification((app.qualification as Qualification | null) ?? null);
        setPassYear(app.passYear ?? "");
        setBoard(app.board ?? "");
        setWhatsapp(app.whatsapp ?? "");
        setCoursePreference((app.coursePreference as CoursePreference | null) ?? null);
        setDurationPreference((app.durationPreference as DurationPref | null) ?? null);
        if (app.courseId) {
          setSelectedCourseId(app.courseId);
          setSelectedCourseName(app.course?.name ?? null);
        }
        // The applicant already accepted terms themselves when they
        // submitted the public form — no need to make frontdesk re-tick
        // this (still editable, e.g. if they want to walk through the terms
        // again in person anyway).
        if (app.tcAcceptedAt) {
          setTcAcknowledged(true);
          setApplicantAcceptedTc(true);
        }
      })
      .catch(() => {
        showInfo("error", "Couldn't load application", "The application details couldn't be loaded — you can still fill the form in manually.");
      });
  }, [applicationId]);

  // ── Step navigation ────────────────────────────────────────────────────────

  function animateStep(direction: 1 | -1, targetStep: number) {
    slideAnim.setValue(direction * ms(60));
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 120, friction: 12 }).start();
    setStep(targetStep);
  }

  function validateStep(): boolean {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!fullName.trim())  errs.fullName = "Full name is required.";
      if (!phone.trim())     errs.phone    = "Phone number is required.";
      else if (!/^\d{7,15}$/.test(phone.trim())) errs.phone = "Enter a valid phone number (7–15 digits, no spaces).";
      if (!dob.trim())       errs.dob      = "Date of birth is required.";
      else if (!parseDisplayDate(dob)) errs.dob = "Enter date of birth in DD/MM/YYYY format.";
      if (!gender)           errs.gender   = "Please select a gender.";
      if (!aadhaar.trim())   errs.aadhaar  = "Aadhaar number is required.";
      else if (!/^\d{12}$/.test(aadhaar.trim())) errs.aadhaar = "Enter a valid 12-digit Aadhaar number.";
      if (!address.trim())  errs.address  = "Address is required.";
    }
    if (step === 1) {
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    }
    if (step === 2) {
      // selectedCourseId (not coursePreference) is the real signal that a
      // course was chosen — the manual CoursePickerModal always sets both
      // together, but the prefill-from-AdmissionApplication effect can set
      // selectedCourseId alone when the application's own coursePreference
      // field is empty even though it has a specific courseId. Validating
      // on coursePreference let that show a selected course while still
      // blocking Next with "Please select a course."
      if (!selectedCourseId)   errs.coursePreference   = "Please select a course.";
      if (!qualification)      errs.qualification      = "Please select your highest qualification.";
      if (!passYear.trim() || !/^\d{4}$/.test(passYear.trim())) errs.passYear = "Enter a valid 4-digit pass year (e.g. 2022).";
      if (!board.trim())       errs.board              = "Board / University name is required.";
    }
    if (step === 3) {
      if (!tcAcknowledged) errs.tcAcknowledged = "T&C acknowledgment is required — please confirm the student / parent was informed.";
    }
    if (step === 4) {
      if (amountPaid.trim() && isNaN(Number(amountPaid))) errs.amountPaid = "Enter a valid amount (numbers only).";
      if (amountPaid.trim() && !isNaN(Number(amountPaid)) && Number(amountPaid) > 0 && !paymentMode) {
        errs.paymentMode = "Select a payment mode when recording a payment.";
      }
      if (discountAmount.trim() && (isNaN(Number(discountAmount)) || Number(discountAmount) < 0)) {
        errs.discountAmount = "Enter a valid discount amount.";
      } else if (discountAmount.trim()) {
        const selectedCourse = courses.find((c) => c.id === selectedCourseId);
        if (selectedCourse && Number(discountAmount) > selectedCourse.defaultFee) {
          errs.discountAmount = "Discount cannot exceed the course fee.";
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (!validateStep()) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
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

  function revealSuccessCard() {
    setDocsStepDone(true);
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

  async function handleSubmit(overrideCenterId?: string) {
    if (!validateStep()) return;
    setLoading(true);
    try {
      const payload: AdmitStudentPayload = {
        ...(overrideCenterId ? { centerId: overrideCenterId } : {}),
        fullName:           fullName.trim(),
        phone:              phone.trim(),
        email:              email.trim() || null,
        // dob/address/aadhaar/gender are enforced required by validateStep()
        // on step 0 before the wizard can advance, so they're guaranteed
        // present (and dob guaranteed parseable) by the time this runs.
        dob:                parseDisplayDate(dob) as string,
        address:            address.trim(),
        aadhaar:            aadhaar.trim(),
        gender:             gender as Gender,
        fatherName:         fatherName.trim() || null,
        motherName:         motherName.trim() || null,
        guardianOccupation: guardianOccupation.trim() || null,
        guardianPhone:      guardianPhone.trim() || null,
        qualification,
        passYear:           passYear.trim() || null,
        board:              board.trim() || null,
        whatsapp:           whatsapp.trim() || null,
        courseId:           selectedCourseId ?? null,
        coursePreference,
        durationPreference,
        batchId:            batchId ?? null,
        preferredTiming,
        paymentMode,
        amountPaid:         amountPaid.trim() ? Number(amountPaid) : null,
        discountAmount:     discountAmount.trim() ? Number(discountAmount) : null,
        discountReason:     discountReason.trim() || null,
        tcAcknowledged:     tcAcknowledged || undefined,
        applicationId,
      };

      const response = await admitStudent(payload);
      if (response.ok) {
        // Success card animation is deferred until the Documents stage finishes
        // (skip or continue) — see revealSuccessCard().
        setAdmitted(response.result);
      } else if ("batchFull" in response) {
        showInfo("warning", "Batch is Full", response.message);
      } else if (typeof response.error === "string" && response.error.includes("centerId") && !overrideCenterId) {
        // Try to silently resolve a single available center before bothering the user —
        // stays inside this same try block (loading never flips false) so the retry
        // happens under one continuous spinner instead of flashing it closed and
        // reopening it. Only offer the manual picker when there's a genuine choice
        // (or an error) to show; if we already supplied a centerId and it still
        // failed, don't retry again — that would loop forever.
        const resolvedCenterId = await resolveSingleCenter();
        if (resolvedCenterId) {
          await handleSubmit(resolvedCenterId);
          return;
        }
        setCenterPickerVisible(true);
      } else {
        const errDetail = typeof response.error === "string"
          ? response.error
          : response.error
            ? JSON.stringify(response.error)
            : "Unknown error";
        console.error("[Admission] API error:", errDetail);
        setErrors({ submit: `Admission failed: ${errDetail}` });
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    } catch (err) {
      console.error("[Admission] network/JS error:", err);
      setErrors({ submit: "Network error — please check your connection." });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
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
          <SectionHead icon="person-outline" label="Personal Details" color={colors.primary} />

          {/* Aadhaar QR scan button */}
          <TouchableOpacity
            style={[s.scanBtn, s.scanBtnGrad, aadhaarFilled && s.scanBtnDone, { backgroundColor: aadhaarFilled ? C.green : colors.primary }]}
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
            placeholder="e.g. Rahul Kumar Sharma" error={errors.fullName} icon="person-outline" maxLength={120} clearable returnKeyType="next" required />
          <FormField label="DATE OF BIRTH" value={dob} onChangeText={(v) => { setDob(autoFormatDate(v)); setErrors((p) => ({ ...p, dob: "" })); }}
            placeholder="DD/MM/YYYY" keyboardType="number-pad" error={errors.dob} icon="calendar-outline" hint="Auto-filled from Aadhaar if scanned" required />

          <View style={s.fieldBlock}>
            <View style={s.reqLabelRow}>
              <Text style={s.fieldLabel}>GENDER</Text>
              <Text style={s.reqAsterisk}> *</Text>
            </View>
            <OptionRow options={GENDER_OPTIONS} value={gender} onSelect={(v) => { setGender(v); setErrors((p) => ({ ...p, gender: "" })); }} color={colors.primary} />
            {!!errors.gender && (
              <View style={s.inlineError}>
                <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
                <Text style={s.inlineErrorT}>{errors.gender}</Text>
              </View>
            )}
          </View>

          <FormField label="AADHAAR NUMBER" value={aadhaar} onChangeText={(v) => { setAadhaar(v.replace(/\D/g, "").slice(0, 12)); setErrors((p) => ({ ...p, aadhaar: "" })); }}
            placeholder="12-digit Aadhaar number" keyboardType="number-pad" error={errors.aadhaar} icon="card-outline" hint="Auto-filled from Aadhaar if scanned" required />
          <FormField label="ADDRESS" value={address} onChangeText={(v) => { setAddress(v); setErrors((p) => ({ ...p, address: "" })); }}
            placeholder="House, Street, City, State" error={errors.address} icon="location-outline" hint="Auto-filled from Aadhaar if scanned" required />
          <FormField label="PHONE NUMBER" value={phone} onChangeText={(v) => { setPhone(v.replace(/\D/g, "")); setErrors((p) => ({ ...p, phone: "" })); }}
            placeholder="e.g. 9876543210" keyboardType="phone-pad" error={errors.phone} icon="call-outline" required />
        </View>
      );

      // ─── Step 2: Family ──────────────────────────────────────────────────
      case 1: return (
        <View style={s.stepContent}>
          <SectionHead icon="people-outline" label="Family Details" color={colors.primary} sub="Optional — fill what's available" />
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

          {/* ── Course Interest ─────────────────────────── */}
          <SectionHead icon="book-outline" label="Course Interest" color={colors.primary} />

          <View style={s.fieldBlock}>
            <View style={s.reqLabelRow}>
              <Text style={s.fieldLabel}>COURSE APPLIED FOR</Text>
              <Text style={s.reqAsterisk}> *</Text>
            </View>
            <TouchableOpacity
              style={[s.courseSel, !!errors.coursePreference && s.courseSelErr]}
              onPress={() => setCoursePickerOpen(true)}
              activeOpacity={0.75}
            >
              {coursesLoading ? (
                <>
                  <ActivityIndicator size="small" color={C.muted} />
                  <Text style={s.courseSelPlaceholder}>Loading courses…</Text>
                </>
              ) : selectedCourseName ? (
                <>
                  <View style={[s.courseSelDot, { backgroundColor: courses.find(c => c.id === selectedCourseId)?.examCategories[0]?.color ?? colors.primary }]} />
                  <Text style={s.courseSelValue} numberOfLines={1}>{selectedCourseName}</Text>
                  <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
                </>
              ) : (
                <>
                  <Ionicons name="book-outline" size={ms(16)} color={errors.coursePreference ? C.red : C.muted} />
                  <Text style={[s.courseSelPlaceholder, !!errors.coursePreference && { color: C.red }]}>Tap to select a course</Text>
                  <Ionicons name="chevron-forward" size={ms(16)} color={errors.coursePreference ? C.red : C.placeholder} />
                </>
              )}
            </TouchableOpacity>
            {!!errors.coursePreference && (
              <View style={s.inlineError}>
                <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
                <Text style={s.inlineErrorT}>{errors.coursePreference}</Text>
              </View>
            )}
          </View>

          {/* ── Academic Background ─────────────────────── */}
          <View style={s.sectionDivider} />
          <SectionHead icon="ribbon-outline" label="Academic Background" color={colors.primary} />

          <View style={s.fieldBlock}>
            <View style={s.reqLabelRow}>
              <Text style={s.fieldLabel}>HIGHEST QUALIFICATION</Text>
              <Text style={s.reqAsterisk}> *</Text>
            </View>
            <TouchableOpacity
              style={[s.courseSel, !!errors.qualification && s.courseSelErr]}
              onPress={() => setQualPickerOpen(true)}
              activeOpacity={0.75}
            >
              {qualification ? (
                <>
                  <Ionicons name={QUAL_DISPLAY[qualification]?.icon as any ?? "ribbon-outline"} size={ms(16)} color={colors.accent} />
                  <Text style={s.courseSelValue} numberOfLines={1}>{QUAL_DISPLAY[qualification]?.label}</Text>
                  <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
                </>
              ) : (
                <>
                  <Ionicons name="ribbon-outline" size={ms(16)} color={errors.qualification ? C.red : C.muted} />
                  <Text style={[s.courseSelPlaceholder, !!errors.qualification && { color: C.red }]}>Tap to select qualification</Text>
                  <Ionicons name="chevron-forward" size={ms(16)} color={errors.qualification ? C.red : C.placeholder} />
                </>
              )}
            </TouchableOpacity>
            {!!errors.qualification && (
              <View style={s.inlineError}>
                <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
                <Text style={s.inlineErrorT}>{errors.qualification}</Text>
              </View>
            )}
          </View>

          <FormField label="PASS YEAR" value={passYear}
            onChangeText={(v) => { setPassYear(v.replace(/\D/g, "").slice(0, 4)); setErrors((p) => ({ ...p, passYear: "" })); }}
            placeholder="e.g. 2023" keyboardType="number-pad" icon="calendar-outline"
            error={errors.passYear} hint="Year of your most recent board / university exam" required />

          <FormField label="BOARD / UNIVERSITY" value={board}
            onChangeText={(v) => { setBoard(v); setErrors((p) => ({ ...p, board: "" })); }}
            placeholder="e.g. CBSE, UP Board, University of Delhi"
            icon="ribbon-outline" error={errors.board} required />

        </View>
      );

      // ─── Step 4: Contact ─────────────────────────────────────────────────
      case 3: return (
        <View style={s.stepContent}>
          <SectionHead icon="chatbubble-outline" label="Contact Details" color={colors.primary} />
          <FormField label="SELF WHATSAPP NUMBER" value={whatsapp} onChangeText={(v) => setWhatsapp(v.replace(/\D/g, ""))}
            placeholder="e.g. 9876543210" keyboardType="phone-pad" icon="logo-whatsapp" />
          <FormField label="PARENTS CONTACT NUMBER" value={guardianPhone} onChangeText={(v) => setGuardianPhone(v.replace(/\D/g, ""))}
            placeholder="e.g. 9876543210" keyboardType="phone-pad" icon="call-outline" hint="Emergency / alternate contact" />

          {/* T&C — show to student + acknowledgment */}
          <View style={s.tcSection}>
            <TouchableOpacity style={s.showTcBtn} onPress={() => setTermsOpen(true)} activeOpacity={0.8}>
              <View style={s.showTcIcon}>
                <Ionicons name="document-text-outline" size={ms(18)} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.showTcTitle}>Terms &amp; Conditions</Text>
                <Text style={s.showTcSub}>Tap to show to student / parent</Text>
              </View>
              <Ionicons name="chevron-forward" size={ms(16)} color={colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.tcCheckRow, tcAcknowledged && s.tcCheckRowOn]}
              onPress={() => setTcAcknowledged(!tcAcknowledged)}
              activeOpacity={0.75}
            >
              <View style={[s.checkbox, tcAcknowledged && s.checkboxOn]}>
                {tcAcknowledged && <Ionicons name="checkmark" size={ms(13)} color="#fff" />}
              </View>
              <Text style={s.tcCheckText}>
                Student / parent has been informed of and accepted all Terms &amp; Conditions
              </Text>
            </TouchableOpacity>

            {applicantAcceptedTc && (
              <View style={s.tcErrorRow}>
                <Ionicons name="checkmark-circle-outline" size={ms(13)} color={C.green} />
                <Text style={[s.tcError, { color: C.green }]}>Applicant already accepted these terms when they applied online</Text>
              </View>
            )}

            {!!errors.tcAcknowledged && (
              <View style={s.tcErrorRow}>
                <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
                <Text style={s.tcError}>{errors.tcAcknowledged}</Text>
              </View>
            )}
          </View>
        </View>
      );

      // ─── Step 5: Office Use ──────────────────────────────────────────────
      case 4: return (
        <View style={s.stepContent}>

          {/* Office badge */}
          <View style={s.officeBadgeWrap}>
            <View style={s.officeBadge}>
              <Ionicons name="business-outline" size={ms(11)} color={C.blue} />
              <Text style={s.officeBadgeT}>FOR OFFICE USE ONLY</Text>
            </View>
          </View>

          {/* ── Batch Assignment ─────────────────────── */}
          <SectionHead icon="layers-outline" label="Batch Assignment" color={colors.primary} />
          <TouchableOpacity
            style={s.courseSel}
            onPress={() => setBatchPickerOpen(true)}
            activeOpacity={0.75}
            disabled={batchesLoading}
          >
            {batchesLoading ? (
              <>
                <ActivityIndicator size="small" color={C.muted} />
                <Text style={s.courseSelPlaceholder}>Loading batches…</Text>
              </>
            ) : selectedBatch ? (
              <>
                <View style={[s.courseSelDot, { backgroundColor: selectedBatch.course.examCategories[0]?.color ?? colors.primary }]} />
                <Text style={s.courseSelValue} numberOfLines={1}>{selectedBatch.name}</Text>
                <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
              </>
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={ms(16)} color={C.muted} />
                <Text style={s.courseSelValue}>Assign batch later</Text>
                <Ionicons name="chevron-forward" size={ms(16)} color={C.muted} />
              </>
            )}
          </TouchableOpacity>

          <View style={[s.fieldBlock, { marginTop: ms(18) }]}>
            <Text style={s.fieldLabel}>PREFERRED BATCH TIMING</Text>
            <TimingPicker value={preferredTiming} onSelect={setPreferredTiming} />
          </View>

          <View style={s.sectionDivider} />

          {/* ── Payment Details ──────────────────────── */}
          <SectionHead icon="cash-outline" label="Payment Details" color={colors.primary} sub="Record initial fee collected at admission" />

          <View style={s.fieldBlock}>
            <Text style={[s.fieldLabel, !!errors.amountPaid && { color: C.red }]}>AMOUNT COLLECTED (₹)</Text>
            <View style={[s.amountRow, !!errors.amountPaid && s.amountRowErr]}>
              <Text style={s.amountPrefix}>₹</Text>
              <TextInput
                style={s.amountInput}
                value={amountPaid}
                onChangeText={(v) => { setAmountPaid(v.replace(/[^0-9.]/g, "")); setErrors((p) => ({ ...p, amountPaid: "" })); }}
                placeholder="0"
                placeholderTextColor={C.placeholder}
                keyboardType="decimal-pad"
              />
            </View>
            {!!errors.amountPaid && (
              <View style={s.inlineError}>
                <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
                <Text style={s.inlineErrorT}>{errors.amountPaid}</Text>
              </View>
            )}
          </View>

          <View style={s.fieldBlock}>
            <Text style={[s.fieldLabel, !!errors.discountAmount && { color: C.red }]}>DISCOUNT FOR THIS STUDENT (₹)</Text>
            <View style={[s.amountRow, !!errors.discountAmount && s.amountRowErr]}>
              <Text style={s.amountPrefix}>₹</Text>
              <TextInput
                style={s.amountInput}
                value={discountAmount}
                onChangeText={(v) => { setDiscountAmount(v.replace(/[^0-9.]/g, "")); setErrors((p) => ({ ...p, discountAmount: "" })); }}
                placeholder="Leave blank for automatic"
                placeholderTextColor={C.placeholder}
                keyboardType="decimal-pad"
              />
            </View>
            {!!errors.discountAmount && (
              <View style={s.inlineError}>
                <Ionicons name="alert-circle-outline" size={ms(13)} color={C.red} />
                <Text style={s.inlineErrorT}>{errors.discountAmount}</Text>
              </View>
            )}
          </View>

          {!!discountAmount.trim() && (
            <FormField label="DISCOUNT REASON" value={discountReason} onChangeText={setDiscountReason}
              placeholder="Optional — e.g. hardship discount" />
          )}

          <View style={s.fieldBlock}>
            <Text style={[s.fieldLabel, !!errors.paymentMode && { color: C.red }]}>MODE OF PAYMENT</Text>
            <PaymentModePicker
              value={paymentMode}
              onSelect={(k) => { setPaymentMode(k); setErrors((p) => ({ ...p, paymentMode: "" })); }}
              error={errors.paymentMode}
            />
          </View>

          {!!errors.submit && (
            <View style={[s.submitError, { flexDirection: "row", alignItems: "flex-start", gap: ms(8) }]}>
              <Ionicons name="alert-circle" size={ms(16)} color={C.red} style={{ flexShrink: 0, marginTop: ms(1) }} />
              <Text style={[s.submitErrorT, { flex: 1 }]}>{errors.submit}</Text>
            </View>
          )}
        </View>
      );

      default: return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!canWrite) return null;

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader title="New Admission" onBack={handleBack} />

      {/* Step progress bar */}
      <StepBar current={step} />

      <KeyboardAvoidingScroll
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.body}
        footer={
          <View style={s.footer}>
            {/* Navigation buttons — same Back/Next/Complete row, now pinned
                instead of scrolling away; still swaps per step like before. */}
            <View style={s.navRow}>
              {step > 0 && (
                <TouchableOpacity style={s.prevBtn} onPress={handlePrev} activeOpacity={0.75}>
                  <Ionicons name="chevron-back" size={ms(18)} color={colors.primary} />
                  <Text style={s.prevBtnT}>Back</Text>
                </TouchableOpacity>
              )}
              <View style={s.navSpacer} />
              {step < 4 ? (
                <TouchableOpacity style={[s.nextBtn, s.nextBtnGrad, { backgroundColor: colors.primary }]} onPress={handleNext} activeOpacity={0.85}>
                  <Text style={s.nextBtnT}>Next</Text>
                  <Ionicons name="chevron-forward" size={ms(18)} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.nextBtn, s.nextBtnGrad, { backgroundColor: colors.primary }]} onPress={() => handleSubmit()} disabled={loading} activeOpacity={0.85}>
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
          </View>
        }
      >

          {/* Animated step wrapper */}
          <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
            <View style={s.card}>
              <StepErrorBanner errors={errors} />
              {renderStep()}
            </View>
          </Animated.View>
      </KeyboardAvoidingScroll>

      {/* QR Scanner modal */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <QRScannerModal onClose={() => setScannerOpen(false)} onScan={handleQRScan} />
      </Modal>

      {/* Course picker modal */}
      <CoursePickerModal
        visible={coursePickerOpen}
        courses={courses}
        selectedId={selectedCourseId}
        onClose={() => setCoursePickerOpen(false)}
        onSelect={(course) => {
          setSelectedCourseId(course.id);
          setSelectedCourseName(course.name);
          setCoursePreference((course.examCategories[0]?.key as CoursePreference) ?? null);
          setDurationPreference(monthsToDurationPref(course.durationMonths));
          setErrors((p) => ({ ...p, coursePreference: "", durationPreference: "" }));
          setCoursePickerOpen(false);
        }}
      />

      {/* Qualification picker modal */}
      <QualPickerModal
        visible={qualPickerOpen}
        value={qualification}
        onClose={() => setQualPickerOpen(false)}
        onSelect={(k) => {
          setQualification(k);
          setErrors((p) => ({ ...p, qualification: "" }));
        }}
      />

      {/* Batch picker modal */}
      <BatchPickerModal
        visible={batchPickerOpen}
        batches={batches}
        selectedId={batchId}
        onClose={() => setBatchPickerOpen(false)}
        onSelect={setBatchId}
      />

      {/* Terms & Conditions modal */}
      <TermsModal visible={termsOpen} onClose={() => setTermsOpen(false)} />

      {/* Discard Admission modal */}
      <Modal visible={discardVisible} transparent animationType="fade" onRequestClose={() => setDiscardVisible(false)}>
        <View style={s.discardOverlay}>
          <View style={s.discardCard}>
            {/* Icon circle */}
            <View style={s.discardIconCircle}>
              <Ionicons name="arrow-undo-outline" size={ms(30)} color={colors.primary} />
            </View>

            <Text style={s.discardTitle}>Discard Admission?</Text>
            <Text style={s.discardBody}>
              All the details you've entered across{"\n"}
              <Text style={{ fontFamily: "Inter_700Bold", fontWeight: "700", color: colors.primary }}>
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
              <Ionicons name="arrow-undo-outline" size={ms(16)} color="#fff" />
              <Text style={s.discardDestructiveTxt}>Yes, Discard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.discardCancelBtn}
              onPress={() => setDiscardVisible(false)}
              activeOpacity={0.82}
            >
              <Ionicons name="arrow-back-outline" size={ms(16)} color={colors.primary} />
              <Text style={s.discardCancelTxt}>Continue Filling</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Info / Alert modal */}
      <Modal visible={!!infoModal} transparent animationType="fade" onRequestClose={() => { infoModal?.onClose?.(); setInfoModal(null); }}>
        {infoModal && (() => {
          const cfg = {
            success: { bg: C.green + "10", border: C.green + "30", iconBg: C.greenBg, iconColor: C.green, icon: "checkmark-circle-outline" as const },
            error:   { bg: C.red + "08", border: C.red + "30", iconBg: C.red + "18", iconColor: C.red, icon: "alert-circle-outline" as const },
            warning: { bg: C.orange + "10", border: C.orange + "30", iconBg: C.orange + "18", iconColor: C.orange, icon: "warning-outline" as const },
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
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderTitle}>Processing Admission…</Text>
            <Text style={s.loaderSub}>Please wait a moment</Text>
          </View>
        </View>
      )}

      <CenterPickerSheet
        visible={centerPickerVisible}
        onClose={() => setCenterPickerVisible(false)}
        onSelect={(centerId) => {
          setCenterPickerVisible(false);
          handleSubmit(centerId);
        }}
      />

      {/* Photo + documents — shown once, before the success card, all optional */}
      {admitted !== null && !docsStepDone && (
        <DocumentsStep studentId={admitted.student.id} onDone={revealSuccessCard} />
      )}

      {/* Full-screen success card */}
      {admitted !== null && docsStepDone && (
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
                  <View style={[s.checkCircle, { backgroundColor: C.green }]}>
                    <Ionicons name="checkmark" size={ms(34)} color="#fff" />
                  </View>
                </Animated.View>

                <Animated.View style={[s.sparkleTL, { opacity: sparkle, transform: [{ scale: sparkle }] }]}>
                  <Ionicons name="sparkles" size={ms(14)} color={colors.secondary} />
                </Animated.View>
                <Animated.View style={[s.sparkleBR, { opacity: sparkle, transform: [{ scale: sparkle }] }]}>
                  <Ionicons name="sparkles" size={ms(10)} color={colors.accent} />
                </Animated.View>
              </View>

              <Animated.View style={[s.successContent, { opacity: contentOpacity, transform: [{ translateY: contentY }] }]}>
                <Text style={s.successTitle}>Admission Complete!</Text>
                <View style={s.regCodeRow}>
                  <Ionicons name="id-card-outline" size={ms(14)} color={colors.primary} />
                  <Text style={s.regCode}>{admitted.student.studentCode}</Text>
                </View>
                <Text style={s.successSub}>Student registered successfully</Text>

                <View style={s.detailBox}>
                  <DetailRow icon="person-outline"    label="Student Name"    value={admitted.student.fullName}                                                                   color={colors.primary} />
                  <DetailRow icon="call-outline"      label="Phone"           value={admitted.student.phone}                                                                       color={colors.accent} />
                  {admitted.student.coursePreference && (
                    <DetailRow icon="book-outline"    label="Course Pref."    value={admitted.student.coursePreference.toUpperCase()}                                              color={C.blue} />
                  )}
                  {admitted.enrollment && (
                    <DetailRow icon="layers-outline"  label="Batch Assigned"  value={batches.find((b) => b.id === admitted.enrollment?.batchId)?.name ?? "Assigned"}              color={C.green} />
                  )}
                  {admitted.student.amountPaid && (
                    <DetailRow icon="cash-outline"    label="Amount Paid"     value={`₹ ${Number(admitted.student.amountPaid).toLocaleString("en-IN")}`}                          color={C.green} />
                  )}
                  {admitted.student.paymentMode && (
                    <DetailRow icon="card-outline"    label="Payment Mode"    value={admitted.student.paymentMode === "cash" ? "Cash" : "Online Payment"}          color={C.orange} last />
                  )}
                </View>

                <View style={s.termsBox}>
                  <View style={s.termsTitleRow}>
                    <Ionicons name="checkmark-circle-outline" size={ms(14)} color={colors.primary} />
                    <Text style={s.termsT}>Terms &amp; Conditions Acknowledged</Text>
                  </View>
                  <Text style={s.termsSub}>
                    Fees once paid are non-refundable. Student must attend all classes regularly.
                  </Text>
                </View>

                {/* WhatsApp share */}
                <TouchableOpacity
                  style={s.doneBtnWrap}
                  activeOpacity={0.85}
                  onPress={() => {
                    const contact = admitted.student.whatsapp || admitted.student.phone;
                    const text    = buildWhatsAppText(
                      admitted,
                      batches.find((b) => b.id === admitted.enrollment?.batchId)?.name,
                    );
                    openWhatsApp(contact, text);
                  }}
                >
                  <View style={[s.whatsappBtn, { backgroundColor: C.green }]}>
                    <Ionicons name="logo-whatsapp" size={ms(18)} color="#fff" />
                    <Text style={s.doneBtnT}>Send T&amp;C via WhatsApp</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
                  <View style={[s.doneBtn, { backgroundColor: colors.primary }]}>
                    <Ionicons name="school-outline" size={ms(18)} color="#fff" />
                    <Text style={s.doneBtnT}>View All Students</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>

          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.screenBg },
  flex:        { flex: 1 },
  scroll:      { flex: 1, backgroundColor: colors.screenBg },
  body:        { paddingHorizontal: ms(16), paddingTop: ms(8), paddingBottom: ms(40) },

  stepContent: { gap: ms(2) },
  card:        { backgroundColor: C.card, borderRadius: ms(20), padding: ms(18), marginBottom: ms(14), shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },

  // Aadhaar scan
  scanBtn:        { marginBottom: ms(18), borderRadius: ms(14) },
  scanBtnDone:    {},
  scanBtnGrad:    { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: ms(16), paddingVertical: ms(14) },
  scanBtnTitle:   { ...T.buttonText, color: "#fff" },
  scanBtnSub:     { ...T.caption, color: "rgba(255,255,255,0.8)", marginTop: ms(2) },

  // Field blocks
  fieldBlock:      { marginBottom: ms(16), gap: ms(10) },
  // Matches FormField's own label style (T.chipText) — these OptionRow-based
  // fields (Gender, Course Applied For, etc.) are individual field labels,
  // not group headers, so sectionHeading was the wrong token.
  fieldLabel:      { ...T.chipText, color: C.text },
  twoCol:          { flexDirection: "row", gap: ms(10) },
  reqLabelRow:     { flexDirection: "row", alignItems: "center" },
  reqAsterisk:     { fontSize: fs(13), color: C.red, fontFamily: "Inter_700Bold", fontWeight: "700", lineHeight: fs(14) },
  sectionDivider:  { height: 1, backgroundColor: C.border, marginTop: ms(4), marginBottom: ms(20) },

  // T&C section
  tcSection:    { gap: ms(12) },
  showTcBtn:    { flexDirection: "row", alignItems: "center", gap: ms(12), backgroundColor: C.inputBg, borderRadius: ms(14), padding: ms(14), borderWidth: 1, borderColor: C.border },
  showTcIcon:   { width: ms(38), height: ms(38), borderRadius: ms(10), backgroundColor: C.card, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  showTcTitle:  { ...T.buttonText, color: colors.primary },
  showTcSub:    { ...T.caption, color: C.muted, marginTop: ms(2) },
  tcCheckRow:   { flexDirection: "row", alignItems: "flex-start", gap: ms(10), padding: ms(12), backgroundColor: C.inputBg, borderRadius: ms(12), borderWidth: 1.5, borderColor: C.border },
  tcCheckRowOn: { borderColor: colors.primary, backgroundColor: colors.primary + "10" },
  checkbox:     { width: ms(20), height: ms(20), borderRadius: ms(5), borderWidth: 2, borderColor: C.border, backgroundColor: C.card, justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: ms(1) },
  checkboxOn:   { backgroundColor: colors.primary, borderColor: colors.primary },
  tcCheckText:  { flex: 1, ...T.body, color: C.text },
  tcErrorRow:   { flexDirection: "row", alignItems: "center", gap: ms(5) },
  tcError:      { ...T.helperText, color: C.red, flex: 1 },

  // Office badge
  officeBadgeWrap: { alignItems: "center", marginBottom: ms(18) },
  officeBadge:     { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: C.blue + "12", borderRadius: ms(20), paddingHorizontal: ms(14), paddingVertical: ms(7), borderWidth: 1, borderColor: C.blue + "30" },
  officeBadgeT:    { ...T.badgeText, color: C.blue, letterSpacing: 1.2 },
  divider:         { height: 1, backgroundColor: C.border, marginVertical: ms(16) },

  // Amount input
  amountRow:    { flexDirection: "row", alignItems: "center", backgroundColor: C.inputBg, borderRadius: ms(12), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, paddingHorizontal: ms(14), paddingVertical: ms(12), gap: ms(8) },
  amountRowErr: { borderColor: C.red, backgroundColor: C.red + "08" },
  amountPrefix: { ...T.cardTitle, color: C.green },
  amountInput:  { flex: 1, ...T.cardTitle, color: C.text, includeFontPadding: false, padding: 0 },

  // Course selector
  courseSel:            { flexDirection: "row", alignItems: "center", gap: ms(10), backgroundColor: C.inputBg, borderRadius: ms(14), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, paddingHorizontal: ms(14), paddingVertical: ms(14) },
  courseSelErr:         { borderColor: C.red, backgroundColor: C.red + "08" },
  courseSelDot:         { width: ms(10), height: ms(10), borderRadius: ms(5), flexShrink: 0 },
  courseSelValue:       { flex: 1, ...T.listItemTitle, color: C.text },
  courseSelPlaceholder: { flex: 1, ...T.body, color: C.placeholder },

  // Errors
  submitError:   { backgroundColor: C.red + "08", borderRadius: ms(12), borderWidth: 1, borderColor: C.red + "30", padding: ms(14), marginTop: ms(8) },
  submitErrorT:  { ...T.body, color: C.red },
  inlineError:   { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(6) },
  inlineErrorT:  { ...T.helperText, color: C.red, flex: 1 },

  // Nav buttons
  footer:       { paddingHorizontal: ms(16), paddingTop: ms(12), paddingBottom: ms(14), backgroundColor: colors.screenBg, borderTopWidth: 1, borderTopColor: C.border },
  navRow:       { flexDirection: "row", alignItems: "center" },
  navSpacer:    { flex: 1 },
  prevBtn:      { flexDirection: "row", alignItems: "center", gap: ms(4), paddingHorizontal: ms(16), paddingVertical: ms(12), borderRadius: ms(14), backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  prevBtnT:     { ...T.buttonText, color: colors.primary },
  nextBtn:      { borderRadius: ms(14) },
  nextBtnGrad:  { flexDirection: "row", alignItems: "center", gap: ms(6), paddingHorizontal: ms(22), paddingVertical: ms(13), borderRadius: ms(14) },
  nextBtnT:     { ...T.buttonText, color: "#fff" },
  stepPill:     { textAlign: "center", ...T.caption, color: C.placeholder, marginTop: ms(2) },

  // Loader
  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg + "EE", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: C.text, shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { ...T.cardTitle, color: C.text },
  loaderSub:     { ...T.bodySmall, color: C.muted },

  // Success
  successOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, justifyContent: "center", alignItems: "center", paddingHorizontal: ms(20) },
  successStatusBarBg: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: colors.primary },
  successCard:    { width: "100%", backgroundColor: C.card, borderRadius: ms(30), padding: ms(22), alignItems: "center", shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(10) }, shadowOpacity: 0.14, shadowRadius: ms(28), elevation: 12 },

  checkStage:   { width: ms(104), height: ms(104), justifyContent: "center", alignItems: "center", marginBottom: ms(8) },
  checkGlow:    { position: "absolute", width: ms(90), height: ms(90), borderRadius: ms(45), backgroundColor: C.greenBg },
  pingRing:     { position: "absolute", width: ms(70), height: ms(70), borderRadius: ms(35), borderWidth: 2, borderColor: C.green },
  checkCircle:  { width: ms(70), height: ms(70), borderRadius: ms(35), justifyContent: "center", alignItems: "center" },
  sparkleTL:    { position: "absolute", top: ms(2), left: ms(8) },
  sparkleBR:    { position: "absolute", bottom: ms(6), right: ms(4) },

  successContent: { width: "100%", alignItems: "center" },
  successTitle:   { ...T.displayMedium, color: C.text, marginBottom: ms(6) },
  regCodeRow:     { flexDirection: "row", alignItems: "center", gap: ms(6), backgroundColor: colors.primary + "12", borderRadius: ms(10), paddingHorizontal: ms(12), paddingVertical: ms(5), marginBottom: ms(6) },
  regCode:        { ...T.listItemTitle, color: colors.primary, letterSpacing: 1 },
  successSub:     { ...T.bodySmall, color: C.muted, marginBottom: ms(12), textAlign: "center" },
  detailBox:      { width: "100%", backgroundColor: C.inputBg, borderRadius: ms(16), paddingHorizontal: ms(16), marginBottom: ms(12), borderWidth: 1, borderColor: C.border },
  termsBox:       { width: "100%", backgroundColor: C.bg, borderRadius: ms(12), padding: ms(10), marginBottom: ms(10), borderWidth: 1, borderColor: C.border },
  termsTitleRow:  { flexDirection: "row", alignItems: "center", gap: ms(5), marginBottom: ms(4) },
  termsT:         { ...T.chipText, color: colors.primary },
  termsSub:       { ...T.caption, color: C.muted },
  doneBtnWrap:    { width: "100%", marginBottom: ms(8) },
  whatsappBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(12) },
  doneBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), borderRadius: ms(16), paddingVertical: ms(13) },
  doneBtnT:       { ...T.buttonText, color: "#FFFFFF" },

  // ── Discard modal ──
  discardOverlay:       { flex: 1, backgroundColor: "rgba(16,4,8,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: ms(28) },
  discardCard:          { width: "100%", backgroundColor: C.card, borderRadius: ms(24), paddingHorizontal: ms(24), paddingTop: ms(32), paddingBottom: ms(24), alignItems: "center", shadowColor: C.text, shadowOffset: { width: 0, height: ms(12) }, shadowOpacity: 0.22, shadowRadius: ms(28), elevation: 18 },
  discardIconCircle:    { width: ms(64), height: ms(64), borderRadius: ms(32), backgroundColor: colors.primary + "17", borderWidth: 2, borderColor: colors.primary + "33", justifyContent: "center", alignItems: "center", marginBottom: ms(18) },
  discardTitle:         { ...T.displayMedium, color: C.text, marginBottom: ms(10) },
  discardBody:          { ...T.body, color: C.muted, textAlign: "center", marginBottom: ms(20) },
  discardDivider:       { width: "100%", height: 1, backgroundColor: C.border, marginBottom: ms(16) },
  discardDestructiveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), width: "100%", backgroundColor: colors.primary, borderRadius: ms(14), paddingVertical: ms(14), marginBottom: ms(10) },
  discardDestructiveTxt: { ...T.buttonText, color: "#FFFFFF" },
  discardCancelBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), width: "100%", backgroundColor: colors.primary + "12", borderRadius: ms(14), paddingVertical: ms(13), borderWidth: 1.5, borderColor: colors.primary + "33" },
  discardCancelTxt:     { ...T.buttonText, color: colors.primary },

  // ── Info modal ──
  infoOverlay:   { flex: 1, backgroundColor: "rgba(16,4,8,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: ms(28) },
  infoCard:      { width: "100%", borderRadius: ms(24), borderWidth: 1.5, paddingHorizontal: ms(24), paddingTop: ms(32), paddingBottom: ms(24), alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: ms(10) }, shadowOpacity: 0.18, shadowRadius: ms(24), elevation: 16 },
  infoIconCircle: { width: ms(68), height: ms(68), borderRadius: ms(34), justifyContent: "center", alignItems: "center", marginBottom: ms(16) },
  infoTitle:     { ...T.displayMedium, color: C.text, marginBottom: ms(10), textAlign: "center" },
  infoBody:      { ...T.body, color: C.muted, textAlign: "center", marginBottom: ms(24) },
  infoBtn:       { width: "100%", borderRadius: ms(14), paddingVertical: ms(14), alignItems: "center" },
  infoBtnTxt:    { ...T.buttonText, color: "#FFFFFF" },
});

// ── TermsModal styles ─────────────────────────────────────────────────────────

const makeTmStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.bg },
  header:     { flexDirection: "row", alignItems: "center", paddingHorizontal: ms(16), paddingBottom: ms(12), gap: ms(10), backgroundColor: C.card },
  headerIcon: { width: ms(36), height: ms(36), borderRadius: ms(10), backgroundColor: colors.primary + "14", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  headerTitle: { flex: 1, ...T.cardTitle, color: C.text },
  closeBtn:   { width: ms(36), height: ms(36), borderRadius: ms(10), backgroundColor: C.inputBg, justifyContent: "center", alignItems: "center", flexShrink: 0, borderWidth: 1, borderColor: C.border },
  divider:    { height: 1, backgroundColor: C.border },

  body:       { paddingHorizontal: ms(16), paddingTop: ms(8), gap: ms(12), paddingBottom: ms(8) },

  alertBox: {
    flexDirection:   "row",
    alignItems:      "flex-start",
    gap:             ms(10),
    backgroundColor: C.red + "08",
    borderRadius:    ms(14),
    padding:         ms(14),
    borderWidth:     1,
    borderColor:     C.red + "30",
  },
  alertTitle: { ...T.chipText, color: C.red, marginBottom: ms(3) },
  alertBody:  { ...T.body, color: C.red, flex: 1 },

  termRow:    { flexDirection: "row", gap: ms(10), alignItems: "flex-start" },
  termNum:    { width: ms(22), height: ms(22), borderRadius: ms(11), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: ms(2) },
  termNumT:   { ...T.badgeText, color: "#fff" },
  termText:   { flex: 1, ...T.body, color: C.text },

  footerBox:  { flexDirection: "row", alignItems: "flex-start", gap: ms(8), backgroundColor: C.inputBg, borderRadius: ms(12), padding: ms(14), marginTop: ms(4), borderWidth: 1, borderColor: C.border },
  footerT:    { flex: 1, ...T.helperText, color: C.muted },

  btnWrap:    { padding: ms(16), backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  btn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), backgroundColor: colors.primary, borderRadius: ms(14), paddingVertical: ms(15) },
  btnT:       { ...T.buttonText, color: "#fff" },
});

// ── Documents stage — shown once, right after admission succeeds, before the
//    success card. Photo is fixed (uses the same mechanism as EditStudentScreen);
//    the rest come from the document-types master list, so adding a new type
//    later needs zero changes here. Everything is optional/skippable. ─────────

type UploadKey = "photo" | string; // "photo" or a documentTypeId

function UploadRow({ label, uri, loading, error, onPress, onView }: {
  label: string; uri: string | null; loading: boolean; error?: string; onPress: () => void; onView: () => void;
}) {
  const colors = useThemeColors();
  const ds = useThemedStyles(makeDsStyles);
  return (
    <View style={ds.row}>
      <TouchableOpacity
        style={[ds.rowIcon, uri && ds.rowIconDone]}
        onPress={uri ? onView : onPress}
        activeOpacity={0.75}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : uri ? (
          <Image source={{ uri }} style={ds.rowThumb} />
        ) : (
          <Ionicons name="document-attach-outline" size={ms(20)} color={C.muted} />
        )}
      </TouchableOpacity>
      <TouchableOpacity style={ds.rowBody} onPress={onPress} activeOpacity={0.75} disabled={loading}>
        <Text style={ds.rowLabel}>{label}</Text>
        <Text style={ds.rowSub}>{uri ? "Uploaded — tap photo to view, or here to replace" : "Not uploaded yet"}</Text>
        {error ? <Text style={ds.rowErr}>{error}</Text> : null}
      </TouchableOpacity>
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-forward" size={ms(18)} color={C.placeholder} />
      </TouchableOpacity>
    </View>
  );
}

function DocumentsStep({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const colors = useThemeColors();
  const ds = useThemedStyles(makeDsStyles);
  const insets = useSafeAreaInsets();
  const [docTypes, setDocTypes]         = useState<DocumentType[]>([]);
  const [docTypesLoading, setDocTypesLoading] = useState(true);

  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [docUris, setDocUris]           = useState<Record<string, string>>({});
  const [loadingKey, setLoadingKey]     = useState<UploadKey | null>(null);
  const [errorKey, setErrorKey]         = useState<{ key: UploadKey; message: string } | null>(null);
  const [activeSheet, setActiveSheet]   = useState<UploadKey | null>(null);
  const [previewUri, setPreviewUri]     = useState<string | null>(null);

  useEffect(() => {
    listDocumentTypes()
      .then(setDocTypes)
      .catch(() => {})
      .finally(() => setDocTypesLoading(false));
  }, []);

  async function pickAndUpload(key: UploadKey, fromCamera: boolean) {
    setActiveSheet(null);
    setErrorKey(null);
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { setErrorKey({ key, message: "Camera permission is required." }); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { setErrorKey({ key, message: "Gallery permission is required." }); return; }
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];

    setLoadingKey(key);
    if (key === "photo") {
      const res = await uploadStudentPhoto(studentId, asset.uri, asset.mimeType ?? "image/jpeg");
      setLoadingKey(null);
      if (res.ok) setPhotoUri(res.student.photoUrl ?? asset.uri);
      else setErrorKey({ key, message: res.error });
    } else {
      const res = await uploadStudentDocument(studentId, key, asset.uri, asset.mimeType ?? "image/jpeg");
      setLoadingKey(null);
      if (res.ok) setDocUris((prev) => ({ ...prev, [key]: res.document.fileUrl }));
      else setErrorKey({ key, message: res.error });
    }
  }

  async function removeUpload(key: UploadKey) {
    setActiveSheet(null);
    setLoadingKey(key);
    if (key === "photo") {
      const res = await deleteStudentPhoto(studentId);
      setLoadingKey(null);
      if (res.ok) setPhotoUri(null);
      else setErrorKey({ key, message: res.error });
    } else {
      const res = await deleteStudentDocument(studentId, key);
      setLoadingKey(null);
      if (res.ok) setDocUris((prev) => { const next = { ...prev }; delete next[key]; return next; });
      else setErrorKey({ key, message: res.error });
    }
  }

  const activeHasUpload = activeSheet === "photo" ? !!photoUri : !!(activeSheet && docUris[activeSheet]);
  const activeLabel = activeSheet === "photo" ? "Photo" : docTypes.find((d) => d.id === activeSheet)?.label ?? "";

  return (
    <View style={ds.overlay}>
      {/* Header */}
      <View style={[ds.header, { paddingTop: insets.top + ms(4) }]}>
        <View style={ds.headerContent}>
          <View style={ds.headerIconWrap}>
            <Ionicons name="images-outline" size={ms(18)} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ds.headerTitle}>Photo &amp; Documents</Text>
            <Text style={ds.headerSub}>Optional — add now or later</Text>
          </View>
          <TouchableOpacity style={ds.closeBtn} onPress={onDone} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={ms(18)} color={C.muted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={ds.scroll} showsVerticalScrollIndicator={false}>
        <Text style={ds.note}>Add these now while you have them in hand, or later from the student's profile.</Text>

        <UploadRow
          label="Student Photo"
          uri={photoUri}
          loading={loadingKey === "photo"}
          error={errorKey?.key === "photo" ? errorKey.message : undefined}
          onPress={() => setActiveSheet("photo")}
          onView={() => setPreviewUri(photoUri)}
        />

        {docTypesLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: ms(16) }} />
        ) : (
          docTypes.map((dt) => (
            <UploadRow
              key={dt.id}
              label={dt.label}
              uri={docUris[dt.id] ?? null}
              loading={loadingKey === dt.id}
              error={errorKey?.key === dt.id ? errorKey.message : undefined}
              onPress={() => setActiveSheet(dt.id)}
              onView={() => setPreviewUri(docUris[dt.id] ?? null)}
            />
          ))
        )}
      </ScrollView>

      <View style={ds.footer}>
        <TouchableOpacity style={ds.continueBtn} onPress={onDone} activeOpacity={0.85}>
          <Ionicons name="arrow-forward" size={ms(18)} color="#fff" />
          <Text style={ds.continueBtnT}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDone} style={ds.skipBtn}>
          <Text style={ds.skipT}>Skip for now</Text>
        </TouchableOpacity>
      </View>

      <BottomSheet visible={activeSheet !== null} onClose={() => setActiveSheet(null)}>
        <View style={ds.sheetInner}>
          <Text style={ds.sheetTitle}>Update {activeLabel}</Text>
          <TouchableOpacity style={ds.sheetOption} onPress={() => activeSheet && pickAndUpload(activeSheet, true)} activeOpacity={0.8}>
            <View style={[ds.sheetOptionIcon, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="camera-outline" size={ms(22)} color={colors.primary} />
            </View>
            <Text style={ds.sheetOptionLabel}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ds.sheetOption} onPress={() => activeSheet && pickAndUpload(activeSheet, false)} activeOpacity={0.8}>
            <View style={[ds.sheetOptionIcon, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="image-outline" size={ms(22)} color={colors.primary} />
            </View>
            <Text style={ds.sheetOptionLabel}>Choose from Gallery</Text>
          </TouchableOpacity>
          {activeHasUpload && (
            <TouchableOpacity style={ds.sheetOption} onPress={() => activeSheet && removeUpload(activeSheet)} activeOpacity={0.8}>
              <View style={[ds.sheetOptionIcon, { backgroundColor: C.red + "18" }]}>
                <Ionicons name="trash-outline" size={ms(22)} color={C.red} />
              </View>
              <Text style={[ds.sheetOptionLabel, { color: C.red }]}>Remove</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: ms(20) }} />
        </View>
      </BottomSheet>

      {/* Full-screen document/photo preview */}
      <Modal visible={previewUri !== null} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <View style={ds.previewOverlay}>
          <TouchableOpacity
            style={[ds.previewCloseBtn, { top: insets.top + ms(12) }]}
            onPress={() => setPreviewUri(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={ms(22)} color="#fff" />
          </TouchableOpacity>
          {previewUri && (
            <Image source={{ uri: previewUri }} style={ds.previewImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const makeDsStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.screenBg },
  scroll:  { padding: ms(20), paddingBottom: ms(30) },

  header:        { backgroundColor: colors.headerBg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  headerContent: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: ms(16), paddingVertical: ms(12) },
  headerIconWrap: { width: ms(40), height: ms(40), borderRadius: ms(13), backgroundColor: colors.primary + "18", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  headerTitle:   { ...T.cardTitle, color: C.text },
  headerSub:     { ...T.helperText, color: C.muted, marginTop: ms(1) },
  closeBtn:      { width: ms(36), height: ms(36), borderRadius: ms(11), backgroundColor: C.inputBg, justifyContent: "center", alignItems: "center", flexShrink: 0, borderWidth: 1, borderColor: C.border },

  note: { ...T.bodySmall, color: C.muted, marginBottom: ms(16) },

  row: {
    flexDirection: "row", alignItems: "center", gap: ms(12),
    backgroundColor: C.card, borderRadius: ms(14), padding: ms(12), marginBottom: ms(10),
    shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: ms(6), elevation: 2,
  },
  rowIcon:     { width: ms(40), height: ms(40), borderRadius: ms(12), backgroundColor: C.inputBg, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  rowIconDone: { backgroundColor: C.greenBg },
  rowThumb:    { width: ms(40), height: ms(40) },
  rowBody:     { flex: 1 },
  rowLabel:    { ...T.listItemTitle, color: C.text },
  rowSub:      { ...T.helperText, color: C.muted, marginTop: ms(2) },
  rowErr:      { ...T.caption, color: C.red, marginTop: ms(3) },

  footer: { padding: ms(16), backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, gap: ms(10) },
  continueBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(8), backgroundColor: colors.primary, borderRadius: ms(14), paddingVertical: ms(15) },
  continueBtnT: { ...T.buttonText, color: "#fff" },
  skipBtn:  { alignItems: "center", paddingVertical: ms(4) },
  skipT:    { ...T.buttonText, color: C.muted },

  sheetInner:  { padding: ms(20) },
  sheetTitle:  { ...T.cardTitle, color: C.text, marginBottom: ms(14) },
  sheetOption: { flexDirection: "row", alignItems: "center", gap: ms(14), paddingVertical: ms(12) },
  sheetOptionIcon: { width: ms(42), height: ms(42), borderRadius: ms(12), justifyContent: "center", alignItems: "center" },
  sheetOptionLabel: { ...T.listItemTitle, color: C.text },

  previewOverlay:  { flex: 1, backgroundColor: "rgba(10,4,7,0.95)", justifyContent: "center", alignItems: "center" },
  previewCloseBtn: { position: "absolute", right: ms(16), width: ms(38), height: ms(38), borderRadius: ms(19), backgroundColor: "rgba(255,255,255,0.16)", justifyContent: "center", alignItems: "center", zIndex: 1 },
  previewImg:      { width: "100%", height: "80%" },
});

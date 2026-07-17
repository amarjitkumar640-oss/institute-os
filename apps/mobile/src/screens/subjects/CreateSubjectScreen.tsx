import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, StatusBar, TextInput, Animated, TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { FormField } from "../../components/ui/FormField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { createSubject, type ExamCategory, type SubjectItem } from "../../api/subjects";
import { ms, fs } from "../../utils/responsive";

type Props = NativeStackScreenProps<RootStackParamList, "CreateSubject">;

type CategoryOption = { key: ExamCategory | null; label: string; sub: string; color: string; icon: string };

const CATEGORIES: CategoryOption[] = [
  { key: null,       label: "Shared",  sub: "Applies to all exam categories",   color: "#E8752C", icon: "grid-outline"         },
  { key: "ssc",      label: "SSC",     sub: "Staff Selection Commission",        color: "#8B1E3F", icon: "document-text-outline" },
  { key: "banking",  label: "Banking", sub: "IBPS, SBI, RBI & other bank exams", color: "#2563A8", icon: "card-outline"          },
  { key: "railway",  label: "Railway", sub: "RRB & Railway Recruitment Board",   color: "#2CA6A4", icon: "train-outline"         },
];

interface CreatedSubject {
  name: string;
  examCategory: ExamCategory | null;
}

export function CreateSubjectScreen({ navigation }: Props) {
  const [name, setName]                   = useState("");
  const [nameError, setNameError]         = useState<string | undefined>();
  const [category, setCategory]           = useState<ExamCategory | null>(null);
  const [categoryError, setCategoryError] = useState<string | undefined>();
  const [submitError, setSubmitError]     = useState<string | undefined>();
  const [loading, setLoading]             = useState(false);
  const [created, setCreated]             = useState<CreatedSubject | null>(null);

  const checkScale  = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(ms(60))).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  // track whether the user has explicitly chosen shared (null) vs not chosen
  const [categoryChosen, setCategoryChosen] = useState(false);

  function selectCategory(key: ExamCategory | null) {
    setCategory(key);
    setCategoryChosen(true);
    setCategoryError(undefined);
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
    setCreated({ name: s.name, examCategory: s.examCategory });
    Animated.parallel([
      Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7, delay: 100 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(cardSlide,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 10, delay: 60 }),
    ]).start();
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setSubmitError(undefined);
    try {
      const result = await createSubject({ name: name.trim(), examCategory: category });
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

  const catLabel = CATEGORIES.find((c) => c.key === category)?.label ?? "—";
  const catColor = CATEGORIES.find((c) => c.key === category)?.color ?? "#8A7F82";

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScreenHeader title="Add Subject" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Name ── */}
          <View style={s.section}>
            <SectionHead dot="#8B1E3F" title="Subject Name" />
            <FormField
              label="NAME"
              value={name}
              onChangeText={(v) => { setName(v); setNameError(undefined); }}
              placeholder="e.g. Quantitative Aptitude"
              error={nameError}
              icon="book-outline"
              maxLength={120}
              clearable
              returnKeyType="done"
            />
          </View>

          {/* ── Category ── */}
          <View style={s.section}>
            <SectionHead dot="#2563A8" title="Exam Category" />
            <Text style={s.catHint}>Choose which exam this subject belongs to.</Text>
            <View style={s.catGrid}>
              {CATEGORIES.map((opt) => {
                const active = categoryChosen && category === opt.key;
                return (
                  <TouchableOpacity
                    key={String(opt.key)}
                    style={[s.catCard, active && { borderColor: opt.color, borderWidth: 2, backgroundColor: opt.color + "0C" }]}
                    onPress={() => selectCategory(opt.key)}
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

          <PrimaryButton
            label="Add Subject"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            icon="add-circle-outline"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Full-screen loader */}
      {loading && (
        <View style={s.loaderOverlay}>
          <View style={s.loaderCard}>
            <ActivityIndicator size="large" color="#8B1E3F" />
            <Text style={s.loaderTitle}>Adding Subject…</Text>
            <Text style={s.loaderSub}>Please wait</Text>
          </View>
        </View>
      )}

      {/* Full-screen success card */}
      {created !== null && (
        <Animated.View style={[s.successOverlay, { opacity: cardOpacity }]}>
          <Animated.View style={[s.successCard, { transform: [{ translateY: cardSlide }] }]}>
            <Animated.View style={{ transform: [{ scale: checkScale }], marginBottom: ms(20) }}>
              <LinearGradient colors={["#1B9C63", "#16A085"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.checkCircle}>
                <Ionicons name="checkmark" size={ms(44)} color="#fff" />
              </LinearGradient>
            </Animated.View>

            <Text style={s.successTitle}>Subject Added!</Text>
            <Text style={s.successSub}>The subject has been created successfully</Text>

            <View style={s.detailBox}>
              <DetailRow icon="book-outline"   label="Subject Name" value={created.name}  color="#8B1E3F" />
              <DetailRow icon="layers-outline" label="Category"     value={catLabel}       color={catColor} last />
            </View>

            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={s.doneBtnWrap}>
              <LinearGradient colors={["#8B1E3F", "#A52341"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.doneBtn}>
                <Ionicons name="list-outline" size={ms(18)} color="#fff" />
                <Text style={s.doneBtnT}>View All Subjects</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
        <Text style={dr.value}>{value}</Text>
      </View>
    </View>
  );
}

const dr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: ms(12), gap: ms(12) },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  iconWrap:  { width: ms(32), height: ms(32), borderRadius: ms(8), justifyContent: "center", alignItems: "center" },
  textWrap:  { flex: 1 },
  label:     { fontSize: fs(10), color: "#8A7F82", fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: ms(1) },
  value:     { fontSize: fs(13), color: "#2B1B1F", fontWeight: "700" },
});

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: "#8B1E3F" },
  flex:          { flex: 1 },
  scroll:        { flex: 1, backgroundColor: "#FFFBF0" },
  scrollContent: { paddingHorizontal: ms(20), paddingTop: ms(24), paddingBottom: ms(40) },

  section:       { backgroundColor: "#FFFFFF", borderRadius: ms(18), padding: ms(18), marginBottom: ms(16), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: ms(10), elevation: 3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: ms(8), marginBottom: ms(16) },
  sectionDot:    { width: ms(4), height: ms(18), borderRadius: ms(2) },
  sectionTitle:  { fontSize: fs(12), fontWeight: "800", color: "#8A7F82", letterSpacing: 1, textTransform: "uppercase" },

  catHint:       { fontSize: fs(12), color: "#8A7F82", marginBottom: ms(14) },
  catGrid:       { flexDirection: "row", flexWrap: "wrap", gap: ms(10) },
  catCard:       { width: "47%", borderRadius: ms(14), padding: ms(14), backgroundColor: "#FAFAFA", borderWidth: 1.5, borderColor: "#E8E0DC", gap: ms(6), position: "relative" },
  catIcon:       { width: ms(40), height: ms(40), borderRadius: ms(12), justifyContent: "center", alignItems: "center", marginBottom: ms(4) },
  catName:       { fontSize: fs(14), fontWeight: "800", color: "#2B1B1F" },
  catSub:        { fontSize: fs(10.5), color: "#8A7F82", lineHeight: fs(14) },
  catCheck:      { position: "absolute", top: ms(10), right: ms(10), width: ms(18), height: ms(18), borderRadius: ms(9), justifyContent: "center", alignItems: "center" },
  fieldErr:      { fontSize: fs(12), color: "#C0392B", marginTop: ms(10) },

  submitError:   { backgroundColor: "#FEF0EE", borderRadius: ms(12), borderWidth: 1, borderColor: "#F5C6C0", padding: ms(14), marginBottom: ms(16) },
  submitErrorT:  { fontSize: fs(13), color: "#C0392B", lineHeight: fs(18) },

  loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,251,240,0.96)", justifyContent: "center", alignItems: "center" },
  loaderCard:    { alignItems: "center", gap: ms(16), backgroundColor: "#FFFFFF", borderRadius: ms(24), paddingHorizontal: ms(40), paddingVertical: ms(36), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: ms(8) }, shadowOpacity: 0.12, shadowRadius: ms(20), elevation: 10 },
  loaderTitle:   { fontSize: fs(16), fontWeight: "800", color: "#2B1B1F" },
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

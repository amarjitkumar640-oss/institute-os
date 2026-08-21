import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListErrorState } from "../../components/ui/ListErrorState";
import { SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { AVATAR_SIZE, AVATAR_RADIUS, getAvatarFill } from "../../components/ui/avatarStyle";
import { T } from "../../components/ui/typography";
import {
  listAdmissionApplications, rejectAdmissionApplication,
  type AdmissionApplicationItem, type ApplicationStatus,
} from "../../api/admissionApplications";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { useAlert } from "../../context/AlertContext";

type Props = NativeStackScreenProps<RootStackParamList, "AdmissionApplications">;

const STATUS_META: Record<ApplicationStatus, { label: string; color: string }> = {
  pending:  { label: "Pending",  color: C.blue },
  admitted: { label: "Admitted", color: C.green },
  rejected: { label: "Rejected", color: C.red },
};

const TABS: { key: ApplicationStatus; label: string }[] = [
  { key: "pending",  label: "Pending" },
  { key: "rejected", label: "Rejected" },
  { key: "admitted", label: "Admitted" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Reject modal ───────────────────────────────────────────────────────────────

function RejectModal({
  application, visible, onClose, onDone,
}: {
  application: AdmissionApplicationItem | null;
  visible:     boolean;
  onClose:     () => void;
  onDone:      () => void;
}) {
  const colors = useThemeColors();
  const rm = useThemedStyles(makeRmStyles);
  const { showAlert } = useAlert();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);

  async function submit() {
    if (!application || !reason.trim()) return;
    setSaving(true);
    try {
      const res = await rejectAdmissionApplication(application.id, reason.trim());
      if (res.ok) {
        onDone();
      } else {
        showAlert("Error", res.error, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={rm.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={rm.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={rm.sheet}>
          <View style={rm.drag} />
          <View style={rm.head}>
            <View style={rm.headIcon}>
              <Ionicons name="close-circle-outline" size={ms(20)} color={C.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rm.headTitle}>Reject Application</Text>
              <Text style={rm.headSub} numberOfLines={1}>{application?.fullName}</Text>
            </View>
            <TouchableOpacity style={rm.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={ms(18)} color={C.text} />
            </TouchableOpacity>
          </View>
          <View style={rm.divider} />

          <Text style={rm.label}>Reason</Text>
          <TextInput
            style={rm.input}
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Duplicate submission, spam, unreachable"
            placeholderTextColor={C.placeholder}
            multiline
          />

          <TouchableOpacity
            style={[rm.submitBtn, (!reason.trim() || saving) && rm.submitBtnDisabled]}
            onPress={submit}
            disabled={!reason.trim() || saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={rm.submitBtnT}>Reject Application</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function ApplicationCard({
  application, onReview, onReject,
}: {
  application: AdmissionApplicationItem;
  onReview:    () => void;
  onReject:    () => void;
}) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const status = STATUS_META[application.status];
  const fill = getAvatarFill(colors.primary);

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={[s.avatar, { backgroundColor: fill.backgroundColor, borderWidth: fill.borderWidth, borderColor: fill.borderColor }]}>
          <Text style={[s.avatarT, { color: fill.color }]}>{initials(application.fullName)}</Text>
        </View>
        <View style={s.cardInfo}>
          <Text style={s.name} numberOfLines={1}>{application.fullName}</Text>
          <Text style={s.phone} numberOfLines={1}>{application.phone}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: status.color + "18" }]}>
          <Text style={[s.statusT, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      {(application.course || application.center) && (
        <>
          <View style={s.divider} />
          <View style={s.cardBottom}>
            {application.course && (
              <View style={[s.tagBadge, { backgroundColor: C.blue + "18" }]}>
                <Ionicons name="book-outline" size={ms(11)} color={C.blue} />
                <Text style={[s.tagT, { color: C.blue }]} numberOfLines={1}>{application.course.name}</Text>
              </View>
            )}
            {application.center && (
              <View style={[s.tagBadge, { backgroundColor: C.purple + "18" }]}>
                <Ionicons name="business-outline" size={ms(11)} color={C.purple} />
                <Text style={[s.tagT, { color: C.purple }]} numberOfLines={1}>{application.center.name}</Text>
              </View>
            )}
          </View>
        </>
      )}

      {application.status === "rejected" && application.rejectionReason && (
        <Text style={s.rejectionReason} numberOfLines={2}>Reason: {application.rejectionReason}</Text>
      )}

      {application.status === "pending" && (
        <View style={s.actionsRow}>
          <TouchableOpacity style={s.rejectBtn} onPress={onReject} activeOpacity={0.8}>
            <Text style={s.rejectBtnT}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.reviewBtn} onPress={onReview} activeOpacity={0.85}>
            <Text style={s.reviewBtnT}>Review</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function ApplicationsEmpty({ status }: { status: ApplicationStatus }) {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <EmptyState
        scene="leads"
        color={colors.primary}
        title={`No ${status} applications`}
        subtitle="Self-service admission applications will show up here"
      />
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export function AdmissionApplicationsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const s = useThemedStyles(makeSStyles);
  const { showAlert } = useAlert();
  const [status, setStatus] = useState<ApplicationStatus>("pending");
  const [applications, setApplications] = useState<AdmissionApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AdmissionApplicationItem | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const data = await listAdmissionApplications(status);
      setApplications(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <ScreenHeader
        title="Applications"
        count={applications.length}
        countLabel={status}
        onBack={() => navigation.goBack()}
      />

      <View style={s.filterRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.chip, status === t.key && s.chipOn]}
            onPress={() => setStatus(t.key)}
          >
            <Text style={[s.chipT, status === t.key && s.chipTOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.content}>
        {loading ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderT}>Loading applications…</Text>
          </View>
        ) : error ? (
          <ListErrorState title="Failed to load applications" onRetry={() => load()} />
        ) : (
          <FlatList
            data={applications}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ApplicationCard
                application={item}
                onReview={() => navigation.navigate("NewAdmission", { applicationId: item.id })}
                onReject={() => setRejectTarget(item)}
              />
            )}
            style={s.list}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} />}
            ListEmptyComponent={<ApplicationsEmpty status={status} />}
          />
        )}
      </View>

      <RejectModal
        application={rejectTarget}
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onDone={() => {
          setRejectTarget(null);
          showAlert("Application Rejected", undefined, "success");
          load();
        }}
      />
    </SafeAreaView>
  );
}

const makeSStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, backgroundColor: colors.screenBg, position: "relative" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", gap: ms(14) },
  loaderT: { ...T.body, color: C.muted },
  list:        { flex: 1 },
  listContent: { flexGrow: 1, paddingHorizontal: ms(16), paddingTop: ms(14), paddingBottom: ms(40) },

  filterRow: { flexDirection: "row", paddingHorizontal: ms(16), paddingTop: ms(12), gap: ms(8) },
  chip: { paddingHorizontal: ms(14), paddingVertical: ms(6), borderRadius: ms(20), backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipT: { ...T.chipText, color: C.muted, includeFontPadding: false },
  chipTOn: { color: "#fff" },

  card: { backgroundColor: C.card, borderRadius: ms(16), padding: ms(14), marginBottom: ms(12), shadowColor: "#2B1B1F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: ms(8), elevation: 3 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: ms(10) },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  avatarT: { ...T.listItemTitle, includeFontPadding: false },
  cardInfo: { flex: 1, minWidth: 0 },
  name: { ...T.listItemTitle, color: C.text, marginBottom: ms(3) },
  phone: { ...T.caption, color: C.muted },
  statusBadge: { borderRadius: ms(20), paddingHorizontal: ms(9), paddingVertical: ms(4), flexShrink: 0 },
  statusT: { ...T.badgeText },
  divider: { height: 1, backgroundColor: C.border, marginVertical: ms(10) },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: ms(8), flexWrap: "wrap" },
  tagBadge: { flexDirection: "row", alignItems: "center", gap: ms(4), borderRadius: ms(20), paddingHorizontal: ms(8), paddingVertical: ms(3), flexShrink: 1, maxWidth: "100%" },
  tagT: { ...T.badgeText },
  rejectionReason: { ...T.caption, color: C.muted, fontStyle: "italic", marginTop: ms(8) },

  actionsRow: { flexDirection: "row", gap: ms(10), marginTop: ms(12) },
  rejectBtn: { flex: 1, height: ms(38), borderRadius: ms(12), borderWidth: 1, borderColor: C.red + "40", justifyContent: "center", alignItems: "center" },
  rejectBtnT: { ...T.chipText, color: C.red },
  reviewBtn: { flex: 1, height: ms(38), borderRadius: ms(12), backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
  reviewBtnT: { ...T.chipText, color: "#fff" },
});

const makeRmStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor:      C.card,
    borderTopLeftRadius:  ms(24),
    borderTopRightRadius: ms(24),
    paddingHorizontal:    ms(20),
    paddingTop:           ms(8),
    paddingBottom:        ms(28),
    maxHeight:            SHEET_HEIGHT.short,
  },
  drag: { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginBottom: ms(16) },
  head: { flexDirection: "row", alignItems: "center", gap: ms(12), marginBottom: ms(14) },
  headIcon: { width: ms(42), height: ms(42), borderRadius: ms(13), backgroundColor: C.red + "12", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  headTitle: { ...T.cardTitle, color: C.text },
  headSub:   { ...T.caption, color: C.muted, marginTop: ms(2) },
  closeBtn: { width: ms(32), height: ms(32), borderRadius: ms(10), backgroundColor: C.bg, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  divider: { height: 1, backgroundColor: C.border, marginBottom: ms(14) },
  label: { ...T.chipText, color: C.text, marginBottom: ms(8) },
  input: {
    minHeight: ms(90), borderRadius: ms(14), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    backgroundColor: C.inputBg, padding: ms(12), ...T.body, color: C.text,
    textAlignVertical: "top", marginBottom: ms(18),
  },
  submitBtn: { height: ms(48), borderRadius: ms(14), backgroundColor: C.red, justifyContent: "center", alignItems: "center" },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnT: { ...T.buttonText, color: "#fff" },
});

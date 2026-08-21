import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import {
  listSlots, listSessions, generateSessions,
  type ClassSlot, type ClassSession,
  DAY_LABELS, DAY_ORDER, fmtTimeRange,
} from "../../api/classSchedule";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { T } from "../../components/ui/typography";
import { ManageSlotModal } from "./ManageSlotModal";
import { usePermission } from "../../hooks/usePermission";
import { useAuth } from "../../context/AuthContext";

type Props = NativeStackScreenProps<RootStackParamList, "BatchSchedule">;

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayColorMap(colors: ThemeColors): Record<string, string> {
  return {
    monday:    C.blue,
    tuesday:   C.green,
    wednesday: C.orange,
    thursday:  colors.accent,
    friday:    C.purple,
    saturday:  colors.primary,
    sunday:    C.red,
  };
}

function getWeekBounds(date: Date): { from: Date; to: Date } {
  const d    = new Date(date);
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const from = new Date(d);
  from.setDate(d.getDate() + diff);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtWeekLabel(from: Date, to: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${from.toLocaleDateString("en-IN", opts)} – ${to.toLocaleDateString("en-IN", { ...opts, year: "numeric" })}`;
}

function fmtSessionDate(iso: string): string {
  // Parse date portion directly to avoid UTC→local timezone shift
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

const STATUS_META = {
  scheduled: { label: "Scheduled", color: C.blue,    bg: "#EEF4FF", icon: "calendar-outline"         },
  completed: { label: "Completed", color: C.green,   bg: C.greenBg, icon: "checkmark-circle-outline"  },
  cancelled: { label: "Cancelled", color: C.red,     bg: "#FEF0EE", icon: "close-circle-outline"      },
} as const;

function typeMeta(colors: ThemeColors) {
  return {
    regular: { label: "Regular", color: C.muted,   bg: "#F3F4F6" },
    extra:   { label: "Extra",   color: colors.accent, bg: "#E5F5F5" },
    makeup:  { label: "Makeup",  color: C.orange,  bg: "#FDF0E8" },
  } as const;
}

// ── Slot Card ─────────────────────────────────────────────────────────────────

function SlotCard({ slot, onEdit }: { slot: ClassSlot; onEdit?: (slot: ClassSlot) => void }) {
  const colors = useThemeColors();
  const sc = useThemedStyles(makeScStyles);
  const color = dayColorMap(colors)[slot.dayOfWeek] ?? colors.primary;
  const inner = (
    <View style={sc.cardMainRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Subject — the card's headline now, shown in full (wraps up to
            2 lines instead of truncating) rather than a small pill. */}
        <Text
          style={[sc.subjectTitle, !slot.subject && { color: C.placeholder }]}
          numberOfLines={2}
        >
          {slot.subject?.name ?? "No subject assigned"}
        </Text>

        {/* Duration */}
        <View style={sc.durationRow}>
          <Ionicons name="time-outline" size={ms(12)} color={color} />
          <Text style={sc.durationText}>{fmtTimeRange(slot.startTime, slot.endTime)}</Text>
        </View>

        {/* Faculty + Room */}
        {(slot.faculty || slot.room) && (
          <View style={sc.metaRow}>
            {slot.faculty && (
              <View style={sc.metaItem}>
                <Ionicons name="person-outline" size={ms(11)} color={C.green} />
                <Text style={sc.metaText} numberOfLines={1}>{slot.faculty.fullName}</Text>
              </View>
            )}
            {slot.room && (
              <View style={sc.metaItem}>
                <Ionicons name="location-outline" size={ms(11)} color={C.orange} />
                <Text style={sc.metaText} numberOfLines={1}>{slot.room}</Text>
              </View>
            )}
          </View>
        )}
      </View>
      {onEdit && <Ionicons name="chevron-forward" size={ms(14)} color={C.placeholder} />}
    </View>
  );

  if (!onEdit) return <View style={sc.card}>{inner}</View>;
  return (
    <TouchableOpacity style={sc.card} onPress={() => onEdit(slot)} activeOpacity={0.78}>
      {inner}
    </TouchableOpacity>
  );
}

// ── Session Card ──────────────────────────────────────────────────────────────

function SessionCard({ session, onPress }: { session: ClassSession; onPress: () => void }) {
  const colors = useThemeColors();
  const sc = useThemedStyles(makeScStyles);
  const sm = STATUS_META[session.status];
  const tm = typeMeta(colors)[session.type];
  // Fall back to slot's subject/faculty for sessions generated before assignment was set
  const subject = session.subject ?? session.slot?.subject ?? null;
  const faculty = session.faculty ?? session.slot?.faculty ?? null;
  return (
    <TouchableOpacity
      style={[sc.card, session.status === "cancelled" && { opacity: 0.6 }]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={sc.cardBody}>
        {/* Date + duration — back at the top, as in the original card */}
        <View style={sc.cardTopRow}>
          <View style={[sc.durationRow, { flex: 1, marginBottom: 0 }]}>
            <Ionicons name="calendar-outline" size={ms(12)} color={colors.primary} />
            <Text style={sc.durationText}>{fmtSessionDate(session.scheduledDate)}</Text>
            <Text style={sc.durationSep}>·</Text>
            <Ionicons name="time-outline" size={ms(12)} color={colors.primary} />
            <Text style={sc.durationText}>{fmtTimeRange(session.startTime, session.endTime)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={ms(14)} color={C.placeholder} />
        </View>

        {/* Subject — full headline, matching the Weekly Template card's redesign */}
        <Text
          style={[sc.subjectTitle, !subject && { color: C.placeholder }]}
          numberOfLines={2}
        >
          {subject?.name ?? "No subject assigned"}
        </Text>

        {/* Status + Type + Faculty + Room — all on one line */}
        <View style={sc.metaRow}>
          <View style={[sc.statusBadge, { backgroundColor: sm.bg }]}>
            <Ionicons name={sm.icon as any} size={ms(10)} color={sm.color} />
            <Text style={[sc.statusBadgeT, { color: sm.color }]}>{sm.label}</Text>
          </View>
          {session.type !== "regular" && (
            <View style={[sc.typeBadge, { backgroundColor: tm.bg }]}>
              <Text style={[sc.typeBadgeT, { color: tm.color }]}>{tm.label}</Text>
            </View>
          )}
          {faculty && (
            <View style={sc.metaItem}>
              <Ionicons name="person-outline" size={ms(11)} color={C.green} />
              <Text style={sc.metaText} numberOfLines={1}>{faculty.fullName}</Text>
            </View>
          )}
          {session.room && (
            <View style={sc.metaItem}>
              <Ionicons name="location-outline" size={ms(11)} color={C.orange} />
              <Text style={sc.metaText} numberOfLines={1}>{session.room}</Text>
            </View>
          )}
        </View>

        {session.cancelReason && (
          <Text style={sc.cancelReason} numberOfLines={1}>
            Reason: {session.cancelReason}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function BatchScheduleScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const sc = useThemedStyles(makeScStyles);
  const { batchId, batchName } = route.params;
  const { canEdit: canEditSlotsPermission, canWrite: canCreateSlots } = usePermission("schedule");
  const { staff } = useAuth();
  // Editing the weekly template is admin/frontdesk-only — matches the API's
  // own block on PATCH /class-slots/:slotId, which a teacher's "edit" grant
  // would otherwise technically satisfy.
  const canEditSlots = canEditSlotsPermission && (staff?.activeRole === "admin" || staff?.activeRole === "frontdesk");

  const [activeTab, setActiveTab]       = useState<"template" | "week">("template");
  const [slots, setSlots]               = useState<ClassSlot[]>([]);
  const [sessions, setSessions]         = useState<ClassSession[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [loadingWeek, setLoadingWeek]   = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [weekBase, setWeekBase]         = useState(() => new Date());
  const [slotModal, setSlotModal]       = useState<{ visible: boolean; slot?: ClassSlot }>({ visible: false });

  const { from, to } = useMemo(() => getWeekBounds(weekBase), [weekBase]);

  const loadSlots = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingSlots(true);
    try {
      const data = await listSlots(batchId);
      setSlots(data);
    } catch { /* silent */ }
    finally { setLoadingSlots(false); }
  }, [batchId]);

  const loadWeek = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingWeek(true);
    try {
      // Generating is a best-effort pre-step, not something every viewer
      // can or needs to do — POST .../sessions/generate requires
      // schedule.write, which a teacher (read+edit only) doesn't have, and
      // would always 403. Previously that 403 threw before listSessions
      // ever ran, so a teacher's Week tab could never show even already-
      // generated sessions. Gated by permission, and non-fatal regardless
      // (a transient failure here still shouldn't hide existing sessions).
      if (canCreateSlots) {
        await generateSessions(batchId, { from: toDateStr(from), to: toDateStr(to) }).catch(() => {});
      }
      const data = await listSessions(batchId, { from: toDateStr(from), to: toDateStr(to) });
      setSessions(data);
    } catch { /* silent */ }
    finally { setLoadingWeek(false); }
  }, [batchId, from, to, canCreateSlots]);

  // Refreshes whichever tab is currently active on every focus (screen
  // re-opened, app foregrounded, etc.) — previously only ever refreshed the
  // Template tab's slots, so the Week tab could silently show stale session
  // data (e.g. a newly-generated or reassigned today's class) until the
  // active tab was manually switched away and back.
  useFocusEffect(useCallback(() => {
    if (activeTab === "template") loadSlots(); else loadWeek();
  }, [activeTab, loadSlots, loadWeek]));

  useEffect(() => {
    if (activeTab === "week") loadWeek();
  }, [activeTab, from, to, loadWeek]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await (activeTab === "template" ? loadSlots(true) : loadWeek(true));
    setRefreshing(false);
  }, [activeTab, loadSlots, loadWeek]);

  const slotsByDay = useMemo(() => {
    const map: Partial<Record<string, ClassSlot[]>> = {};
    for (const slot of slots) {
      if (!map[slot.dayOfWeek]) map[slot.dayOfWeek] = [];
      map[slot.dayOfWeek]!.push(slot);
    }
    return map;
  }, [slots]);

  const activeDays = useMemo(
    () => DAY_ORDER.filter((d) => (slotsByDay[d]?.length ?? 0) > 0),
    [slotsByDay],
  );

  const prevWeek = () => {
    const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d);
  };
  const nextWeek = () => {
    const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d);
  };

  return (
    <SafeAreaView style={sc.safe} edges={["bottom"]}>

      <ScreenHeader
        title={batchName}
        count={activeTab === "template" ? slots.length : sessions.length}
        countLabel={activeTab === "template" ? "slots" : "sessions"}
        onBack={() => navigation.goBack()}
      />

      <View style={sc.content}>
        {/* ── Tabs ── */}
        <View style={sc.tabBar}>
          {(["template", "week"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[sc.tab, activeTab === tab && sc.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={tab === "template" ? "repeat-outline" : "calendar-outline"}
                size={ms(14)}
                color={activeTab === tab ? colors.primary : C.muted}
              />
              <Text style={[sc.tabT, activeTab === tab && sc.tabTActive]}>
                {tab === "template" ? "Weekly Template" : "This Week"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Template tab ── */}
        {activeTab === "template" && (
          loadingSlots ? (
            <View style={sc.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={sc.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
              }
            >
              {activeDays.length === 0 ? (
                <View style={sc.emptyBox}>
                  <View style={sc.emptyIllus}>
                    <Ionicons name="calendar-outline" size={ms(52)} color={colors.primary} />
                  </View>
                  <Text style={sc.emptyTitle}>No weekly slots yet</Text>
                  <Text style={sc.emptySub}>
                    {canCreateSlots
                      ? "Tap the + button to define the first recurring class slot for this batch."
                      : "No recurring class slots have been set up for this batch yet."}
                  </Text>
                </View>
              ) : (
                activeDays.map((day) => {
                  const color = dayColorMap(colors)[day] ?? colors.primary;
                  return (
                    <View key={day} style={sc.daySection}>
                      <View style={sc.dayHeaderRow}>
                        <View style={[sc.dayDot, { backgroundColor: color }]} />
                        <Text style={[sc.dayLabel, { color }]}>
                          {DAY_LABELS[day]}
                        </Text>
                        <View style={sc.dayLine} />
                        <View style={[sc.dayCountPill, { backgroundColor: color + "18" }]}>
                          <Text style={[sc.dayCountT, { color }]}>{slotsByDay[day]!.length}</Text>
                        </View>
                      </View>
                      {slotsByDay[day]!.map((slot) => (
                        <SlotCard
                          key={slot.id}
                          slot={slot}
                          onEdit={canEditSlots ? (s) => setSlotModal({ visible: true, slot: s }) : undefined}
                        />
                      ))}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )
        )}

        {/* ── Week tab ── */}
        {activeTab === "week" && (
          <View style={{ flex: 1 }}>
            <View style={sc.weekNav}>
              <TouchableOpacity style={sc.weekNavBtn} onPress={prevWeek}>
                <Ionicons name="chevron-back" size={ms(18)} color={colors.primary} />
              </TouchableOpacity>
              <Text style={sc.weekLabel}>{fmtWeekLabel(from, to)}</Text>
              <TouchableOpacity style={sc.weekNavBtn} onPress={nextWeek}>
                <Ionicons name="chevron-forward" size={ms(18)} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {loadingWeek ? (
              <View style={sc.center}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={sc.loadingT}>Generating sessions…</Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={sc.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
                }
              >
                {sessions.length === 0 ? (
                  <View style={sc.emptyBox}>
                    <View style={sc.emptyIllus}>
                      <Ionicons name="calendar-clear-outline" size={ms(52)} color={C.blue} />
                    </View>
                    <Text style={sc.emptyTitle}>No classes this week</Text>
                    <Text style={sc.emptySub}>Add weekly slots in the Template tab and they will appear here automatically.</Text>
                  </View>
                ) : (
                  sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onPress={() =>
                        navigation.navigate("SessionDetail", {
                          sessionId: session.id,
                          batchId,
                          batchName,
                        })
                      }
                    />
                  ))
                )}
              </ScrollView>
            )}
          </View>
        )}

        {/* FAB — add slot. POST .../slots requires schedule.write, a
            different flag than the schedule.edit each existing slot's Edit
            action needs — teacher has edit but not write, so this can't
            reuse canEditSlots (that was the bug: the FAB was showing for
            teacher, who'd get a 403 tapping it). */}
        {activeTab === "template" && canCreateSlots && (
          <TouchableOpacity
            style={sc.fab}
            onPress={() => setSlotModal({ visible: true })}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={ms(26)} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <ManageSlotModal
        batchId={batchId}
        slot={slotModal.slot}
        visible={slotModal.visible}
        onClose={() => setSlotModal({ visible: false })}
        onSaved={() => { setSlotModal({ visible: false }); loadSlots(true); }}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeScStyles = (colors: ThemeColors) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.screenBg },
  content: { flex: 1, backgroundColor: colors.screenBg, marginTop: ms(8) },

  // Tabs
  tabBar: {
    flexDirection:   "row",
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex:            1,
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             ms(5),
    paddingVertical: ms(12),
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive:  { borderBottomColor: colors.primary },
  tabT:       { ...T.chipText, color: C.muted },
  tabTActive: { ...T.chipText, color: colors.primary },

  // Content
  listContent: { padding: ms(16), paddingBottom: ms(96) },
  center:      { flex: 1, justifyContent: "center", alignItems: "center", gap: ms(10) },
  loadingT:    { ...T.bodySmall, color: C.muted, marginTop: ms(4) },

  // Empty state
  emptyBox: {
    alignItems:      "center",
    paddingVertical: ms(56),
    paddingHorizontal: ms(32),
  },
  emptyIllus: {
    width:           ms(100),
    height:          ms(100),
    borderRadius:    ms(30),
    backgroundColor: colors.primary + "10",
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    ms(16),
  },
  emptyTitle: { ...T.cardTitle, color: C.text, marginBottom: ms(6), textAlign: "center" },
  emptySub:   { ...T.bodySmall, color: C.muted, textAlign: "center" },

  // Day section header
  daySection:    { marginBottom: ms(20) },
  dayHeaderRow:  { flexDirection: "row", alignItems: "center", marginBottom: ms(10), gap: ms(6) },
  dayDot:        { width: ms(7), height: ms(7), borderRadius: ms(3.5), flexShrink: 0 },
  dayLabel:      { ...T.sectionHeading, letterSpacing: 0.6 },
  dayLine:       { flex: 1, height: 1, backgroundColor: C.border },
  dayCountPill:  { borderRadius: ms(10), paddingHorizontal: ms(7), paddingVertical: ms(2) },
  dayCountT:     { ...T.badgeText },

  // Shared card
  card: {
    flexDirection:    "row",
    backgroundColor:  C.card,
    borderRadius:     ms(16),
    marginHorizontal: ms(0),
    marginBottom:     ms(10),
    shadowColor:      C.text,
    shadowOffset:     { width: 0, height: ms(2) },
    shadowOpacity:    0.07,
    shadowRadius:     ms(8),
    elevation:        2,
    overflow:         "hidden",
  },
  cardBody:{ flex: 1, padding: ms(14), gap: ms(8) },

  cardTopRow: { flexDirection: "row", alignItems: "center", gap: ms(8) },

  // Slot card — subject headline, then duration, then faculty/room meta.
  cardMainRow:  { flex: 1, flexDirection: "row", alignItems: "center", gap: ms(8), padding: ms(14) },
  subjectTitle: { ...T.cardTitle, color: C.text, marginBottom: ms(5) },
  durationRow:  { flexDirection: "row", alignItems: "center", gap: ms(5), marginBottom: ms(6) },
  durationText: { ...T.caption, color: C.muted },
  durationSep:  { ...T.caption, color: C.placeholder },
  metaRow:      { flexDirection: "row", alignItems: "center", gap: ms(14), flexWrap: "wrap" },
  metaItem:     { flexDirection: "row", alignItems: "center", gap: ms(4), flexShrink: 1 },
  metaText:     { ...T.caption, color: C.muted },

  // Session-specific
  statusBadge: { flexDirection: "row", alignItems: "center", gap: ms(3), borderRadius: ms(5), paddingHorizontal: ms(6), paddingVertical: ms(2) },
  statusBadgeT:{ ...T.badgeText },
  typeBadge:   { borderRadius: ms(5), paddingHorizontal: ms(6), paddingVertical: ms(2) },
  typeBadgeT:  { ...T.badgeText },
  cancelReason:{ ...T.caption, color: C.red, fontStyle: "italic" },

  // Week navigation
  weekNav: {
    flexDirection:    "row",
    alignItems:       "center",
    justifyContent:   "space-between",
    paddingHorizontal: ms(16),
    paddingVertical:  ms(10),
    backgroundColor:  C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  weekNavBtn: {
    width: ms(36), height: ms(36), borderRadius: ms(10),
    backgroundColor: colors.primary + "10",
    alignItems: "center", justifyContent: "center",
  },
  weekLabel: { ...T.listItemTitle, color: C.text },

  // FAB
  fab: {
    position:        "absolute",
    bottom:          ms(24),
    right:           ms(20),
    width:           ms(56),
    height:          ms(56),
    borderRadius:    ms(28),
    backgroundColor: colors.primary,
    justifyContent:  "center",
    alignItems:      "center",
    shadowColor:     colors.primary,
    shadowOffset:    { width: 0, height: ms(6) },
    shadowOpacity:   0.45,
    shadowRadius:    ms(12),
    elevation:       10,
  },
});

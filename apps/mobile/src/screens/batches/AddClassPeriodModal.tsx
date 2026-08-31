import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, Dimensions, ScrollView, Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet, SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import {
  WheelColumn, usePositionMap, scrollToIndex, useMeasuredColumnLayout, wheelStyles,
} from "../../components/ui/WheelPicker";
import { T } from "../../components/ui/typography";
import { DAY_LABELS, DAY_ORDER, type DayOfWeek } from "../../api/classSchedule";
import { listFaculty, type FacultyItem } from "../../api/faculty";
import { listSubjects, type SubjectItem } from "../../api/subjects";
// Reused as-is from the batch's own "Add Class Slot" flow — same subject/
// faculty pickers, same look, so this doesn't invent a second visual
// language for what's conceptually the same choice.
import { SubjectGrid, FacultyGrid } from "../schedule/ManageSlotModal";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";

// A period defined here doesn't exist on the server yet — the batch itself
// hasn't been created. It's held locally in CreateBatchScreen's state (one
// entry per period, each independently timed/subject/faculty'd, and each
// covering whichever days were picked) and only turned into real ClassSlot
// rows (one per day × period) after the batch is actually created.
export interface ClassPeriodDraft {
  id:          string; // local-only key, for editing/removing from the list
  days:        DayOfWeek[];
  startTime:   string; // 24h "HH:MM"
  endTime:     string;
  subjectId:   string | null;
  subjectName: string;
  facultyId:   string | null;
  facultyName: string;
  room:        string;
}

interface Props {
  visible: boolean;
  initial?: ClassPeriodDraft | null; // present → editing that period, absent → adding a new one
  onClose: () => void;
  onSave:  (draft: ClassPeriodDraft) => void;
}

// ── Time helpers (24h "HH:MM" storage ↔ 12h AM/PM wheel display) ─────────────
// Same wheel-picker approach as CreateBatchScreen's DatePickerModal — a pure
// JS component instead of the native @react-native-community/datetimepicker
// dialog, which turned out to be unreliable on Android when opened from
// inside a nested BottomSheet (see git history for the DateTimePickerAndroid
// attempt this replaces).

const HOURS_12   = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES_05 = Array.from({ length: 12 }, (_, i) => i * 5);  // 0,5,...,55
const MERIDIEMS: ("AM" | "PM")[] = ["AM", "PM"];

function to24h(hour12: number, minute: number, meridiem: "AM" | "PM"): string {
  let h = hour12 % 12;
  if (meridiem === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function from24h(time: string): { hour12: number; minute: number; meridiem: "AM" | "PM" } {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const meridiem: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: m, meridiem };
}

function fmt12h(time: string): string {
  const { hour12, minute, meridiem } = from24h(time);
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function newDraftId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Duration helpers ──────────────────────────────────────────────────────────
// End time is set via a duration off Start (the common case) rather than a
// second wheel — see AddClassPeriodModal's own comment on why: a hidden,
// easy-to-forget End field is exactly what let a real bug through before.

const DURATION_PRESETS_MIN = [45, 60, 90, 120];

function toMinutes(time24: string): number {
  const [h, m] = time24.split(":").map(Number);
  return h * 60 + m;
}

function addMinutes(time24: string, minutes: number): string {
  const total = (toMinutes(time24) + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function diffMinutes(startTime24: string, endTime24: string): number {
  return toMinutes(endTime24) - toMinutes(startTime24);
}

const SCREEN_H = Dimensions.get("window").height;

export function AddClassPeriodModal({ visible, initial, onClose, onSave }: Props) {
  const colors = useThemeColors();
  const m = useThemedStyles(makeStyles);
  const isEdit = !!initial;

  const [days, setDays]                 = useState<Set<DayOfWeek>>(new Set());
  const [startTime, setStartTime]       = useState("09:00");
  const [endTime, setEndTime]           = useState("10:30");
  const [room, setRoom]                 = useState("");
  const [subjectId, setSubjectId]       = useState<string | null>(null);
  const [subjectName, setSubjectName]   = useState("");
  const [facultyId, setFacultyId]       = useState<string | null>(null);
  const [facultyName, setFacultyName]   = useState("");
  // Subject/faculty still swap in as full inline content within this same
  // BottomSheet — never a second nested BottomSheet (a second native Modal
  // stacked on the first one froze the whole screen on iOS, with no JS
  // error, since nothing in this codebase had ever nested one BottomSheet
  // inside another before). Timing no longer works this way — see
  // timingOpen below — since leaving the whole form to pick a time made it
  // too easy to confirm Start/End without seeing the rest of the period
  // (this is what let a real bug through: an End time left at its default
  // because the End wheel was the only thing on screen).
  const [activePicker, setActivePicker] = useState<"subject" | "faculty" | null>(null);
  // Expands the Timing section inline (Start wheel + duration chips), with
  // the rest of the period form still on screen around it.
  const [timingOpen, setTimingOpen] = useState(false);
  // Whether the End wheel is shown for a manual override — closed by default
  // whenever the current Start/End pair matches one of the duration presets,
  // so the common case never needs a second wheel at all (see below).
  const [customEndOpen, setCustomEndOpen] = useState(false);

  const [faculties, setFaculties]   = useState<FacultyItem[]>([]);
  const [subjects, setSubjects]     = useState<SubjectItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const [kbHeight, setKbHeight] = useState(0);

  // Shared once across both Start's and End's wheel columns — every column
  // uses the identical colLabel style/content, so one measurement (taken
  // from whichever mounts first) is authoritative for all six, same as the
  // original single time-picker did for its own three.
  const { scrollAreaH: timeScrollAreaH, highlightTop: timeHighlightTop, onLabelLayout: onTimeLabelLayout } = useMeasuredColumnLayout();

  // The sheet's viewport doesn't reliably shrink via KeyboardAvoidingView in
  // this nested BottomSheet-inside-Modal context (confirmed on-device — its
  // "padding" behavior had no visible effect here), so instead of relying on
  // that, we track the OS-reported keyboard height directly and pad the
  // ScrollView's own content by that amount. scrollToEnd() then has genuine
  // room to scroll the last field (Room — the only text input in this form)
  // fully above the keyboard, rather than being capped at a scroll position
  // that still leaves it half covered.
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s1 = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates.height);
      // Give the native layout pass time to actually apply the new
      // contentContainerStyle padding (driven by the state update above)
      // before asking the ScrollView for its end — otherwise scrollToEnd()
      // computes against the still-stale, shorter content height.
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    });
    const s2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoadingData(true);
    Promise.all([listFaculty({ isActive: true, limit: 100 }), listSubjects()])
      .then(([fac, sub]) => {
        setFaculties(fac.data ?? []);
        setSubjects(Array.isArray(sub) ? sub : []);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let start = "09:00";
    let end   = "10:30";
    if (initial) {
      setDays(new Set(initial.days));
      start = initial.startTime;
      end   = initial.endTime;
      setStartTime(start);
      setEndTime(end);
      setRoom(initial.room);
      setSubjectId(initial.subjectId);
      setSubjectName(initial.subjectName);
      setFacultyId(initial.facultyId);
      setFacultyName(initial.facultyName);
    } else {
      setDays(new Set());
      setStartTime(start);
      setEndTime(end);
      setRoom("");
      setSubjectId(null); setSubjectName("");
      setFacultyId(null); setFacultyName("");
    }
    setError(null);
    setActivePicker(null);
    setTimingOpen(false);
    // Only reveal the End wheel up front if this period's own duration
    // doesn't match any preset — the common case (a fresh period, or an
    // existing one on a round duration) never needs it.
    setCustomEndOpen(!DURATION_PRESETS_MIN.includes(diffMinutes(start, end)));
  }, [visible, initial]);

  function toggleDay(d: DayOfWeek) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
    setError(null);
  }

  function handleSave() {
    if (days.size === 0) { setError("Select at least one day"); return; }
    if (!startTime || !endTime || startTime >= endTime) { setError("Start time must be before end time"); return; }
    onSave({
      id: initial?.id ?? newDraftId(),
      days: Array.from(days),
      startTime, endTime,
      room: room.trim(),
      subjectId, subjectName, facultyId, facultyName,
    });
  }

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} maxHeight={SHEET_HEIGHT.tall}>
        {/* Explicit, constant height — BottomSheet's own inner container has
            no height of its own (only a maxHeight cap), so a flex:1 child
            (the ScrollView below) has nothing to resolve against and would
            collapse to nothing without this. */}
        <View style={{ height: SCREEN_H * 0.88 }}>
        <View style={{ flex: 1 }}>
        <View style={m.handle} />

        {activePicker === "subject" && (
          <SubjectGrid
            subjects={subjects} selectedId={subjectId} onBack={() => setActivePicker(null)}
            onSelect={(s) => { if (!s) { setSubjectId(null); setSubjectName(""); } else { setSubjectId(s.id); setSubjectName(s.name); } }}
          />
        )}
        {activePicker === "faculty" && (
          <FacultyGrid
            faculties={faculties} selectedId={facultyId} onBack={() => setActivePicker(null)}
            onSelect={(f) => { if (!f) { setFacultyId(null); setFacultyName(""); } else { setFacultyId(f.id); setFacultyName(f.fullName); } }}
          />
        )}
        {!activePicker && (
          <>
            <View style={m.titleRow}>
              <View style={m.titleIcon}>
                <Ionicons name="time-outline" size={ms(20)} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={m.title}>{isEdit ? "Edit Class Period" : "Add Class Period"}</Text>
                <Text style={m.titleDesc}>Define the days, timing, subject and faculty for this period.</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={m.closeBtn}>
                <Ionicons name="close" size={ms(18)} color={C.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: ms(24) + kbHeight }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {loadingData && (
                <View style={m.loadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={m.loadingT}>Loading subjects &amp; faculty…</Text>
                </View>
              )}

              <View style={m.section}>
                <Text style={m.label}>Days</Text>
                <View style={m.dayGrid}>
                  {DAY_ORDER.map((d) => (
                    <TouchableOpacity key={d} style={[m.dayChip, days.has(d) && m.dayChipActive]} onPress={() => toggleDay(d)} activeOpacity={0.75}>
                      <Text style={[m.dayChipT, days.has(d) && m.dayChipTActive]}>{DAY_LABELS[d]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={m.section}>
                <View style={m.timingHeaderRow}>
                  <Text style={m.label}>Timing</Text>
                  {timingOpen && (
                    <TouchableOpacity onPress={() => setTimingOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[m.label, { color: colors.primary }]}>Done</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {!timingOpen ? (
                  <TouchableOpacity style={m.timeRangeRow} onPress={() => setTimingOpen(true)} activeOpacity={0.7}>
                    <Ionicons name="time-outline" size={ms(16)} color={C.muted} />
                    <Text style={m.timeRangeValue}>{fmt12h(startTime)}</Text>
                    <Text style={m.timeRangeSep}>–</Text>
                    <Text style={m.timeRangeValue}>{fmt12h(endTime)}</Text>
                    <Ionicons name="chevron-down" size={ms(14)} color={C.placeholder} style={{ marginLeft: "auto" }} />
                  </TouchableOpacity>
                ) : (() => {
                  const currentDuration = diffMinutes(startTime, endTime);
                  const matchedPreset   = customEndOpen ? null : DURATION_PRESETS_MIN.find((p) => p === currentDuration) ?? null;
                  return (
                    <View style={m.inlineTimingWrap}>
                      <InlineTimeGroup
                        label="START"
                        value={startTime}
                        accentColor={colors.primary}
                        scrollAreaH={timeScrollAreaH} highlightTop={timeHighlightTop} onLabelLayout={onTimeLabelLayout}
                        onChange={(t) => {
                          setStartTime(t);
                          // A preset stays "pinned" as a duration, not an absolute
                          // clock time — moving Start slides End along with it.
                          // Custom mode leaves End exactly where it was.
                          if (matchedPreset != null) setEndTime(addMinutes(t, matchedPreset));
                        }}
                      />

                      <Text style={m.durationLabel}>Duration</Text>
                      <View style={m.durationRow}>
                        {DURATION_PRESETS_MIN.map((p) => {
                          const active = matchedPreset === p;
                          return (
                            <TouchableOpacity
                              key={p}
                              style={[m.durationChip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                              onPress={() => { setEndTime(addMinutes(startTime, p)); setCustomEndOpen(false); }}
                              activeOpacity={0.75}
                            >
                              <Text style={[m.durationChipT, active && m.durationChipTActive]}>{p} min</Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          style={[m.durationChip, customEndOpen && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => setCustomEndOpen(true)}
                          activeOpacity={0.75}
                        >
                          <Text style={[m.durationChipT, customEndOpen && m.durationChipTActive]}>Custom</Text>
                        </TouchableOpacity>
                      </View>

                      {customEndOpen ? (
                        <InlineTimeGroup
                          label="END" value={endTime} onChange={setEndTime} accentColor={colors.primary}
                          scrollAreaH={timeScrollAreaH} highlightTop={timeHighlightTop}
                        />
                      ) : (
                        <View style={m.endsAtRow}>
                          <Ionicons name="flag-outline" size={ms(13)} color={C.muted} />
                          <Text style={m.endsAtT}>Ends at <Text style={m.endsAtVal}>{fmt12h(endTime)}</Text></Text>
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>

              <View style={m.section}>
                <Text style={m.label}>Subject (optional)</Text>
                <TouchableOpacity
                  style={[m.pickerCard, subjectId ? { borderColor: C.blue, backgroundColor: C.blue + "06" } : undefined]}
                  onPress={() => setActivePicker("subject")}
                  activeOpacity={0.75}
                >
                  <View style={[m.pickerIcon, { backgroundColor: subjectId ? C.blue + "18" : C.inputBg }]}>
                    <Ionicons name="book-outline" size={ms(16)} color={subjectId ? C.blue : C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    {subjectId
                      ? <Text style={m.pickerSelected}>{subjectName}</Text>
                      : <Text style={m.pickerPlaceholder}>Tap to select subject</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={ms(14)} color={C.placeholder} />
                </TouchableOpacity>
              </View>

              <View style={m.section}>
                <Text style={m.label}>Faculty (optional)</Text>
                <TouchableOpacity
                  style={[m.pickerCard, facultyId ? { borderColor: C.green, backgroundColor: C.green + "06" } : undefined]}
                  onPress={() => setActivePicker("faculty")}
                  activeOpacity={0.75}
                >
                  <View style={[m.pickerIcon, { backgroundColor: C.inputBg }]}>
                    <Ionicons name="person-outline" size={ms(16)} color={C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    {facultyId
                      ? <Text style={[m.pickerSelected, { color: C.green }]}>{facultyName}</Text>
                      : <Text style={m.pickerPlaceholder}>Tap to select faculty</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={ms(14)} color={C.placeholder} />
                </TouchableOpacity>
              </View>

              <View style={m.section}>
                <Text style={m.label}>Room / Location (optional)</Text>
                <TextInput
                  style={m.input}
                  value={room}
                  onChangeText={setRoom}
                  placeholder="e.g. Room 101, Hall A"
                  placeholderTextColor={C.placeholder}
                  maxLength={100}
                  autoCorrect={false}
                />
              </View>

              {error && (
                <View style={m.errorBox}>
                  <Ionicons name="alert-circle-outline" size={ms(14)} color={C.red} />
                  <Text style={m.errorT}>{error}</Text>
                </View>
              )}
            </ScrollView>

            {/* Pinned below the scroll area, but its own extra bottom padding
                grows with the keyboard height — the fixed column above it
                (see the height:SCREEN_H*0.88 wrapper) can't move as a whole,
                so this is what keeps the button from ending up rendered
                behind the keyboard instead of just shrinking the ScrollView
                to make room for it. */}
            <View style={[m.footer, { paddingBottom: ms(24) + kbHeight }]}>
              <TouchableOpacity style={m.saveBtn} onPress={handleSave} activeOpacity={0.85}>
                <Text style={m.saveBtnT}>{isEdit ? "Save Changes" : "Add Period"}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        </View>
        </View>
      </BottomSheet>

    </>
  );
}

// ── Inline Time Group (Hour / Minute / AM-PM) ─────────────────────────────────
// Renders directly inline within AddClassPeriodModal's own form (two side by
// side — one for Start, one for End) instead of swapping out the whole sheet
// the way the subject/faculty grids still do. No local "uncommitted" state or
// separate confirm step: each wheel writes straight through to the parent's
// startTime/endTime via onChange, since Start and End are both on screen
// together — there's nothing to leave partially-picked out of view the way
// a full-screen swap allowed. A stable, module-level component for the same
// reason WheelColumn is: an inline component gets a new identity every
// re-render, which would remount its ScrollViews and reset scroll position
// on every tap.
function InlineTimeGroup({ label, value, onChange, accentColor, scrollAreaH, highlightTop, onLabelLayout }: {
  label:       string;
  value:       string; // 24h "HH:MM"
  onChange:    (time24: string) => void;
  accentColor: string;
  scrollAreaH: number;
  highlightTop: number;
  onLabelLayout?: (e: { nativeEvent: { layout: { height: number } } }) => void;
}) {
  const { hour12, minute, meridiem } = from24h(value);

  const hourRef     = useRef<ScrollView>(null);
  const minuteRef   = useRef<ScrollView>(null);
  const meridiemRef = useRef<ScrollView>(null);

  const hourPos     = usePositionMap();
  const minutePos   = usePositionMap();
  const meridiemPos = usePositionMap();

  // Scrolls each column to reflect `value` on mount and whenever it changes
  // for a reason other than this group's own wheel taps (e.g. switching
  // which period is being edited) — the taps below already scroll
  // themselves immediately, this just covers the initial/external case.
  useEffect(() => {
    const t = setTimeout(() => {
      scrollToIndex(hourRef,     hourPos.positions,     HOURS_12.indexOf(hour12),    scrollAreaH);
      scrollToIndex(minuteRef,   minutePos.positions,   MINUTES_05.indexOf(minute),  scrollAreaH);
      scrollToIndex(meridiemRef, meridiemPos.positions, MERIDIEMS.indexOf(meridiem), scrollAreaH);
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, scrollAreaH]);

  return (
    <View style={{ flex: 1 }}>
      <Text style={groupStyles.groupLabel}>{label}</Text>
      <View style={wheelStyles.selectors}>
          <View style={wheelStyles.selector}>
            <Text style={wheelStyles.colLabel} onLayout={onLabelLayout}>HOUR</Text>
            <WheelColumn
              items={HOURS_12} selected={hour12} scrollRef={hourRef} fmt={(v) => String(v)}
              onItemLayout={hourPos.onItemLayout} accentColor={accentColor}
              onSelect={(v) => {
                onChange(to24h(v, minute, meridiem));
                scrollToIndex(hourRef, hourPos.positions, HOURS_12.indexOf(v), scrollAreaH, true);
              }}
            />
          </View>
          <View style={wheelStyles.selector}>
            <Text style={wheelStyles.colLabel}>MIN</Text>
            <WheelColumn
              items={MINUTES_05} selected={minute} scrollRef={minuteRef} fmt={(v) => String(v).padStart(2, "0")}
              onItemLayout={minutePos.onItemLayout} accentColor={accentColor}
              onSelect={(v) => {
                onChange(to24h(hour12, v, meridiem));
                scrollToIndex(minuteRef, minutePos.positions, MINUTES_05.indexOf(v), scrollAreaH, true);
              }}
            />
          </View>
          <View style={wheelStyles.selector}>
            <Text style={wheelStyles.colLabel}>{" "}</Text>
            <WheelColumn
              items={MERIDIEMS} selected={meridiem} scrollRef={meridiemRef} fmt={(v) => v}
              onItemLayout={meridiemPos.onItemLayout} accentColor={accentColor}
              onSelect={(v) => {
                onChange(to24h(hour12, minute, v));
                scrollToIndex(meridiemRef, meridiemPos.positions, MERIDIEMS.indexOf(v), scrollAreaH, true);
              }}
            />
          </View>

          <View pointerEvents="none" style={[wheelStyles.highlight, { top: highlightTop, borderColor: accentColor + "20", backgroundColor: accentColor + "06" }]} />
        </View>
    </View>
  );
}

const groupStyles = StyleSheet.create({
  groupLabel: { ...T.sectionHeading, color: C.muted, letterSpacing: 1, textAlign: "center", marginBottom: ms(6) },
});

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  handle: { width: ms(36), height: ms(4), borderRadius: ms(2), backgroundColor: C.border, alignSelf: "center", marginTop: ms(12), marginBottom: ms(4) },

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: ms(12), paddingHorizontal: ms(20), paddingVertical: ms(14) },
  titleIcon: { width: ms(44), height: ms(44), borderRadius: ms(12), backgroundColor: colors.primary + "17", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  title: { ...T.cardTitle, color: C.text, marginBottom: 3 },
  titleDesc: { ...T.bodySmall, color: C.muted },
  closeBtn: { width: ms(32), height: ms(32), borderRadius: ms(10), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: ms(8), padding: ms(16) },
  loadingT: { ...T.bodySmall, color: C.muted },

  section: { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(14) },
  label: { ...T.chipText, color: C.text, marginBottom: ms(7), textTransform: "uppercase", letterSpacing: 0.3 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(12), ...T.body, color: C.text, backgroundColor: C.inputBg },

  dayGrid: { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  dayChip: { paddingHorizontal: ms(12), paddingVertical: ms(7), borderRadius: ms(8), borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipT: { ...T.chipText, color: C.muted },
  dayChipTActive: { color: "#FFFFFF" },

  timingHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeRangeRow: { flexDirection: "row", alignItems: "center", gap: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(12), paddingHorizontal: ms(14), paddingVertical: ms(12), backgroundColor: C.inputBg },
  timeRangeValue: { ...T.body, color: C.text },
  timeRangeSep: { ...T.cardTitle, color: C.placeholder },
  inlineTimingWrap: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(12),
    backgroundColor: C.inputBg, paddingVertical: ms(10), paddingHorizontal: ms(10),
  },
  durationLabel: { ...T.chipText, color: C.text, marginTop: ms(4), marginBottom: ms(7), textTransform: "uppercase", letterSpacing: 0.3 },
  durationRow: { flexDirection: "row", flexWrap: "wrap", gap: ms(8), marginBottom: ms(10) },
  durationChip: { paddingHorizontal: ms(12), paddingVertical: ms(7), borderRadius: ms(20), borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  durationChipT: { ...T.chipText, color: C.muted },
  durationChipTActive: { color: "#FFFFFF" },
  endsAtRow: { flexDirection: "row", alignItems: "center", gap: ms(6), paddingTop: ms(2) },
  endsAtT: { ...T.bodySmall, color: C.muted },
  endsAtVal: { ...T.bodySmall, color: C.text, fontFamily: "Inter_600SemiBold", fontWeight: "600" },

  pickerCard: { flexDirection: "row", alignItems: "center", gap: ms(10), borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(12), paddingHorizontal: ms(10), paddingVertical: ms(7), backgroundColor: C.inputBg },
  pickerIcon: { width: ms(30), height: ms(30), borderRadius: ms(9), alignItems: "center", justifyContent: "center" },
  pickerSelected: { ...T.listItemTitle, color: C.text },
  pickerPlaceholder: { ...T.body, color: C.placeholder },

  errorBox: { flexDirection: "row", gap: ms(8), alignItems: "flex-start", marginHorizontal: ms(20), marginTop: ms(4), backgroundColor: C.redBg, padding: ms(12), borderRadius: ms(10) },
  errorT: { flex: 1, ...T.bodySmall, color: C.red },

  footer: { paddingHorizontal: ms(20), paddingTop: ms(12), paddingBottom: ms(24) },
  saveBtn: { height: ms(46), borderRadius: ms(10), backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  saveBtnT: { ...T.buttonText, color: "#FFFFFF" },
});

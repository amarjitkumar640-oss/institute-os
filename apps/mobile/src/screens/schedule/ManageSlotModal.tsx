import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Platform, Keyboard,
  Dimensions, Modal,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { BottomSheet, SHEET_HEIGHT } from "../../components/ui/BottomSheet";
import { T } from "../../components/ui/typography";

const SCREEN_H = Dimensions.get("window").height;
import { Ionicons } from "@expo/vector-icons";
import {
  createSlot, updateSlot, deleteSlot,
  type ClassSlot, type DayOfWeek, DAY_LABELS, DAY_ORDER, fmtTimeRange,
} from "../../api/classSchedule";
import { listFaculty, type FacultyItem } from "../../api/faculty";
import { listSubjects, type SubjectItem } from "../../api/subjects";
import { ms, fs } from "../../utils/responsive";
import { C } from "../../theme";
import { useThemeColors, useThemedStyles, type ThemeColors } from "../../context/ThemeContext";
import { useAlert } from "../../context/AlertContext";
import { usePermission } from "../../hooks/usePermission";

interface Props {
  batchId:  string;
  slot?:    ClassSlot;
  visible:  boolean;
  onClose:  () => void;
  onSaved:  () => void;
}

const TODAY = new Date().toISOString().slice(0, 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeError(t: string): string | null {
  if (!t.trim()) return "Required";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.trim())) return "Use HH:MM  e.g. 09:00";
  return null;
}

function timeStrToDate(t: string): Date {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function dateToTimeStr(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function facultyAvatarColor(name: string, colors: ThemeColors) {
  const palette = [colors.primary, C.blue, C.green, colors.accent, C.purple, C.orange];
  return palette[name.charCodeAt(0) % palette.length];
}

// ── Subject grid picker ───────────────────────────────────────────────────────

function SubjectGrid({
  subjects, selectedId, onSelect, onBack,
}: {
  subjects:   SubjectItem[];
  selectedId: string | null;
  onSelect:   (s: SubjectItem | null) => void;
  onBack:     () => void;
}) {
  const sg = useThemedStyles(makeSgStyles);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? subjects.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : subjects;

  const groups: Record<string, { label: string; color: string; items: SubjectItem[] }> = {};
  const general: SubjectItem[] = [];
  for (const s of filtered) {
    if (s.examCategories.length > 0) {
      // A subject relevant to several categories appears under each of them.
      for (const ec of s.examCategories) {
        if (!groups[ec.id]) groups[ec.id] = { label: ec.label, color: ec.color, items: [] };
        groups[ec.id].items.push(s);
      }
    } else {
      general.push(s);
    }
  }

  return (
    <View style={sg.wrap}>
      {/* Header */}
      <View style={sg.header}>
        <TouchableOpacity style={sg.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={ms(18)} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={sg.headerTitle}>Select Subject</Text>
          <Text style={sg.headerSub}>{subjects.length} subject{subjects.length !== 1 ? "s" : ""} available</Text>
        </View>
        {selectedId && (
          <TouchableOpacity style={sg.clearBtn} onPress={() => { onSelect(null); onBack(); }}>
            <Text style={sg.clearT}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={sg.searchRow}>
        <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
        <TextInput
          style={sg.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search subjects…"
          placeholderTextColor={C.placeholder}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={ms(15)} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Grid */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={sg.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length === 0 ? (
          <View style={sg.empty}>
            <Ionicons name="search-outline" size={ms(32)} color={C.placeholder} />
            <Text style={sg.emptyT}>No subjects found</Text>
          </View>
        ) : (
          <>
            {Object.entries(groups).map(([catId, group]) => {
              const color = group.color;
              const label = group.label;
              const items = group.items;
              return (
                <View key={catId} style={sg.group}>
                  <View style={sg.groupHeader}>
                    <View style={[sg.groupDot, { backgroundColor: color }]} />
                    <Text style={[sg.groupLabel, { color }]}>{label}</Text>
                    <Text style={sg.groupCount}>{items.length} subject{items.length !== 1 ? "s" : ""}</Text>
                  </View>
                  <View style={sg.grid}>
                    {items.map((s) => {
                      const sel = s.id === selectedId;
                      return (
                        <TouchableOpacity
                          key={s.id}
                          style={[sg.card, { borderColor: sel ? color : C.border }, sel && { backgroundColor: color + "10" }]}
                          onPress={() => { onSelect(s); onBack(); }}
                          activeOpacity={0.75}
                        >
                          <View style={[sg.cardTop, { backgroundColor: color + "16" }]}>
                            <View style={[sg.cardDot, { backgroundColor: color }]} />
                            {sel && <Ionicons name="checkmark-circle" size={ms(15)} color={color} />}
                          </View>
                          <Text style={[sg.cardName, sel && { color }]} numberOfLines={2}>{s.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {general.length > 0 && (
              <View style={sg.group}>
                <View style={sg.groupHeader}>
                  <View style={[sg.groupDot, { backgroundColor: C.muted }]} />
                  <Text style={[sg.groupLabel, { color: C.muted }]}>General</Text>
                  <Text style={sg.groupCount}>{general.length}</Text>
                </View>
                <View style={sg.grid}>
                  {general.map((s) => {
                    const sel = s.id === selectedId;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[sg.card, { borderColor: sel ? C.muted : C.border }, sel && { backgroundColor: C.muted + "10" }]}
                        onPress={() => { onSelect(s); onBack(); }}
                        activeOpacity={0.75}
                      >
                        <View style={[sg.cardTop, { backgroundColor: C.muted + "16" }]}>
                          <View style={[sg.cardDot, { backgroundColor: C.muted }]} />
                          {sel && <Ionicons name="checkmark-circle" size={ms(15)} color={C.muted} />}
                        </View>
                        <Text style={[sg.cardName, sel && { color: C.muted }]} numberOfLines={2}>{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Faculty list picker ───────────────────────────────────────────────────────

function FacultyGrid({
  faculties, selectedId, onSelect, onBack,
}: {
  faculties:  FacultyItem[];
  selectedId: string | null;
  onSelect:   (f: FacultyItem | null) => void;
  onBack:     () => void;
}) {
  const colors = useThemeColors();
  const fg = useThemedStyles(makeFgStyles);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? faculties.filter((f) =>
        f.fullName.toLowerCase().includes(search.toLowerCase()) ||
        (f.subjects ?? []).some((s) => s.name.toLowerCase().includes(search.toLowerCase()))
      )
    : faculties;

  return (
    <View style={fg.wrap}>
      {/* Header */}
      <View style={fg.header}>
        <TouchableOpacity style={fg.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={ms(18)} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={fg.headerTitle}>Select Faculty</Text>
          <Text style={fg.headerSub}>{faculties.length} faculty member{faculties.length !== 1 ? "s" : ""}</Text>
        </View>
        {selectedId && (
          <TouchableOpacity style={fg.clearBtn} onPress={() => { onSelect(null); onBack(); }}>
            <Text style={fg.clearT}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={fg.searchRow}>
        <Ionicons name="search-outline" size={ms(15)} color={C.muted} />
        <TextInput
          style={fg.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search faculty…"
          placeholderTextColor={C.placeholder}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={ms(15)} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Cards */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={fg.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length === 0 ? (
          <View style={fg.empty}>
            <Ionicons name="people-outline" size={ms(32)} color={C.placeholder} />
            <Text style={fg.emptyT}>No faculty found</Text>
          </View>
        ) : (
          filtered.map((f) => {
            const sel   = f.id === selectedId;
            const color = facultyAvatarColor(f.fullName, colors);
            const subs  = (f.subjects ?? []).map((s) => s.name).join(" · ");
            return (
              <TouchableOpacity
                key={f.id}
                style={[fg.card, sel && { borderColor: color, backgroundColor: color + "08" }]}
                onPress={() => { onSelect(f); onBack(); }}
                activeOpacity={0.75}
              >
                <View style={[fg.avatar, { backgroundColor: sel ? color : color + "18" }]}>
                  <Text style={[fg.initials, { color: sel ? "#fff" : color }]}>{getInitials(f.fullName)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[fg.name, sel && { color }]} numberOfLines={1}>{f.fullName}</Text>
                  {!!subs && <Text style={fg.subs} numberOfLines={1}>{subs}</Text>}
                  <Text style={fg.code}>{f.employeeCode}</Text>
                </View>
                {sel
                  ? <Ionicons name="checkmark-circle" size={ms(22)} color={color} />
                  : <Ionicons name="chevron-forward"  size={ms(14)} color={C.placeholder} />
                }
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function ManageSlotModal({ batchId, slot, visible, onClose, onSaved }: Props) {
  const colors = useThemeColors();
  const m = useThemedStyles(makeMStyles);
  const isEdit = !!slot;
  const { showConfirm, showAlert } = useAlert();
  // DELETE /class-slots/:slotId requires schedule.delete specifically — a
  // separate flag from the schedule.edit this modal's Save action needs
  // (teacher has "re" i.e. read+edit but not delete, so this button must be
  // its own gate, not folded into the edit permission already implied by
  // isEdit being true).
  const { canDelete } = usePermission("schedule");

  const [dayOfWeek,   setDayOfWeek]   = useState<DayOfWeek>("monday");
  const [startTime,   setStartTime]   = useState("09:00");
  const [endTime,     setEndTime]     = useState("10:30");
  const [room,        setRoom]        = useState("");
  const [validFrom,   setValidFrom]   = useState(TODAY);
  const [subjectId,   setSubjectId]   = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [facultyId,   setFacultyId]   = useState<string | null>(null);
  const [facultyName, setFacultyName] = useState("");

  const [activePicker, setActivePicker] = useState<"subject" | "faculty" | null>(null);
  const [faculties,    setFaculties]    = useState<FacultyItem[]>([]);
  const [subjects,     setSubjects]     = useState<SubjectItem[]>([]);
  const [loadingData,  setLoadingData]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // The sheet's own size NEVER changes for the keyboard — it stays at the
  // full SCREEN_H * 0.88 always. Only the content scrolls internally, just
  // far enough that the focused field ends up above the portion of the
  // sheet the keyboard is covering (the keyboard overlaps the bottom
  // kbHeight pixels of the sheet itself, since the sheet is anchored to the
  // screen's bottom edge).
  const scrollRef = useRef<ScrollView>(null);
  const kbHeightRef = useRef(0);
  const focusedKeyRef = useRef<string | null>(null);
  // Where the content was scrolled to right before the keyboard opened,
  // so closing the keyboard can put it back — otherwise the form stays
  // scrolled down to wherever the last field-clearing scroll left it.
  const currentScrollYRef = useRef(0);
  const preKeyboardScrollYRef = useRef(0);
  // The ScrollView doesn't start at the top of the sheet — the handle and
  // title row sit above it and don't scroll. Captured via the ScrollView's
  // own onLayout `y` (its offset within the sheet's flex column). Confirmed
  // via on-device logging that omitting this was the actual bug: the scroll
  // target was computed as if the ScrollView's content started at the very
  // top of the sheet, undershooting by exactly this header height every time.
  const headerHeightRef = useRef(0);

  // Each field section's top offset within the ScrollView's content,
  // captured via onLayout (see recordFieldY below) — deliberately avoids
  // measureLayout()/findNodeHandle(), which warn ("must be called with a ref
  // to a native component") against the wrapper refs ScrollView/TextInput
  // expose here.
  const fieldY = useRef<Record<string, number>>({});
  function recordFieldY(key: string) {
    return (e: { nativeEvent: { layout: { y: number } } }) => {
      fieldY.current[key] = e.nativeEvent.layout.y;
    };
  }

  function scrollToClearKeyboard(key: string, kbH: number) {
    const y = fieldY.current[key];
    if (y === undefined) return;
    const sheetHeight = SCREEN_H * 0.88;
    const visible = sheetHeight - kbH - headerHeightRef.current;
    const target = Math.max(0, y - visible + ms(140));
    scrollRef.current?.scrollTo({ y: target, animated: true });
  }

  // Called from onFocus. If the keyboard is already open (switching between
  // fields), scroll immediately using the height we already know.
  // Otherwise, wait for the keyboard-show listener below to fire and drive
  // the scroll from there — that's the only place the real height is
  // guaranteed known, avoiding any race with a guessed delay.
  function scrollFieldIntoView(key: string) {
    // Only snapshot on the transition from "keyboard closed" to "about to
    // open" — not on every field switch while it's already open, which
    // would overwrite the snapshot with an already-scrolled-for-keyboard
    // position instead of the true original one.
    if (kbHeightRef.current === 0) preKeyboardScrollYRef.current = currentScrollYRef.current;
    focusedKeyRef.current = key;
    if (kbHeightRef.current > 0) scrollToClearKeyboard(key, kbHeightRef.current);
  }

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s1 = Keyboard.addListener(showEvt, (e) => {
      kbHeightRef.current = e.endCoordinates.height;
      if (focusedKeyRef.current) scrollToClearKeyboard(focusedKeyRef.current, e.endCoordinates.height);
    });
    const s2 = Keyboard.addListener(hideEvt, () => {
      kbHeightRef.current = 0;
      focusedKeyRef.current = null;
      scrollRef.current?.scrollTo({ y: preKeyboardScrollYRef.current, animated: true });
    });
    return () => { s1.remove(); s2.remove(); };
  }, []);

  // Class Timing — a native time-picker wheel instead of typed HH:MM.
  const [activeTimePicker, setActiveTimePicker] = useState<"start" | "end" | null>(null);

  // Android's picker is an imperative one-shot dialog: mounting it opens the
  // dialog, and onChange fires once with the result (event.type "set") or a
  // cancel (event.type "dismissed") — there's no separate "confirm" step.
  // iOS's spinner is inline and fires onChange continuously as the wheel
  // scrolls, confirmed via the Done button in confirmIosTimePicker below.
  function handleTimeChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") {
      if (event.type !== "set" || !selected) { setActiveTimePicker(null); return; }
      const str = dateToTimeStr(selected);
      if (activeTimePicker === "start") {
        setStartTime(str);
        setActiveTimePicker("end"); // auto-advance to End Time
      } else {
        setEndTime(str);
        setActiveTimePicker(null);
      }
    } else if (selected) {
      const str = dateToTimeStr(selected);
      if (activeTimePicker === "start") setStartTime(str);
      else setEndTime(str);
    }
  }

  function confirmIosTimePicker() {
    if (activeTimePicker === "start") setActiveTimePicker("end"); // auto-advance to End Time
    else setActiveTimePicker(null);
  }

  // Load faculty + subjects when modal opens
  useEffect(() => {
    if (!visible) return;
    setLoadingData(true);
    setError(null);
    Promise.all([
      listFaculty({ isActive: true, limit: 100 }),
      listSubjects(),
    ]).then(([fac, sub]) => {
      setFaculties(fac.data ?? []);
      setSubjects(Array.isArray(sub) ? sub : []);
    }).catch((err) => {
      const raw = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message;
      setError(typeof raw === "string" ? raw : "Failed to load subjects / faculty. Check connection.");
    }).finally(() => setLoadingData(false));
  }, [visible]);

  // Pre-fill when editing; reset when creating
  useEffect(() => {
    if (visible && slot) {
      setDayOfWeek(slot.dayOfWeek);
      setStartTime(slot.startTime);
      setEndTime(slot.endTime);
      setRoom(slot.room ?? "");
      setValidFrom(slot.validFrom.slice(0, 10));
      setSubjectId(slot.subject?.id ?? null);
      setSubjectName(slot.subject?.name ?? "");
      setFacultyId(slot.faculty?.id ?? null);
      setFacultyName(slot.faculty?.fullName ?? "");
    } else if (visible && !slot) {
      setDayOfWeek("monday");
      setStartTime("09:00");
      setEndTime("10:30");
      setRoom("");
      setValidFrom(TODAY);
      setSubjectId(null);
      setSubjectName("");
      setFacultyId(null);
      setFacultyName("");
    }
    setError(null);
    setActivePicker(null);
    setDeleting(false);
    setSaving(false);
  }, [visible, slot]);

  const validate = () => {
    const st = timeError(startTime);
    const et = timeError(endTime);
    if (st) return `Start time: ${st}`;
    if (et) return `End time: ${et}`;
    if (startTime.trim() >= endTime.trim()) return "Start time must be before end time";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateSlot(slot!.id, {
          startTime: startTime.trim(),
          endTime:   endTime.trim(),
          room:      room.trim() || null,
          subjectId,
          facultyId,
        });
      } else {
        await createSlot(batchId, {
          dayOfWeek,
          startTime: startTime.trim(),
          endTime:   endTime.trim(),
          room:      room.trim() || undefined,
          validFrom,
          subjectId: subjectId ?? undefined,
          facultyId: facultyId ?? undefined,
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Failed to save slot");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!slot) return;
    showConfirm(
      "Remove Slot",
      `Remove the ${DAY_LABELS[slot.dayOfWeek]} ${fmtTimeRange(slot.startTime, slot.endTime)} slot from the weekly template?`,
      async () => {
        setDeleting(true);
        try {
          await deleteSlot(slot.id);
          onSaved();
        } catch (e: any) {
          const msg = e?.response?.data?.error ?? "Failed to remove slot. Make sure the server is running.";
          showAlert("Remove Failed", msg, "error");
        } finally {
          setDeleting(false);
        }
      },
      { confirmLabel: "Remove", cancelLabel: "Cancel", destructive: true },
    );
  };

  return (
    <>
    <BottomSheet visible={visible} onClose={onClose} maxHeight={SHEET_HEIGHT.tall}>
      {/* Explicit, constant height — never changes for the keyboard.
          BottomSheet's own inner container has no height of its own (only
          a maxHeight cap), so a flex:1 child here has nothing to resolve
          against and would collapse to nothing without this. */}
      <View style={{ height: SCREEN_H * 0.88 }}>
        <View style={{ flex: 1 }}>
          <View style={m.handle} />

            {/* ── Subject grid ── */}
            {activePicker === "subject" && (
              <SubjectGrid
                subjects={subjects}
                selectedId={subjectId}
                onSelect={(s) => {
                  if (!s) { setSubjectId(null); setSubjectName(""); }
                  else    { setSubjectId(s.id); setSubjectName(s.name); }
                }}
                onBack={() => setActivePicker(null)}
              />
            )}

            {/* ── Faculty grid ── */}
            {activePicker === "faculty" && (
              <FacultyGrid
                faculties={faculties}
                selectedId={facultyId}
                onSelect={(f) => {
                  if (!f) { setFacultyId(null); setFacultyName(""); }
                  else    { setFacultyId(f.id); setFacultyName(f.fullName); }
                }}
                onBack={() => setActivePicker(null)}
              />
            )}

            {/* ── Main form ── */}
            {!activePicker && (
              <>
                <View style={m.titleRow}>
                  <View style={m.titleIcon}>
                    <Ionicons name={isEdit ? "create-outline" : "add-circle-outline"} size={ms(21)} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={m.title}>{isEdit ? "Edit Slot" : "Add Class Slot"}</Text>
                    <Text style={m.titleDesc}>
                      {isEdit
                        ? "Update the timing, subject, faculty or room for this weekly slot."
                        : "Define a new recurring class slot for this batch."}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={onClose} style={m.closeBtn}>
                    <Ionicons name="close" size={ms(18)} color={C.muted} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  ref={scrollRef}
                  onLayout={(e) => { headerHeightRef.current = e.nativeEvent.layout.y; }}
                  onScroll={(e) => { currentScrollYRef.current = e.nativeEvent.contentOffset.y; }}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: ms(400) }}
                >
                  {loadingData && (
                    <View style={m.loadingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={m.loadingT}>Loading subjects &amp; faculty…</Text>
                    </View>
                  )}

                  {/* ── Day of week (create only) ── */}
                  {!isEdit && (
                    <View style={m.section}>
                      <Text style={m.label}>Day of Week</Text>
                      <View style={m.dayGrid}>
                        {DAY_ORDER.map((d) => (
                          <TouchableOpacity
                            key={d}
                            style={[m.dayChip, dayOfWeek === d && m.dayChipActive]}
                            onPress={() => setDayOfWeek(d)}
                          >
                            <Text style={[m.dayChipT, dayOfWeek === d && m.dayChipTActive]}>
                              {DAY_LABELS[d]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* ── Subject selector ── */}
                  <View style={m.section}>
                    <Text style={m.label}>Subject (optional)</Text>
                    <TouchableOpacity
                      style={[m.pickerCard, subjectId && { borderColor: C.blue, backgroundColor: C.blue + "06" }]}
                      onPress={() => setActivePicker("subject")}
                      activeOpacity={0.75}
                    >
                      <View style={[m.pickerIcon, { backgroundColor: subjectId ? C.blue + "18" : C.inputBg }]}>
                        <Ionicons name="book-outline" size={ms(16)} color={subjectId ? C.blue : C.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        {subjectId ? (
                          <>
                            <Text style={m.pickerSelected}>{subjectName}</Text>
                            <Text style={m.pickerMeta}>Tap to change</Text>
                          </>
                        ) : (
                          <Text style={m.pickerPlaceholder}>Tap to select subject</Text>
                        )}
                      </View>
                      {subjectId
                        ? <Ionicons name="checkmark-circle" size={ms(18)} color={C.blue} />
                        : <Ionicons name="chevron-forward"  size={ms(14)} color={C.placeholder} />
                      }
                    </TouchableOpacity>
                  </View>

                  {/* ── Faculty selector ── */}
                  <View style={m.section}>
                    <Text style={m.label}>Faculty (optional)</Text>
                    <TouchableOpacity
                      style={[m.pickerCard, facultyId && { borderColor: C.green, backgroundColor: C.green + "06" }]}
                      onPress={() => setActivePicker("faculty")}
                      activeOpacity={0.75}
                    >
                      {facultyId ? (
                        <View style={[m.pickerAvatar, { backgroundColor: facultyAvatarColor(facultyName, colors) }]}>
                          <Text style={m.pickerAvatarT}>{getInitials(facultyName)}</Text>
                        </View>
                      ) : (
                        <View style={[m.pickerIcon, { backgroundColor: C.inputBg }]}>
                          <Ionicons name="person-outline" size={ms(16)} color={C.muted} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        {facultyId ? (
                          <>
                            <Text style={[m.pickerSelected, { color: C.green }]}>{facultyName}</Text>
                            <Text style={m.pickerMeta}>Tap to change</Text>
                          </>
                        ) : (
                          <Text style={m.pickerPlaceholder}>Tap to select faculty</Text>
                        )}
                      </View>
                      {facultyId
                        ? <Ionicons name="checkmark-circle" size={ms(18)} color={C.green} />
                        : <Ionicons name="chevron-forward"  size={ms(14)} color={C.placeholder} />
                      }
                    </TouchableOpacity>
                  </View>

                  {/* ── Room ── */}
                  <View style={m.section} onLayout={recordFieldY("room")}>
                    <Text style={m.label}>Room / Location (optional)</Text>
                    <TextInput
                      style={m.input}
                      value={room}
                      onChangeText={setRoom}
                      onFocus={() => scrollFieldIntoView("room")}
                      placeholder="e.g. Room 101, Hall A"
                      placeholderTextColor={C.placeholder}
                      maxLength={100}
                      autoCorrect={false}
                    />
                  </View>

                  {/* ── Valid from (create only) ── */}
                  {!isEdit && (
                    <View style={m.section} onLayout={recordFieldY("validFrom")}>
                      <Text style={m.label}>Valid From</Text>
                      <TextInput
                        style={m.input}
                        value={validFrom}
                        onChangeText={setValidFrom}
                        onFocus={() => scrollFieldIntoView("validFrom")}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={C.placeholder}
                        maxLength={10}
                        keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
                        autoCorrect={false}
                      />
                      <Text style={m.hint}>Sessions only generate from this date onwards</Text>
                    </View>
                  )}

                  {/* ── Times ── */}
                  <View style={m.section} onLayout={recordFieldY("time")}>
                    <Text style={m.label}>Class Timing</Text>
                    <View style={m.timeRangeRow}>
                      <Ionicons name="time-outline" size={ms(16)} color={C.muted} />
                      <TouchableOpacity
                        style={m.timeRangeTap}
                        onPress={() => setActiveTimePicker("start")}
                        activeOpacity={0.7}
                      >
                        <Text style={m.timeRangeValue}>{startTime}</Text>
                      </TouchableOpacity>
                      <Text style={m.timeRangeSep}>–</Text>
                      <TouchableOpacity
                        style={m.timeRangeTap}
                        onPress={() => setActiveTimePicker("end")}
                        activeOpacity={0.7}
                      >
                        <Text style={m.timeRangeValue}>{endTime}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {error && (
                    <View style={m.errorBox}>
                      <Ionicons name="alert-circle-outline" size={ms(14)} color={C.red} />
                      <Text style={m.errorT}>{error}</Text>
                    </View>
                  )}

                  <View style={{ height: ms(16) }} />
                </ScrollView>

                {/* Footer */}
                <View style={m.footer}>
                  {isEdit && canDelete && (
                    <TouchableOpacity
                      style={m.deleteBtn}
                      onPress={handleDelete}
                      disabled={deleting || saving}
                    >
                      {deleting
                        ? <ActivityIndicator size="small" color={C.red} />
                        : <>
                            <Ionicons name="trash-outline" size={ms(15)} color={C.red} />
                            <Text style={m.deleteBtnT}>Remove</Text>
                          </>
                      }
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[m.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Text style={m.saveBtnT}>{isEdit ? "Save Changes" : "Add Slot"}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}
        </View>
      </View>
    </BottomSheet>

    {/* Native time-picker wheel — Android's is an imperative one-shot dialog
        (mounting it opens the dialog; it unmounts itself via handleTimeChange
        once "set" or "dismissed" fires). iOS has no built-in modal chrome for
        the spinner, so it's wrapped in a small sheet with Cancel/Done. */}
    {activeTimePicker && Platform.OS === "android" && (
      <DateTimePicker
        value={timeStrToDate(activeTimePicker === "start" ? startTime : endTime)}
        mode="time"
        is24Hour
        display="default"
        onChange={handleTimeChange}
      />
    )}
    {activeTimePicker && Platform.OS === "ios" && (
      <Modal transparent animationType="slide" visible onRequestClose={() => setActiveTimePicker(null)}>
        <View style={m.iosPickerOverlay}>
          <TouchableOpacity style={m.iosPickerBackdrop} activeOpacity={1} onPress={() => setActiveTimePicker(null)} />
          <View style={m.iosPickerSheet}>
            <View style={m.iosPickerHeader}>
              <TouchableOpacity onPress={() => setActiveTimePicker(null)}>
                <Text style={m.iosPickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={m.iosPickerTitle}>{activeTimePicker === "start" ? "Start Time" : "End Time"}</Text>
              <TouchableOpacity onPress={confirmIosTimePicker}>
                <Text style={m.iosPickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={timeStrToDate(activeTimePicker === "start" ? startTime : endTime)}
              mode="time"
              is24Hour
              display="spinner"
              onChange={handleTimeChange}
            />
          </View>
        </View>
      </Modal>
    )}
  </>
  );
}

// ── Modal styles ──────────────────────────────────────────────────────────────

const makeMStyles = (colors: ThemeColors) => StyleSheet.create({
  handle: {
    width: ms(36), height: ms(4), borderRadius: ms(2),
    backgroundColor: C.border, alignSelf: "center",
    marginTop: ms(12), marginBottom: ms(4),
  },
  // Matches ManageCentersModal's header — icon badge + title + description,
  // not a bare title row — so every popup header in the app reads the same way.
  titleRow: {
    flexDirection: "row", alignItems: "flex-start", gap: ms(12),
    paddingHorizontal: ms(20), paddingVertical: ms(14),
  },
  titleIcon: {
    width: ms(44), height: ms(44), borderRadius: ms(12),
    backgroundColor: colors.primary + "17",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  title:    { ...T.cardTitle, color: C.text, marginBottom: 3 },
  titleDesc:{ ...T.bodySmall, color: C.muted },
  closeBtn: {
    width: ms(32), height: ms(32), borderRadius: ms(10),
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: ms(8), padding: ms(16) },
  loadingT:   { ...T.bodySmall, color: C.muted },

  section:  { paddingHorizontal: ms(20), paddingTop: ms(8), paddingBottom: ms(14) },
  // Matches FormField.tsx's own label exactly (chipText + text color,
  // uppercased) — that's the shared field primitive StudentAdmissionScreen
  // uses, and this modal's fields should read the same way.
  label:    { ...T.chipText, color: C.text, marginBottom: ms(7), textTransform: "uppercase", letterSpacing: 0.3 },
  hint:     { ...T.caption, color: C.placeholder, marginTop: ms(4) },

  // Light tinted fill, not a white card — with the hairline border now this
  // thin, a pure-white fill on a white sheet made fields hard to spot.
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(12),
    paddingHorizontal: ms(14), paddingVertical: ms(12),
    ...T.body, color: C.text, backgroundColor: C.inputBg,
  },

  // Single time-range field — one bordered card holding both times, so this
  // lines up with every other field in the form (one field per row) instead
  // of two separate boxes competing for width side by side.
  timeRangeRow: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(12),
    paddingHorizontal: ms(14), paddingVertical: ms(12),
    backgroundColor: C.inputBg,
  },
  timeRangeTap:   { flex: 1, alignItems: "center" },
  timeRangeValue: { ...T.body, color: C.text },
  timeRangeSep:   { ...T.cardTitle, color: C.placeholder },

  // ── iOS time-picker sheet (Android uses the OS's own dialog chrome) ──
  iosPickerOverlay:  { flex: 1, justifyContent: "flex-end" },
  iosPickerBackdrop: { ...StyleSheet.absoluteFill },
  iosPickerSheet:    { backgroundColor: C.card, borderTopLeftRadius: ms(20), borderTopRightRadius: ms(20), paddingBottom: ms(24) },
  iosPickerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: ms(16), paddingVertical: ms(12),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  iosPickerTitle:  { ...T.cardTitle, color: C.text },
  iosPickerCancel: { ...T.buttonText, color: C.muted },
  iosPickerDone:   { ...T.buttonText, color: colors.primary },

  // ── Day chips ──
  dayGrid:      { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  dayChip:      { paddingHorizontal: ms(12), paddingVertical: ms(7), borderRadius: ms(8), borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg },
  dayChipActive:{ backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipT:     { ...T.chipText, color: C.muted },
  dayChipTActive:{ color: "#FFFFFF" },

  // ── Picker cards ── (same field height as m.input, so every field in this
  // modal — text or picker — lines up at a consistent size)
  pickerCard: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: ms(12),
    paddingHorizontal: ms(10), paddingVertical: ms(7),
    backgroundColor: C.inputBg,
  },
  pickerIcon: {
    width: ms(30), height: ms(30), borderRadius: ms(9),
    alignItems: "center", justifyContent: "center",
  },
  pickerAvatar: {
    width: ms(30), height: ms(30), borderRadius: ms(9),
    alignItems: "center", justifyContent: "center",
  },
  pickerAvatarT:   { ...T.chipText, color: "#fff" },
  pickerSelected:  { ...T.listItemTitle, color: C.text },
  pickerMeta:      { ...T.caption, color: C.muted, marginTop: ms(1) },
  pickerPlaceholder: { ...T.body, color: C.placeholder },

  errorBox: {
    flexDirection: "row", gap: ms(8), alignItems: "flex-start",
    marginHorizontal: ms(20), marginTop: ms(12),
    backgroundColor: C.redBg, padding: ms(12), borderRadius: ms(10),
  },
  errorT: { flex: 1, ...T.bodySmall, color: C.red },

  footer: {
    flexDirection: "row", gap: ms(10),
    paddingHorizontal: ms(20), paddingTop: ms(16), paddingBottom: ms(32),
  },
  deleteBtn: {
    flexDirection: "row", gap: ms(4),
    height: ms(46), paddingHorizontal: ms(14), borderRadius: ms(10),
    borderWidth: 1, borderColor: C.red + "60",
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.red + "14",
  },
  deleteBtnT: { ...T.buttonText, color: C.red },
  saveBtn: {
    flex: 1, height: ms(46), borderRadius: ms(10),
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.primary, shadowOffset: { width: 0, height: ms(4) },
    shadowOpacity: 0.35, shadowRadius: ms(8), elevation: 6,
  },
  saveBtnT: { ...T.buttonText, color: "#FFFFFF" },
});

// ── Subject grid styles ───────────────────────────────────────────────────────

const makeSgStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    paddingHorizontal: ms(16), paddingVertical: ms(12),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: {
    width: ms(32), height: ms(32), borderRadius: ms(10),
    backgroundColor: C.border, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { ...T.cardTitle, color: C.text },
  headerSub:   { ...T.caption, color: C.muted, marginTop: ms(1) },
  clearBtn:    { paddingHorizontal: ms(10), paddingVertical: ms(5), borderRadius: ms(8), backgroundColor: colors.primary + "14" },
  clearT:      { ...T.chipText, color: colors.primary },

  searchRow: {
    flexDirection: "row", alignItems: "center", gap: ms(8),
    marginHorizontal: ms(12), marginTop: ms(8), marginBottom: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(9),
    backgroundColor: C.inputBg, borderRadius: ms(10),
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  searchInput: { flex: 1, ...T.body, color: C.text, padding: 0 },

  listContent: { paddingHorizontal: ms(16), paddingBottom: ms(24) },
  empty:       { alignItems: "center", gap: ms(8), paddingVertical: ms(40) },
  emptyT:      { ...T.body, color: C.muted },

  group:       { marginBottom: ms(8) },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: ms(8), paddingTop: ms(14), paddingBottom: ms(10) },
  groupDot:    { width: ms(8), height: ms(8), borderRadius: ms(4), flexShrink: 0 },
  groupLabel:  { ...T.sectionHeading, letterSpacing: 0.8, flex: 1 },
  groupCount:  { ...T.caption, color: C.muted },

  grid:    { flexDirection: "row", flexWrap: "wrap", gap: ms(10) },
  card:    { width: "47%", backgroundColor: C.card, borderRadius: ms(14), borderWidth: 1.5, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ms(10), paddingVertical: ms(8) },
  cardDot: { width: ms(9), height: ms(9), borderRadius: ms(4.5) },
  // Was T.cardTitle (15px) — oversized for a half-width grid tile whose only
  // content is this name; same fix as BatchDetailScreen's info-tile values.
  cardName:{ ...T.chipText, color: C.text, paddingHorizontal: ms(10), paddingVertical: ms(8) },
});

// ── Faculty grid styles ───────────────────────────────────────────────────────

const makeFgStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    paddingHorizontal: ms(16), paddingVertical: ms(12),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: {
    width: ms(32), height: ms(32), borderRadius: ms(10),
    backgroundColor: C.border, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { ...T.cardTitle, color: C.text },
  headerSub:   { ...T.caption, color: C.muted, marginTop: ms(1) },
  clearBtn:    { paddingHorizontal: ms(10), paddingVertical: ms(5), borderRadius: ms(8), backgroundColor: colors.primary + "14" },
  clearT:      { ...T.chipText, color: colors.primary },

  searchRow: {
    flexDirection: "row", alignItems: "center", gap: ms(8),
    marginHorizontal: ms(12), marginTop: ms(8), marginBottom: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(9),
    backgroundColor: C.inputBg, borderRadius: ms(10),
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  searchInput: { flex: 1, ...T.body, color: C.text, padding: 0 },

  listContent: { padding: ms(12), gap: ms(8) },
  empty:       { alignItems: "center", gap: ms(8), paddingVertical: ms(40) },
  emptyT:      { ...T.body, color: C.muted },

  card: {
    flexDirection: "row", alignItems: "center", gap: ms(12),
    paddingHorizontal: ms(14), paddingVertical: ms(13),
    backgroundColor: C.card, borderRadius: ms(14),
    borderWidth: 1.5, borderColor: C.border,
  },
  avatar:   { width: ms(42), height: ms(42), borderRadius: ms(13), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  initials: { ...T.listItemTitle },
  name:     { ...T.listItemTitle, color: C.text },
  subs:     { ...T.caption, color: C.muted, marginTop: ms(2) },
  code:     { ...T.badgeText, color: C.placeholder, marginTop: ms(2) },
});

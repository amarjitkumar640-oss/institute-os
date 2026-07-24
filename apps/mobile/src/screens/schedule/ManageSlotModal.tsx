import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
  Dimensions,
} from "react-native";
import { BottomSheet } from "../../components/ui/BottomSheet";

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
import { useAlert } from "../../context/AlertContext";

interface Props {
  batchId:  string;
  slot?:    ClassSlot;
  visible:  boolean;
  onClose:  () => void;
  onSaved:  () => void;
}

const TODAY = new Date().toISOString().slice(0, 10);

// ── Category + day meta ───────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  ssc:        C.primary,
  banking:    C.blue,
  railway:    C.accent,
  foundation: C.purple,
};
const CAT_LABEL: Record<string, string> = {
  ssc: "SSC", banking: "Banking", railway: "Railway", foundation: "Foundation",
};


// ── Helpers ───────────────────────────────────────────────────────────────────

function timeError(t: string): string | null {
  if (!t.trim()) return "Required";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.trim())) return "Use HH:MM  e.g. 09:00";
  return null;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function facultyAvatarColor(name: string) {
  const palette = [C.primary, C.blue, C.green, C.accent, C.purple, C.orange];
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
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? subjects.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : subjects;

  const groups: Record<string, SubjectItem[]> = {};
  const general: SubjectItem[] = [];
  for (const s of filtered) {
    if (s.examCategory && CAT_COLOR[s.examCategory]) {
      if (!groups[s.examCategory]) groups[s.examCategory] = [];
      groups[s.examCategory].push(s);
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
            {Object.entries(groups).map(([cat, items]) => {
              const color = CAT_COLOR[cat] ?? C.primary;
              const label = CAT_LABEL[cat]  ?? cat;
              return (
                <View key={cat} style={sg.group}>
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
            const color = facultyAvatarColor(f.fullName);
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
  const isEdit = !!slot;
  const { showConfirm, showAlert } = useAlert();

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
    <BottomSheet visible={visible} onClose={onClose} maxHeight="90%">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ height: SCREEN_H * 0.88 }}
      >
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
                  <Text style={m.title}>{isEdit ? "Edit Slot" : "Add Class Slot"}</Text>
                  <TouchableOpacity onPress={onClose} style={m.closeBtn}>
                    <Ionicons name="close" size={ms(18)} color={C.muted} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={{ flex: 1 }}
                >
                  {loadingData && (
                    <View style={m.loadingRow}>
                      <ActivityIndicator size="small" color={C.primary} />
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

                  {/* ── Times ── */}
                  <View style={m.timeRow}>
                    <View style={[m.section, { flex: 1 }]}>
                      <Text style={m.label}>Start Time</Text>
                      <TextInput
                        style={m.input}
                        value={startTime}
                        onChangeText={setStartTime}
                        placeholder="09:00"
                        placeholderTextColor={C.placeholder}
                        keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
                        maxLength={5}
                        autoCorrect={false}
                        autoCapitalize="none"
                      />
                      <Text style={m.hint}>24-hour  HH:MM</Text>
                    </View>
                    <View style={[m.section, { flex: 1 }]}>
                      <Text style={m.label}>End Time</Text>
                      <TextInput
                        style={m.input}
                        value={endTime}
                        onChangeText={setEndTime}
                        placeholder="10:30"
                        placeholderTextColor={C.placeholder}
                        keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
                        maxLength={5}
                        autoCorrect={false}
                        autoCapitalize="none"
                      />
                      <Text style={m.hint}>24-hour  HH:MM</Text>
                    </View>
                  </View>

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
                        <View style={[m.pickerAvatar, { backgroundColor: facultyAvatarColor(facultyName) }]}>
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

                  {/* ── Valid from (create only) ── */}
                  {!isEdit && (
                    <View style={m.section}>
                      <Text style={m.label}>Valid From</Text>
                      <TextInput
                        style={m.input}
                        value={validFrom}
                        onChangeText={setValidFrom}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={C.placeholder}
                        maxLength={10}
                        keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
                        autoCorrect={false}
                      />
                      <Text style={m.hint}>Sessions only generate from this date onwards</Text>
                    </View>
                  )}

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
                  {isEdit && (
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
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

// ── Modal styles ──────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  handle: {
    width: ms(36), height: ms(4), borderRadius: ms(2),
    backgroundColor: C.border, alignSelf: "center",
    marginTop: ms(12), marginBottom: ms(4),
  },
  titleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: ms(20), paddingVertical: ms(14),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title:    { fontSize: fs(16), fontWeight: "800", color: C.text },
  closeBtn: {
    width: ms(32), height: ms(32), borderRadius: ms(10),
    backgroundColor: C.border, alignItems: "center", justifyContent: "center",
  },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: ms(8), padding: ms(16) },
  loadingT:   { fontSize: fs(12), color: C.muted },

  section:  { paddingHorizontal: ms(20), paddingTop: ms(8) },
  label:    { fontSize: fs(11), fontWeight: "700", color: C.muted, marginBottom: ms(8), textTransform: "uppercase", letterSpacing: 0.5 },
  hint:     { fontSize: fs(10), color: C.placeholder, marginTop: ms(4) },
  timeRow:  { flexDirection: "row", gap: ms(12), paddingHorizontal: ms(20), paddingTop: ms(16) },

  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: ms(10),
    paddingHorizontal: ms(12), paddingVertical: ms(11),
    fontSize: fs(14), color: C.text, backgroundColor: C.inputBg,
  },

  // ── Day chips ──
  dayGrid:      { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  dayChip:      { paddingHorizontal: ms(12), paddingVertical: ms(7), borderRadius: ms(8), borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg },
  dayChipActive:{ backgroundColor: C.primary, borderColor: C.primary },
  dayChipT:     { fontSize: fs(12), color: C.muted, fontWeight: "600" },
  dayChipTActive:{ color: "#FFFFFF" },

  // ── Picker cards ──
  pickerCard: {
    flexDirection: "row", alignItems: "center", gap: ms(10),
    borderWidth: 1.5, borderColor: C.border, borderRadius: ms(12),
    paddingHorizontal: ms(12), paddingVertical: ms(11),
    backgroundColor: C.inputBg,
  },
  pickerIcon: {
    width: ms(36), height: ms(36), borderRadius: ms(10),
    alignItems: "center", justifyContent: "center",
  },
  pickerAvatar: {
    width: ms(36), height: ms(36), borderRadius: ms(10),
    alignItems: "center", justifyContent: "center",
  },
  pickerAvatarT:   { fontSize: fs(12), fontWeight: "800", color: "#fff" },
  pickerSelected:  { fontSize: fs(13), fontWeight: "700", color: C.text },
  pickerMeta:      { fontSize: fs(10), color: C.muted, marginTop: ms(1) },
  pickerPlaceholder: { fontSize: fs(13), color: C.placeholder },

  errorBox: {
    flexDirection: "row", gap: ms(8), alignItems: "flex-start",
    marginHorizontal: ms(20), marginTop: ms(12),
    backgroundColor: "#FEF0EE", padding: ms(12), borderRadius: ms(10),
  },
  errorT: { flex: 1, fontSize: fs(12), color: C.red },

  footer: {
    flexDirection: "row", gap: ms(10),
    paddingHorizontal: ms(20), paddingTop: ms(16), paddingBottom: ms(32),
    borderTopWidth: 1, borderTopColor: C.border,
  },
  deleteBtn: {
    flexDirection: "row", gap: ms(4),
    height: ms(46), paddingHorizontal: ms(14), borderRadius: ms(10),
    borderWidth: 1, borderColor: C.red + "60",
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.red + "14",
  },
  deleteBtnT: { fontSize: fs(13), fontWeight: "700", color: C.red },
  saveBtn: {
    flex: 1, height: ms(46), borderRadius: ms(10),
    backgroundColor: C.primary,
    alignItems: "center", justifyContent: "center",
    shadowColor: C.primary, shadowOffset: { width: 0, height: ms(4) },
    shadowOpacity: 0.35, shadowRadius: ms(8), elevation: 6,
  },
  saveBtnT: { fontSize: fs(14), fontWeight: "700", color: "#FFFFFF" },
});

// ── Subject grid styles ───────────────────────────────────────────────────────

const sg = StyleSheet.create({
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
  headerTitle: { fontSize: fs(15), fontWeight: "800", color: C.text },
  headerSub:   { fontSize: fs(11), color: C.muted, marginTop: ms(1) },
  clearBtn:    { paddingHorizontal: ms(10), paddingVertical: ms(5), borderRadius: ms(8), backgroundColor: C.primary + "14" },
  clearT:      { fontSize: fs(12), color: C.primary, fontWeight: "700" },

  searchRow: {
    flexDirection: "row", alignItems: "center", gap: ms(8),
    marginHorizontal: ms(12), marginTop: ms(8), marginBottom: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(9),
    backgroundColor: C.inputBg, borderRadius: ms(10),
    borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: fs(13), color: C.text, padding: 0 },

  listContent: { paddingHorizontal: ms(16), paddingBottom: ms(24) },
  empty:       { alignItems: "center", gap: ms(8), paddingVertical: ms(40) },
  emptyT:      { fontSize: fs(13), fontWeight: "600", color: C.muted },

  group:       { marginBottom: ms(8) },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: ms(8), paddingTop: ms(14), paddingBottom: ms(10) },
  groupDot:    { width: ms(8), height: ms(8), borderRadius: ms(4), flexShrink: 0 },
  groupLabel:  { fontSize: fs(11), fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", flex: 1 },
  groupCount:  { fontSize: fs(10.5), color: C.muted },

  grid:    { flexDirection: "row", flexWrap: "wrap", gap: ms(10) },
  card:    { width: "47%", backgroundColor: "#FFFFFF", borderRadius: ms(14), borderWidth: 1.5, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: ms(10), paddingVertical: ms(8) },
  cardDot: { width: ms(9), height: ms(9), borderRadius: ms(4.5) },
  cardName:{ fontSize: fs(12.5), fontWeight: "700", color: C.text, paddingHorizontal: ms(10), paddingVertical: ms(8), lineHeight: fs(18) },
});

// ── Faculty grid styles ───────────────────────────────────────────────────────

const fg = StyleSheet.create({
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
  headerTitle: { fontSize: fs(15), fontWeight: "800", color: C.text },
  headerSub:   { fontSize: fs(11), color: C.muted, marginTop: ms(1) },
  clearBtn:    { paddingHorizontal: ms(10), paddingVertical: ms(5), borderRadius: ms(8), backgroundColor: C.primary + "14" },
  clearT:      { fontSize: fs(12), color: C.primary, fontWeight: "700" },

  searchRow: {
    flexDirection: "row", alignItems: "center", gap: ms(8),
    marginHorizontal: ms(12), marginTop: ms(8), marginBottom: ms(12), paddingHorizontal: ms(12), paddingVertical: ms(9),
    backgroundColor: C.inputBg, borderRadius: ms(10),
    borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: fs(13), color: C.text, padding: 0 },

  listContent: { padding: ms(12), gap: ms(8) },
  empty:       { alignItems: "center", gap: ms(8), paddingVertical: ms(40) },
  emptyT:      { fontSize: fs(13), fontWeight: "600", color: C.muted },

  card: {
    flexDirection: "row", alignItems: "center", gap: ms(12),
    paddingHorizontal: ms(14), paddingVertical: ms(13),
    backgroundColor: "#FFFFFF", borderRadius: ms(14),
    borderWidth: 1.5, borderColor: C.border,
  },
  avatar:   { width: ms(42), height: ms(42), borderRadius: ms(13), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  initials: { fontSize: fs(14), fontWeight: "800" },
  name:     { fontSize: fs(13.5), fontWeight: "700", color: C.text },
  subs:     { fontSize: fs(11), color: C.muted, marginTop: ms(2) },
  code:     { fontSize: fs(10), color: C.placeholder, marginTop: ms(2), fontWeight: "600" },
});

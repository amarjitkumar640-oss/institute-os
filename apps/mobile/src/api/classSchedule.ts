import { apiClient } from "./client";

// ── Enums / literals ──────────────────────────────────────────────────────────

export type DayOfWeek     = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type SessionStatus = "scheduled" | "completed" | "cancelled";
export type SessionType   = "regular" | "extra" | "makeup";

// ── Response types ────────────────────────────────────────────────────────────

export interface SlotSubject { id: string; name: string; }
export interface SlotFaculty { id: string; fullName: string; employeeCode: string; }
export interface SlotBatch   { id: string; name: string; }

export interface ClassSlot {
  id:        string;
  batchId:   string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime:   string;
  subjectId: string | null;
  facultyId: string | null;
  room:      string | null;
  validFrom: string;
  validTo:   string | null;
  isActive:  boolean;
  createdAt: string;
  updatedAt: string;
  subject:   SlotSubject | null;
  faculty:   SlotFaculty | null;
  batch:     SlotBatch;
}

export interface ClassSession {
  id:            string;
  batchId:       string;
  slotId:        string | null;
  scheduledDate: string;
  startTime:     string;
  endTime:       string;
  subjectId:     string | null;
  facultyId:     string | null;
  room:          string | null;
  status:        SessionStatus;
  type:          SessionType;
  cancelReason:  string | null;
  notes:         string | null;
  createdAt:     string;
  updatedAt:     string;
  slot:          { id: string; dayOfWeek: DayOfWeek; subject: SlotSubject | null; faculty: SlotFaculty | null } | null;
  subject:       SlotSubject | null;
  faculty:       SlotFaculty | null;
  batch:         SlotBatch;
}

// ── Request payload types ─────────────────────────────────────────────────────

export interface CreateSlotPayload {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime:   string;
  subjectId?: string;
  facultyId?: string;
  room?:      string;
  validFrom:  string;
  validTo?:   string;
}

export interface UpdateSlotPayload {
  startTime?: string;
  endTime?:   string;
  subjectId?: string | null;
  facultyId?: string | null;
  room?:      string | null;
  validTo?:   string | null;
  isActive?:  boolean;
}

export interface CreateAdHocSessionPayload {
  scheduledDate: string;
  startTime:     string;
  endTime:       string;
  type:          SessionType;
  subjectId?:    string;
  facultyId?:    string;
  room?:         string;
  notes?:        string;
}

export interface PatchSessionPayload {
  status?:        SessionStatus;
  scheduledDate?: string;
  startTime?:     string;
  endTime?:       string;
  facultyId?:     string | null;
  subjectId?:     string | null;
  room?:          string | null;
  cancelReason?:  string;
  notes?:         string;
}

export type AttendanceStatus = "present" | "absent";

export interface SessionAttendanceRow {
  studentId: string;
  fullName:  string;
  status:    AttendanceStatus | null;
}

// ── API functions ─────────────────────────────────────────────────────────────

// Slots

export async function listSlots(batchId: string): Promise<ClassSlot[]> {
  const { data } = await apiClient.get<ClassSlot[]>(`/schedule/batches/${batchId}/slots`);
  return data;
}

export async function createSlot(batchId: string, payload: CreateSlotPayload): Promise<ClassSlot> {
  const { data } = await apiClient.post<ClassSlot>(`/schedule/batches/${batchId}/slots`, payload);
  return data;
}

export async function updateSlot(slotId: string, payload: UpdateSlotPayload): Promise<ClassSlot> {
  const { data } = await apiClient.patch<ClassSlot>(`/schedule/class-slots/${slotId}`, payload);
  return data;
}

export async function deleteSlot(slotId: string): Promise<void> {
  await apiClient.delete(`/schedule/class-slots/${slotId}`);
}

// Sessions

export async function listSessions(
  batchId: string,
  params: { from: string; to: string; status?: SessionStatus },
): Promise<ClassSession[]> {
  const { data } = await apiClient.get<ClassSession[]>(
    `/schedule/batches/${batchId}/sessions`,
    { params },
  );
  return data;
}

export async function generateSessions(
  batchId: string,
  payload: { from: string; to: string },
): Promise<{ created: number }> {
  const { data } = await apiClient.post<{ created: number }>(
    `/schedule/batches/${batchId}/sessions/generate`,
    payload,
  );
  return data;
}

export async function createAdHocSession(
  batchId: string,
  payload: CreateAdHocSessionPayload,
): Promise<ClassSession> {
  const { data } = await apiClient.post<ClassSession>(
    `/schedule/batches/${batchId}/sessions`,
    payload,
  );
  return data;
}

export async function patchSession(
  sessionId: string,
  payload: PatchSessionPayload,
): Promise<ClassSession> {
  const { data } = await apiClient.patch<ClassSession>(
    `/schedule/class-sessions/${sessionId}`,
    payload,
  );
  return data;
}

export async function listFacultySessions(
  facultyId: string,
  params: { from: string; to: string },
): Promise<ClassSession[]> {
  const { data } = await apiClient.get<ClassSession[]>(
    `/schedule/faculty/${facultyId}/sessions`,
    { params },
  );
  return data;
}

export async function listTodaySessions(): Promise<ClassSession[]> {
  const { data } = await apiClient.get<ClassSession[]>("/schedule/sessions/today");
  return data;
}

// Attendance

export async function getSessionAttendance(sessionId: string): Promise<SessionAttendanceRow[]> {
  const { data } = await apiClient.get<SessionAttendanceRow[]>(
    `/schedule/class-sessions/${sessionId}/attendance`,
  );
  return data;
}

export async function setSessionAttendance(
  sessionId: string,
  marks: { studentId: string; status: AttendanceStatus }[],
): Promise<SessionAttendanceRow[]> {
  const { data } = await apiClient.put<SessionAttendanceRow[]>(
    `/schedule/class-sessions/${sessionId}/attendance`,
    { marks },
  );
  return data;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday:    "Mon",
  tuesday:   "Tue",
  wednesday: "Wed",
  thursday:  "Thu",
  friday:    "Fri",
  saturday:  "Sat",
  sunday:    "Sun",
};

export const DAY_ORDER: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

export function fmtTimeRange(start: string, end: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour   = h % 12 || 12;
    return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

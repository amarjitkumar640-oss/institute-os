import { apiClient } from "./client";

export interface ClassSlot {
  id: string;
  batchId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room: string | null;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  subject?: { id: string; name: string } | null;
  faculty?: { id: string; fullName: string } | null;
}

export interface ClassSession {
  id: string;
  batchId: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "completed" | "cancelled";
  type: "regular" | "extra" | "makeup";
  room: string | null;
  cancelReason: string | null;
  notes: string | null;
  subject?: { id: string; name: string } | null;
  faculty?: { id: string; fullName: string } | null;
}

export interface CreateSlotPayload {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subjectId?: string;
  facultyId?: string;
  room?: string;
  validFrom: string;
  validTo?: string;
}

export interface CreateAdHocSessionPayload {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  type?: "regular" | "extra" | "makeup";
  subjectId?: string;
  facultyId?: string;
  room?: string;
  notes?: string;
}

export interface PatchSessionPayload {
  status?: "scheduled" | "completed" | "cancelled";
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  facultyId?: string | null;
  subjectId?: string | null;
  room?: string | null;
  cancelReason?: string;
  notes?: string;
}

export async function listBatchSlots(batchId: string): Promise<ClassSlot[]> {
  const { data } = await apiClient.get<ClassSlot[]>(`/api/schedule/batches/${batchId}/slots`);
  return data;
}

export async function createSlot(batchId: string, payload: CreateSlotPayload): Promise<ClassSlot> {
  const { data } = await apiClient.post<ClassSlot>(`/api/schedule/batches/${batchId}/slots`, payload);
  return data;
}

export async function updateSlot(slotId: string, payload: Partial<CreateSlotPayload & { isActive?: boolean }>): Promise<ClassSlot> {
  const { data } = await apiClient.patch<ClassSlot>(`/api/schedule/class-slots/${slotId}`, payload);
  return data;
}

export async function deleteSlot(slotId: string): Promise<void> {
  await apiClient.delete(`/api/schedule/class-slots/${slotId}`);
}

export async function listBatchSessions(batchId: string, params: { from: string; to: string; status?: string }): Promise<ClassSession[]> {
  const { data } = await apiClient.get<ClassSession[]>(`/api/schedule/batches/${batchId}/sessions`, { params });
  return data;
}

export async function generateSessions(batchId: string, payload: { from: string; to: string }): Promise<unknown> {
  const { data } = await apiClient.post(`/api/schedule/batches/${batchId}/sessions/generate`, payload);
  return data;
}

export async function createAdHocSession(batchId: string, payload: CreateAdHocSessionPayload): Promise<ClassSession> {
  const { data } = await apiClient.post<ClassSession>(`/api/schedule/batches/${batchId}/sessions`, payload);
  return data;
}

export async function patchSession(sessionId: string, payload: PatchSessionPayload): Promise<ClassSession> {
  const { data } = await apiClient.patch<ClassSession>(`/api/schedule/class-sessions/${sessionId}`, payload);
  return data;
}

export async function listTodaySessions(): Promise<ClassSession[]> {
  const { data } = await apiClient.get<ClassSession[]>("/api/schedule/sessions/today");
  return data;
}

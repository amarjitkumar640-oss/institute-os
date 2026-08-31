import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Edit, Calendar, Users, Plus, Trash2, RefreshCw, Pencil, Repeat, MoreVertical,
  CheckCircle2, XCircle, Merge, IndianRupee, Clock, Building2, Tag, Landmark,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateBatchSchema } from "@institute-os/shared";
import { type z } from "zod";
import { getBatch, updateBatch, listBatches, mergeBatch, type MergeBatchResult } from "@/api/batches";
import { OffersTab } from "./OffersTab";
import { SponsorshipTab } from "./SponsorshipTab";
import { listStudents } from "@/api/students";
import { listFaculty } from "@/api/faculty";
import { listSubjects } from "@/api/subjects";
import {
  listBatchSlots, createSlot, updateSlot, deleteSlot,
  listBatchSessions, createAdHocSession, patchSession, generateSessions,
  type ClassSlot, type ClassSession,
} from "@/api/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/FormField";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/components/ui/use-toast";
import { formatDate, formatCurrency } from "@/lib/utils";
import { type ColumnDef } from "@tanstack/react-table";
import type { Student } from "@/api/students";
import { SessionReassignDialog } from "@/modules/schedule/SessionReassignDialog";
import { useAuth } from "@/context/AuthContext";

type UpdateBatchForm = z.infer<typeof updateBatchSchema>;

const STATUS_COLORS: Record<string, "default" | "success" | "info" | "warning"> = {
  upcoming: "info",
  running: "success",
  completed: "default",
  merged: "warning",
};

const DAY_OPTIONS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

// ── Edit Batch ─────────────────────────────────────────────────────────────────

function EditBatchDialog({ batchId, open, onClose }: { batchId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: batch } = useQuery({ queryKey: ["batch", batchId], queryFn: () => getBatch(batchId) });

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<UpdateBatchForm>({
    resolver: zodResolver(updateBatchSchema),
    values: batch ? {
      name: batch.name,
      capacity: batch.capacity,
      startDate: new Date(batch.startDate),
      endDate: new Date(batch.endDate),
      status: batch.status,
    } : undefined,
  });

  const mutation = useMutation({
    mutationFn: (d: UpdateBatchForm) => updateBatch(batchId, {
      name: d.name,
      capacity: d.capacity,
      status: d.status,
      startDate: d.startDate ? new Date(d.startDate).toISOString() : undefined,
      endDate: d.endDate ? new Date(d.endDate).toISOString() : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batch", batchId] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      toast({ title: "Batch updated" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Batch</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <FormField label="Batch Name" error={errors.name}>
            <Input {...register("name")} />
          </FormField>
          <FormField label="Capacity" error={errors.capacity}>
            <Input {...register("capacity", { valueAsNumber: true })} type="number" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" error={errors.startDate}>
              <Input {...register("startDate")} type="date" />
            </FormField>
            <FormField label="End Date" error={errors.endDate}>
              <Input {...register("endDate")} type="date" />
            </FormField>
          </div>
          <FormField label="Status">
            <Select onValueChange={(v) => setValue("status", v as "upcoming" | "running" | "completed")}>
              <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Merge Batch ──────────────────────────────────────────────────────────────
// Moves every active student out of this batch and into another — see
// batch-merge.service.ts on the API side for exactly what does and doesn't
// move (no course-match requirement, fee/courseId untouched, this batch's
// class slots deactivated once emptied and its status set to "merged").

function MergeBatchDialog({
  batch, open, onClose,
}: {
  batch: { id: string; name: string; enrolledCount: number; centerId: string };
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [toBatchId, setToBatchId] = useState<string | null>(null);
  const [result, setResult] = useState<MergeBatchResult | null>(null);

  const { data: batches, isLoading: loadingBatches } = useQuery({
    queryKey: ["batches"],
    queryFn: listBatches,
    enabled: open,
  });

  // Same-center only, matching the existing per-student "Move to Batch"
  // picker in the mobile app — a student physically attends one center.
  const targets = (batches ?? []).filter((b) => b.id !== batch.id && b.centerId === batch.centerId && b.status !== "merged");
  const target = targets.find((b) => b.id === toBatchId) ?? null;

  const mutation = useMutation({
    mutationFn: () => mergeBatch(batch.id, toBatchId!),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["batch", batch.id] });
      qc.invalidateQueries({ queryKey: ["batch", toBatchId] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (err: any) =>
      toast({ variant: "destructive", title: "Merge failed", description: err?.response?.data?.error }),
  });

  function handleClose() {
    setToBatchId(null);
    setResult(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Merge {batch.name} Into Another Batch</DialogTitle></DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">
              {result.mergedCount} student(s) moved into {target?.name ?? "the target batch"}.
              {result.sourceBatchStatus === "merged" && ` ${batch.name} is now empty and marked as merged.`}
            </p>
            {result.skipped.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-1.5">
                  {result.skipped.length} student(s) need manual handling:
                </p>
                <div className="space-y-1">
                  {result.skipped.map((s) => (
                    <p key={s.studentId} className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                      <strong>{s.fullName}</strong> — {s.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => { handleClose(); navigate(`/batches/${batch.id}`); }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Moves all {batch.enrolledCount} active student(s) — and their full fee/payment history — into another
              batch. No course-match required; each student's own course record and fee amount are left untouched.
              This batch will be marked <span className="font-medium">merged</span> once empty and can't be reused for new enrollments.
            </p>
            <FormField label="Target Batch" required>
              {loadingBatches ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={toBatchId ?? "__none__"} onValueChange={setToBatchId}>
                  <SelectTrigger><SelectValue placeholder="Select a batch in the same center" /></SelectTrigger>
                  <SelectContent>
                    {targets.length === 0 && <SelectItem value="__none__" disabled>No other batches in this center</SelectItem>}
                    {targets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} — {b.course.name} ({b.enrolledCount}/{b.capacity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            {target && target.capacity - target.enrolledCount < batch.enrolledCount && (
              <p className="text-xs text-amber-600">
                {target.name} only has room for {Math.max(0, target.capacity - target.enrolledCount)} more student(s) right
                now — the rest will be reported as skipped rather than blocking the merge. Increase its capacity first if
                you want everyone to fit.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => mutation.mutate()} disabled={!toBatchId || mutation.isPending}>
                {mutation.isPending ? "Merging…" : "Merge"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Slot form (create / edit) ──────────────────────────────────────────────────

interface SlotFormData {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subjectId: string;
  facultyId: string;
  room: string;
  validFrom: string;
}

function SlotFormDialog({
  batchId, slot, open, onClose,
}: {
  batchId: string;
  slot?: ClassSlot;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!slot;
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<SlotFormData>(() => ({
    dayOfWeek: slot?.dayOfWeek ?? "monday",
    startTime: slot?.startTime ?? "09:00",
    endTime:   slot?.endTime   ?? "10:30",
    subjectId: slot?.subject?.id ?? "",
    facultyId: slot?.faculty?.id ?? "",
    room:      slot?.room ?? "",
    validFrom: slot?.validFrom?.slice(0, 10) ?? today,
  }));
  const [saving, setSaving] = useState(false);

  const { data: facultyRes } = useQuery({ queryKey: ["faculty-list"], queryFn: () => listFaculty({ isActive: true, limit: 100 }) });
  const { data: subjects }   = useQuery({ queryKey: ["subjects-list"], queryFn: () => listSubjects() });
  const facultyList = facultyRes?.data ?? [];

  const set = (k: keyof SlotFormData) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.startTime || !form.endTime) return;
    setSaving(true);
    try {
      const payload = {
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime:   form.endTime,
        subjectId: form.subjectId || undefined,
        facultyId: form.facultyId || undefined,
        room:      form.room.trim() || undefined,
        validFrom: form.validFrom || today,
      };
      if (isEdit) {
        await updateSlot(slot!.id, { startTime: payload.startTime, endTime: payload.endTime, subjectId: payload.subjectId, facultyId: payload.facultyId, room: payload.room });
      } else {
        await createSlot(batchId, payload);
      }
      qc.invalidateQueries({ queryKey: ["slots", batchId] });
      toast({ title: isEdit ? "Slot updated" : "Slot created" });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Failed to save slot" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Slot" : "Add Class Slot"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Day of week — only for new slots */}
          {!isEdit && (
            <FormField label="Day of Week">
              <Select value={form.dayOfWeek} onValueChange={set("dayOfWeek")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Time" required>
              <Input type="time" value={form.startTime} onChange={(e) => set("startTime")(e.target.value)} />
            </FormField>
            <FormField label="End Time" required>
              <Input type="time" value={form.endTime} onChange={(e) => set("endTime")(e.target.value)} />
            </FormField>
          </div>

          <FormField label="Subject (optional)">
            <Select value={form.subjectId} onValueChange={set("subjectId")}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Faculty (optional)">
            <Select value={form.facultyId} onValueChange={set("facultyId")}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {facultyList.map((f) => <SelectItem key={f.id} value={f.id}>{f.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Room / Location (optional)">
            <Input placeholder="e.g. Room 101" value={form.room} onChange={(e) => set("room")(e.target.value)} />
          </FormField>

          {/* Valid from — only for new slots */}
          {!isEdit && (
            <FormField label="Valid From">
              <Input type="date" value={form.validFrom} onChange={(e) => set("validFrom")(e.target.value)} />
            </FormField>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Slot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Ad-hoc session form ────────────────────────────────────────────────────────

function AdHocSessionForm({ batchId, onSuccess }: { batchId: string; onSuccess: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date,      setDate]      = useState(today);
  const [startTime, setStartTime] = useState("");
  const [endTime,   setEndTime]   = useState("");
  const [type,      setType]      = useState<"regular" | "extra" | "makeup">("extra");
  const [subjectId, setSubjectId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [room,      setRoom]      = useState("");
  const [notes,     setNotes]     = useState("");
  const [loading,   setLoading]   = useState(false);

  const { data: facultyRes } = useQuery({ queryKey: ["faculty-list"], queryFn: () => listFaculty({ isActive: true, limit: 100 }) });
  const { data: subjects }   = useQuery({ queryKey: ["subjects-list"], queryFn: () => listSubjects() });
  const facultyList = facultyRes?.data ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !startTime || !endTime) return;
    setLoading(true);
    try {
      await createAdHocSession(batchId, {
        scheduledDate: date,
        startTime,
        endTime,
        type,
        subjectId: subjectId || undefined,
        facultyId: facultyId || undefined,
        room:      room.trim() || undefined,
        notes:     notes.trim() || undefined,
      });
      toast({ title: "Session added" });
      onSuccess();
    } catch {
      toast({ variant: "destructive", title: "Failed to add session" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <FormField label="Date" required>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Start Time" required>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </FormField>
        <FormField label="End Time" required>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </FormField>
      </div>

      <FormField label="Session Type">
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="regular">Regular</SelectItem>
            <SelectItem value="extra">Extra</SelectItem>
            <SelectItem value="makeup">Makeup</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="Subject (optional)">
        <Select value={subjectId} onValueChange={setSubjectId}>
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">None</SelectItem>
            {(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="Faculty (optional)">
        <Select value={facultyId} onValueChange={setFacultyId}>
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">None</SelectItem>
            {facultyList.map((f) => <SelectItem key={f.id} value={f.id}>{f.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="Room / Location (optional)">
        <Input placeholder="e.g. Room 101" value={room} onChange={(e) => setRoom(e.target.value)} />
      </FormField>

      <FormField label="Notes (optional)">
        <Input placeholder="Any notes for this session" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>

      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add Session"}</Button>
      </DialogFooter>
    </form>
  );
}

// ── Schedule tab ───────────────────────────────────────────────────────────────

// Mirrors the API's own sessionHasEnded() check in schedule.service.ts — a
// session can't be marked completed until it's actually ended (same-day
// session before its end time, or any future day). Cancelling a not-yet-
// ended session is still allowed; only "completed" is time-restricted. This
// is a UX nicety to hide the option up front — the API is the real
// enforcement, and compares against the server's clock, not the browser's.
function sessionHasEnded(scheduledDate: string, endTime: string): boolean {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const scheduledDateStr = scheduledDate.slice(0, 10);
  if (scheduledDateStr < todayStr) return true;
  if (scheduledDateStr > todayStr) return false;
  const nowHHMM = now.toTimeString().slice(0, 5);
  return nowHHMM >= endTime;
}

function ScheduleTab({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const { staff } = useAuth();
  // Cancelling and reassigning are a step above the ordinary edit available
  // here for a teacher (marking their own ended session complete) — only
  // admin/frontdesk may cancel a class or reassign its subject/faculty.
  // Matches the API's own checks.
  const canCancel   = staff?.activeRole === "admin" || staff?.activeRole === "frontdesk";
  const canReassign = canCancel;
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysLater = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [from,           setFrom]           = useState(today);
  const [to,             setTo]             = useState(thirtyDaysLater);
  const [genFrom,        setGenFrom]        = useState(today);
  const [genTo,          setGenTo]          = useState(thirtyDaysLater);
  const [slotDialog,     setSlotDialog]     = useState<{ open: boolean; slot?: ClassSlot }>({ open: false });
  const [showAddSession, setShowAddSession] = useState(false);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<ClassSession | null>(null);

  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ["slots", batchId],
    queryFn: () => listBatchSlots(batchId),
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["sessions", batchId, from, to],
    queryFn: () => listBatchSessions(batchId, { from, to }),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateSessions(batchId, { from: genFrom, to: genTo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions", batchId] });
      toast({ title: "Sessions generated" });
    },
    onError: () => toast({ variant: "destructive", title: "Generation failed" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status: "completed" | "cancelled" } }) =>
      patchSession(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions", batchId] });
      toast({ title: "Session updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  async function handleDeleteSlot(slotId: string) {
    if (!confirm("Remove this recurring slot?")) return;
    setDeletingSlotId(slotId);
    try {
      await deleteSlot(slotId);
      qc.invalidateQueries({ queryKey: ["slots", batchId] });
      toast({ title: "Slot removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove slot" });
    } finally {
      setDeletingSlotId(null);
    }
  }

  const sessionColumns: ColumnDef<ClassSession>[] = [
    {
      accessorKey: "scheduledDate",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.scheduledDate),
    },
    {
      id: "time",
      header: "Time",
      cell: ({ row }) => `${row.original.startTime} – ${row.original.endTime}`,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <Badge variant="default">{row.original.type}</Badge>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "completed" ? "success" : row.original.status === "cancelled" ? "danger" : "info"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "subject",
      header: "Subject",
      cell: ({ row }) => row.original.subject?.name ?? "—",
    },
    {
      id: "faculty",
      header: "Faculty",
      cell: ({ row }) => row.original.faculty?.fullName ?? "—",
    },
    {
      id: "room",
      header: "Room",
      cell: ({ row }) => row.original.room ?? "—",
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        if (row.original.status !== "scheduled") return null;
        const canComplete = sessionHasEnded(row.original.scheduledDate, row.original.endTime);
        // A teacher whose session hasn't ended yet can't reassign, complete,
        // or cancel — nothing here they can do, so no menu at all rather
        // than a "..." button that opens empty.
        if (!canReassign && !canComplete && !canCancel) return null;
        return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canReassign && (
              <DropdownMenuItem onClick={() => setReassignTarget(row.original)}>
                <Repeat className="mr-2 h-3.5 w-3.5" /> Reassign
              </DropdownMenuItem>
            )}
            {canComplete && (
              <DropdownMenuItem onClick={() => patchMutation.mutate({ id: row.original.id, payload: { status: "completed" } })}>
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Mark Complete
              </DropdownMenuItem>
            )}
            {canCancel && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                  onClick={() => patchMutation.mutate({ id: row.original.id, payload: { status: "cancelled" } })}
                >
                  <XCircle className="mr-2 h-3.5 w-3.5" /> Cancel Session
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Weekly Template (Slots) ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Weekly Template</h3>
            <p className="text-xs text-gray-400 mt-0.5">Recurring slots — sessions are generated from these</p>
          </div>
          <Button size="sm" onClick={() => setSlotDialog({ open: true })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Slot
          </Button>
        </div>

        {slotsLoading ? (
          <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (slots ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
            No slots yet — add a recurring slot to start scheduling classes
          </div>
        ) : (
          <div className="rounded-lg border border-gray-100 divide-y divide-gray-100 overflow-hidden">
            {(slots ?? []).map((slot) => (
              <div key={slot.id} className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                <span className="w-10 text-xs font-bold text-gray-500 uppercase">{DAY_LABELS[slot.dayOfWeek]}</span>
                <span className="text-sm font-medium text-gray-800 w-32">{slot.startTime} – {slot.endTime}</span>
                <span className="text-sm text-gray-500 flex-1">
                  {slot.subject?.name && <span className="mr-3">{slot.subject.name}</span>}
                  {slot.faculty?.fullName && <span className="text-gray-400">{slot.faculty.fullName}</span>}
                  {slot.room && <span className="ml-3 text-gray-400">· {slot.room}</span>}
                  {!slot.subject?.name && !slot.faculty?.fullName && !slot.room && <span className="text-gray-300">No subject or faculty</span>}
                </span>
                {!slot.isActive && <Badge variant="default">Inactive</Badge>}
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setSlotDialog({ open: true, slot })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                    disabled={deletingSlotId === slot.id}
                    onClick={() => handleDeleteSlot(slot.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Generate sessions */}
        {(slots ?? []).length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 mr-1">Generate sessions:</span>
            <Input type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} className="w-36 h-8 text-xs" />
            <span className="text-gray-400 text-xs">–</span>
            <Input type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)} className="w-36 h-8 text-xs" />
            <Button size="sm" variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${generateMutation.isPending ? "animate-spin" : ""}`} />
              Generate
            </Button>
          </div>
        )}
      </div>

      {/* ── Sessions ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Sessions</h3>
            <p className="text-xs text-gray-400 mt-0.5">Individual class instances</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 h-8 text-xs" />
            <span className="text-gray-400 text-xs">–</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 h-8 text-xs" />
            <Button size="sm" variant="outline" onClick={() => setShowAddSession(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Session
            </Button>
          </div>
        </div>

        {sessionsLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (sessions ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
            No sessions in this range — generate from slots above or add an ad-hoc session
          </div>
        ) : (
          <DataTable columns={sessionColumns} data={sessions ?? []} />
        )}
      </div>

      {/* Slot dialog */}
      {slotDialog.open && (
        <SlotFormDialog
          batchId={batchId}
          slot={slotDialog.slot}
          open={slotDialog.open}
          onClose={() => setSlotDialog({ open: false })}
        />
      )}

      {/* Ad-hoc session dialog */}
      <Dialog open={showAddSession} onOpenChange={setShowAddSession}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Ad-Hoc Session</DialogTitle></DialogHeader>
          <AdHocSessionForm batchId={batchId} onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["sessions", batchId] });
            setShowAddSession(false);
          }} />
        </DialogContent>
      </Dialog>

      {reassignTarget && (
        <SessionReassignDialog session={reassignTarget} onClose={() => setReassignTarget(null)} />
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showEdit, setShowEdit] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  const { data: batch, isLoading } = useQuery({
    queryKey: ["batch", id],
    queryFn: () => getBatch(id!),
    enabled: !!id,
  });

  const { data: students } = useQuery({
    queryKey: ["students", "batch", id],
    queryFn: () => listStudents({ batchId: id }),
    enabled: !!id,
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );

  if (!batch) return <div className="p-6 text-gray-500">Batch not found</div>;

  const examColor = batch.course.examCategories[0]?.color ?? "#7C3AED";
  const examLabel = batch.course.examCategories.length
    ? batch.course.examCategories.map((c) => c.label).join(", ")
    : "General";
  const fillPct = batch.capacity > 0 ? Math.min(100, Math.round((batch.enrolledCount / batch.capacity) * 100)) : 0;

  const studentColumns: ColumnDef<Student>[] = [
    {
      accessorKey: "studentCode",
      header: "ID",
      cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.studentCode}</span>,
    },
    {
      accessorKey: "fullName",
      header: "Name",
      cell: ({ row }) => (
        <button className="font-medium text-gray-900 hover:text-[var(--color-primary,#C0392B)]" onClick={() => navigate(`/students/${row.original.id}`)}>
          {row.original.fullName}
        </button>
      ),
    },
    { accessorKey: "phone", header: "Phone" },
    {
      accessorKey: "coursePreference",
      header: "Preference",
      cell: ({ row }) => row.original.coursePreference ? <Badge variant="info">{row.original.coursePreference.toUpperCase()}</Badge> : "—",
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center gap-4 border-b border-gray-100 bg-white px-6 py-5">
        <Button variant="ghost" size="icon" onClick={() => navigate("/batches")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{batch.name}</h1>
            <Badge variant={STATUS_COLORS[batch.status]} className="capitalize">{batch.status}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: examColor + "18", color: examColor }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: examColor }} />
              {examLabel}
            </span>
            <p className="text-sm text-gray-500">
              {batch.course.name} &middot; {formatDate(batch.startDate)} – {formatDate(batch.endDate)}
            </p>
          </div>
        </div>
        {batch.status !== "merged" && batch.enrolledCount > 0 && (
          <Button variant="outline" onClick={() => setShowMerge(true)}>
            <Merge className="mr-2 h-4 w-4" /> Merge Into…
          </Button>
        )}
        <Button variant="outline" onClick={() => setShowEdit(true)}>
          <Edit className="mr-2 h-4 w-4" /> Edit
        </Button>
      </div>

      <div className="flex-1 p-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-blue-50">
                  <Users className="h-[18px] w-[18px] text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Enrolled</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{batch.enrolledCount} / {batch.capacity}</p>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 mt-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${fillPct}%`, background: "var(--color-primary, #7C3AED)" }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50">
                  <IndianRupee className="h-[18px] w-[18px] text-emerald-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Course Fee</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{formatCurrency(batch.course.defaultFee)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-50">
                  <Clock className="h-[18px] w-[18px] text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Duration</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{batch.course.durationMonths} months</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-violet-50">
                  <Building2 className="h-[18px] w-[18px] text-violet-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Center</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5 truncate">{batch.center?.name ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="students">
          <TabsList>
            <TabsTrigger value="students">
              <Users className="mr-2 h-4 w-4" />
              Students ({batch.enrolledCount})
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <Calendar className="mr-2 h-4 w-4" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="offers">
              <Tag className="mr-2 h-4 w-4" />
              Offers
            </TabsTrigger>
            <TabsTrigger value="sponsorship">
              <Landmark className="mr-2 h-4 w-4" />
              Sponsorship
            </TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="mt-4">
            {(students ?? []).length === 0 ? (
              <EmptyState
                icon={Users}
                title="No students enrolled yet"
                description="Students admitted into this batch will show up here."
              />
            ) : (
              <DataTable columns={studentColumns} data={students ?? []} />
            )}
          </TabsContent>

          <TabsContent value="schedule" className="mt-4">
            <ScheduleTab batchId={id!} />
          </TabsContent>

          <TabsContent value="offers" className="mt-4">
            <OffersTab batchId={id!} />
          </TabsContent>

          <TabsContent value="sponsorship" className="mt-4">
            <SponsorshipTab batchId={id!} />
          </TabsContent>
        </Tabs>
      </div>

      {showEdit && id && (
        <EditBatchDialog batchId={id} open={showEdit} onClose={() => setShowEdit(false)} />
      )}
      {showMerge && (
        <MergeBatchDialog
          batch={{ id: batch.id, name: batch.name, enrolledCount: batch.enrolledCount, centerId: batch.centerId }}
          open={showMerge}
          onClose={() => setShowMerge(false)}
        />
      )}
    </div>
  );
}

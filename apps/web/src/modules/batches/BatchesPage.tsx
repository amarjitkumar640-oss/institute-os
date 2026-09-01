import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Layers, Clock, Calendar, BookOpen, Lock, Activity, Pencil, Trash2, Eye } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBatchSchema } from "@institute-os/shared";
import { type z } from "zod";
import { listBatches, createBatch, updateBatch, deleteBatch, type Batch } from "@/api/batches";
import { listCourses, type Course } from "@/api/courses";
import { createSlot, updateSlot, deleteSlot, listBatchSlots, type ClassSlot } from "@/api/schedule";
import { listAssignableCenters } from "@/api/centers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAction } from "@/components/ui/icon-action";
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { AddClassPeriodDialog, DAY_ORDER, DAY_LABELS, type DayOfWeek, type ClassPeriodDraft } from "./AddClassPeriodDialog";

function fmt12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function addMonths(date: string | Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function toISODate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

function newDraftId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Reconciling ClassPeriodDrafts against real ClassSlot rows ─────────────────
// Mirrors mobile's EditBatchScreen: a batch being edited already has real
// ClassSlot rows server-side (unlike CreateBatchDialog, where periods are
// purely local until the batch exists), so loading them back into the same
// period-drafting UI means grouping slots that share one period's identity
// (same time/subject/faculty/room, just a different day) back together, and
// tracking each draft's real slot id per day so saving can update/create/
// delete the exact right rows instead of naively replacing everything.
function groupSlotsIntoPeriods(slots: ClassSlot[]): {
  periods: ClassPeriodDraft[];
  slotIdsByPeriod: Record<string, Partial<Record<DayOfWeek, string>>>;
} {
  const groups = new Map<string, ClassSlot[]>();
  for (const slot of slots) {
    const key = `${slot.startTime}|${slot.endTime}|${slot.subject?.id ?? ""}|${slot.faculty?.id ?? ""}|${slot.room ?? ""}`;
    const existing = groups.get(key);
    if (existing) existing.push(slot); else groups.set(key, [slot]);
  }

  const periods: ClassPeriodDraft[] = [];
  const slotIdsByPeriod: Record<string, Partial<Record<DayOfWeek, string>>> = {};

  for (const groupSlots of groups.values()) {
    const id = newDraftId();
    const first = groupSlots[0];
    periods.push({
      id,
      days:        DAY_ORDER.filter((d) => groupSlots.some((s) => s.dayOfWeek === d)),
      startTime:   first.startTime,
      endTime:     first.endTime,
      subjectId:   first.subject?.id ?? "",
      subjectName: first.subject?.name ?? "",
      facultyId:   first.faculty?.id ?? "",
      facultyName: first.faculty?.fullName ?? "",
      room:        first.room ?? "",
    });
    const idsByDay: Partial<Record<DayOfWeek, string>> = {};
    for (const s of groupSlots) idsByDay[s.dayOfWeek as DayOfWeek] = s.id;
    slotIdsByPeriod[id] = idsByDay;
  }

  return { periods, slotIdsByPeriod };
}

type CreateBatchForm = z.infer<typeof createBatchSchema>;

const STATUS_COLORS: Record<string, "default" | "success" | "info" | "warning"> = {
  upcoming: "info",
  running: "success",
  completed: "default",
  merged: "warning",
};

function CreateBatchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentCenter } = useAuth();
  const qc = useQueryClient();
  const { data: coursesData } = useQuery({ queryKey: ["courses"], queryFn: () => listCourses() });
  const { data: centers } = useQuery({ queryKey: ["centers-assignable"], queryFn: listAssignableCenters, enabled: !currentCenter });

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [periods, setPeriods] = useState<ClassPeriodDraft[]>([]);
  const [periodModal, setPeriodModal] = useState<{ open: boolean; editing: ClassPeriodDraft | null }>({ open: false, editing: null });

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateBatchForm>({
    resolver: zodResolver(createBatchSchema),
  });

  const startDateVal = watch("startDate");

  // Auto-calculate end date whenever start date or course changes
  useEffect(() => {
    if (startDateVal && selectedCourse) {
      setValue("endDate", new Date(addMonths(startDateVal, selectedCourse.durationMonths)));
    }
  }, [startDateVal, selectedCourse, setValue]);

  function handleSavePeriod(draft: ClassPeriodDraft) {
    setPeriods((prev) => {
      const idx = prev.findIndex((p) => p.id === draft.id);
      if (idx === -1) return [...prev, draft];
      const next = [...prev];
      next[idx] = draft;
      return next;
    });
    setPeriodModal({ open: false, editing: null });
  }

  function removePeriod(id: string) {
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  }

  const courses = coursesData?.data ?? [];
  const endDateVal = startDateVal && selectedCourse ? addMonths(new Date(startDateVal), selectedCourse.durationMonths) : "";

  const mutation = useMutation({
    mutationFn: async (d: CreateBatchForm) => {
      const batch = await createBatch({
        ...d,
        startDate: new Date(d.startDate).toISOString(),
        endDate: new Date(d.endDate).toISOString(),
      });

      // Create one slot per (period × day) combination (best-effort — batch is already saved)
      if (periods.length > 0) {
        await Promise.allSettled(
          periods.flatMap((period) =>
            period.days.map((dayOfWeek) =>
              createSlot(batch.id, {
                dayOfWeek,
                startTime: period.startTime,
                endTime:   period.endTime,
                subjectId: period.subjectId || undefined,
                facultyId: period.facultyId || undefined,
                room:      period.room || undefined,
                validFrom: toISODate(d.startDate),
              })
            )
          )
        );
      }

      return batch;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      toast({ title: "Batch created" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Failed to create batch" }),
  });

  function onSubmit(d: CreateBatchForm) {
    mutation.mutate(d);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Batch</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Course */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <BookOpen className="h-3.5 w-3.5" /> Course
            </div>
            <FormField label="" error={errors.courseId} required={false}>
              <Select
                onValueChange={(v) => {
                  setValue("courseId", v);
                  setSelectedCourse(courses.find((c) => c.id === v) ?? null);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a course…" /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.durationMonths ? ` · ${c.durationMonths}mo` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {errors.courseId && <p className="text-xs text-red-600">{errors.courseId.message}</p>}
            {selectedCourse && (
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-500">
                {selectedCourse.examCategories[0] && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                    style={{ background: selectedCourse.examCategories[0].color + "18", color: selectedCourse.examCategories[0].color }}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: selectedCourse.examCategories[0].color }} />
                    {selectedCourse.examCategories.map((e) => e.label).join(", ")}
                  </span>
                )}
                <span>{selectedCourse.durationMonths} months</span>
                {selectedCourse.defaultFee > 0 && (
                  <span className="text-green-600 font-semibold">₹{(selectedCourse.defaultFee / 1000).toFixed(0)}k</span>
                )}
              </div>
            )}
          </div>

          {/* Batch Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <Layers className="h-3.5 w-3.5" /> Batch Details
            </div>
            <FormField label="Batch Name" error={errors.name} required>
              <Input {...register("name")} placeholder="e.g. SSC Morning Batch 2026" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Capacity (seats)" error={errors.capacity} required>
                <Input {...register("capacity", { valueAsNumber: true })} type="number" min={1} placeholder="e.g. 40" />
              </FormField>
              {!currentCenter && (
                <FormField label="Center" required>
                  <Select onValueChange={(v) => setValue("centerId" as keyof CreateBatchForm, v as never)}>
                    <SelectTrigger><SelectValue placeholder="Select center" /></SelectTrigger>
                    <SelectContent>
                      {(centers ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <Calendar className="h-3.5 w-3.5" /> Schedule
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date" error={errors.startDate} required>
                <Input {...register("startDate")} type="date" />
              </FormField>
              <FormField label={`End Date${selectedCourse ? ` (auto · ${selectedCourse.durationMonths}mo)` : ""}`}>
                <Input
                  value={endDateVal}
                  readOnly
                  disabled
                  type="date"
                  placeholder="Select course + start date"
                  className="bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </FormField>
            </div>
          </div>

          {/* Class Timing (optional) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
                <Clock className="h-3.5 w-3.5" /> Class Timing
              </div>
              <span className="text-xs text-gray-400">Optional — can be added later</span>
            </div>

            {periods.length === 0 ? (
              <p className="text-xs text-gray-400">No class periods added yet.</p>
            ) : (
              <div className="space-y-2">
                {periods.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">
                        {p.days.map((d) => DAY_LABELS[d]).join(", ")}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {fmt12h(p.startTime)} – {fmt12h(p.endTime)}
                        {p.subjectName && ` · ${p.subjectName}`}
                        {p.facultyName && ` · ${p.facultyName}`}
                        {p.room && ` · ${p.room}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPeriodModal({ open: true, editing: p })}
                      className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-500 hover:text-gray-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePeriod(p.id)}
                      className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md bg-white border border-gray-200 text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setPeriodModal({ open: true, editing: null })}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-[1.5px] border-dashed border-[var(--color-primary,#7C3AED)]/40 text-xs font-semibold text-[var(--color-primary,#7C3AED)] hover:bg-[var(--color-primary,#7C3AED)]/5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Class Period
            </button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create Batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <AddClassPeriodDialog
        open={periodModal.open}
        initial={periodModal.editing}
        onClose={() => setPeriodModal({ open: false, editing: null })}
        onSave={handleSavePeriod}
      />
    </Dialog>
  );
}

const STATUSES = ["upcoming", "running", "completed", "merged"] as const;

// ── Edit Batch Dialog ──────────────────────────────────────────────────────────

const EDIT_STATUS_OPTIONS = [
  { key: "upcoming"  as const, label: "Upcoming",  color: "#3B82F6" },
  { key: "running"   as const, label: "Running",   color: "#22C55E" },
  { key: "completed" as const, label: "Completed", color: "#6B7280" },
];

function EditBatchDialog({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const qc        = useQueryClient();
  const initRef   = useRef(false);

  const [name,        setName]        = useState(batch.name);
  const [capacity,    setCapacity]    = useState(String(batch.capacity));
  const [status,      setStatus]      = useState(batch.status);
  const [startDate,   setStartDate]   = useState(toISODate(batch.startDate));
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  // ── Class periods — same per-period model as CreateBatchDialog, loaded
  // back from this batch's real ClassSlot rows and reconciled against them
  // on save (see groupSlotsIntoPeriods and the mutation below).
  const [periods, setPeriods] = useState<ClassPeriodDraft[]>([]);
  const [periodModal, setPeriodModal] = useState<{ open: boolean; editing: ClassPeriodDraft | null }>({ open: false, editing: null });
  const originalSlotIdsByPeriod = useRef<Record<string, Partial<Record<DayOfWeek, string>>>>({});

  const endDate   = startDate ? addMonths(startDate, batch.course.durationMonths) : "";
  const examColor = batch.course.examCategories[0]?.color ?? "#7C3AED";
  const examLabel = batch.course.examCategories.length
    ? batch.course.examCategories.map((e) => e.label).join(", ")
    : "General";

  const { data: existingSlots, isLoading: slotsLoading } = useQuery<ClassSlot[]>({
    queryKey: ["batch-slots", batch.id],
    queryFn:  () => listBatchSlots(batch.id),
  });

  useEffect(() => {
    if (!existingSlots || initRef.current) return;
    initRef.current = true;
    const { periods: loaded, slotIdsByPeriod } = groupSlotsIntoPeriods(existingSlots.filter((s) => s.isActive));
    originalSlotIdsByPeriod.current = slotIdsByPeriod;
    setPeriods(loaded);
  }, [existingSlots]);

  function handleSavePeriod(draft: ClassPeriodDraft) {
    setPeriods((prev) => {
      const idx = prev.findIndex((p) => p.id === draft.id);
      if (idx === -1) return [...prev, draft];
      const next = [...prev];
      next[idx] = draft;
      return next;
    });
    setPeriodModal({ open: false, editing: null });
  }

  function removePeriod(id: string) {
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim())                                                        errs.name     = "Batch name is required.";
    if (!capacity.trim() || isNaN(Number(capacity)) || Number(capacity) < 1) errs.capacity = "Enter a valid capacity (min 1).";
    if (!startDate)                                                           errs.startDate = "Start date is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Reconciles the current `periods` state against whatever real ClassSlot
  // rows this batch had when the dialog opened — update the ones that
  // survived (by their recorded real id), create ones for newly-added
  // days/periods, and delete any original id nothing in the final state
  // still claims. Best-effort per call, same philosophy as
  // CreateBatchDialog's own slot creation: the batch's core fields already
  // saved successfully, so one slot failing shouldn't undo that.
  async function reconcileClassPeriods() {
    const claimedIds = new Set<string>();
    const ops: Promise<unknown>[] = [];

    for (const period of periods) {
      const existingIdsForPeriod = originalSlotIdsByPeriod.current[period.id] ?? {};
      for (const day of period.days) {
        const existingId = existingIdsForPeriod[day];
        if (existingId) {
          claimedIds.add(existingId);
          ops.push(updateSlot(existingId, {
            startTime: period.startTime,
            endTime:   period.endTime,
            subjectId: period.subjectId || null,
            facultyId: period.facultyId || null,
            room:      period.room || null,
          }));
        } else {
          ops.push(createSlot(batch.id, {
            dayOfWeek: day,
            startTime: period.startTime,
            endTime:   period.endTime,
            subjectId: period.subjectId || undefined,
            facultyId: period.facultyId || undefined,
            room:      period.room || undefined,
            validFrom: startDate,
          }));
        }
      }
    }

    for (const idsByDay of Object.values(originalSlotIdsByPeriod.current)) {
      for (const id of Object.values(idsByDay)) {
        if (id && !claimedIds.has(id)) ops.push(deleteSlot(id));
      }
    }

    await Promise.allSettled(ops);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      await updateBatch(batch.id, {
        name:      name.trim(),
        capacity:  Number(capacity),
        startDate: new Date(startDate).toISOString(),
        endDate:   new Date(endDate).toISOString(),
        status,
      });
      await reconcileClassPeriods();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["batch-slots", batch.id] });
      toast({ title: "Batch updated" });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to update batch";
      toast({ variant: "destructive", title: msg });
    },
  });

  function handleSave() {
    if (!validate()) return;
    mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Batch</DialogTitle></DialogHeader>

        <div className="space-y-5">

          {/* ── Course (read-only) ── */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
              <BookOpen className="h-3.5 w-3.5" />
              Course
              <span className="ml-auto inline-flex items-center gap-1 bg-gray-100 text-gray-400 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                <Lock className="h-2.5 w-2.5" /> Fixed
              </span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <span
                className="shrink-0 inline-flex items-center rounded-lg px-2 py-1 text-xs font-extrabold uppercase"
                style={{ background: examColor + "18", color: examColor }}
              >
                {examLabel}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{batch.course.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {batch.course.durationMonths} months · ₹{(batch.course.defaultFee / 1000).toFixed(0)}k
                </p>
              </div>
            </div>
          </div>

          {/* ── Batch Details ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <Layers className="h-3.5 w-3.5" /> Batch Details
            </div>
            <FormField label="Batch Name" error={errors.name ? { message: errors.name } as never : undefined} required>
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
                placeholder="e.g. SSC Morning Batch A"
              />
            </FormField>
            <FormField label="Capacity (seats)" error={errors.capacity ? { message: errors.capacity } as never : undefined} required>
              <Input
                type="number" min={1}
                value={capacity}
                onChange={(e) => { setCapacity(e.target.value.replace(/\D/g, "")); setErrors((p) => ({ ...p, capacity: "" })); }}
                placeholder="e.g. 40"
              />
            </FormField>
          </div>

          {/* ── Status ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <Activity className="h-3.5 w-3.5" /> Status
            </div>
            <div className="flex gap-2">
              {EDIT_STATUS_OPTIONS.map((opt) => {
                const active = status === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStatus(opt.key)}
                    className={cn(
                      "flex-1 py-2 px-3 rounded-xl border-[1.5px] text-xs font-semibold transition-colors",
                      active ? "text-white" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                    )}
                    style={active ? { background: opt.color, borderColor: opt.color } : undefined}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {batch.enrolledCount > 0 && (
              <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                {batch.enrolledCount} student{batch.enrolledCount !== 1 ? "s" : ""} currently enrolled
              </p>
            )}
          </div>

          {/* ── Schedule ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <Calendar className="h-3.5 w-3.5" /> Schedule
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date" error={errors.startDate ? { message: errors.startDate } as never : undefined} required>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setErrors((p) => ({ ...p, startDate: "" })); }}
                />
              </FormField>
              <FormField label={`End Date (auto · ${batch.course.durationMonths}mo)`}>
                <Input
                  value={endDate}
                  readOnly
                  disabled
                  type="date"
                  className="bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </FormField>
            </div>
          </div>

          {/* ── Class Timing — same per-period model as Create, loaded back
              from this batch's real ClassSlot rows and reconciled against
              them on save (see groupSlotsIntoPeriods / reconcileClassPeriods). ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <Clock className="h-3.5 w-3.5" /> Class Timing
            </div>

            {slotsLoading ? (
              <p className="text-xs text-gray-400">Loading class periods…</p>
            ) : periods.length === 0 ? (
              <p className="text-xs text-gray-400">No class periods set up yet.</p>
            ) : (
              <div className="space-y-2">
                {periods.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">
                        {p.days.map((d) => DAY_LABELS[d]).join(", ")}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {fmt12h(p.startTime)} – {fmt12h(p.endTime)}
                        {p.subjectName && ` · ${p.subjectName}`}
                        {p.facultyName && ` · ${p.facultyName}`}
                        {p.room && ` · ${p.room}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPeriodModal({ open: true, editing: p })}
                      className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-500 hover:text-gray-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePeriod(p.id)}
                      className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md bg-white border border-gray-200 text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setPeriodModal({ open: true, editing: null })}
              disabled={slotsLoading}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-[1.5px] border-dashed border-[var(--color-primary,#7C3AED)]/40 text-xs font-semibold text-[var(--color-primary,#7C3AED)] hover:bg-[var(--color-primary,#7C3AED)]/5 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add Class Period
            </button>
          </div>

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AddClassPeriodDialog
        open={periodModal.open}
        initial={periodModal.editing}
        onClose={() => setPeriodModal({ open: false, editing: null })}
        onSave={handleSavePeriod}
      />
    </Dialog>
  );
}

export function BatchesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAllCenters } = useAuth();
  const { canDelete } = usePermission("batches");
  const [search, setSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);

  const { data: batches, isLoading } = useQuery({ queryKey: ["batches"], queryFn: listBatches });

  const deleteMutation = useMutation({
    mutationFn: deleteBatch,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      toast({ title: "Batch deleted" });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
      toast({ variant: "destructive", title: msg?.message ?? msg?.error ?? "Failed to delete batch" });
    },
  });

  function handleDelete(batch: Batch) {
    if (confirm(`Delete "${batch.name}"? This also removes its weekly class schedule and all class sessions. This can't be undone.`)) {
      deleteMutation.mutate(batch.id);
    }
  }

  const filtered = (batches ?? []).filter((b) => {
    const matchSearch = b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.course.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Only meaningful when viewing more than one center's data at once —
  // redundant (every row would show the same name) when scoped to one.
  const centerColumn: ColumnDef<Batch> = {
    id: "center",
    header: "Center",
    cell: ({ row }) => row.original.center?.name ?? "—",
  };

  const columns: ColumnDef<Batch>[] = [
    {
      accessorKey: "name",
      header: "Batch Name",
      cell: ({ row }) => (
        <button
          className="block max-w-[180px] text-left font-medium text-gray-900 hover:text-[var(--color-primary,#C0392B)] transition-colors"
          onClick={() => navigate(`/batches/${row.original.id}`)}
        >
          <TruncatedText text={row.original.name} />
        </button>
      ),
    },
    {
      id: "course",
      header: "Course",
      cell: ({ row }) => <TruncatedText text={row.original.course.name} className="text-sm max-w-[160px]" />,
    },
    ...(isAllCenters ? [centerColumn] : []),
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_COLORS[row.original.status]}>{row.original.status}</Badge>
      ),
    },
    {
      id: "enrollment",
      header: "Enrolled",
      cell: ({ row }) => `${row.original.enrolledCount} / ${row.original.capacity}`,
    },
    {
      accessorKey: "startDate",
      header: "Start",
      cell: ({ row }) => <span className="text-sm text-gray-500">{formatDate(row.original.startDate)}</span>,
    },
    {
      accessorKey: "endDate",
      header: "End",
      cell: ({ row }) => <span className="text-sm text-gray-500">{formatDate(row.original.endDate)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <IconAction label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(row.original)} />
          <IconAction label="View" icon={<Eye className="h-3.5 w-3.5" />} variant="ghost" onClick={() => navigate(`/batches/${row.original.id}`)} />
          {canDelete && (
            <IconAction
              label="Delete" icon={<Trash2 className="h-3.5 w-3.5" />} variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => handleDelete(row.original)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <h1 className="text-xl font-bold text-gray-900">Batches</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Batch
        </Button>
      </div>
      <div className="flex-1 p-7 space-y-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search batches..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>All</Button>
            {STATUSES.map((s) => (
              <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="capitalize">{s}</Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Layers} title="No batches found" actionLabel="Create Batch" onAction={() => setShowCreate(true)} />
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </div>
      <CreateBatchDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {editing && <EditBatchDialog batch={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

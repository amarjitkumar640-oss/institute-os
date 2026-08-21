import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Layers, Clock, Calendar, BookOpen, Lock, Activity, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBatchSchema } from "@institute-os/shared";
import { type z } from "zod";
import { listBatches, createBatch, updateBatch, type Batch } from "@/api/batches";
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
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type DayOfWeek = typeof DAY_ORDER[number];
const DAY_LABELS: Record<DayOfWeek, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };

function addMonths(date: string | Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function toISODate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

type CreateBatchForm = z.infer<typeof createBatchSchema>;

const STATUS_COLORS: Record<string, "default" | "success" | "info" | "warning"> = {
  upcoming: "info",
  running: "success",
  completed: "default",
};

function CreateBatchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentCenter } = useAuth();
  const qc = useQueryClient();
  const { data: coursesData } = useQuery({ queryKey: ["courses"], queryFn: () => listCourses() });
  const { data: centers } = useQuery({ queryKey: ["centers-assignable"], queryFn: listAssignableCenters, enabled: !currentCenter });

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedDays, setSelectedDays]     = useState<Set<DayOfWeek>>(new Set());
  const [startTime, setStartTime]           = useState("");
  const [endTime, setEndTime]               = useState("");
  const [timingError, setTimingError]       = useState("");

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

  function toggleDay(day: DayOfWeek) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
    setTimingError("");
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

      // Create one slot per selected day (best-effort — batch is already saved)
      if (startTime && endTime && selectedDays.size > 0) {
        await Promise.allSettled(
          Array.from(selectedDays).map((dayOfWeek) =>
            createSlot(batch.id, { dayOfWeek, startTime, endTime, validFrom: toISODate(d.startDate) })
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
    const hasTiming = startTime || endTime || selectedDays.size > 0;
    if (hasTiming) {
      if (selectedDays.size === 0) { setTimingError("Select at least one class day"); return; }
      if (!startTime || !endTime)  { setTimingError("Select both start and end time"); return; }
      if (startTime >= endTime)    { setTimingError("Start time must be before end time"); return; }
    }
    setTimingError("");
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

            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Class Days</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_ORDER.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border-[1.5px] transition-colors",
                      selectedDays.has(day)
                        ? "bg-[var(--color-primary,#7C3AED)] text-white border-[var(--color-primary,#7C3AED)]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {DAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Time">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => { setStartTime(e.target.value); setTimingError(""); }}
                    className="pl-9"
                  />
                </div>
              </FormField>
              <FormField label="End Time">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => { setEndTime(e.target.value); setTimingError(""); }}
                    className="pl-9"
                  />
                </div>
              </FormField>
            </div>
            {timingError && <p className="text-xs text-red-600">{timingError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create Batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATUSES = ["upcoming", "running", "completed"] as const;

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
  const [selectedDays, setSelectedDays] = useState<Set<DayOfWeek>>(new Set());
  const [startTime,   setStartTime]   = useState("");
  const [endTime,     setEndTime]     = useState("");
  const [timingError, setTimingError] = useState("");
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  const endDate   = startDate ? addMonths(startDate, batch.course.durationMonths) : "";
  const examColor = batch.course.examCategories[0]?.color ?? "#7C3AED";
  const examLabel = batch.course.examCategories.length
    ? batch.course.examCategories.map((e) => e.label).join(", ")
    : "General";

  // Load existing slots and pre-populate days/times
  const { data: existingSlots } = useQuery<ClassSlot[]>({
    queryKey: ["batch-slots", batch.id],
    queryFn:  () => listBatchSlots(batch.id),
  });

  useEffect(() => {
    if (!existingSlots || initRef.current) return;
    initRef.current = true;
    const active = existingSlots.filter((s) => s.isActive);
    setSelectedDays(new Set(active.map((s) => s.dayOfWeek as DayOfWeek)));
    const first = active[0];
    if (first) { setStartTime(first.startTime); setEndTime(first.endTime); }
  }, [existingSlots]);

  function toggleDay(day: DayOfWeek) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
    setTimingError("");
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim())                                                        errs.name     = "Batch name is required.";
    if (!capacity.trim() || isNaN(Number(capacity)) || Number(capacity) < 1) errs.capacity = "Enter a valid capacity (min 1).";
    if (!startDate)                                                           errs.startDate = "Start date is required.";
    setErrors(errs);
    // Timing cross-validation
    const hasTiming = startTime || endTime || selectedDays.size > 0;
    if (hasTiming) {
      if (selectedDays.size === 0) { setTimingError("Select at least one class day"); return false; }
      if (!startTime || !endTime)  { setTimingError("Select both start and end time"); return false; }
      if (startTime >= endTime)    { setTimingError("Start time must be before end time"); return false; }
    }
    return Object.keys(errs).length === 0;
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // 1. Update batch metadata
      await updateBatch(batch.id, {
        name:      name.trim(),
        capacity:  Number(capacity),
        startDate: new Date(startDate).toISOString(),
        endDate:   new Date(endDate).toISOString(),
        status,
      });

      // 2. Reconcile slots (best-effort)
      const active = (existingSlots ?? []).filter((s) => s.isActive);
      const slotByDay = new Map(active.map((s) => [s.dayOfWeek as DayOfWeek, s]));

      const hasTiming = startTime && endTime && selectedDays.size > 0;
      if (hasTiming) {
        const toDelete = active.filter((s) => !selectedDays.has(s.dayOfWeek as DayOfWeek));
        const toCreate = Array.from(selectedDays).filter((d) => !slotByDay.has(d));
        const toUpdate = active.filter(
          (s) => selectedDays.has(s.dayOfWeek as DayOfWeek) &&
                 (s.startTime !== startTime || s.endTime !== endTime)
        );
        await Promise.allSettled([
          ...toDelete.map((s) => deleteSlot(s.id)),
          ...toCreate.map((d) => createSlot(batch.id, { dayOfWeek: d, startTime, endTime, validFrom: startDate })),
          ...toUpdate.map((s) => updateSlot(s.id, { startTime, endTime })),
        ]);
      }
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

          {/* ── Class Timing ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
                <Clock className="h-3.5 w-3.5" /> Class Timing
              </div>
              <span className="text-xs text-gray-400">Optional</span>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Class Days</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_ORDER.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border-[1.5px] transition-colors",
                      selectedDays.has(day)
                        ? "bg-[var(--color-primary,#7C3AED)] text-white border-[var(--color-primary,#7C3AED)]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {DAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Time">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => { setStartTime(e.target.value); setTimingError(""); }}
                    className="pl-9"
                  />
                </div>
              </FormField>
              <FormField label="End Time">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => { setEndTime(e.target.value); setTimingError(""); }}
                    className="pl-9"
                  />
                </div>
              </FormField>
            </div>
            {timingError && <p className="text-xs text-red-600">{timingError}</p>}
          </div>

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BatchesPage() {
  const navigate = useNavigate();
  const { isAllCenters } = useAuth();
  const [search, setSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);

  const { data: batches, isLoading } = useQuery({ queryKey: ["batches"], queryFn: listBatches });

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
          className="font-medium text-gray-900 hover:text-[var(--color-primary,#C0392B)] transition-colors"
          onClick={() => navigate(`/batches/${row.original.id}`)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      id: "course",
      header: "Course",
      cell: ({ row }) => <span className="text-sm">{row.original.course.name}</span>,
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
          <Button
            size="sm" variant="outline"
            onClick={() => setEditing(row.original)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/batches/${row.original.id}`)}>
            View
          </Button>
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

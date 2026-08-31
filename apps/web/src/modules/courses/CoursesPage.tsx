import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Plus, Search, BookOpen, Trash2, Clock, Wallet,
  LayoutList, ChevronUp, ChevronDown, PlusCircle,
} from "lucide-react";
import { listCourses, createCourse, updateCourse, deleteCourse, type Course } from "@/api/courses";
import { listExamCategories } from "@/api/subjects";
import {
  getFeeTemplate, upsertFeeTemplate,
  type FeeTemplate, type TemplateLine, type UpsertTemplatePayload,
} from "@/api/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

// ── Course form helpers ────────────────────────────────────────────────────────

interface CourseFormState {
  name: string;
  durationMonths: string;
  defaultFee: string;
  discountAmount: string;
  discountReason: string;
  examCategoryIds: string[];
  isFree: boolean;
}

interface CourseFormErrors {
  name?: string;
  durationMonths?: string;
  defaultFee?: string;
  discountAmount?: string;
}

function validateCourseForm(f: CourseFormState): CourseFormErrors {
  const errs: CourseFormErrors = {};
  if (!f.name.trim())                        errs.name          = "Course name is required.";
  else if (f.name.trim().length > 120)       errs.name          = "Course name must be 120 characters or fewer.";
  const months = Number(f.durationMonths);
  if (!f.durationMonths.trim())              errs.durationMonths = "Duration is required.";
  else if (!Number.isInteger(months) || months < 1 || months > 60)
                                             errs.durationMonths = "Duration must be 1 – 60 months.";
  // A free course is never billed to anyone, so its fee/discount fields are
  // meaningless — skip validating them entirely (submit forces both to 0).
  if (!f.isFree) {
    const fee = Number(f.defaultFee);
    if (f.defaultFee.trim() === "")            errs.defaultFee     = "Default fee is required.";
    else if (isNaN(fee) || fee < 0)            errs.defaultFee     = "Fee must be 0 or a positive number.";
    else if (fee > 10_000_000)                 errs.defaultFee     = "Fee cannot exceed ₹1,00,00,000.";
    const discount = f.discountAmount.trim() === "" ? 0 : Number(f.discountAmount);
    if (isNaN(discount) || discount < 0)       errs.discountAmount = "Discount must be 0 or a positive number.";
    else if (!errs.defaultFee && discount > fee)
                                               errs.discountAmount = "Discount cannot exceed the default fee.";
  }
  return errs;
}

// ── Course Form Dialog ─────────────────────────────────────────────────────────

function CourseFormDialog({
  open, onClose, existing,
}: { open: boolean; onClose: () => void; existing?: Course }) {
  const qc = useQueryClient();
  const { data: examCategories } = useQuery({ queryKey: ["exam-categories"], queryFn: listExamCategories });

  const [form, setForm]     = useState<CourseFormState>(() => ({
    name:            existing?.name ?? "",
    durationMonths:  existing ? String(existing.durationMonths) : "",
    defaultFee:      existing ? String(existing.defaultFee) : "",
    discountAmount:  existing?.discountAmount ? String(existing.discountAmount) : "",
    discountReason:  existing?.discountReason ?? "",
    examCategoryIds: existing?.examCategories.map((e) => e.id) ?? [],
    isFree:          existing?.isFree ?? false,
  }));
  const [errors, setErrors] = useState<CourseFormErrors>({});
  const [loading, setLoading] = useState(false);

  function setField<K extends keyof CourseFormState>(k: K, v: CourseFormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k as keyof CourseFormErrors]) setErrors((p) => ({ ...p, [k]: undefined }));
  }

  function toggleCategory(id: string) {
    if (id === "__general__") {
      setField("examCategoryIds", []);
      return;
    }
    const next = form.examCategoryIds.includes(id)
      ? form.examCategoryIds.filter((c) => c !== id)
      : [...form.examCategoryIds, id];
    setField("examCategoryIds", next);
  }

  const isGeneral = form.examCategoryIds.length === 0;

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name:            form.name.trim(),
        examCategoryIds: form.examCategoryIds,
        durationMonths:  Number(form.durationMonths),
        defaultFee:      form.isFree ? 0 : Number(form.defaultFee),
        discountAmount:  form.isFree || form.discountAmount.trim() === "" ? 0 : Number(form.discountAmount),
        discountReason:  form.isFree ? undefined : (form.discountReason.trim() || undefined),
        isFree:          form.isFree,
      };
      return existing ? updateCourse(existing.id, payload) : createCourse(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: existing ? "Course updated" : "Course created" });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error";
      toast({ variant: "destructive", title: msg });
    },
  });

  async function handleSubmit() {
    const errs = validateCourseForm(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setLoading(true);
    try { await mutation.mutateAsync(); } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Course" : "Create Course"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <BookOpen className="h-3.5 w-3.5" /> Basic Information
            </div>
            <FormField label="Course Name" error={errors.name ? { message: errors.name } as never : undefined} required>
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="e.g. SSC CGL Complete Course"
                maxLength={120}
              />
            </FormField>

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Exam Category</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleCategory("__general__")}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-semibold border-[1.5px] transition-colors",
                    isGeneral
                      ? "bg-gray-600 text-white border-gray-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                  )}
                >
                  General (All)
                </button>
                {(examCategories ?? []).map((ec) => {
                  const active = form.examCategoryIds.includes(ec.id);
                  return (
                    <button
                      key={ec.id}
                      type="button"
                      onClick={() => toggleCategory(ec.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-[1.5px] transition-colors"
                      style={active
                        ? { background: ec.color, borderColor: ec.color, color: "#fff" }
                        : { background: ec.color + "14", borderColor: ec.color + "40", color: ec.color }
                      }
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: active ? "#fff" : ec.color }}
                      />
                      {ec.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <Clock className="h-3.5 w-3.5" /> Schedule &amp; Fee
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-800">Free course</p>
                <p className="text-xs text-gray-400">
                  Never billed to students (e.g. a dedicated CSR-sponsored program) — no fee schedule is generated
                  on admission.
                </p>
              </div>
              <Switch checked={form.isFree} onCheckedChange={(v) => setField("isFree", v)} />
            </div>

            <div className={cn("grid gap-4", form.isFree ? "grid-cols-1" : "grid-cols-2")}>
              <FormField label="Duration (months)" error={errors.durationMonths ? { message: errors.durationMonths } as never : undefined} required>
                <Input
                  type="number" min={1} max={60}
                  value={form.durationMonths}
                  onChange={(e) => setField("durationMonths", e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 12"
                />
              </FormField>
              {!form.isFree && (
                <FormField label="Default Fee (₹)" error={errors.defaultFee ? { message: errors.defaultFee } as never : undefined} required>
                  <div className="relative">
                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <Input
                      type="number" min={0}
                      value={form.defaultFee}
                      onChange={(e) => setField("defaultFee", e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="e.g. 15000"
                      className="pl-9"
                    />
                  </div>
                </FormField>
              )}
            </div>

            {!form.isFree && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Standing Discount (₹)"
                    error={errors.discountAmount ? { message: errors.discountAmount } as never : undefined}
                  >
                    <div className="relative">
                      <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                      <Input
                        type="number" min={0}
                        value={form.discountAmount}
                        onChange={(e) => setField("discountAmount", e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="e.g. 1000"
                        className="pl-9"
                      />
                    </div>
                  </FormField>
                  <FormField label="Discount Reason">
                    <Input
                      value={form.discountReason}
                      onChange={(e) => setField("discountReason", e.target.value)}
                      placeholder="Optional"
                    />
                  </FormField>
                </div>
                <p className="text-xs text-gray-400 -mt-2">
                  Auto-applied to every new student who enrolls in this course going forward.
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : (existing ? "Save" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Fee Structure ─────────────────────────────────────────────────────────────

type DraftTrigger = "on_admission" | "after_days" | "monthly";

interface DraftLine {
  key: string;
  label: string;
  amount: string;
  trigger: DraftTrigger;
  offsetDays: string;
  months: string;
  dayOfMonth: string;
}

function newDraftLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    label: "",
    amount: "",
    trigger: "on_admission",
    offsetDays: "30",
    months: "3",
    dayOfMonth: "1",
  };
}

function templateLineToDraft(line: TemplateLine): DraftLine {
  const base: DraftLine = {
    key: line.id,
    label: line.label,
    amount: "0",
    trigger: "on_admission",
    offsetDays: "30",
    months: "3",
    dayOfMonth: "1",
  };
  if (line.trigger === "on_admission") {
    return { ...base, trigger: "on_admission", amount: line.amount ?? "0" };
  }
  if (line.trigger === "days_after_admission") {
    return {
      ...base,
      trigger: "after_days",
      amount: line.amount ?? "0",
      offsetDays: line.offsetDays?.toString() ?? "30",
    };
  }
  if (line.trigger === "monthly_recurring") {
    const months = line.splitCount ?? 3;
    const totalAmt = Number(line.amount ?? 0);
    const perMonth = months > 0 ? Math.round(totalAmt / months) : 0;
    return {
      ...base,
      trigger: "monthly",
      months: months.toString(),
      dayOfMonth: line.dayOfMonth?.toString() ?? "1",
      amount: perMonth.toString(),
    };
  }
  return base;
}

function draftToApiLine(d: DraftLine, sortOrder: number): UpsertTemplatePayload["lines"][number] {
  const label = d.label.trim() || "Installment";
  const amt   = Math.max(0, Number(d.amount) || 0);
  if (d.trigger === "on_admission") {
    return { sortOrder, label, lineType: "fixed", trigger: "on_admission", amount: amt };
  }
  if (d.trigger === "after_days") {
    return {
      sortOrder, label,
      lineType: "fixed",
      trigger: "days_after_admission",
      amount: amt,
      offsetDays: Math.max(1, Number(d.offsetDays) || 30),
    };
  }
  const months = Math.max(1, Number(d.months) || 3);
  const dom    = Math.min(28, Math.max(1, Number(d.dayOfMonth) || 1));
  return {
    sortOrder, label,
    lineType: "equal_split",
    trigger: "monthly_recurring",
    amount: amt * months,
    splitCount: months,
    dayOfMonth: dom,
  };
}

function lineTotal(d: DraftLine): number {
  const amt = Number(d.amount) || 0;
  if (d.trigger === "monthly") return amt * (Number(d.months) || 1);
  return amt;
}

// ── LineCard ──────────────────────────────────────────────────────────────────

interface LineCardProps {
  line: DraftLine;
  index: number;
  total: number;
  onChange: (updated: DraftLine) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

const TRIGGERS: { id: DraftTrigger; label: string }[] = [
  { id: "on_admission", label: "On Admission" },
  { id: "after_days",   label: "After Days"   },
  { id: "monthly",      label: "Monthly"      },
];

function LineCard({ line, index, total, onChange, onMoveUp, onMoveDown, onRemove }: LineCardProps) {
  function update<K extends keyof DraftLine>(k: K, v: DraftLine[K]) {
    onChange({ ...line, [k]: v });
  }
  const isMonthly   = line.trigger === "monthly";
  const isAfterDays = line.trigger === "after_days";
  const subtotal    = lineTotal(line);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <Input
            value={line.label}
            onChange={(e) => update("label", e.target.value)}
            placeholder="e.g. Admission Fee"
            className="text-sm font-medium border-0 shadow-none p-0 h-auto focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-2">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-red-400 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Trigger chips */}
      <div className="flex gap-1.5 flex-wrap">
        {TRIGGERS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => update("trigger", t.id)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
              line.trigger === t.id
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Amount + conditional fields */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label={isMonthly ? "Per Month (₹)" : "Amount (₹)"}>
          <div className="relative">
            <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <Input
              type="number"
              min={0}
              value={line.amount}
              onChange={(e) => update("amount", e.target.value)}
              placeholder="0"
              className="pl-9"
            />
          </div>
        </FormField>

        {isAfterDays && (
          <FormField label="Days after admission">
            <Input
              type="number"
              min={1}
              value={line.offsetDays}
              onChange={(e) => update("offsetDays", e.target.value)}
              placeholder="30"
            />
          </FormField>
        )}

        {isMonthly && (
          <>
            <FormField label="No. of months">
              <Input
                type="number"
                min={1}
                max={60}
                value={line.months}
                onChange={(e) => update("months", e.target.value)}
                placeholder="6"
              />
            </FormField>
            <FormField label="Day of month (1–28)">
              <Input
                type="number"
                min={1}
                max={28}
                value={line.dayOfMonth}
                onChange={(e) => update("dayOfMonth", e.target.value)}
                placeholder="5"
              />
            </FormField>
          </>
        )}
      </div>

      {isMonthly && subtotal > 0 && (
        <p className="text-xs text-gray-500">
          ₹{Number(line.amount || 0).toLocaleString("en-IN")}
          {" × "}
          {line.months || 0} months{" = "}
          <span className="font-semibold text-green-700">{formatCurrency(subtotal)}</span>
        </p>
      )}
    </div>
  );
}

// ── FeeStructureDialog ────────────────────────────────────────────────────────

function FeeStructureDialog({ course, onClose }: { course: Course; onClose: () => void }) {
  const qc = useQueryClient();
  const initRef = useRef(false);

  const [lines, setLines]     = useState<DraftLine[]>([]);
  const [notes, setNotes]     = useState("");
  const [saving, setSaving]   = useState(false);

  const { data: template, isLoading } = useQuery<FeeTemplate | null>({
    queryKey: ["fee-template", course.id],
    queryFn:  () => getFeeTemplate(course.id),
  });

  useEffect(() => {
    if (isLoading || initRef.current) return;
    initRef.current = true;
    if (template?.lines?.length) {
      setLines(template.lines.map(templateLineToDraft));
      setNotes(template.notes ?? "");
    } else {
      setLines([newDraftLine()]);
    }
  }, [isLoading, template]);

  function moveUp(i: number) {
    setLines((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveDown(i: number) {
    setLines((prev) => {
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  function removeAt(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateAt(i: number, updated: DraftLine) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? updated : l)));
  }

  const runningTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);

  async function handleSave() {
    setSaving(true);
    try {
      await upsertFeeTemplate(course.id, {
        notes: notes.trim() || undefined,
        lines: lines.map((l, i) => draftToApiLine(l, i + 1)),
      });
      qc.invalidateQueries({ queryKey: ["fee-template", course.id] });
      toast({ title: "Fee structure saved" });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Failed to save fee structure" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutList className="h-4 w-4 text-green-600" />
            Fee Structure
          </DialogTitle>
        </DialogHeader>

        {/* Course summary */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
          <span className="font-semibold text-gray-700 text-sm">{course.name}</span>
          {course.examCategories[0] && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
              style={{
                background: course.examCategories[0].color + "18",
                color: course.examCategories[0].color,
              }}
            >
              {course.examCategories.map((e) => e.label).join(", ")}
            </span>
          )}
          <span className="text-gray-400">{course.durationMonths} months</span>
          <span className="text-green-600 font-semibold">{formatCurrency(course.defaultFee)} default</span>
        </div>

        {isLoading && !initRef.current ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {lines.map((line, i) => (
              <LineCard
                key={line.key}
                line={line}
                index={i}
                total={lines.length}
                onChange={(u) => updateAt(i, u)}
                onMoveUp={() => moveUp(i)}
                onMoveDown={() => moveDown(i)}
                onRemove={() => removeAt(i)}
              />
            ))}

            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, newDraftLine()])}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-violet-300 hover:text-violet-600 transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              Add Installment
            </button>

            {runningTotal > 0 && (
              <div className="flex justify-between items-center px-4 py-2.5 rounded-lg bg-green-50 border border-green-100">
                <span className="text-sm font-medium text-green-800">Total Fee</span>
                <span className="text-base font-bold text-green-700">{formatCurrency(runningTotal)}</span>
              </div>
            )}

            <FormField label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional fee notes..."
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
              />
            </FormField>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || lines.length === 0}>
            {saving ? "Saving…" : "Save Fee Structure"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Courses Page ───────────────────────────────────────────────────────────────

export function CoursesPage() {
  const qc = useQueryClient();
  const [search, setSearch]                   = useState("");
  const [showCreate, setShowCreate]           = useState(false);
  const [editing, setEditing]                 = useState<Course | null>(null);
  const [feeStructureCourse, setFeeStructureCourse] = useState<Course | null>(null);

  const { data: coursesData, isLoading } = useQuery({ queryKey: ["courses"], queryFn: () => listCourses() });
  const courses = coursesData?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: deleteCourse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: "Course deleted" });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Cannot delete course";
      toast({ variant: "destructive", title: msg });
    },
  });

  const filtered = courses.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const columns: ColumnDef<Course>[] = [
    {
      accessorKey: "name",
      header: "Course Name",
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-gray-900 text-sm">{row.original.name}</p>
          {row.original.examCategories.length === 0 && (
            <p className="text-xs text-gray-400">General</p>
          )}
        </div>
      ),
    },
    {
      id: "categories",
      header: "Exam Categories",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.examCategories.length === 0 ? (
            <Badge variant="default">General</Badge>
          ) : row.original.examCategories.map((ec) => (
            <span
              key={ec.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: ec.color + "18", color: ec.color, border: `1px solid ${ec.color}30` }}
            >
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: ec.color }} />
              {ec.label}
            </span>
          ))}
        </div>
      ),
    },
    {
      accessorKey: "durationMonths",
      header: "Duration",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.original.durationMonths} months</span>
      ),
    },
    {
      accessorKey: "defaultFee",
      header: "Default Fee",
      cell: ({ row }) => {
        const { defaultFee, discountAmount } = row.original;
        if (discountAmount > 0) {
          return (
            <span className="text-sm">
              <span className="text-gray-400 line-through mr-1.5">{formatCurrency(defaultFee)}</span>
              <span className="font-medium text-green-700">{formatCurrency(defaultFee - discountAmount)}</span>
            </span>
          );
        }
        return <span className="text-sm font-medium text-green-700">{formatCurrency(defaultFee)}</span>;
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-green-700 border-green-200 hover:bg-green-50 hover:border-green-300"
            onClick={() => setFeeStructureCourse(row.original)}
          >
            <LayoutList className="h-3.5 w-3.5 mr-1" />
            Fee Structure
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(row.original)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => {
              if (confirm("Delete this course?")) deleteMutation.mutate(row.original.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div
        className="flex items-center justify-between bg-white px-7 py-5"
        style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}
      >
        <div>
          <h1 className="text-xl font-bold text-gray-900">Courses</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage courses and exam categories</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Course
        </Button>
      </div>

      <div className="flex-1 p-7 space-y-5">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses found"
            actionLabel="Create Course"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </div>

      {showCreate && (
        <CourseFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      )}
      {editing && (
        <CourseFormDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />
      )}
      {feeStructureCourse && (
        <FeeStructureDialog
          course={feeStructureCourse}
          onClose={() => setFeeStructureCourse(null)}
        />
      )}
    </div>
  );
}

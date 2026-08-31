import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload } from "lucide-react";
import { listBatches } from "@/api/batches";
import { listAssignableCenters } from "@/api/centers";
import { listCourses } from "@/api/courses";
import { bulkImportLegacyStudents, type LegacyImportResult } from "@/api/students";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/FormField";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import type { LegacyStudentInput } from "@institute-os/shared";

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function formatMoney(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

const QUALIFICATIONS = [
  { value: "class10", label: "Class 10" },
  { value: "class12", label: "Class 12" },
  { value: "graduation", label: "Graduation" },
  { value: "post_graduation", label: "Post Graduation" },
] as const;

type QualificationValue = (typeof QUALIFICATIONS)[number]["value"];

// The four values above are the only ones the backend accepts (same enum the
// real Admit Student form uses — see formHelpers.tsx's QUAL_OPTS). Registers
// write qualification as free text ("10th", "Gradadiw 2020"), so the Bulk
// Paste tab accepts common shorthand and maps it to the canonical value
// instead of forcing whoever's transcribing to remember exact enum spelling.
const QUALIFICATION_ALIASES: Record<string, QualificationValue> = {
  "10th": "class10", "class 10": "class10", "class10": "class10", "matric": "class10", "matriculation": "class10", "ssc": "class10",
  "12th": "class12", "class 12": "class12", "class12": "class12", "intermediate": "class12", "hsc": "class12", "hs": "class12",
  "graduation": "graduation", "graduate": "graduation", "bachelor": "graduation", "bachelors": "graduation", "ug": "graduation", "b.a": "graduation", "b.sc": "graduation", "b.com": "graduation",
  "pg": "post_graduation", "post graduation": "post_graduation", "post_graduation": "post_graduation", "postgraduate": "post_graduation", "postgraduation": "post_graduation", "masters": "post_graduation", "master's": "post_graduation", "m.a": "post_graduation", "m.sc": "post_graduation", "m.com": "post_graduation",
};

/** null = blank (fine, qualification is optional in the DB); "unrecognized" = had text that couldn't be mapped, worth a human look. */
function normalizeQualification(raw: unknown): { value: QualificationValue | null; unrecognized: string | null } {
  if (typeof raw !== "string" || !raw.trim()) return { value: null, unrecognized: null };
  const key = raw.trim().toLowerCase();
  const mapped = QUALIFICATION_ALIASES[key];
  if (mapped) return { value: mapped, unrecognized: null };
  // Already an exact canonical value (e.g. hand-written correctly) — leave as-is.
  if ((QUALIFICATIONS as readonly { value: string }[]).some((q) => q.value === key)) {
    return { value: key as QualificationValue, unrecognized: null };
  }
  return { value: null, unrecognized: raw };
}

const EXAMPLE_JSON = `[
  {
    "legacyId": "5549",
    "fullName": "Sampa Soren",
    "fatherName": "Dhanu Soren",
    "address": "At - Dhilabera, P.O - Katashol, P.S - Baghsol, Dist - East Singhbhum",
    "qualification": "Graduation",
    "passYear": "2020",
    "board": "KU",
    "email": "sampasoren0@gmail.com",
    "aadhaar": "642449905984",
    "phone": "7857804436",
    "guardianPhone": "9608509650",
    "totalFee": 12000,
    "payments": [
      { "date": "2025-08-12", "amount": 7000, "receiptNo": "3300" },
      { "date": "2026-05-11", "amount": 1000, "receiptNo": "3957" },
      { "date": "2026-07-13", "amount": 1000, "receiptNo": "4125" }
    ]
  }
]`;

// ── Single-entry form ─────────────────────────────────────────────────────────

type PaymentRow = { date: string; amount: string; receiptNo: string };
type StudentDraft = {
  legacyId: string; fullName: string; fatherName: string; motherName: string; gender: string; address: string;
  qualification: string; passYear: string; board: string; email: string; aadhaar: string;
  phone: string; guardianPhone: string; courseId: string; totalFee: string; payments: PaymentRow[];
};

function emptyPayment(): PaymentRow {
  return { date: "", amount: "", receiptNo: "" };
}

function emptyStudent(defaultCourseId: string, defaultTotalFee: number): StudentDraft {
  return {
    legacyId: "", fullName: "", fatherName: "", motherName: "", gender: "", address: "",
    qualification: "", passYear: "", board: "", email: "", aadhaar: "",
    phone: "", guardianPhone: "", courseId: defaultCourseId,
    totalFee: defaultTotalFee ? String(defaultTotalFee) : "",
    payments: [emptyPayment()],
  };
}

function draftToPayload(d: StudentDraft): LegacyStudentInput {
  return {
    legacyId: d.legacyId.trim(),
    fullName: d.fullName.trim(),
    fatherName: d.fatherName.trim() || null,
    motherName: d.motherName.trim() || null,
    gender: (d.gender || null) as LegacyStudentInput["gender"],
    address: d.address.trim() || null,
    qualification: (d.qualification || null) as LegacyStudentInput["qualification"],
    passYear: d.passYear.trim() || null,
    board: d.board.trim() || null,
    email: d.email.trim() || null,
    aadhaar: d.aadhaar.trim() || null,
    phone: d.phone.trim(),
    guardianPhone: d.guardianPhone.trim() || null,
    courseId: d.courseId || null,
    totalFee: Number(d.totalFee),
    payments: d.payments
      .filter((p) => p.date && p.amount)
      .map((p) => ({ date: p.date, amount: Number(p.amount), receiptNo: p.receiptNo.trim() || undefined })),
  };
}

function SingleEntryForm({
  batchId, centerId, defaultCourseId, defaultTotalFee, onImported,
}: {
  batchId: string; centerId: string; defaultCourseId: string; defaultTotalFee: number; onImported: () => void;
}) {
  const [student, setStudent] = useState<StudentDraft>(() => emptyStudent(defaultCourseId, defaultTotalFee));
  const { data: coursesData } = useQuery({ queryKey: ["courses"], queryFn: () => listCourses() });
  const courses = coursesData?.data ?? [];

  const mutation = useMutation({
    mutationFn: () => bulkImportLegacyStudents({ batchId, centerId, students: [draftToPayload(student)] }),
    onSuccess: (data) => {
      const result = data.results[0];
      if (result.success) {
        toast({ title: `Created ${result.studentCode}`, description: student.fullName });
        setStudent(emptyStudent(defaultCourseId, defaultTotalFee));
        onImported();
      } else {
        toast({ variant: "destructive", title: "Import failed", description: result.error });
      }
    },
    onError: (err) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function update<K extends keyof StudentDraft>(key: K, value: StudentDraft[K]) {
    setStudent((s) => ({ ...s, [key]: value }));
  }

  function updatePayment(i: number, key: keyof PaymentRow, value: string) {
    setStudent((s) => ({ ...s, payments: s.payments.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)) }));
  }

  function addPayment() {
    setStudent((s) => ({ ...s, payments: [...s.payments, emptyPayment()] }));
  }

  function removePayment(i: number) {
    setStudent((s) => ({ ...s, payments: s.payments.filter((_, idx) => idx !== i) }));
  }

  const paidTotal = student.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const pending = (Number(student.totalFee) || 0) - paidTotal;

  const canSubmit =
    student.fullName.trim().length > 0 &&
    student.phone.trim().length > 0 &&
    Number(student.totalFee) > 0 &&
    student.payments.every((p) => p.date && Number(p.amount) > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Legacy / Register No.">
          <Input value={student.legacyId} onChange={(e) => update("legacyId", e.target.value)} placeholder="e.g. 5549" />
        </FormField>
        <FormField label="Full Name" required>
          <Input value={student.fullName} onChange={(e) => update("fullName", e.target.value)} />
        </FormField>
        <FormField label="Father's / Guardian's Name">
          <Input value={student.fatherName} onChange={(e) => update("fatherName", e.target.value)} />
        </FormField>
        <FormField label="Gender">
          <Select value={student.gender || "__none__"} onValueChange={(v) => update("gender", v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Phone" required>
          <Input value={student.phone} onChange={(e) => update("phone", e.target.value)} />
        </FormField>
        <FormField label="Guardian Phone">
          <Input value={student.guardianPhone} onChange={(e) => update("guardianPhone", e.target.value)} />
        </FormField>
        <FormField label="Email">
          <Input value={student.email} onChange={(e) => update("email", e.target.value)} />
        </FormField>
        <FormField label="Aadhaar No.">
          <Input value={student.aadhaar} onChange={(e) => update("aadhaar", e.target.value)} />
        </FormField>
        <FormField label="Qualification">
          <Select value={student.qualification || "__none__"} onValueChange={(v) => update("qualification", v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {QUALIFICATIONS.map((q) => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Pass Year">
          <Input value={student.passYear} onChange={(e) => update("passYear", e.target.value)} placeholder="e.g. 2020" />
        </FormField>
      </div>

      <FormField label="Board / University">
        <Input value={student.board} onChange={(e) => update("board", e.target.value)} className="max-w-xs" />
      </FormField>

      <FormField label="Address">
        <Textarea rows={2} value={student.address} onChange={(e) => update("address", e.target.value)} />
      </FormField>

      <FormField label="Course Applied For">
        <Select value={student.courseId || "__none__"} onValueChange={(v) => update("courseId", v === "__none__" ? "" : v)}>
          <SelectTrigger className="max-w-sm"><SelectValue placeholder="Select course" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-400 mt-1">
          Defaults to the target batch&apos;s own course — same field the normal Admit Student form sets independently
          of the batch, override only if this student&apos;s original admission course actually differs.
        </p>
      </FormField>

      <FormField label="Total Course Fee (₹)" required>
        <Input type="number" value={student.totalFee} onChange={(e) => update("totalFee", e.target.value)} className="max-w-xs" />
      </FormField>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Payment History</Label>
          <Button size="sm" variant="outline" onClick={addPayment}>
            <Plus className="h-3.5 w-3.5" /> Add Payment
          </Button>
        </div>
        <div className="space-y-2">
          {student.payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="date" value={p.date} onChange={(e) => updatePayment(i, "date", e.target.value)} className="w-40" />
              <Input type="number" placeholder="Amount" value={p.amount} onChange={(e) => updatePayment(i, "amount", e.target.value)} className="w-32" />
              <Input placeholder="Receipt No. (optional)" value={p.receiptNo} onChange={(e) => updatePayment(i, "receiptNo", e.target.value)} className="w-40" />
              {student.payments.length > 1 && (
                <Button size="icon" variant="ghost" className="text-red-600" onClick={() => removePayment(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm bg-gray-50 rounded-lg p-3 max-w-md">
        <span>Paid: <strong>{formatMoney(paidTotal)}</strong></span>
        <span className={pending > 0 ? "text-amber-600" : "text-emerald-600"}>
          Pending: <strong>{formatMoney(Math.max(0, pending))}</strong>
        </span>
      </div>

      <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Save & Add Next"}
      </Button>
    </div>
  );
}

// ── Bulk paste (JSON) form ─────────────────────────────────────────────────────

function BulkPasteForm({
  batchId, centerId, defaultTotalFee, onImported,
}: {
  batchId: string; centerId: string; defaultTotalFee: number; onImported: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<LegacyStudentInput[] | null>(null);
  const [defaultedRows, setDefaultedRows] = useState<Set<number>>(new Set());
  const [unrecognizedQualifications, setUnrecognizedQualifications] = useState<{ index: number; raw: string }[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<LegacyImportResult[] | null>(null);

  const mutation = useMutation({
    mutationFn: () => bulkImportLegacyStudents({ batchId, centerId, students: parsed! }),
    onSuccess: (data) => {
      setResults(data.results);
      const succeeded = data.results.filter((r) => r.success).length;
      toast({ title: `${succeeded}/${data.results.length} student(s) imported` });
      if (succeeded > 0) onImported();
    },
    onError: (err) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function handleParse() {
    setResults(null);
    setParseError(null);
    try {
      const json = JSON.parse(raw);
      if (!Array.isArray(json) || json.length === 0) throw new Error("Expected a non-empty JSON array of students");
      // totalFee is optional in the pasted JSON — same as the Single Entry
      // tab, it defaults to the batch's course fee when a student's entry
      // doesn't specify one. Track which rows were defaulted so the preview
      // can show it wasn't actually in the JSON.
      const defaulted = new Set<number>();
      const unrecognized: { index: number; raw: string }[] = [];
      const normalized = (json as LegacyStudentInput[]).map((s, i) => {
        if (!s.totalFee) defaulted.add(i);
        const qual = normalizeQualification(s.qualification);
        if (qual.unrecognized) unrecognized.push({ index: i, raw: qual.unrecognized });
        return { ...s, totalFee: s.totalFee || defaultTotalFee, qualification: qual.value };
      });
      setDefaultedRows(defaulted);
      setUnrecognizedQualifications(unrecognized);
      setParsed(normalized);
    } catch (err) {
      setParsed(null);
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  const invalidRows = (parsed ?? []).filter((s) => !s.totalFee || s.totalFee <= 0);

  return (
    <div className="space-y-4">
      <FormField label="Paste a JSON array of students">
        <Textarea
          rows={12}
          className="font-mono text-xs"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={EXAMPLE_JSON}
        />
        <p className="text-xs text-gray-400 mt-1">
          &quot;qualification&quot; can be written as it appears in the register — 10th, 12th, Graduation, PG, Matric,
          Intermediate, etc. — it&apos;s matched to the right value automatically. Leave it out entirely if the register
          doesn&apos;t show one; it&apos;s optional. &quot;courseId&quot; (a course&apos;s UUID) is also optional — every
          student defaults to this batch&apos;s own course unless you set it explicitly, same as the Single Entry tab.
          A payment&apos;s &quot;receiptNo&quot; (the register&apos;s own number) is optional too and can be written as a
          plain number — it&apos;s kept only as a reference, never as the actual stored receipt number (every payment
          gets a real one auto-generated automatically, so a duplicate or missing register number never blocks anything).
          Numbers like phone, Aadhaar, pass year, and legacy ID can also be written unquoted — both are accepted.
          A payment&apos;s &quot;date&quot; and &quot;amount&quot; are still required — those directly affect the money
          on record, so a payment missing either is reported specifically (which student, which payment) rather than
          guessed at or silently skipped. &quot;paidAt&quot; is also accepted as another name for a payment&apos;s date,
          in case that&apos;s what your source data calls it.
        </p>
      </FormField>
      {parseError && <p className="text-sm text-red-600">{parseError}</p>}
      <Button variant="outline" onClick={handleParse} disabled={!raw.trim()}>
        Parse & Preview
      </Button>

      {parsed && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Preview — {parsed.length} student(s)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400 mb-3">
              &quot;Total Fee&quot; − &quot;Paid&quot; (the sum of that student&apos;s payment rows) = &quot;Pending&quot;, computed here just for review — the
              same numbers get stored on the student&apos;s fee schedule. Rows marked <span className="italic">(from course)</span> didn&apos;t
              specify a totalFee in the JSON, so the batch&apos;s course fee ({formatMoney(defaultTotalFee)}) was used instead.
            </p>
            {invalidRows.length > 0 && (
              <p className="text-sm text-red-600 mb-3">
                {invalidRows.length} row(s) have no valid Total Fee (and this batch's course has no default fee to fall back to) —
                add a totalFee to those entries before importing.
              </p>
            )}
            {unrecognizedQualifications.length > 0 && (
              <p className="text-sm text-amber-600 mb-3">
                {unrecognizedQualifications.length} row(s) had a qualification value we didn&apos;t recognize, so it was left blank
                (safe to import — qualification isn&apos;t required by the database, only by the normal admission form) —
                you can fill it in later on the student&apos;s profile: {unrecognizedQualifications.map((u) => `"${u.raw}"`).join(", ")}.
                Recognized values: 10th/12th/Graduation/PG (and a few close variants).
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Legacy ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Qualification</TableHead>
                  <TableHead>Total Fee</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Payments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.map((s, i) => {
                  const paid = (s.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
                  const totalFee = s.totalFee ?? 0;
                  const hasValidFee = totalFee > 0;
                  const pending = totalFee - paid;
                  const wasUnrecognized = unrecognizedQualifications.some((u) => u.index === i);
                  return (
                    <TableRow key={i}>
                      <TableCell>{s.legacyId ?? "—"}</TableCell>
                      <TableCell className="font-medium">{s.fullName}</TableCell>
                      <TableCell>{s.phone}</TableCell>
                      <TableCell className={wasUnrecognized ? "text-amber-600" : undefined}>
                        {s.qualification ? QUALIFICATIONS.find((q) => q.value === s.qualification)?.label : wasUnrecognized ? "Unrecognized" : "—"}
                      </TableCell>
                      <TableCell className={!hasValidFee ? "text-red-600" : undefined}>
                        {hasValidFee ? formatMoney(totalFee) : "Missing"}
                        {defaultedRows.has(i) && hasValidFee && <span className="text-gray-400 italic"> (from course)</span>}
                      </TableCell>
                      <TableCell>{formatMoney(paid)}</TableCell>
                      <TableCell className={!hasValidFee ? "text-red-600" : pending > 0 ? "text-amber-600" : "text-emerald-600"}>
                        {hasValidFee ? formatMoney(Math.max(0, pending)) : "—"}
                      </TableCell>
                      <TableCell>{(s.payments ?? []).length}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex justify-end mt-3">
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || invalidRows.length > 0}>
                {mutation.isPending ? "Importing…" : `Import ${parsed.length} student(s)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Results</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {results.map((r) => (
              <div key={r.index} className="flex items-center gap-2 text-sm">
                {r.success ? (
                  <>
                    <Badge variant="success">Created</Badge>
                    <span>{parsed?.[r.index]?.fullName} → {r.studentCode}</span>
                  </>
                ) : (
                  <>
                    <Badge variant="danger">Failed</Badge>
                    <span>{parsed?.[r.index]?.fullName}: {r.error}</span>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function LegacyImportPage() {
  const qc = useQueryClient();
  const { currentCenter } = useAuth();
  const { data: batches, isLoading: loadingBatches } = useQuery({ queryKey: ["batches"], queryFn: listBatches });
  const { data: centers } = useQuery({ queryKey: ["centers-assignable"], queryFn: listAssignableCenters, enabled: !currentCenter });

  const [batchId, setBatchId] = useState<string | null>(null);
  const [centerId, setCenterId] = useState<string | null>(null);

  const batch = batches?.find((b) => b.id === batchId) ?? null;
  const resolvedCenterId = currentCenter?.id ?? centerId ?? batch?.centerId ?? null;

  function handleSelectBatch(id: string) {
    setBatchId(id);
    const b = batches?.find((x) => x.id === id);
    if (b?.centerId && !currentCenter) setCenterId(b.centerId);
  }

  const ready = !!batchId && !!resolvedCenterId;

  function handleImported() {
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["batches"] });
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-7 py-5 bg-white" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <h1 className="text-xl font-bold text-gray-900">Legacy Student Import</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Backfill students and their historical payment records from paper registers into an existing batch.
        </p>
      </div>

      <div className="p-6 space-y-6 max-w-5xl">
        <Card>
          <CardHeader><CardTitle className="text-sm">Target Batch</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <FormField label="Batch" required>
              {loadingBatches ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={batchId ?? "__none__"} onValueChange={handleSelectBatch}>
                  <SelectTrigger><SelectValue placeholder="Select a batch" /></SelectTrigger>
                  <SelectContent>
                    {(batches ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name} — {b.course.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            {!currentCenter && (
              <FormField label="Center" required>
                <Select value={resolvedCenterId ?? "__none__"} onValueChange={setCenterId}>
                  <SelectTrigger><SelectValue placeholder="Select a center" /></SelectTrigger>
                  <SelectContent>
                    {(centers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </CardContent>
          {batch && (
            <CardContent className="pt-0 text-xs text-gray-400">
              Course fee: {formatMoney(Number(batch.course.defaultFee))} · Capacity: {batch.enrolledCount}/{batch.capacity}
            </CardContent>
          )}
        </Card>

        {ready ? (
          <Tabs defaultValue="single">
            <TabsList>
              <TabsTrigger value="single"><Plus className="mr-2 h-4 w-4" />Single Entry</TabsTrigger>
              <TabsTrigger value="bulk"><Upload className="mr-2 h-4 w-4" />Bulk Paste (JSON)</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <SingleEntryForm
                    batchId={batchId!}
                    centerId={resolvedCenterId!}
                    defaultCourseId={batch?.course.id ?? ""}
                    defaultTotalFee={Number(batch?.course.defaultFee ?? 0)}
                    onImported={handleImported}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bulk" className="mt-4">
              <BulkPasteForm
                batchId={batchId!}
                centerId={resolvedCenterId!}
                defaultTotalFee={Number(batch?.course.defaultFee ?? 0)}
                onImported={handleImported}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-sm text-gray-400">Select a batch{!currentCenter ? " and center" : ""} to begin.</p>
        )}
      </div>
    </div>
  );
}

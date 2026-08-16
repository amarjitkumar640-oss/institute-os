import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Plus, Search, Users, CheckCircle2, BookOpen, Users2,
  GraduationCap, Phone, Building2, Sun, Sunset, Moon,
  Banknote, CreditCard, ArrowLeft, ArrowRight,
} from "lucide-react";
import { listStudents, admitStudent, type Student } from "@/api/students";
import { getAdmissionApplication, type AdmissionApplication } from "@/api/admissionApplications";
import { listAssignableCenters } from "@/api/centers";
import { listBatches } from "@/api/batches";
import { listCourses, type Course } from "@/api/courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { formatDate, initials } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

// ── Types ──────────────────────────────────────────────────────────────────────

type Gender          = "male" | "female";
type Qualification   = "class10" | "class12" | "graduation" | "post_graduation";
type CoursePreference = "ssc" | "banking" | "railway" | "foundation" | "others";
type DurationPref    = "3months" | "6months" | "1year";
type PreferredTiming = "morning" | "midday" | "evening";
type PaymentMode     = "cash" | "online";

interface FormErrors { [key: string]: string }

const STEPS = ["Personal", "Family", "Academic", "Contact", "Office"] as const;

// ── Step progress bar ─────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center px-1 py-4">
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors",
                  done   && "bg-[var(--color-primary,#7C3AED)] border-[var(--color-primary,#7C3AED)] text-white",
                  active && "border-[var(--color-primary,#7C3AED)] text-[var(--color-primary,#7C3AED)] bg-white",
                  !done && !active && "border-gray-200 text-gray-400 bg-white"
                )}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-semibold whitespace-nowrap",
                  active ? "text-[var(--color-primary,#7C3AED)]" : done ? "text-[var(--color-primary,#7C3AED)]" : "text-gray-400"
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("flex-1 h-0.5 mb-5 mx-1", done ? "bg-[var(--color-primary,#7C3AED)]" : "bg-gray-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Option pills ──────────────────────────────────────────────────────────────

function OptionPills<T extends string>({
  options, value, onSelect, color = "var(--color-primary,#7C3AED)",
}: {
  options: { key: T; label: string }[];
  value: T | null | undefined;
  onSelect: (k: T) => void;
  color?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-[1.5px] transition-colors",
              active ? "text-white" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            )}
            style={active ? { background: color, borderColor: color } : {}}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Card selector (duration / timing / payment) ───────────────────────────────

function CardSelector<T extends string>({
  options, value, onSelect,
}: {
  options: { key: T; icon: React.ReactNode; label: string; sub: string }[];
  value: T | null | undefined;
  onSelect: (k: T) => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(({ key, icon, label, sub }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-2.5 py-2 px-3 rounded-xl border-[1.5px] text-left transition-colors",
              active
                ? "border-[var(--color-primary,#7C3AED)] bg-[var(--color-primary,#7C3AED)]/5"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            )}
          >
            <span
              className={cn(
                "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center",
                active ? "bg-[var(--color-primary,#7C3AED)]/10 text-[var(--color-primary,#7C3AED)]" : "bg-gray-100 text-gray-400"
              )}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <p className={cn("text-xs font-bold leading-none", active ? "text-[var(--color-primary,#7C3AED)]" : "text-gray-700")}>{label}</p>
              <p className={cn("text-[10px] mt-0.5", active ? "text-[var(--color-primary,#7C3AED)]/70" : "text-gray-400")}>{sub}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Qualification grid ────────────────────────────────────────────────────────

const QUAL_OPTS: { key: Qualification; icon: React.ReactNode; label: string; sub: string }[] = [
  { key: "class10",         icon: <BookOpen className="h-5 w-5" />,      label: "Class 10",        sub: "Secondary"         },
  { key: "class12",         icon: <GraduationCap className="h-5 w-5" />, label: "Class 12",        sub: "Senior Secondary"  },
  { key: "graduation",      icon: <GraduationCap className="h-5 w-5" />, label: "Graduation",      sub: "Bachelor's"        },
  { key: "post_graduation", icon: <GraduationCap className="h-5 w-5" />, label: "Post Grad",       sub: "Master's"          },
];

function QualGrid({ value, onSelect }: { value: Qualification | null | undefined; onSelect: (k: Qualification) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {QUAL_OPTS.map(({ key, icon, label, sub }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-2.5 py-2 px-3 rounded-xl border-[1.5px] text-left transition-colors",
              active
                ? "border-[var(--color-accent,#0EA5E9)] bg-[var(--color-accent,#0EA5E9)]/5"
                : "border-gray-200 bg-white hover:border-gray-300"
            )}
          >
            <span
              className={cn(
                "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center",
                active ? "bg-[var(--color-accent,#0EA5E9)]/10 text-[var(--color-accent,#0EA5E9)]" : "bg-gray-100 text-gray-400"
              )}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <p className={cn("text-xs font-bold leading-none", active ? "text-[var(--color-accent,#0EA5E9)]" : "text-gray-700")}>{label}</p>
              <p className={cn("text-[10px] mt-0.5", active ? "text-[var(--color-accent,#0EA5E9)]/70" : "text-gray-400")}>{sub}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
      {icon} {label}
    </div>
  );
}

// ── Admit Student Dialog (multi-step) ─────────────────────────────────────────

function AdmitStudentDialog({
  open, onClose, initialApplication,
}: {
  open: boolean;
  onClose: () => void;
  initialApplication?: AdmissionApplication | null;
}) {
  const { currentCenter } = useAuth();
  const qc = useQueryClient();

  const { data: batches }      = useQuery({ queryKey: ["batches"], queryFn: listBatches });
  const { data: centers }      = useQuery({ queryKey: ["centers-assignable"], queryFn: listAssignableCenters, enabled: !currentCenter });
  const { data: coursesData }  = useQuery({ queryKey: ["courses"], queryFn: () => listCourses() });
  const allCourses = coursesData?.data ?? [];

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [admitted, setAdmitted] = useState<{ studentCode: string; fullName: string; batchName?: string } | null>(null);

  // ── Step 1: Personal ──
  const [fullName, setFullName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [dob, setDob]             = useState("");
  const [gender, setGender]       = useState<Gender | null>(null);
  const [aadhaar, setAadhaar]     = useState("");
  const [address, setAddress]     = useState("");

  // ── Step 2: Family ──
  const [fatherName, setFatherName]             = useState("");
  const [motherName, setMotherName]             = useState("");
  const [guardianOccupation, setGuardianOccupation] = useState("");
  const [email, setEmail]                       = useState("");

  // ── Step 3: Academic ──
  const [selectedCourseId, setSelectedCourseId]     = useState<string | null>(null);
  const [courseSearch, setCourseSearch]             = useState("");
  const [coursePreference, setCoursePreference]     = useState<CoursePreference | null>(null);
  const [durationPreference, setDurationPreference] = useState<DurationPref | null>(null);
  const [qualification, setQualification]           = useState<Qualification | null>(null);
  const [passYear, setPassYear]                     = useState("");
  const [board, setBoard]                           = useState("");

  // ── Step 4: Contact ──
  const [whatsapp, setWhatsapp]           = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [tcAcknowledged, setTcAcknowledged] = useState(false);
  const [applicantAcceptedTc, setApplicantAcceptedTc] = useState(false);

  // ── Step 5: Office ──
  const [batchId, setBatchId]           = useState<string | null>(null);
  const [preferredTiming, setPreferredTiming] = useState<PreferredTiming | null>(null);
  const [paymentMode, setPaymentMode]   = useState<PaymentMode | null>(null);
  const [amountPaid, setAmountPaid]     = useState("");
  const [centerId, setCenterId]         = useState<string | null>(null);

  // Prefill from a self-service AdmissionApplication opened via "Review" —
  // only the student-fillable fields; office-use ones (batch/payment/etc.)
  // are still left for frontdesk to fill in here.
  useEffect(() => {
    if (!initialApplication) return;
    setFullName(initialApplication.fullName);
    setPhone(initialApplication.phone);
    setEmail(initialApplication.email ?? "");
    setDob(initialApplication.dob ? initialApplication.dob.slice(0, 10) : "");
    setAddress(initialApplication.address ?? "");
    setGender((initialApplication.gender as Gender | null) ?? null);
    setFatherName(initialApplication.fatherName ?? "");
    setMotherName(initialApplication.motherName ?? "");
    setGuardianOccupation(initialApplication.guardianOccupation ?? "");
    setGuardianPhone(initialApplication.guardianPhone ?? "");
    setQualification((initialApplication.qualification as Qualification | null) ?? null);
    setPassYear(initialApplication.passYear ?? "");
    setBoard(initialApplication.board ?? "");
    setWhatsapp(initialApplication.whatsapp ?? "");
    setSelectedCourseId(initialApplication.courseId ?? null);
    setCoursePreference((initialApplication.coursePreference as CoursePreference | null) ?? null);
    setDurationPreference((initialApplication.durationPreference as DurationPref | null) ?? null);
    // Applicant's preferred center — still just a starting point for the
    // Office step below; frontdesk can change it before admitting.
    if (initialApplication.centerId) setCenterId(initialApplication.centerId);
    // The applicant already accepted terms themselves when they submitted
    // the public form — no need to make frontdesk re-tick this (still
    // editable, e.g. if they want to walk through the terms again in person).
    if (initialApplication.tcAcceptedAt) {
      setTcAcknowledged(true);
      setApplicantAcceptedTc(true);
    }
  }, [initialApplication]);

  function clearError(key: string) {
    setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
  }

  function handleCourseSelect(course: Course) {
    setSelectedCourseId(course.id);
    setCoursePreference((course.examCategories[0]?.key ?? null) as CoursePreference | null);
    const mo = course.durationMonths;
    setDurationPreference(mo <= 3 ? "3months" : mo <= 6 ? "6months" : "1year");
    clearError("coursePreference");
  }

  function validateStep(): boolean {
    const errs: FormErrors = {};
    if (step === 0) {
      if (!fullName.trim())  errs.fullName = "Full name is required.";
      if (!phone.trim())     errs.phone    = "Phone number is required.";
      else if (!/^\d{7,15}$/.test(phone.trim())) errs.phone = "Enter a valid phone number (7–15 digits).";
    }
    if (step === 1) {
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    }
    if (step === 2) {
      if (!coursePreference) errs.coursePreference = "Please select a course.";
      if (!qualification)    errs.qualification    = "Please select your highest qualification.";
      if (passYear.trim() && !/^\d{4}$/.test(passYear.trim())) errs.passYear = "Enter a valid 4-digit pass year.";
    }
    if (step === 3) {
      if (!tcAcknowledged) errs.tcAcknowledged = "Please confirm the student has been informed of the terms.";
    }
    if (step === 4) {
      if (amountPaid.trim() && isNaN(Number(amountPaid))) errs.amountPaid = "Enter a valid amount.";
      if (amountPaid.trim() && Number(amountPaid) > 0 && !paymentMode) errs.paymentMode = "Select payment mode when recording a payment.";
      if (!currentCenter && !centerId) errs.centerId = "Please select a center.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (!validateStep()) return;
    setStep((s) => s + 1);
  }

  function handlePrev() {
    setErrors({});
    setStep((s) => s - 1);
  }

  async function handleSubmit() {
    if (!validateStep()) return;
    setLoading(true);
    try {
      const result = await admitStudent({
        fullName: fullName.trim(),
        phone:    phone.trim(),
        email:    email.trim() || undefined,
        dob:      dob ? new Date(dob) : undefined,
        address:  address.trim() || undefined,
        aadhaar:  aadhaar.trim() || undefined,
        gender:   gender ?? undefined,
        fatherName:         fatherName.trim() || undefined,
        motherName:         motherName.trim() || undefined,
        guardianOccupation: guardianOccupation.trim() || undefined,
        guardianPhone:      guardianPhone.trim() || undefined,
        qualification:      qualification ?? undefined,
        passYear:           passYear.trim() || undefined,
        board:              board.trim() || undefined,
        courseId:           selectedCourseId ?? undefined,
        coursePreference:   coursePreference ?? undefined,
        durationPreference: durationPreference ?? undefined,
        whatsapp:           whatsapp.trim() || undefined,
        batchId:            batchId ?? undefined,
        preferredTiming:    preferredTiming ?? undefined,
        paymentMode:        paymentMode ?? undefined,
        amountPaid:         amountPaid.trim() ? Number(amountPaid) : undefined,
        tcAcknowledged,
        centerId:           centerId ?? undefined,
        applicationId:      initialApplication?.id ?? undefined,
      });

      qc.invalidateQueries({ queryKey: ["students"] });
      if (initialApplication) qc.invalidateQueries({ queryKey: ["admission-applications"] });
      const selectedBatch = (batches ?? []).find((b) => b.id === batchId);
      setAdmitted({
        studentCode: result.student.studentCode,
        fullName:    result.student.fullName,
        batchName:   selectedBatch?.name,
      });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to admit student";
      toast({ variant: "destructive", title: msg });
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setStep(0); setAdmitted(null); setErrors({});
    setFullName(""); setPhone(""); setDob(""); setGender(null); setAadhaar(""); setAddress("");
    setFatherName(""); setMotherName(""); setGuardianOccupation(""); setEmail("");
    setSelectedCourseId(null); setCourseSearch("");
    setCoursePreference(null); setDurationPreference(null); setQualification(null); setPassYear(""); setBoard("");
    setWhatsapp(""); setGuardianPhone(""); setTcAcknowledged(false);
    setBatchId(null); setPreferredTiming(null); setPaymentMode(null); setAmountPaid(""); setCenterId(null);
    onClose();
  }

  // ── Active batches for the picker ──
  const activeBatches = (batches ?? []).filter((b) => b.status !== "completed");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>Admit New Student</DialogTitle>
        </DialogHeader>

        {/* Success state */}
        {admitted ? (
          <div className="px-6 py-8 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Admission Confirmed!</h3>
              <p className="text-sm text-gray-500 mt-1">Student has been successfully admitted</p>
            </div>
            <div className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 font-medium">Student Code</span>
                <span className="font-bold text-gray-900 font-mono">{admitted.studentCode}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 font-medium">Name</span>
                <span className="font-semibold text-gray-900">{admitted.fullName}</span>
              </div>
              {admitted.batchName && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Batch</span>
                  <span className="font-semibold text-gray-900">{admitted.batchName}</span>
                </div>
              )}
            </div>
            <Button className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <>
            {/* Step bar */}
            <div className="px-6 pb-0">
              <StepBar current={step} />
            </div>

            <div className="px-6 pb-6 space-y-5">

              {/* ── Step 1: Personal ── */}
              {step === 0 && (
                <div className="space-y-4">
                  <SectionHead icon={<Users2 className="h-3.5 w-3.5" />} label="Personal Information" />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Full Name" error={errors.fullName ? { message: errors.fullName } as never : undefined} required>
                      <Input value={fullName} onChange={(e) => { setFullName(e.target.value); clearError("fullName"); }} placeholder="Student's full name" />
                    </FormField>
                    <FormField label="Phone" error={errors.phone ? { message: errors.phone } as never : undefined} required>
                      <Input value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "")); clearError("phone"); }} placeholder="10-digit mobile" />
                    </FormField>
                    <FormField label="Date of Birth">
                      <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                    </FormField>
                    <FormField label="Aadhaar Number">
                      <Input value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="12-digit Aadhaar" />
                    </FormField>
                  </div>
                  <FormField label="Gender">
                    <OptionPills
                      options={[{ key: "male" as Gender, label: "Male" }, { key: "female" as Gender, label: "Female" }]}
                      value={gender}
                      onSelect={setGender}
                    />
                  </FormField>
                  <FormField label="Address">
                    <Textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Full address"
                      rows={2}
                    />
                  </FormField>
                </div>
              )}

              {/* ── Step 2: Family ── */}
              {step === 1 && (
                <div className="space-y-4">
                  <SectionHead icon={<Users className="h-3.5 w-3.5" />} label="Family Information" />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Father's Name">
                      <Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} placeholder="Father's full name" />
                    </FormField>
                    <FormField label="Mother's Name">
                      <Input value={motherName} onChange={(e) => setMotherName(e.target.value)} placeholder="Mother's full name" />
                    </FormField>
                    <FormField label="Guardian Occupation">
                      <Input value={guardianOccupation} onChange={(e) => setGuardianOccupation(e.target.value)} placeholder="e.g. Farmer, Teacher" />
                    </FormField>
                    <FormField label="Email" error={errors.email ? { message: errors.email } as never : undefined}>
                      <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); clearError("email"); }} placeholder="email@example.com" />
                    </FormField>
                  </div>
                </div>
              )}

              {/* ── Step 3: Academic ── */}
              {step === 2 && (
                <div className="space-y-5">
                  <SectionHead icon={<GraduationCap className="h-3.5 w-3.5" />} label="Academic & Course Details" />

                  <div>
                    <p className={cn("text-xs font-semibold mb-1.5", errors.coursePreference ? "text-red-600" : "text-gray-600")}>
                      Course Applied For <span className="text-red-500">*</span>
                    </p>

                    {/* Search */}
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                      <Input
                        className="pl-8 h-8 text-xs"
                        placeholder="Search courses…"
                        value={courseSearch}
                        onChange={(e) => setCourseSearch(e.target.value)}
                      />
                    </div>

                    {/* Course grid */}
                    <div className={cn(
                      "grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-0.5 rounded-xl border p-2",
                      errors.coursePreference ? "border-red-300" : "border-gray-200"
                    )}>
                      {allCourses.length === 0 ? (
                        <div className="col-span-2 flex gap-2 py-2">
                          {[1,2,3,4].map(i => <div key={i} className="h-20 flex-1 rounded-xl bg-gray-100 animate-pulse" />)}
                        </div>
                      ) : (() => {
                        const filtered = allCourses.filter((c) =>
                          c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
                          (c.examCategories.length ? c.examCategories.map(e => e.label).join(", ") : "General").toLowerCase().includes(courseSearch.toLowerCase())
                        );
                        return filtered.length === 0 ? (
                          <div className="col-span-2 py-6 text-center text-xs text-gray-400">No courses found</div>
                        ) : filtered.map((course) => {
                          const color    = course.examCategories[0]?.color ?? "#7C3AED";
                          const catLabel = course.examCategories.length
                            ? course.examCategories.map(e => e.label).join(", ")
                            : "General";
                          const sel = selectedCourseId === course.id;
                          return (
                            <button
                              key={course.id}
                              type="button"
                              onClick={() => handleCourseSelect(course)}
                              className={cn(
                                "rounded-xl border-[1.5px] p-2.5 text-left transition-colors",
                                sel ? "border-current" : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white"
                              )}
                              style={sel ? { borderColor: color, background: color + "0A" } : undefined}
                            >
                              <div className="flex items-start justify-between gap-1 mb-1">
                                <p
                                  className="text-xs font-bold leading-snug line-clamp-2 flex-1"
                                  style={sel ? { color } : { color: "#111827" }}
                                >
                                  {course.name}
                                </p>
                                {sel && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color }} />}
                              </div>
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide leading-none"
                                style={{ background: color + "18", color }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                                {catLabel}
                              </span>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[10px] text-gray-400">{course.durationMonths}mo</span>
                                {course.defaultFee > 0 && (
                                  <span className="text-[10px] text-green-600 font-semibold">
                                    ₹{(course.defaultFee / 1000).toFixed(0)}k
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>

                    {errors.coursePreference && (
                      <p className="text-xs text-red-600 mt-1">{errors.coursePreference}</p>
                    )}
                  </div>

                  <FormField label="Highest Qualification" error={errors.qualification ? { message: errors.qualification } as never : undefined} required>
                    <QualGrid value={qualification} onSelect={(k) => { setQualification(k); clearError("qualification"); }} />
                  </FormField>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Pass Year" error={errors.passYear ? { message: errors.passYear } as never : undefined}>
                      <Input
                        value={passYear}
                        onChange={(e) => { setPassYear(e.target.value.replace(/\D/g, "").slice(0, 4)); clearError("passYear"); }}
                        placeholder="e.g. 2022"
                      />
                    </FormField>
                    <FormField label="Board / University">
                      <Input value={board} onChange={(e) => setBoard(e.target.value)} placeholder="e.g. CBSE, Delhi Univ." />
                    </FormField>
                  </div>
                </div>
              )}

              {/* ── Step 4: Contact & T&C ── */}
              {step === 3 && (
                <div className="space-y-4">
                  <SectionHead icon={<Phone className="h-3.5 w-3.5" />} label="Contact &amp; Terms" />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="WhatsApp Number">
                      <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ""))} placeholder="WhatsApp number" />
                    </FormField>
                    <FormField label="Guardian Phone">
                      <Input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value.replace(/\D/g, ""))} placeholder="Parent / guardian phone" />
                    </FormField>
                  </div>

                  {/* Terms & Conditions */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Terms &amp; Conditions</p>
                    <ul className="text-xs text-amber-900 space-y-1.5 list-decimal list-inside">
                      <li>The admission fee and course fee once paid are strictly non-refundable.</li>
                      <li>Admission is subject to availability of seats in the selected batch.</li>
                      <li>The institute reserves the right to change batch timings without prior notice.</li>
                      <li>Students must maintain regular attendance. Irregular attendance will not entitle them to any refund.</li>
                      <li>Any misconduct will result in immediate cancellation of admission without refund.</li>
                    </ul>
                  </div>

                  <label className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border-[1.5px] cursor-pointer transition-colors",
                    tcAcknowledged ? "border-green-400 bg-green-50" : "border-gray-200 bg-white"
                  )}>
                    <input
                      type="checkbox"
                      checked={tcAcknowledged}
                      onChange={(e) => { setTcAcknowledged(e.target.checked); clearError("tcAcknowledged"); }}
                      className="mt-0.5 h-4 w-4 rounded accent-green-600"
                    />
                    <span className="text-xs font-medium text-gray-700">
                      I confirm that the student / parent has been informed of and has agreed to all the above terms and conditions.
                    </span>
                  </label>
                  {applicantAcceptedTc && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Applicant already accepted these terms when they applied online
                    </p>
                  )}
                  {errors.tcAcknowledged && <p className="text-xs text-red-600">{errors.tcAcknowledged}</p>}
                </div>
              )}

              {/* ── Step 5: Office ── */}
              {step === 4 && (
                <div className="space-y-5">
                  <SectionHead icon={<Building2 className="h-3.5 w-3.5" />} label="Office &amp; Enrollment" />

                  <FormField label="Assign to Batch">
                    <Select value={batchId ?? "__none__"} onValueChange={(v) => setBatchId(v === "__none__" ? null : v)}>
                      <SelectTrigger><SelectValue placeholder="Select batch (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Assign later</SelectItem>
                        {activeBatches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name} · {b.enrolledCount}/{b.capacity} seats
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Preferred Timing">
                    <CardSelector
                      options={[
                        { key: "morning" as PreferredTiming, icon: <Sun className="h-5 w-5" />,    label: "Morning", sub: "6am – 10am"  },
                        { key: "midday"  as PreferredTiming, icon: <Sunset className="h-5 w-5" />, label: "Mid Day", sub: "11am – 2pm"  },
                        { key: "evening" as PreferredTiming, icon: <Moon className="h-5 w-5" />,   label: "Evening", sub: "4pm – 8pm"   },
                      ]}
                      value={preferredTiming}
                      onSelect={setPreferredTiming}
                    />
                  </FormField>

                  <FormField label="Payment Mode" error={errors.paymentMode ? { message: errors.paymentMode } as never : undefined}>
                    <CardSelector
                      options={[
                        { key: "cash"   as PaymentMode, icon: <Banknote className="h-5 w-5" />,    label: "Cash",   sub: "Collect physically"  },
                        { key: "online" as PaymentMode, icon: <CreditCard className="h-5 w-5" />, label: "Online", sub: "UPI / NEFT / IMPS"    },
                      ]}
                      value={paymentMode}
                      onSelect={(k) => { setPaymentMode(k); clearError("paymentMode"); }}
                    />
                  </FormField>

                  <FormField label="Amount Paid (₹)" error={errors.amountPaid ? { message: errors.amountPaid } as never : undefined}>
                    <Input
                      type="number" min={0}
                      value={amountPaid}
                      onChange={(e) => { setAmountPaid(e.target.value); clearError("amountPaid"); }}
                      placeholder="0"
                    />
                  </FormField>

                  {!currentCenter && (
                    <FormField label="Center" error={errors.centerId ? { message: errors.centerId } as never : undefined} required>
                      <Select value={centerId ?? ""} onValueChange={(v) => { setCenterId(v); clearError("centerId"); }}>
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
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-2 border-t border-gray-100">
                {step > 0 ? (
                  <Button type="button" variant="outline" onClick={handlePrev}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                ) : <div />}

                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={handleNext}>
                    Next <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleSubmit} disabled={loading}>
                    {loading ? "Admitting…" : "Admit Student"}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Students Page ─────────────────────────────────────────────────────────────

export function StudentsPage() {
  const navigate  = useNavigate();
  const { isAllCenters } = useAuth();
  const [search, setSearch]     = useState("");
  const [showAdmit, setShowAdmit] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const applicationId = searchParams.get("applicationId");

  const { data: students, isLoading } = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });

  // Opened via "Review" from the Admission Applications inbox (/students?applicationId=…)
  const { data: reviewingApplication } = useQuery({
    queryKey: ["admission-application", applicationId],
    queryFn:  () => getAdmissionApplication(applicationId!),
    enabled:  !!applicationId,
  });

  useEffect(() => {
    if (reviewingApplication) setShowAdmit(true);
  }, [reviewingApplication]);

  function closeAdmitDialog() {
    setShowAdmit(false);
    if (applicationId) setSearchParams({}, { replace: true });
  }

  const filtered = (students ?? []).filter((s) =>
    s.fullName.toLowerCase().includes(search.toLowerCase()) ||
    s.phone.includes(search) ||
    s.studentCode?.toLowerCase().includes(search.toLowerCase())
  );

  // Only meaningful when viewing more than one center's data at once —
  // redundant (every row would show the same name) when scoped to one.
  const centerColumn: ColumnDef<Student> = {
    id: "center",
    header: "Center",
    cell: ({ row }) => row.original.center?.name ?? "—",
  };

  const columns: ColumnDef<Student>[] = [
    {
      accessorKey: "studentCode",
      header: "ID",
      cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.studentCode}</span>,
    },
    {
      accessorKey: "fullName",
      header: "Name",
      cell: ({ row }) => (
        <button className="flex items-center gap-3 text-left" onClick={() => navigate(`/students/${row.original.id}`)}>
          <div
            className="h-9 w-9 rounded-2xl flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ background: "var(--color-primary,#7C3AED)" }}
          >
            {initials(row.original.fullName)}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm hover:text-[var(--color-primary,#7C3AED)] transition-colors">
              {row.original.fullName}
            </p>
            <p className="text-xs text-gray-400">{row.original.phone}</p>
          </div>
        </button>
      ),
    },
    {
      id: "course",
      header: "Course Applied For",
      cell: ({ row }) => {
        const label = row.original.course?.name ?? row.original.coursePreference?.toUpperCase() ?? null;
        return label ? <Badge variant="info">{label}</Badge> : <span className="text-gray-400">—</span>;
      },
    },
    {
      id: "batch",
      header: "Batch",
      cell: ({ row }) => row.original.activeEnrollment
        ? <span className="text-sm">{row.original.activeEnrollment.batchName}</span>
        : <span className="text-gray-400 text-sm">Not enrolled</span>,
    },
    ...(isAllCenters ? [centerColumn] : []),
    {
      accessorKey: "createdAt",
      header: "Admitted",
      cell: ({ row }) => <span className="text-sm text-gray-500">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" onClick={() => navigate(`/students/${row.original.id}`)}>View</Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Students</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage student profiles and enrollments</p>
        </div>
        <Button onClick={() => setShowAdmit(true)}>
          <Plus className="mr-2 h-4 w-4" /> Admit Student
        </Button>
      </div>
      <div className="flex-1 p-7 space-y-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search by name, phone, or ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="text-sm text-gray-500">{filtered.length} students</span>
        </div>
        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="No students found" description="Admit your first student to get started" actionLabel="Admit Student" onAction={() => setShowAdmit(true)} />
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </div>
      <AdmitStudentDialog open={showAdmit} onClose={closeAdmitDialog} initialApplication={reviewingApplication} />
    </div>
  );
}

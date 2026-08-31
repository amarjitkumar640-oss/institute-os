import { useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, GraduationCap, Loader2 } from "lucide-react";
import { getTenantBySlug } from "@/api/auth";
import { listPublicCourses, listPublicCenters, submitAdmissionApplication, type PublicCourse } from "@/api/publicAdmissions";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Gender = "male" | "female";
type Qualification = "class10" | "class12" | "graduation" | "post_graduation";
type CoursePreference = "ssc" | "banking" | "railway" | "foundation" | "others";
type DurationPref = "3months" | "6months" | "1year";

interface FormErrors { [key: string]: string }

// Mirrors the terms shown in the frontdesk Admit Student dialog
// (apps/web/src/modules/students/StudentsPage.tsx) so applicants see the
// same terms frontdesk later confirms they were informed of.
const TERMS = [
  "The admission fee and course fee once paid are strictly non-refundable.",
  "Admission is subject to availability of seats in the selected batch.",
  "The institute reserves the right to change batch timings without prior notice.",
  "Students must maintain regular attendance. Irregular attendance will not entitle them to any refund.",
  "Any misconduct will result in immediate cancellation of admission without refund.",
];

const QUALIFICATIONS: { value: Qualification; label: string }[] = [
  { value: "class10",         label: "Class 10" },
  { value: "class12",         label: "Class 12" },
  { value: "graduation",      label: "Graduation" },
  { value: "post_graduation", label: "Post Graduation" },
];

// Most applicants fill this in on a phone — a wizard keeps each screen short
// instead of one long scroll, and the grid collapses to a single column
// below the `sm` breakpoint so fields stay full-width and easy to tap.
const STEPS = ["Personal", "Family", "Academic", "Terms"] as const;

// iOS Safari (and some Android browsers) auto-zoom the whole page when a
// focused field's rendered text is under 16px — these wrappers bump just
// this public page's fields to 16px so that zoom never triggers, without
// touching the shared Input/Textarea used by the (desktop-oriented) staff
// portal.
function MInput({ className, ...props }: InputProps) {
  return <Input className={cn("text-base", className)} {...props} />;
}
function MTextarea({ className, ...props }: TextareaProps) {
  return <Textarea className={cn("text-base", className)} {...props} />;
}
// Same 16px fix for Select's trigger — Radix positions its portal-rendered
// dropdown from the trigger's bounding box at click time, so a mid-tap
// zoom (triggered by this button's own sub-16px text) can shift that math
// enough that the popover renders somewhere the taps don't actually land.
function MSelectTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof SelectTrigger>) {
  return <SelectTrigger className={cn("text-base", className)} {...props} />;
}

function ProgressBar({ step, primary }: { step: number; primary: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-500">
          Step {step + 1} of {STEPS.length}
        </span>
        <span className="text-xs font-bold" style={{ color: primary }}>{STEPS[step]}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: primary }}
        />
      </div>
    </div>
  );
}

export function ApplyPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useQuery({
    queryKey: ["public-tenant", tenantSlug],
    queryFn:  () => getTenantBySlug(tenantSlug!),
    enabled:  !!tenantSlug,
    retry:    false,
  });

  const { data: courses } = useQuery({
    queryKey: ["public-courses", tenantSlug],
    queryFn:  () => listPublicCourses(tenantSlug!),
    enabled:  !!tenantSlug,
  });

  const { data: centers } = useQuery({
    queryKey: ["public-centers", tenantSlug],
    queryFn:  () => listPublicCenters(tenantSlug!),
    enabled:  !!tenantSlug,
  });

  const primary = tenant?.branding.primary ?? "#7C3AED";
  useEffect(() => {
    document.documentElement.style.setProperty("--color-primary", primary);
  }, [primary]);

  const [step, setStep]       = useState(0);
  const [errors, setErrors]   = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Bots that auto-fill every field on a form fill this one too — real users
  // never see it. Checked server-side before the real fields are validated.
  const [website, setWebsite] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone]       = useState("");
  const [email, setEmail]       = useState("");
  const [dob, setDob]           = useState("");
  const [gender, setGender]     = useState<Gender | null>(null);
  const [address, setAddress]   = useState("");

  const [fatherName, setFatherName]                 = useState("");
  const [motherName, setMotherName]                  = useState("");
  const [guardianPhone, setGuardianPhone]            = useState("");
  const [guardianEmail, setGuardianEmail]            = useState("");
  const [guardianOccupation, setGuardianOccupation]  = useState("");
  const [whatsapp, setWhatsapp]                      = useState("");

  const [selectedCourseId, setSelectedCourseId]         = useState<string | null>(null);
  const [coursePreference, setCoursePreference]         = useState<CoursePreference | null>(null);
  const [durationPreference, setDurationPreference]     = useState<DurationPref | null>(null);
  const [qualification, setQualification]               = useState<Qualification | null>(null);
  const [passYear, setPassYear]                         = useState("");
  const [board, setBoard]                               = useState("");

  const [centerId, setCenterId]     = useState<string | null>(null);
  const [tcAccepted, setTcAccepted] = useState(false);

  // Only one center — no need to ask, just use it silently.
  useEffect(() => {
    if (centers?.length === 1) setCenterId(centers[0].id);
  }, [centers]);

  function clearError(key: string) {
    setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
  }

  function handleCourseSelect(course: PublicCourse) {
    setSelectedCourseId(course.id);
    setCoursePreference((course.examCategories[0]?.key ?? null) as CoursePreference | null);
    const mo = course.durationMonths;
    setDurationPreference(mo <= 3 ? "3months" : mo <= 6 ? "6months" : "1year");
    clearError("courseId");
  }

  function validateStep(s: number): boolean {
    const errs: FormErrors = {};
    if (s === 0) {
      if (!fullName.trim()) errs.fullName = "Full name is required.";
      if (!phone.trim())    errs.phone    = "Phone number is required.";
      else if (!/^\d{7,15}$/.test(phone.trim())) errs.phone = "Enter a valid phone number (7–15 digits).";
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email address.";
      if (!dob)             errs.dob      = "Date of birth is required.";
      if (!gender)          errs.gender   = "Please select a gender.";
      if (!address.trim())  errs.address  = "Address is required.";
    }
    if (s === 1) {
      if (guardianEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail.trim())) errs.guardianEmail = "Enter a valid email address.";
    }
    if (s === 2) {
      if (!selectedCourseId) errs.courseId = "Please select a course.";
      if (!qualification) errs.qualification = "Please select your highest qualification.";
      if (!passYear.trim()) errs.passYear = "Pass-out year is required.";
      else if (!/^\d{4}$/.test(passYear.trim())) errs.passYear = "Enter a valid 4-digit pass year.";
      if (!board.trim()) errs.board = "Board / University is required.";
      if ((centers?.length ?? 0) > 1 && !centerId) errs.centerId = "Please select a center.";
    }
    if (s === 3) {
      if (!tcAccepted) errs.tcAccepted = "Please accept the terms and conditions to continue.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    setStep((s) => s + 1);
  }

  function handleBack() {
    setErrors({});
    setStep((s) => s - 1);
  }

  async function handleSubmit() {
    if (!tenantSlug || !validateStep(step)) return;
    setLoading(true);
    try {
      await submitAdmissionApplication(tenantSlug, {
        website,
        fullName: fullName.trim(),
        phone:    phone.trim(),
        email:    email.trim() || undefined,
        // dob/address/gender are enforced required by validateStep()'s step 0
        // check before the wizard can advance, so they're guaranteed present here.
        dob:      new Date(dob),
        address:  address.trim(),
        gender:   gender as Gender,
        fatherName:         fatherName.trim() || undefined,
        motherName:         motherName.trim() || undefined,
        guardianOccupation: guardianOccupation.trim() || undefined,
        guardianEmail:      guardianEmail.trim() || undefined,
        guardianPhone:      guardianPhone.trim() || undefined,
        qualification:      qualification ?? undefined,
        passYear:           passYear.trim() || undefined,
        board:              board.trim() || undefined,
        courseId:           selectedCourseId ?? undefined,
        coursePreference:   coursePreference ?? undefined,
        durationPreference: durationPreference ?? undefined,
        whatsapp:           whatsapp.trim() || undefined,
        centerId:           centerId ?? undefined,
        tcAccepted,
      });
      setSubmitted(true);
    } catch {
      setErrors({ form: "Something went wrong submitting your application. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F8FE]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F8FE] p-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-900">Organization not found</h1>
          <p className="text-sm text-gray-500 mt-1">Check the link and try again.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F8FE] p-4">
        <Card className="max-w-md w-full text-center p-6 sm:p-8">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: primary }} />
          <h1 className="text-lg font-bold text-gray-900">Application submitted</h1>
          <p className="text-sm text-gray-500 mt-2">
            Thanks, {fullName.trim()}. {tenant.name}'s admissions team will review your application and get in
            touch on {phone.trim()}.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F8FE] py-6 sm:py-10 px-3 sm:px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-5 px-1">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-white font-bold text-sm shrink-0"
            style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
          >
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">{tenant.name}</p>
            <p className="text-xs text-gray-400 leading-tight">Admission Application</p>
          </div>
        </div>

        <Card>
          <CardHeader className="p-4 sm:p-6 pb-0 sm:pb-0">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <GraduationCap className="h-5 w-5 shrink-0" style={{ color: primary }} />
              Apply for admission
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Our admissions team will review this and reach out to complete your enrollment — no payment or
              documents needed right now.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <ProgressBar step={step} primary={primary} />

            <form
              onSubmit={(e) => { e.preventDefault(); step === STEPS.length - 1 ? handleSubmit() : handleNext(); }}
              className="space-y-5"
            >
              {/* Honeypot — hidden from real users */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] w-px h-px opacity-0"
              />

              {step === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Full name" required error={errors.fullName ? { message: errors.fullName, type: "" } as any : undefined} className="sm:col-span-2">
                    <MInput value={fullName} onChange={(e) => { setFullName(e.target.value); clearError("fullName"); }} placeholder="Your full name" />
                  </FormField>
                  <FormField label="Phone number" required error={errors.phone ? { message: errors.phone, type: "" } as any : undefined}>
                    <MInput value={phone} onChange={(e) => { setPhone(e.target.value); clearError("phone"); }} placeholder="10-digit mobile number" />
                  </FormField>
                  <FormField label="Email" error={errors.email ? { message: errors.email, type: "" } as any : undefined}>
                    <MInput value={email} onChange={(e) => { setEmail(e.target.value); clearError("email"); }} placeholder="you@example.com" />
                  </FormField>
                  <FormField label="Date of birth" required error={errors.dob ? { message: errors.dob, type: "" } as any : undefined}>
                    <MInput type="date" value={dob} onChange={(e) => { setDob(e.target.value); clearError("dob"); }} />
                  </FormField>
                  <FormField label="Gender" required error={errors.gender ? { message: errors.gender, type: "" } as any : undefined}>
                    <Select value={gender ?? undefined} onValueChange={(v) => { setGender(v as Gender); clearError("gender"); }}>
                      <MSelectTrigger><SelectValue placeholder="Select" /></MSelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Address" required error={errors.address ? { message: errors.address, type: "" } as any : undefined} className="sm:col-span-2">
                    <MTextarea value={address} onChange={(e) => { setAddress(e.target.value); clearError("address"); }} placeholder="Your current address" />
                  </FormField>
                </div>
              )}

              {step === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Father's name">
                    <MInput value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
                  </FormField>
                  <FormField label="Mother's name">
                    <MInput value={motherName} onChange={(e) => setMotherName(e.target.value)} />
                  </FormField>
                  <FormField label="Guardian phone">
                    <MInput value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} />
                  </FormField>
                  <FormField label="Guardian email" error={errors.guardianEmail ? { message: errors.guardianEmail, type: "" } as any : undefined}>
                    <MInput value={guardianEmail} onChange={(e) => { setGuardianEmail(e.target.value); clearError("guardianEmail"); }} />
                  </FormField>
                  <FormField label="Guardian occupation" className="sm:col-span-2">
                    <MInput value={guardianOccupation} onChange={(e) => setGuardianOccupation(e.target.value)} />
                  </FormField>
                </div>
              )}

              {step === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Course you're interested in" required error={errors.courseId ? { message: errors.courseId, type: "" } as any : undefined} className="sm:col-span-2">
                    <Select
                      value={selectedCourseId ?? undefined}
                      onValueChange={(id) => {
                        const course = courses?.find((c) => c.id === id);
                        if (course) handleCourseSelect(course);
                      }}
                    >
                      <MSelectTrigger><SelectValue placeholder="Select a course" /></MSelectTrigger>
                      <SelectContent>
                        {(courses ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Highest qualification" required error={errors.qualification ? { message: errors.qualification, type: "" } as any : undefined}>
                    <Select value={qualification ?? undefined} onValueChange={(v) => { setQualification(v as Qualification); clearError("qualification"); }}>
                      <MSelectTrigger><SelectValue placeholder="Select" /></MSelectTrigger>
                      <SelectContent>
                        {QUALIFICATIONS.map((q) => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Pass-out year" required error={errors.passYear ? { message: errors.passYear, type: "" } as any : undefined}>
                    <MInput value={passYear} onChange={(e) => { setPassYear(e.target.value); clearError("passYear"); }} placeholder="e.g. 2024" />
                  </FormField>
                  <FormField label="Board / University" required error={errors.board ? { message: errors.board, type: "" } as any : undefined} className="sm:col-span-2">
                    <MInput value={board} onChange={(e) => { setBoard(e.target.value); clearError("board"); }} />
                  </FormField>
                  <FormField label="WhatsApp number">
                    <MInput value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                  </FormField>
                  {(centers?.length ?? 0) > 1 && (
                    <FormField label="Preferred center" required error={errors.centerId ? { message: errors.centerId, type: "" } as any : undefined} className="sm:col-span-2">
                      <Select value={centerId ?? undefined} onValueChange={(v) => { setCenterId(v); clearError("centerId"); }}>
                        <MSelectTrigger><SelectValue placeholder="Which branch would you like to attend?" /></MSelectTrigger>
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

              {step === 3 && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Terms &amp; Conditions</p>
                    <ul className="text-xs text-amber-900 space-y-1.5 list-decimal list-inside">
                      {TERMS.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>

                  <label className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-[1.5px] cursor-pointer transition-colors",
                    tcAccepted ? "border-green-400 bg-green-50" : "border-gray-200 bg-white"
                  )}>
                    <input
                      type="checkbox"
                      checked={tcAccepted}
                      onChange={(e) => { setTcAccepted(e.target.checked); clearError("tcAccepted"); }}
                      className="h-4 w-4 rounded accent-green-600 shrink-0"
                    />
                    <span className="text-xs font-medium text-gray-700">
                      I have read and agree to all the above terms and conditions.
                    </span>
                  </label>
                  {errors.tcAccepted && <p className="text-xs text-red-600">{errors.tcAccepted}</p>}
                </div>
              )}

              {errors.form && <p className="text-sm text-red-500">{errors.form}</p>}

              <div className="flex items-center gap-3 pt-2">
                {step > 0 && (
                  <Button type="button" variant="outline" onClick={handleBack} disabled={loading} className="flex-1 sm:flex-none">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1"
                  disabled={loading || (step === STEPS.length - 1 && !tcAccepted)}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : step === STEPS.length - 1 ? (
                    "Submit application"
                  ) : (
                    <>Next <ArrowRight className="ml-2 h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

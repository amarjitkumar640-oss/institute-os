import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, CheckCircle2, Users2, Users, GraduationCap, Phone, ArrowLeft, ArrowRight } from "lucide-react";
import { updateStudent, type Student } from "@/api/students";
import { listCourses, type Course } from "@/api/courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  type Gender, type Qualification, type CoursePreference, type DurationPref, type FormErrors,
  StepBar, OptionPills, QualGrid, SectionHead,
} from "./formHelpers";

const EDIT_STEPS = ["Personal", "Family", "Academic", "Contact"] as const;

// Same 4-step wizard shape as AdmitStudentDialog (Personal/Family/Academic/
// Contact) — deliberately excludes Admit's 5th "Office" step (batch
// assignment + admission payment), which are one-time admission actions
// that live in the Batches/Fees modules once a student exists, not fields
// you'd revisit here.
export function EditStudentDialog({
  student, open, onClose,
}: {
  student: Student;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: coursesData } = useQuery({ queryKey: ["courses"], queryFn: () => listCourses() });
  const allCourses = coursesData?.data ?? [];

  const [step, setStep]     = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  // ── Step 1: Personal ──
  const [fullName, setFullName] = useState(student.fullName);
  const [phone, setPhone]       = useState(student.phone);
  const [dob, setDob]           = useState(student.dob ? student.dob.slice(0, 10) : "");
  const [gender, setGender]     = useState<Gender | null>(student.gender);
  const [aadhaar, setAadhaar]   = useState(student.aadhaar ?? "");
  const [address, setAddress]   = useState(student.address ?? "");

  // ── Step 2: Family ──
  const [fatherName, setFatherName]                 = useState(student.fatherName ?? "");
  const [motherName, setMotherName]                 = useState(student.motherName ?? "");
  const [guardianOccupation, setGuardianOccupation] = useState(student.guardianOccupation ?? "");
  const [email, setEmail]                           = useState(student.email ?? "");

  // ── Step 3: Academic ──
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(student.courseId);
  const [courseSearch, setCourseSearch]         = useState("");
  const [coursePreference, setCoursePreference] = useState<CoursePreference | null>(student.coursePreference as CoursePreference | null);
  const [durationPreference, setDurationPreference] = useState<DurationPref | null>(student.durationPreference as DurationPref | null);
  const [qualification, setQualification]       = useState<Qualification | null>(student.qualification as Qualification | null);
  const [passYear, setPassYear]                 = useState(student.passYear ?? "");
  const [board, setBoard]                       = useState(student.board ?? "");

  // ── Step 4: Contact ──
  const [whatsapp, setWhatsapp]           = useState(student.whatsapp ?? "");
  const [guardianPhone, setGuardianPhone] = useState(student.guardianPhone ?? "");

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
      if (!qualification)    errs.qualification    = "Please select the highest qualification.";
      if (passYear.trim() && !/^\d{4}$/.test(passYear.trim())) errs.passYear = "Enter a valid 4-digit pass year.";
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

  function handleClose() {
    setStep(0);
    setErrors({});
    onClose();
  }

  async function handleSubmit() {
    if (!validateStep()) return;
    setLoading(true);
    try {
      await updateStudent(student.id, {
        fullName: fullName.trim(),
        phone:    phone.trim(),
        // Explicit null (not undefined) for cleared optional fields — this
        // is an edit, so a blanked-out field should actually clear the
        // column, not be silently dropped from the PATCH body.
        email:              email.trim() || null,
        dob:                dob ? new Date(dob) : null,
        address:            address.trim() || null,
        aadhaar:            aadhaar.trim() || null,
        gender:             gender ?? null,
        fatherName:         fatherName.trim() || null,
        motherName:         motherName.trim() || null,
        guardianOccupation: guardianOccupation.trim() || null,
        guardianPhone:      guardianPhone.trim() || null,
        qualification:      qualification ?? null,
        passYear:           passYear.trim() || null,
        board:              board.trim() || null,
        courseId:           selectedCourseId ?? null,
        coursePreference:   coursePreference ?? null,
        durationPreference: durationPreference ?? null,
        whatsapp:           whatsapp.trim() || null,
      });
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["student", student.id] });
      toast({ title: "Student updated" });
      handleClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast({ variant: "destructive", title: typeof msg === "string" ? msg : "Failed to update student" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>Edit Student</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-0">
          <StepBar current={step} steps={EDIT_STEPS} />
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
                  Course <span className="text-red-500">*</span>
                </p>

                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    className="pl-8 h-8 text-xs"
                    placeholder="Search courses…"
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                  />
                </div>

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

          {/* ── Step 4: Contact ── */}
          {step === 3 && (
            <div className="space-y-4">
              <SectionHead icon={<Phone className="h-3.5 w-3.5" />} label="Contact" />
              <div className="grid grid-cols-2 gap-4">
                <FormField label="WhatsApp Number">
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ""))} placeholder="WhatsApp number" />
                </FormField>
                <FormField label="Guardian Phone">
                  <Input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value.replace(/\D/g, ""))} placeholder="Parent / guardian phone" />
                </FormField>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2 border-t border-gray-100">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={handlePrev}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            ) : <div />}

            {step < EDIT_STEPS.length - 1 ? (
              <Button type="button" onClick={handleNext}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={loading}>
                {loading ? "Saving…" : "Save Changes"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

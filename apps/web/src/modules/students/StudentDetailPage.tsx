import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateStudentSchema, type UpdateStudentInput } from "@institute-os/shared";
import { getStudent, updateStudent } from "@/api/students";
import { listCourses, type Course } from "@/api/courses";
import { getStudentEnrollments } from "@/api/enrollments";
import { getFeeSchedule } from "@/api/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/FormField";
import { toast } from "@/components/ui/use-toast";
import { formatDate, formatCurrency, titleCase } from "@/lib/utils";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="w-40 shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value ?? "—"}</span>
    </div>
  );
}

function EditStudentDialog({ studentId, open, onClose }: { studentId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: student } = useQuery({ queryKey: ["student", studentId], queryFn: () => getStudent(studentId) });

  const [courses, setCourses] = useState<Course[]>([]);
  const [courseSearch, setCourseSearch] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(null);

  useEffect(() => {
    if (open) listCourses().then((r) => setCourses(r.data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (student && courses.length > 0 && !selectedCourseId) {
      // Prefer courseId FK; fall back to matching by coursePreference for old records
      const match = student.courseId
        ? courses.find((c) => c.id === student.courseId)
        : courses.find((c) => c.examCategories[0]?.key === student.coursePreference);
      if (match) { setSelectedCourseId(match.id); setSelectedCourseName(match.name); }
    }
  }, [student, courses]);

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<UpdateStudentInput>({
    resolver: zodResolver(updateStudentSchema),
    values: student ? {
      fullName: student.fullName,
      phone: student.phone,
      email: student.email ?? undefined,
      address: student.address ?? undefined,
      guardianPhone: student.guardianPhone ?? undefined,
      fatherName: student.fatherName ?? undefined,
      motherName: student.motherName ?? undefined,
      gender: student.gender ?? undefined,
      courseId: student.courseId ?? undefined,
      coursePreference: (student.coursePreference ?? undefined) as "ssc" | "banking" | "railway" | "foundation" | "others" | undefined,
      durationPreference: (student.durationPreference ?? undefined) as "3months" | "6months" | "1year" | undefined,
    } : undefined,
  });

  function handleCourseSelect(course: Course) {
    setSelectedCourseId(course.id);
    setSelectedCourseName(course.name);
    setCourseSearch("");
    setValue("courseId", course.id as any);
    setValue("coursePreference", (course.examCategories[0]?.key ?? null) as any);
    const mo = course.durationMonths;
    setValue("durationPreference", (mo <= 3 ? "3months" : mo <= 6 ? "6months" : "1year") as any);
  }

  const filteredCourses = courseSearch
    ? courses.filter((c) => c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
        (c.examCategories[0]?.label ?? "").toLowerCase().includes(courseSearch.toLowerCase()))
    : [];

  const mutation = useMutation({
    mutationFn: (d: UpdateStudentInput) => updateStudent(studentId, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student", studentId] });
      qc.invalidateQueries({ queryKey: ["students"] });
      toast({ title: "Student updated" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Student</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Full Name" error={errors.fullName} required>
              <Input {...register("fullName")} />
            </FormField>
            <FormField label="Phone" error={errors.phone}>
              <Input {...register("phone")} />
            </FormField>
            <FormField label="Email" error={errors.email}>
              <Input {...register("email")} type="email" />
            </FormField>
            <FormField label="Guardian Phone" error={errors.guardianPhone}>
              <Input {...register("guardianPhone")} />
            </FormField>
            <FormField label="Father Name" error={errors.fatherName}>
              <Input {...register("fatherName")} />
            </FormField>
            <FormField label="Mother Name" error={errors.motherName}>
              <Input {...register("motherName")} />
            </FormField>
            <FormField label="Gender" error={errors.gender} className="col-span-2">
              <Select
                defaultValue={student?.gender ?? undefined}
                onValueChange={(v) => setValue("gender", v as "male" | "female")}
              >
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {/* Course Preference */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Course Preference</p>
            {selectedCourseName && (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: courses.find((c) => c.id === selectedCourseId)?.examCategories[0]?.color ?? "#6B7280" }}
                />
                <span className="flex-1 text-sm font-medium text-gray-900">{selectedCourseName}</span>
                <span className="text-xs text-gray-400">
                  {courses.find((c) => c.id === selectedCourseId)?.examCategories[0]?.label} ·{" "}
                  {courses.find((c) => c.id === selectedCourseId)?.durationMonths}mo
                </span>
                <button
                  type="button"
                  onClick={() => { setSelectedCourseId(null); setSelectedCourseName(null); setValue("courseId" as any, undefined); setValue("coursePreference", undefined); setValue("durationPreference", undefined); }}
                  className="text-gray-400 hover:text-gray-600 text-sm leading-none"
                >✕</button>
              </div>
            )}
            <Input
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder={selectedCourseName ? "Search to change course…" : "Search courses…"}
            />
            {filteredCourses.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
                {filteredCourses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => handleCourseSelect(course)}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors ${selectedCourseId === course.id ? "bg-blue-50" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: course.examCategories[0]?.color ?? "#6B7280" }}
                      />
                      <span className="text-sm font-medium text-gray-900">{course.name}</span>
                    </div>
                    <p className="mt-0.5 pl-4 text-xs text-gray-400">
                      {course.examCategories[0]?.label ?? "General"} · {course.durationMonths}mo
                      {course.defaultFee > 0 ? ` · ₹${(course.defaultFee / 1000).toFixed(0)}k` : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {courseSearch && filteredCourses.length === 0 && (
              <p className="text-xs text-gray-400 px-1">No courses match "{courseSearch}"</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeeTab({ studentId }: { studentId: string }) {
  const { data: enrollments } = useQuery({
    queryKey: ["enrollments", studentId],
    queryFn: () => getStudentEnrollments(studentId),
  });

  const firstEnrollmentId = enrollments?.[0]?.id;

  const { data: feeSchedule } = useQuery({
    queryKey: ["fee-schedule", firstEnrollmentId],
    queryFn: () => getFeeSchedule(firstEnrollmentId!),
    enabled: !!firstEnrollmentId,
  });

  if (!enrollments) return <Skeleton className="h-32 w-full" />;
  if (enrollments.length === 0) return (
    <div className="py-8 text-center text-gray-400 text-sm">No enrollments found</div>
  );

  if (!feeSchedule) return (
    <div className="py-8 text-center text-gray-400 text-sm">No fee schedule generated yet</div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Fee</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(feeSchedule.totalFee)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Effective Fee</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(feeSchedule.effectiveFee)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
            <Badge variant={feeSchedule.status === "completed" ? "success" : feeSchedule.status === "overdue" ? "danger" : "info"} className="mt-1">
              {feeSchedule.status}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {feeSchedule.installments && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Installments</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Label</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Due</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Amount</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Paid</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {feeSchedule.installments.map((inst) => (
                  <tr key={inst.id} className="border-t border-gray-50">
                    <td className="px-4 py-2">{inst.label}</td>
                    <td className="px-4 py-2 text-gray-500">{formatDate(inst.dueDate)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(inst.plannedAmount)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(inst.paidAmount)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={
                        inst.status === "paid" ? "success" :
                        inst.status === "overdue" ? "danger" :
                        inst.status === "partial" ? "warning" : "default"
                      }>
                        {inst.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showEdit, setShowEdit] = useState(false);

  const { data: student, isLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: () => getStudent(id!),
    enabled: !!id,
  });

  const { data: enrollments } = useQuery({
    queryKey: ["enrollments", id],
    queryFn: () => getStudentEnrollments(id!),
    enabled: !!id,
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!student) return (
    <div className="p-6">
      <p className="text-gray-500">Student not found</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center gap-4 border-b border-gray-100 bg-white px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/students")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{student.fullName}</h1>
          <p className="text-sm text-gray-500">{student.studentCode} &middot; {student.phone}</p>
        </div>
        <Button variant="outline" onClick={() => setShowEdit(true)}>
          <Edit className="mr-2 h-4 w-4" /> Edit
        </Button>
      </div>

      <div className="flex-1 p-6">
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Personal Info</TabsTrigger>
            <TabsTrigger value="academic">Academic</TabsTrigger>
            <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
            <TabsTrigger value="fees">Fees</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-sm">Personal Details</CardTitle></CardHeader>
                <CardContent>
                  <InfoRow label="Full Name" value={student.fullName} />
                  <InfoRow label="Phone" value={student.phone} />
                  <InfoRow label="Email" value={student.email} />
                  <InfoRow label="Date of Birth" value={formatDate(student.dob)} />
                  <InfoRow label="Gender" value={student.gender ? titleCase(student.gender) : null} />
                  <InfoRow label="Aadhaar" value={student.aadhaar} />
                  <InfoRow label="Address" value={student.address} />
                  <InfoRow label="WhatsApp" value={student.whatsapp} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Family Details</CardTitle></CardHeader>
                <CardContent>
                  <InfoRow label="Father Name" value={student.fatherName} />
                  <InfoRow label="Mother Name" value={student.motherName} />
                  <InfoRow label="Guardian Phone" value={student.guardianPhone} />
                  <InfoRow label="Guardian Email" value={student.guardianEmail} />
                  <InfoRow label="Guardian Occupation" value={student.guardianOccupation} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="academic" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Academic Information</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Qualification" value={student.qualification ? titleCase(student.qualification) : null} />
                <InfoRow label="Pass Year" value={student.passYear} />
                <InfoRow label="Board" value={student.board} />
                <InfoRow label="Course Preference" value={student.coursePreference ? titleCase(student.coursePreference) : null} />
                <InfoRow label="Duration Preference" value={student.durationPreference ? titleCase(student.durationPreference) : null} />
                <InfoRow label="Preferred Timing" value={student.preferredTiming ? titleCase(student.preferredTiming) : null} />
                <InfoRow label="Payment Mode" value={student.paymentMode ? titleCase(student.paymentMode) : null} />
                <InfoRow label="Amount Paid" value={student.amountPaid ? formatCurrency(student.amountPaid) : null} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enrollments" className="mt-4">
            <div className="space-y-3">
              {(enrollments ?? []).length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">No enrollments</div>
              )}
              {(enrollments ?? []).map((e) => (
                <Card key={e.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{e.batch.name}</p>
                      <p className="text-sm text-gray-500">{e.batch.course.name} &middot; Enrolled {formatDate(e.enrolledOn)}</p>
                    </div>
                    <Badge variant={e.status === "active" ? "success" : "default"}>{e.status}</Badge>
                    <div className="text-right text-sm text-gray-500">
                      <p>{formatDate(e.batch.startDate)} – {formatDate(e.batch.endDate)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="fees" className="mt-4">
            <FeeTab studentId={id!} />
          </TabsContent>
        </Tabs>
      </div>

      {showEdit && id && (
        <EditStudentDialog studentId={id} open={showEdit} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}

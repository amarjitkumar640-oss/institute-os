import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit, Camera, Loader2, X, FileText, Trash2 } from "lucide-react";
import { getStudent, uploadStudentPhoto, deleteStudentPhoto, type Student } from "@/api/students";
import { getStudentEnrollments } from "@/api/enrollments";
import { getFeeSchedule } from "@/api/fees";
import { listDocumentTypes, listStudentDocuments, uploadStudentDocument, deleteStudentDocument } from "@/api/documents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { formatDate, formatCurrency, titleCase, initials } from "@/lib/utils";
import { EditStudentDialog } from "./EditStudentDialog";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="w-40 shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value ?? "—"}</span>
    </div>
  );
}


function StudentPhoto({ student }: { student: Student }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadStudentPhoto(student.id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student", student.id] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: () => toast({ variant: "destructive", title: "Photo upload failed" }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteStudentPhoto(student.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student", student.id] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: () => toast({ variant: "destructive", title: "Could not remove photo" }),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadMutation.mutate(file);
  }

  return (
    <div className="relative shrink-0">
      {student.photoUrl ? (
        <img src={student.photoUrl} alt={student.fullName} className="h-14 w-14 rounded-2xl object-cover" />
      ) : (
        <div className="h-14 w-14 rounded-2xl bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-lg">
          {initials(student.fullName)}
        </div>
      )}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-gray-50"
        title={student.photoUrl ? "Replace photo" : "Add photo"}
      >
        {uploadMutation.isPending
          ? <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
          : <Camera className="h-3 w-3 text-gray-600" />}
      </button>
      {student.photoUrl && (
        <button
          type="button"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          className="absolute -bottom-1 -left-1 h-6 w-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-red-50"
          title="Remove photo"
        >
          <X className="h-3 w-3 text-red-500" />
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function DocumentsTab({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const { data: types } = useQuery({ queryKey: ["document-types"], queryFn: listDocumentTypes });
  const { data: docs } = useQuery({ queryKey: ["student-documents", studentId], queryFn: () => listStudentDocuments(studentId) });

  const uploadMutation = useMutation({
    mutationFn: ({ documentTypeId, file }: { documentTypeId: string; file: File }) =>
      uploadStudentDocument(studentId, documentTypeId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-documents", studentId] });
      toast({ title: "Document uploaded" });
    },
    onError: () => toast({ variant: "destructive", title: "Upload failed" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (documentTypeId: string) => deleteStudentDocument(studentId, documentTypeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-documents", studentId] });
      toast({ title: "Document removed" });
    },
    onError: () => toast({ variant: "destructive", title: "Could not remove document" }),
  });

  if (!types || !docs) return <Skeleton className="h-48 w-full" />;

  const activeTypes = types.filter((t) => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const docsByType = new Map(docs.map((d) => [d.documentTypeId, d]));

  if (activeTypes.length === 0) {
    return <div className="py-8 text-center text-gray-400 text-sm">No document types configured for this institute</div>;
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Documents</CardTitle></CardHeader>
      <CardContent className="divide-y divide-gray-50">
        {activeTypes.map((type) => {
          const doc = docsByType.get(type.id);
          const inputId = `doc-upload-${type.id}`;
          const busy = uploadMutation.isPending && uploadMutation.variables?.documentTypeId === type.id;
          return (
            <div key={type.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <div className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{type.label}</p>
                {doc ? (
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline">
                    Uploaded {formatDate(doc.uploadedAt)} · View
                  </a>
                ) : (
                  <p className="text-xs text-gray-400">Not uploaded</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {doc && (
                  <Button
                    size="sm" variant="ghost" className="text-red-600"
                    onClick={() => deleteMutation.mutate(type.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <label htmlFor={inputId}>
                  <Button size="sm" variant="outline" disabled={busy} asChild>
                    <span>{busy ? "Uploading…" : doc ? "Replace" : "Upload"}</span>
                  </Button>
                </label>
                <input
                  id={inputId}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) uploadMutation.mutate({ documentTypeId: type.id, file });
                  }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
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
        <StudentPhoto student={student} />
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
            <TabsTrigger value="documents">Documents</TabsTrigger>
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

          <TabsContent value="documents" className="mt-4">
            <DocumentsTab studentId={id!} />
          </TabsContent>
        </Tabs>
      </div>

      {showEdit && (
        <EditStudentDialog student={student} open={showEdit} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}

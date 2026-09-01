import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2, FileText, ClipboardList, Upload, Pencil, CheckCircle2, Archive } from "lucide-react";
import {
  listRecruitments, createRecruitment, updateRecruitment,
  setRecruitmentStatus, deleteRecruitment, createDocument, deleteDocument,
  previewRecruitmentImport, commitRecruitmentImport,
  type GovRecruitment, type GovRecruitmentStatus, type GovDocumentType, type GovOrgType, type ImportPlanItem,
} from "@/api/govExams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { DataTable } from "@/components/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAction } from "@/components/ui/icon-action";
import { TruncatedText } from "@/components/ui/truncated-text";
import { toast } from "@/components/ui/use-toast";
import { formatDate, slugify } from "@/lib/utils";

const STATUS_VARIANT: Record<GovRecruitmentStatus, "warning" | "success" | "default"> = {
  draft: "warning", published: "success", archived: "default",
};

const ORG_TYPE_LABEL: Record<GovOrgType, string> = { ssc: "SSC", banking: "Banking", railway: "Railway", other: "Other" };

const DOC_TYPE_LABEL: Record<GovDocumentType, string> = {
  admit_card: "Admit Card", result: "Result", answer_key: "Answer Key", notification: "Notification", syllabus: "Syllabus",
};

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

// categoryRelaxations/applicationFee/posts are admin-editable as raw JSON —
// they're occasional/advanced fields (age relaxation by category, fee by
// category, multi-post breakdowns) where a bespoke key-value editor UI isn't
// worth building yet; revisit once step 4's scraper reveals real usage
// patterns worth a dedicated widget.
const jsonObjectField = z
  .string()
  .optional()
  .refine((v) => !v || (() => { try { const p = JSON.parse(v); return typeof p === "object" && p !== null && !Array.isArray(p); } catch { return false; } })(), "Must be valid JSON, e.g. {\"obc\": 3}");

const recruitmentSchema = z.object({
  category: z.enum(["ssc", "banking", "railway", "other"]),
  organization: z.string().max(200).optional(),
  title: z.string().min(1, "Required").max(300),
  slug: z.string().min(1, "Required").max(300).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  totalVacancies: z.string().optional(),
  qualification: z.string().max(500).optional(),
  ageMin: z.string().optional(),
  ageMax: z.string().optional(),
  categoryRelaxations: jsonObjectField,
  applicationFee: jsonObjectField,
  applicationStartDate: z.string().optional(),
  applicationEndDate: z.string().optional(),
  examDate: z.string().optional(),
  officialNotificationUrl: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
  officialWebsiteUrl: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
  applyUrl: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
});
type RecruitmentFormValues = z.infer<typeof recruitmentSchema>;

function toNumberOrUndefined(v?: string): number | undefined {
  if (!v?.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toDateOrUndefined(v?: string): string | undefined {
  return v?.trim() ? new Date(v).toISOString() : undefined;
}

function RecruitmentFormDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: GovRecruitment }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<RecruitmentFormValues>({
    resolver: zodResolver(recruitmentSchema),
    defaultValues: existing ? {
      category: existing.category,
      organization: existing.organization ?? "",
      title: existing.title,
      slug: existing.slug,
      totalVacancies: existing.totalVacancies?.toString() ?? "",
      qualification: existing.qualification ?? "",
      ageMin: existing.ageMin?.toString() ?? "",
      ageMax: existing.ageMax?.toString() ?? "",
      categoryRelaxations: existing.categoryRelaxations ? JSON.stringify(existing.categoryRelaxations) : "",
      applicationFee: existing.applicationFee ? JSON.stringify(existing.applicationFee) : "",
      applicationStartDate: existing.applicationStartDate?.slice(0, 10) ?? "",
      applicationEndDate: existing.applicationEndDate?.slice(0, 10) ?? "",
      examDate: existing.examDate?.slice(0, 10) ?? "",
      officialNotificationUrl: existing.officialNotificationUrl ?? "",
      officialWebsiteUrl: existing.officialWebsiteUrl ?? "",
      applyUrl: existing.applyUrl ?? "",
    } : {
      category: "ssc", organization: "", title: "", slug: "", totalVacancies: "", qualification: "",
      ageMin: "", ageMax: "", categoryRelaxations: "", applicationFee: "",
      applicationStartDate: "", applicationEndDate: "", examDate: "",
      officialNotificationUrl: "", officialWebsiteUrl: "", applyUrl: "",
    },
  });
  const category = watch("category");
  const slug = watch("slug");

  const mutation = useMutation({
    mutationFn: (values: RecruitmentFormValues) => {
      const input = {
        category: values.category,
        organization: values.organization || undefined,
        title: values.title,
        slug: values.slug,
        totalVacancies: toNumberOrUndefined(values.totalVacancies),
        qualification: values.qualification || undefined,
        ageMin: toNumberOrUndefined(values.ageMin),
        ageMax: toNumberOrUndefined(values.ageMax),
        categoryRelaxations: values.categoryRelaxations ? JSON.parse(values.categoryRelaxations) : undefined,
        applicationFee: values.applicationFee ? JSON.parse(values.applicationFee) : undefined,
        applicationStartDate: toDateOrUndefined(values.applicationStartDate),
        applicationEndDate: toDateOrUndefined(values.applicationEndDate),
        examDate: toDateOrUndefined(values.examDate),
        officialNotificationUrl: values.officialNotificationUrl || undefined,
        officialWebsiteUrl: values.officialWebsiteUrl || undefined,
        applyUrl: values.applyUrl || undefined,
      };
      return existing ? updateRecruitment(existing.id, input) : createRecruitment(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-recruitments"] });
      toast({ title: existing ? "Updated" : "Created as draft" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} Recruitment</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category" required error={errors.category}>
              <Select value={category} onValueChange={(v) => setValue("category", v as GovOrgType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ORG_TYPE_LABEL) as GovOrgType[]).map((t) => (
                    <SelectItem key={t} value={t}>{ORG_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Organization" error={errors.organization}>
              <Input {...register("organization")} placeholder="e.g. State Bank of India" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Title" required error={errors.title} className="col-span-2">
              <Input
                {...register("title")}
                placeholder="e.g. SSC CGL 2026"
                onBlur={(e) => { if (!slug) setValue("slug", slugify(e.target.value)); }}
              />
            </FormField>
            <FormField label="Slug" required error={errors.slug} className="col-span-2">
              <Input {...register("slug")} placeholder="ssc-cgl-2026" />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Total Vacancies"><Input type="number" {...register("totalVacancies")} /></FormField>
            <FormField label="Min Age"><Input type="number" {...register("ageMin")} /></FormField>
            <FormField label="Max Age"><Input type="number" {...register("ageMax")} /></FormField>
          </div>

          <FormField label="Qualification"><Input {...register("qualification")} placeholder="e.g. Bachelor's Degree" /></FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category Age Relaxations (JSON)" error={errors.categoryRelaxations}>
              <Textarea {...register("categoryRelaxations")} rows={2} placeholder='{"obc": 3, "sc_st": 5}' className="font-mono text-xs" />
            </FormField>
            <FormField label="Application Fee (JSON)" error={errors.applicationFee}>
              <Textarea {...register("applicationFee")} rows={2} placeholder='{"general": 100, "sc_st": 0}' className="font-mono text-xs" />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Application Start"><Input type="date" {...register("applicationStartDate")} /></FormField>
            <FormField label="Application End"><Input type="date" {...register("applicationEndDate")} /></FormField>
            <FormField label="Exam Date"><Input type="date" {...register("examDate")} /></FormField>
          </div>

          <FormField label="Official Notification URL" error={errors.officialNotificationUrl}>
            <Input {...register("officialNotificationUrl")} placeholder="https://..." />
          </FormField>
          <FormField label="Official Website URL" error={errors.officialWebsiteUrl}>
            <Input {...register("officialWebsiteUrl")} placeholder="https://..." />
          </FormField>
          <FormField label="Apply URL" error={errors.applyUrl}>
            <Input {...register("applyUrl")} placeholder="https://... (if different from the notification)" />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsDialog({ open, onClose, recruitment }: { open: boolean; onClose: () => void; recruitment: GovRecruitment }) {
  const qc = useQueryClient();
  const [type, setType] = useState<GovDocumentType>("notification");
  const [title, setTitle] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createDocument({ recruitmentId: recruitment.id, type, title, documentUrl: documentUrl || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-recruitments"] });
      setTitle(""); setDocumentUrl("");
      toast({ title: "Document added" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-recruitments"] });
      toast({ title: "Deleted" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Documents — {recruitment.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!recruitment.documents?.length ? (
            <p className="text-sm text-gray-400">No documents yet.</p>
          ) : (
            <div className="space-y-2">
              {recruitment.documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                    <Badge variant="outline" className="mt-0.5">{DOC_TYPE_LABEL[doc.type]}</Badge>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteMutation.mutate(doc.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            <Select value={type} onValueChange={(v) => setType(v as GovDocumentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DOC_TYPE_LABEL) as GovDocumentType[]).map((t) => <SelectItem key={t} value={t}>{DOC_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Title, e.g. Official Notification" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Document URL (optional)" value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} />
            <Button className="w-full" disabled={!title || createMutation.isPending} onClick={() => createMutation.mutate()}>
              <Plus className="h-4 w-4" /> Add Document
            </Button>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const IMPORT_OUTCOME_VARIANT: Record<string, "warning" | "success" | "danger"> = {
  published: "success", draft: "warning", unusable: "danger",
};

// Extracts the array to send from whatever the admin pasted — the whole
// export file (with a top-level `vacancies` key) or just the array itself —
// so they don't have to hand-edit the paste to strip a wrapper object.
function extractVacancies(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { vacancies?: unknown }).vacancies)) {
    return (parsed as { vacancies: unknown[] }).vacancies;
  }
  return null;
}

function ImportJsonDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<GovOrgType>("banking");
  const [rawText, setRawText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlanItem[] | null>(null);
  const [vacancies, setVacancies] = useState<unknown[] | null>(null);

  const previewMutation = useMutation({
    mutationFn: (items: unknown[]) => previewRecruitmentImport(category, items),
    onSuccess: (res) => setPlan(res.items),
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const commitMutation = useMutation({
    mutationFn: (items: unknown[]) => commitRecruitmentImport(category, items),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["gov-recruitments"] });
      toast({
        title: `Imported ${res.created} recruitment(s)`,
        description: `${res.published} published, ${res.created - res.published} draft, ${res.skippedDuplicates} duplicate(s) skipped, ${res.unusable} unusable.`,
      });
      reset();
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function reset() {
    setRawText(""); setParseError(null); setPlan(null); setVacancies(null);
  }

  function handlePreview() {
    setParseError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      setParseError("Not valid JSON — check for a stray trailing comma or unclosed bracket.");
      return;
    }
    const items = extractVacancies(parsed);
    if (!items || items.length === 0) {
      setParseError("Couldn't find a non-empty array to import — expected the pasted JSON's top-level object to have a \"vacancies\" array, or to just be an array itself.");
      return;
    }
    setVacancies(items);
    previewMutation.mutate(items);
  }

  const importableCount = plan?.filter((p) => p.outcome !== "unusable").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import Recruitments from JSON</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Paste an AI-Overview-style search result (e.g. generated via ChatGPT) in the standard{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{"{ card, details, content }"}</code> vacancy shape.
            Preview shows exactly what will be created before anything is saved.
          </p>

          <FormField label="Category">
            <Select value={category} onValueChange={(v) => setCategory(v as GovOrgType)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ssc">SSC</SelectItem>
                <SelectItem value="banking">Banking</SelectItem>
                <SelectItem value="railway">Railway</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Pasted JSON">
            <Textarea
              value={rawText}
              onChange={(e) => { setRawText(e.target.value); setPlan(null); }}
              rows={10}
              placeholder='{"vacancies": [{"card": {...}, "details": {...}, "content": {...}}]}'
              className="font-mono text-xs"
            />
            {parseError && <p className="text-xs text-red-600 mt-1">{parseError}</p>}
          </FormField>

          <Button variant="outline" onClick={handlePreview} disabled={!rawText.trim() || previewMutation.isPending}>
            {previewMutation.isPending ? "Previewing…" : "Preview"}
          </Button>

          {plan && (
            <div className="border rounded-lg divide-y">
              {plan.map((item) => (
                <div key={item.index} className="p-3 flex items-start gap-3">
                  <Badge variant={IMPORT_OUTCOME_VARIANT[item.outcome]}>{item.outcome}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                    {item.outcome === "unusable" ? (
                      <p className="text-xs text-red-600 mt-0.5">{item.reason}</p>
                    ) : (
                      <>
                        {item.recruitmentInput.organization && (
                          <p className="text-xs text-gray-500 mt-0.5">Organization: {item.recruitmentInput.organization}</p>
                        )}
                        {item.reasons?.map((r, i) => <p key={i} className="text-xs text-amber-600">{r}</p>)}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            disabled={!plan || importableCount === 0 || commitMutation.isPending}
            onClick={() => vacancies && commitMutation.mutate(vacancies)}
          >
            {commitMutation.isPending ? "Importing…" : `Import ${importableCount} item(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecruitmentsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<GovRecruitmentStatus | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<GovRecruitment | null>(null);
  const [managingDocs, setManagingDocs] = useState<GovRecruitment | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["gov-recruitments", statusFilter],
    queryFn: () => listRecruitments(statusFilter === "all" ? {} : { status: statusFilter }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: GovRecruitmentStatus }) => setRecruitmentStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gov-recruitments"] }); toast({ title: "Status updated" }); },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRecruitment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gov-recruitments"] }); toast({ title: "Deleted" }); },
  });

  const columns: ColumnDef<GovRecruitment>[] = [
    {
      accessorKey: "title",
      header: "Recruitment",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[240px]">
          <TruncatedText text={row.original.title} className="font-semibold text-gray-900 text-sm" />
          <TruncatedText text={row.original.organization ?? ORG_TYPE_LABEL[row.original.category]} className="text-xs text-gray-400" />
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex gap-1.5">
          <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
          {row.original.source === "scraped" && <Badge variant="info">scraped</Badge>}
        </div>
      ),
    },
    {
      accessorKey: "totalVacancies",
      header: "Vacancies",
      cell: ({ row }) => <span className="text-sm text-gray-600">{row.original.totalVacancies ?? "—"}</span>,
    },
    {
      id: "applicationEndDate",
      header: "Last Date",
      cell: ({ row }) => <span className="text-sm text-gray-600">{formatDate(row.original.applicationEndDate)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            {r.status !== "published" && (
              <IconAction
                label="Publish" icon={<CheckCircle2 className="h-3.5 w-3.5" />} className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                onClick={() => statusMutation.mutate({ id: r.id, status: "published" })}
              />
            )}
            {r.status === "published" && (
              <IconAction label="Archive" icon={<Archive className="h-3.5 w-3.5" />} onClick={() => statusMutation.mutate({ id: r.id, status: "archived" })} />
            )}
            <IconAction label="Documents" icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => setManagingDocs(r)} />
            <IconAction label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(r)} />
            <IconAction
              label="Delete" icon={<Trash2 className="h-3.5 w-3.5" />} variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => { if (confirm("Delete this recruitment?")) deleteMutation.mutate(r.id); }}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as GovRecruitmentStatus | "all")}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}><Upload className="h-4 w-4" /> Import JSON</Button>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Recruitment</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !data?.data.length ? (
        <EmptyState icon={FileText} title="No recruitments found" actionLabel="Add Recruitment" onAction={() => setShowCreate(true)} />
      ) : (
        <DataTable columns={columns} data={data.data} />
      )}

      {showCreate && <RecruitmentFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {showImport && <ImportJsonDialog open={showImport} onClose={() => setShowImport(false)} />}
      {editing && <RecruitmentFormDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />}
      {managingDocs && <DocumentsDialog open={!!managingDocs} onClose={() => setManagingDocs(null)} recruitment={managingDocs} />}
    </div>
  );
}

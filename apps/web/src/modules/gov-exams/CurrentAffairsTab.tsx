import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2, Newspaper, Upload } from "lucide-react";
import {
  listCurrentAffairs, createCurrentAffair, updateCurrentAffair,
  setCurrentAffairStatus, deleteCurrentAffair, listCurrentAffairCategories,
  previewCurrentAffairImport, commitCurrentAffairImport,
  type GovCurrentAffair, type GovRecruitmentStatus, type CurrentAffairImportPlanItem,
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
import { toast } from "@/components/ui/use-toast";
import { formatDate, slugify } from "@/lib/utils";

const STATUS_VARIANT: Record<GovRecruitmentStatus, "warning" | "success" | "default"> = {
  draft: "warning", published: "success", archived: "default",
};

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

const currentAffairSchema = z.object({
  title: z.string().min(1, "Required").max(300),
  slug: z.string().min(1, "Required").max(300).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  categoryId: z.string().uuid("Required"),
  whatHappened: z.string().min(1, "Required"),
  keyFacts: z.string().optional(), // one per line, converted to string[] on submit
  whyImportant: z.string().optional(),
  examRelevance: z
    .string()
    .optional()
    .refine((v) => !v || (() => { try { const p = JSON.parse(v); return typeof p === "object" && p !== null && !Array.isArray(p); } catch { return false; } })(), "Must be valid JSON, e.g. {\"ssc\": \"...\"}"),
  publishedDate: z.string().min(1, "Required"),
});
type CurrentAffairFormValues = z.infer<typeof currentAffairSchema>;

function CurrentAffairFormDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: GovCurrentAffair }) {
  const qc = useQueryClient();
  const { data: categories } = useQuery({
    queryKey: ["current-affair-categories"],
    queryFn: listCurrentAffairCategories,
  });
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<CurrentAffairFormValues>({
    resolver: zodResolver(currentAffairSchema),
    defaultValues: existing ? {
      title: existing.title,
      slug: existing.slug,
      categoryId: existing.categoryId,
      whatHappened: existing.whatHappened,
      keyFacts: existing.keyFacts?.join("\n") ?? "",
      whyImportant: existing.whyImportant ?? "",
      examRelevance: existing.examRelevance ? JSON.stringify(existing.examRelevance) : "",
      publishedDate: existing.publishedDate.slice(0, 10),
    } : {
      title: "", slug: "", categoryId: "", whatHappened: "", keyFacts: "", whyImportant: "",
      examRelevance: "", publishedDate: new Date().toISOString().slice(0, 10),
    },
  });
  const categoryId = watch("categoryId");
  const slug = watch("slug");

  const mutation = useMutation({
    mutationFn: (values: CurrentAffairFormValues) => {
      const input = {
        title: values.title,
        slug: values.slug,
        categoryId: values.categoryId,
        whatHappened: values.whatHappened,
        keyFacts: values.keyFacts?.split("\n").map((s) => s.trim()).filter(Boolean),
        whyImportant: values.whyImportant || undefined,
        examRelevance: values.examRelevance ? JSON.parse(values.examRelevance) : undefined,
        publishedDate: new Date(values.publishedDate).toISOString(),
      };
      return existing ? updateCurrentAffair(existing.id, input) : createCurrentAffair(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-current-affairs"] });
      toast({ title: existing ? "Updated" : "Created as draft" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} Current Affair</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <FormField label="Title" required error={errors.title}>
            <Input
              {...register("title")}
              placeholder="e.g. RBI keeps repo rate unchanged"
              onBlur={(e) => { if (!slug) setValue("slug", slugify(e.target.value)); }}
            />
          </FormField>
          <FormField label="Slug" required error={errors.slug}>
            <Input {...register("slug")} placeholder="rbi-repo-rate-unchanged" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category" required error={errors.categoryId}>
              <Select value={categoryId} onValueChange={(v) => setValue("categoryId", v)}>
                <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Published Date" required error={errors.publishedDate}>
              <Input type="date" {...register("publishedDate")} />
            </FormField>
          </div>

          <FormField label="What Happened" required error={errors.whatHappened}>
            <Textarea {...register("whatHappened")} rows={3} />
          </FormField>
          <FormField label="Key Facts (one per line)">
            <Textarea {...register("keyFacts")} rows={3} placeholder={"Fact one\nFact two"} />
          </FormField>
          <FormField label="Why Important">
            <Textarea {...register("whyImportant")} rows={2} />
          </FormField>
          <FormField label="Exam Relevance (JSON)" error={errors.examRelevance}>
            <Textarea
              {...register("examRelevance")}
              rows={3}
              placeholder='{"ssc": "Static GK questions on RBI policy", "banking": "Directly relevant for banking awareness"}'
              className="font-mono text-xs"
            />
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

const IMPORT_OUTCOME_VARIANT: Record<string, "warning" | "success" | "danger"> = {
  published: "success", draft: "warning", unusable: "danger",
};

// Extracts the array to send from whatever the admin pasted — the whole
// export file (with a top-level `current_affairs` key, matching
// CurrentAffairsPrompt.md's output shape) or just the array itself.
function extractCurrentAffairItems(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { current_affairs?: unknown }).current_affairs)) {
    return (parsed as { current_affairs: unknown[] }).current_affairs;
  }
  return null;
}

function CurrentAffairImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [rawText, setRawText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CurrentAffairImportPlanItem[] | null>(null);
  const [items, setItems] = useState<unknown[] | null>(null);

  const previewMutation = useMutation({
    mutationFn: (values: unknown[]) => previewCurrentAffairImport(values),
    onSuccess: (res) => setPlan(res.items),
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const commitMutation = useMutation({
    mutationFn: (values: unknown[]) => commitCurrentAffairImport(values),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["gov-current-affairs"] });
      toast({
        title: `Imported ${res.created} current affair(s)`,
        description: `${res.published} published, ${res.created - res.published} draft, ${res.skippedDuplicates} duplicate(s) skipped.`,
      });
      reset();
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function reset() {
    setRawText(""); setParseError(null); setPlan(null); setItems(null);
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
    const parsedItems = extractCurrentAffairItems(parsed);
    if (!parsedItems || parsedItems.length === 0) {
      setParseError("Couldn't find a non-empty array to import — expected the pasted JSON's top-level object to have a \"current_affairs\" array, or to just be an array itself.");
      return;
    }
    setItems(parsedItems);
    previewMutation.mutate(parsedItems);
  }

  const importableCount = plan?.filter((p) => p.outcome !== "unusable").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import Current Affairs from JSON</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Paste a search result in the standard{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{"{ card, details, content }"}</code> current-affairs item shape.
            Each item's own category is matched automatically — there's no category to pick here. Preview shows exactly
            what will be created before anything is saved.
          </p>

          <FormField label="Pasted JSON">
            <Textarea
              value={rawText}
              onChange={(e) => { setRawText(e.target.value); setPlan(null); }}
              rows={10}
              placeholder='{"current_affairs": [{"card": {...}, "details": {...}, "content": {...}}]}'
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
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.matchedCategoryKey ? `Category: ${item.matchedCategoryKey}` : "No category matched — defaulted"}
                        </p>
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
            onClick={() => items && commitMutation.mutate(items)}
          >
            {commitMutation.isPending ? "Importing…" : `Import ${importableCount} item(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CurrentAffairsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<GovRecruitmentStatus | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<GovCurrentAffair | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["gov-current-affairs", statusFilter],
    queryFn: () => listCurrentAffairs(statusFilter === "all" ? {} : { status: statusFilter }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: GovRecruitmentStatus }) => setCurrentAffairStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gov-current-affairs"] }); toast({ title: "Status updated" }); },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCurrentAffair,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gov-current-affairs"] }); toast({ title: "Deleted" }); },
  });

  const columns: ColumnDef<GovCurrentAffair>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => <p className="font-semibold text-gray-900 text-sm">{row.original.title}</p>,
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => <Badge variant="purple">{row.original.category.labelEn}</Badge>,
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
      id: "publishedDate",
      header: "Published",
      cell: ({ row }) => <span className="text-sm text-gray-600">{formatDate(row.original.publishedDate)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const ca = row.original;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            {ca.status !== "published" && (
              <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => statusMutation.mutate({ id: ca.id, status: "published" })}>
                Publish
              </Button>
            )}
            {ca.status === "published" && (
              <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: ca.id, status: "archived" })}>
                Archive
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(ca)}>Edit</Button>
            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (confirm("Delete this current affair?")) deleteMutation.mutate(ca.id); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
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
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Current Affair</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !data?.data.length ? (
        <EmptyState icon={Newspaper} title="No current affairs found" actionLabel="Add Current Affair" onAction={() => setShowCreate(true)} />
      ) : (
        <DataTable columns={columns} data={data.data} />
      )}

      {showCreate && <CurrentAffairFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {showImport && <CurrentAffairImportDialog open={showImport} onClose={() => setShowImport(false)} />}
      {editing && <CurrentAffairFormDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />}
    </div>
  );
}

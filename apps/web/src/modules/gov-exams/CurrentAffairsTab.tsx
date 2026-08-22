import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2, Newspaper } from "lucide-react";
import {
  listCurrentAffairs, createCurrentAffair, updateCurrentAffair,
  setCurrentAffairStatus, deleteCurrentAffair,
  type GovCurrentAffair, type GovCurrentAffairCategory, type GovRecruitmentStatus,
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

const CATEGORY_LABEL: Record<GovCurrentAffairCategory, string> = {
  national: "National", international: "International", banking: "Banking", economy: "Economy",
  science: "Science", technology: "Technology", defence: "Defence", sports: "Sports",
  awards: "Awards", appointments: "Appointments", govt_schemes: "Govt. Schemes", environment: "Environment",
};

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
  category: z.enum([
    "national", "international", "banking", "economy", "science", "technology",
    "defence", "sports", "awards", "appointments", "govt_schemes", "environment",
  ]),
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
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<CurrentAffairFormValues>({
    resolver: zodResolver(currentAffairSchema),
    defaultValues: existing ? {
      title: existing.title,
      slug: existing.slug,
      category: existing.category,
      whatHappened: existing.whatHappened,
      keyFacts: existing.keyFacts?.join("\n") ?? "",
      whyImportant: existing.whyImportant ?? "",
      examRelevance: existing.examRelevance ? JSON.stringify(existing.examRelevance) : "",
      publishedDate: existing.publishedDate.slice(0, 10),
    } : {
      title: "", slug: "", category: "national", whatHappened: "", keyFacts: "", whyImportant: "",
      examRelevance: "", publishedDate: new Date().toISOString().slice(0, 10),
    },
  });
  const category = watch("category");
  const slug = watch("slug");

  const mutation = useMutation({
    mutationFn: (values: CurrentAffairFormValues) => {
      const input = {
        title: values.title,
        slug: values.slug,
        category: values.category,
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
            <FormField label="Category" required>
              <Select value={category} onValueChange={(v) => setValue("category", v as GovCurrentAffairCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABEL) as GovCurrentAffairCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
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

export function CurrentAffairsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<GovRecruitmentStatus | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
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
      cell: ({ row }) => <Badge variant="purple">{CATEGORY_LABEL[row.original.category]}</Badge>,
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
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Current Affair</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !data?.data.length ? (
        <EmptyState icon={Newspaper} title="No current affairs found" actionLabel="Add Current Affair" onAction={() => setShowCreate(true)} />
      ) : (
        <DataTable columns={columns} data={data.data} />
      )}

      {showCreate && <CurrentAffairFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {editing && <CurrentAffairFormDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />}
    </div>
  );
}

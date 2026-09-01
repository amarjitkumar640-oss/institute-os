import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Globe, Pencil } from "lucide-react";
import {
  listSources, createSource, updateSource, deleteSource,
  type GovSource, type GovOrgType, type GovSourceContentType, type GovSourceFetchMode,
} from "@/api/govExams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAction } from "@/components/ui/icon-action";
import { TruncatedText } from "@/components/ui/truncated-text";
import { toast } from "@/components/ui/use-toast";

const ORG_TYPE_LABEL: Record<GovOrgType, string> = { ssc: "SSC", banking: "Banking", railway: "Railway", other: "Other" };
const CONTENT_TYPE_LABEL: Record<GovSourceContentType, string> = { recruitment: "Recruitments", current_affair: "Current Affairs" };
const FETCH_MODE_LABEL: Record<GovSourceFetchMode, string> = { url: "Scrape a URL" };

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

const sourceSchema = z.object({
  category: z.enum(["ssc", "banking", "railway", "other"]),
  contentType: z.enum(["recruitment", "current_affair"]),
  fetchMode: z.literal("url"),
  label: z.string().min(1, "Required").max(200),
  url: z.string().url("Must be a valid URL"),
  enabled: z.boolean(),
});
type SourceFormValues = z.infer<typeof sourceSchema>;

function SourceFormDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: GovSource }) {
  const qc = useQueryClient();

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<SourceFormValues>({
    resolver: zodResolver(sourceSchema),
    defaultValues: existing
      ? {
          category: existing.category, contentType: existing.contentType, fetchMode: "url",
          label: existing.label, url: existing.url ?? "", enabled: existing.enabled,
        }
      : { category: "ssc", contentType: "recruitment", fetchMode: "url", label: "", url: "", enabled: true },
  });
  const category = watch("category");
  const contentType = watch("contentType");
  const enabled = watch("enabled");

  const mutation = useMutation({
    mutationFn: (values: SourceFormValues) => {
      return existing ? updateSource(existing.id, values) : createSource(values);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-sources"] });
      toast({ title: existing ? "Updated" : "Added" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} Source</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <FormField label="Category" required>
            <Select value={category} onValueChange={(v) => setValue("category", v as GovOrgType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ORG_TYPE_LABEL) as GovOrgType[]).map((t) => (
                  <SelectItem key={t} value={t}>{ORG_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Content Type" required>
            <Select value={contentType} onValueChange={(v) => setValue("contentType", v as GovSourceContentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CONTENT_TYPE_LABEL) as GovSourceContentType[]).map((t) => (
                  <SelectItem key={t} value={t}>{CONTENT_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Label" required error={errors.label}>
            <Input {...register("label")} placeholder="e.g. SSC — Latest Notifications" />
          </FormField>
          <FormField label="URL" required error={errors.url}>
            <Input {...register("url")} placeholder="https://ssc.nic.in/notifications" />
          </FormField>
          <FormField label="Enabled">
            <Switch checked={enabled} onCheckedChange={(v) => setValue("enabled", v)} />
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

export function SourcesTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<GovSource | null>(null);

  const { data: sources, isLoading } = useQuery({ queryKey: ["gov-sources"], queryFn: listSources });

  const deleteMutation = useMutation({
    mutationFn: deleteSource,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-sources"] });
      toast({ title: "Deleted" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateSource(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gov-sources"] }),
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Each source below has its own schedule, managed in Settings → System → Government Exam Jobs, where you can
        also trigger it manually. Enabled sources are scraped on their own schedule, extracting structured data and
        auto-publishing what validates cleanly — anything that doesn't lands as a draft for review instead of being
        discarded. For AI web search instead of a fixed URL, use the Search Prompts tab.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Source</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !sources?.length ? (
        <EmptyState icon={Globe} title="No sources yet" description="Add a URL to scrape for a category — e.g. SSC's notifications page." actionLabel="Add Source" onAction={() => setShowCreate(true)} />
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.id} className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">{source.label}</p>
                  <Badge variant="outline">{ORG_TYPE_LABEL[source.category]}</Badge>
                  <Badge variant="purple">{CONTENT_TYPE_LABEL[source.contentType]}</Badge>
                  <Badge variant="outline">{FETCH_MODE_LABEL[source.fetchMode]}</Badge>
                  {source.lastScrapeStatus && (
                    <Badge variant={source.lastScrapeStatus === "error" ? "danger" : "outline"}>
                      Last: {source.lastScrapeStatus}
                    </Badge>
                  )}
                </div>
                <TruncatedText text={source.url} className="text-xs text-gray-400 mt-0.5" />
                {source.lastScrapeError && <TruncatedText text={source.lastScrapeError} className="text-xs text-red-500 mt-0.5" />}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Switch
                  checked={source.enabled}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: source.id, enabled: v })}
                />
                <IconAction label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(source)} />
                <IconAction
                  label="Delete" icon={<Trash2 className="h-3.5 w-3.5" />} variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => { if (confirm(`Delete "${source.label}"?`)) deleteMutation.mutate(source.id); }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <SourceFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {editing && <SourceFormDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />}
    </div>
  );
}

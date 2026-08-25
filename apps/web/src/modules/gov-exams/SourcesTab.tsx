import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Globe } from "lucide-react";
import {
  listOrganizations, listSources, createSource, updateSource, deleteSource,
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
import { toast } from "@/components/ui/use-toast";

const ORG_TYPE_LABEL: Record<GovOrgType, string> = { ssc: "SSC", banking: "Banking", railway: "Railway", other: "Other" };
const CONTENT_TYPE_LABEL: Record<GovSourceContentType, string> = { recruitment: "Recruitments", current_affair: "Current Affairs" };
const FETCH_MODE_LABEL: Record<GovSourceFetchMode, string> = { url: "Scrape a URL", search: "AI Web Search" };

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

const sourceSchema = z
  .object({
    category: z.enum(["ssc", "banking", "railway", "other"]),
    contentType: z.enum(["recruitment", "current_affair"]),
    fetchMode: z.enum(["url", "search"]),
    organizationId: z.string().uuid().or(z.literal("")).optional(),
    label: z.string().min(1, "Required").max(200),
    url: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
    searchQuery: z.string().max(300).optional(),
    enabled: z.boolean(),
  })
  .refine((data) => data.fetchMode !== "url" || !!data.url, { message: "Required for 'Scrape a URL'", path: ["url"] })
  .refine((data) => data.fetchMode !== "search" || !!data.searchQuery, { message: "Required for 'AI Web Search'", path: ["searchQuery"] });
type SourceFormValues = z.infer<typeof sourceSchema>;

function SourceFormDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: GovSource }) {
  const qc = useQueryClient();
  const { data: organizations } = useQuery({ queryKey: ["gov-organizations"], queryFn: listOrganizations });

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<SourceFormValues>({
    resolver: zodResolver(sourceSchema),
    defaultValues: existing
      ? {
          category: existing.category, contentType: existing.contentType, fetchMode: existing.fetchMode,
          organizationId: existing.organizationId ?? "", label: existing.label,
          url: existing.url ?? "", searchQuery: existing.searchQuery ?? "", enabled: existing.enabled,
        }
      : { category: "ssc", contentType: "recruitment", fetchMode: "url", organizationId: "", label: "", url: "", searchQuery: "", enabled: true },
  });
  const category = watch("category");
  const contentType = watch("contentType");
  const fetchMode = watch("fetchMode");
  const organizationId = watch("organizationId");
  const enabled = watch("enabled");

  const mutation = useMutation({
    mutationFn: (values: SourceFormValues) => {
      const input = {
        ...values,
        organizationId: values.organizationId || undefined,
        url: values.url || undefined,
        searchQuery: values.searchQuery || undefined,
      };
      return existing ? updateSource(existing.id, input) : createSource(input);
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
          <FormField label="Fetch Mode" required>
            <Select value={fetchMode} onValueChange={(v) => setValue("fetchMode", v as GovSourceFetchMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FETCH_MODE_LABEL) as GovSourceFetchMode[]).map((t) => (
                  <SelectItem key={t} value={t}>{FETCH_MODE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {contentType === "recruitment" && (
            <FormField label="Organization" error={errors.organizationId}>
              <Select value={organizationId || "__none__"} onValueChange={(v) => setValue("organizationId", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Not set — extraction must resolve one by name" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not set</SelectItem>
                  {organizations?.map((org) => (
                    <SelectItem key={org.id} value={org.id}>{org.name} ({org.shortName})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField label="Label" required error={errors.label}>
            <Input {...register("label")} placeholder="e.g. SSC — Latest Notifications" />
          </FormField>
          {fetchMode === "url" ? (
            <FormField label="URL" required error={errors.url}>
              <Input {...register("url")} placeholder="https://ssc.nic.in/notifications" />
            </FormField>
          ) : (
            <FormField label="Search Query" required error={errors.searchQuery}>
              <Input {...register("searchQuery")} placeholder="e.g. current and upcoming bank job openings with dates" />
            </FormField>
          )}
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
        The scheduled "Government Exam Source Scrape" job (see Settings → Jobs) fetches every enabled source below —
        either scraping a fixed URL or running an AI web search — extracts structured data, and auto-publishes what
        validates cleanly. Anything that doesn't lands as a draft for review instead of being discarded.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Source</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !sources?.length ? (
        <EmptyState icon={Globe} title="No sources yet" description="Add a URL to scrape, or a search query, for a category — e.g. SSC's notifications page." actionLabel="Add Source" onAction={() => setShowCreate(true)} />
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
                  {source.organization && <Badge variant="outline">{source.organization.shortName}</Badge>}
                  {source.lastScrapeStatus && (
                    <Badge variant={source.lastScrapeStatus === "error" ? "danger" : "outline"}>
                      Last: {source.lastScrapeStatus}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">{source.fetchMode === "url" ? source.url : source.searchQuery}</p>
                {source.lastScrapeError && <p className="text-xs text-red-500 truncate mt-0.5">{source.lastScrapeError}</p>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Switch
                  checked={source.enabled}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: source.id, enabled: v })}
                />
                <Button size="sm" variant="outline" onClick={() => setEditing(source)}>Edit</Button>
                <Button
                  size="sm" variant="ghost" className="text-red-600"
                  onClick={() => { if (confirm(`Delete "${source.label}"?`)) deleteMutation.mutate(source.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
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

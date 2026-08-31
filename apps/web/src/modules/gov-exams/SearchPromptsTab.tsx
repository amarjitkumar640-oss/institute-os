import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import {
  listJobVacancyPromptTemplates, saveJobVacancyPromptTemplate, deleteJobVacancyPromptTemplate,
  getCurrentAffairsPromptTemplate, saveCurrentAffairsPromptTemplate, deleteCurrentAffairsPromptTemplate,
  type GovOrgType, type GovJobVacancyPromptTemplate, type GovCurrentAffairsPromptTemplate,
} from "@/api/govExams";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";

const ORG_TYPE_LABEL: Record<GovOrgType, string> = { ssc: "SSC", banking: "Banking", railway: "Railway", other: "Other" };
const JOB_VACANCY_CATEGORIES: GovOrgType[] = ["ssc", "banking", "railway", "other"];

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function LastRunStatus({ template }: { template: { lastRunAt: string | null; lastRunStatus: string | null; lastRunError: string | null } }) {
  if (!template.lastRunAt) return <Badge variant="outline">Never run</Badge>;
  return (
    <div className="flex items-center gap-2">
      <Badge variant={template.lastRunStatus === "error" ? "danger" : "outline"}>
        Last run: {formatDate(template.lastRunAt)} — {template.lastRunStatus ?? "unknown"}
      </Badge>
      {template.lastRunError && <span className="text-xs text-red-500 truncate">{template.lastRunError}</span>}
    </div>
  );
}

function JobVacancyPromptCard({ category, existing }: { category: GovOrgType; existing?: GovJobVacancyPromptTemplate }) {
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);

  useEffect(() => {
    setPrompt(existing?.prompt ?? "");
    setEnabled(existing?.enabled ?? true);
  }, [existing]);

  const mutation = useMutation({
    mutationFn: (input: { prompt: string; enabled?: boolean }) => saveJobVacancyPromptTemplate(category, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-job-vacancy-prompt-templates"] });
      toast({ title: "Saved" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteJobVacancyPromptTemplate(category),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-job-vacancy-prompt-templates"] });
      toast({ title: "Removed" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const dirty = prompt !== (existing?.prompt ?? "");

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{ORG_TYPE_LABEL[category]}</h3>
          {existing && <LastRunStatus template={existing} />}
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => { setEnabled(v); if (existing) mutation.mutate({ prompt, enabled: v }); }}
          />
          {dirty && (
            <Button size="sm" disabled={!prompt.trim() || mutation.isPending} onClick={() => mutation.mutate({ prompt, enabled })}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          )}
          {existing && (
            <Button
              size="sm" variant="ghost" className="text-red-600"
              disabled={deleteMutation.isPending}
              onClick={() => { if (confirm(`Remove the ${ORG_TYPE_LABEL[category]} prompt?`)) deleteMutation.mutate(); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <FormField label="Prompt">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={14}
          placeholder={`Paste the full ${ORG_TYPE_LABEL[category]} job-vacancy research prompt here — passed to the AI Gateway's web search as-is every sweep.`}
          className="font-mono text-xs"
        />
      </FormField>
    </div>
  );
}

function CurrentAffairsPromptCard({ existing }: { existing?: GovCurrentAffairsPromptTemplate | null }) {
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);

  useEffect(() => {
    setPrompt(existing?.prompt ?? "");
    setEnabled(existing?.enabled ?? true);
  }, [existing]);

  const mutation = useMutation({
    mutationFn: (input: { prompt: string; enabled?: boolean }) => saveCurrentAffairsPromptTemplate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-current-affairs-prompt-template"] });
      toast({ title: "Saved" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCurrentAffairsPromptTemplate(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-current-affairs-prompt-template"] });
      toast({ title: "Removed" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const dirty = prompt !== (existing?.prompt ?? "");

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Current Affairs</h3>
          {existing && <LastRunStatus template={existing} />}
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => { setEnabled(v); if (existing) mutation.mutate({ prompt, enabled: v }); }}
          />
          {dirty && (
            <Button size="sm" disabled={!prompt.trim() || mutation.isPending} onClick={() => mutation.mutate({ prompt, enabled })}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          )}
          {existing && (
            <Button
              size="sm" variant="ghost" className="text-red-600"
              disabled={deleteMutation.isPending}
              onClick={() => { if (confirm("Remove the Current Affairs prompt?")) deleteMutation.mutate(); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <FormField label="Prompt">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={14}
          placeholder="Paste the full current-affairs research prompt here — one shared search covering all exam categories, each item self-tagging its own relevance."
          className="font-mono text-xs"
        />
      </FormField>
    </div>
  );
}

export function SearchPromptsTab() {
  const { data: jobVacancyTemplates, isLoading: loadingJobVacancy } = useQuery({
    queryKey: ["gov-job-vacancy-prompt-templates"],
    queryFn: listJobVacancyPromptTemplates,
  });
  const { data: currentAffairsTemplate, isLoading: loadingCurrentAffairs } = useQuery({
    queryKey: ["gov-current-affairs-prompt-template"],
    queryFn: getCurrentAffairsPromptTemplate,
  });

  const templateByCategory = new Map(jobVacancyTemplates?.map((t) => [t.category, t]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 flex items-center gap-2">
        <Search className="h-4 w-4" />
        One admin-written prompt per job-vacancy category, plus one shared current-affairs prompt, passed to the AI
        Gateway's web search as-is and mapped into the same rich shape the JSON import features accept. Each prompt
        has its own schedule, managed in Settings → System → Government Exam Jobs, where you can also trigger it
        manually.
      </p>

      {loadingJobVacancy ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {JOB_VACANCY_CATEGORIES.map((category) => (
            <JobVacancyPromptCard key={category} category={category} existing={templateByCategory.get(category)} />
          ))}
        </div>
      )}

      {loadingCurrentAffairs ? <Skeleton className="h-40 w-full" /> : <CurrentAffairsPromptCard existing={currentAffairsTemplate} />}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import {
  listSources, updateSource, createSource, runSourceNow,
  listJobVacancyPromptTemplates, saveJobVacancyPromptTemplate, runJobVacancyPromptTemplateNow,
  getCurrentAffairsPromptTemplate, saveCurrentAffairsPromptTemplate, runCurrentAffairsPromptTemplateNow,
  type GovSource, type GovOrgType, type GovSourceContentType,
  type GovJobVacancyPromptTemplate, type GovCurrentAffairsPromptTemplate,
} from "@/api/govExams";
import { ScheduleFields, DEFAULT_SCHEDULE, type ScheduleFieldsValue } from "@/modules/gov-exams/ScheduleFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FormField } from "@/components/FormField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";

const ORG_TYPE_LABEL: Record<GovOrgType, string> = { ssc: "SSC", banking: "Banking", railway: "Railway", other: "Other" };
const JOB_VACANCY_CATEGORIES: GovOrgType[] = ["ssc", "banking", "railway", "other"];

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function scheduleOf(row: {
  scheduleFrequency: string;
  scheduleTimeOfDay: string | null;
  scheduleDayOfWeek: number | null;
  scheduleDayOfMonth: number | null;
}): ScheduleFieldsValue {
  return {
    scheduleFrequency: row.scheduleFrequency as ScheduleFieldsValue["scheduleFrequency"],
    scheduleTimeOfDay: row.scheduleTimeOfDay ?? DEFAULT_SCHEDULE.scheduleTimeOfDay,
    scheduleDayOfWeek: row.scheduleDayOfWeek ?? DEFAULT_SCHEDULE.scheduleDayOfWeek,
    scheduleDayOfMonth: row.scheduleDayOfMonth ?? DEFAULT_SCHEDULE.scheduleDayOfMonth,
  };
}

function LastRunCell({ status, error }: { status: string | null; error: string | null }) {
  if (!status) return <Badge variant="outline">Never run</Badge>;
  const badge = <Badge variant={status === "error" ? "danger" : "outline"}>{status}</Badge>;
  if (!error) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-start gap-0.5 min-w-0 cursor-default">
          {badge}
          <span className="text-xs text-red-500 truncate max-w-full">{error}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{error}</TooltipContent>
    </Tooltip>
  );
}

function JobRowShell({ name, typeLabel, schedule, onScheduleChange, enabled, onToggle, lastStatus, lastError, onRun, running }: {
  name: string;
  typeLabel: string;
  schedule: ScheduleFieldsValue;
  onScheduleChange: (next: ScheduleFieldsValue) => void;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  lastStatus: string | null;
  lastError: string | null;
  onRun: () => void;
  running: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(160px,200px)_minmax(220px,260px)_minmax(0,1fr)_auto] items-center gap-4 bg-white rounded-xl border border-gray-100 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        <Badge variant="purple" className="mt-1">{typeLabel}</Badge>
      </div>
      <div>
        <ScheduleFields value={schedule} onChange={onScheduleChange} />
      </div>
      <div className="min-w-0"><LastRunCell status={lastStatus} error={lastError} /></div>
      <div className="flex items-center gap-3 shrink-0">
        <Switch checked={enabled} onCheckedChange={onToggle} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" onClick={onRun} disabled={running}>
              <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Run Now</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function SourceJobRow({ source }: { source: GovSource }) {
  const qc = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: (input: Partial<ScheduleFieldsValue> & { enabled?: boolean }) => updateSource(source.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gov-sources"] }),
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });
  const runMutation = useMutation({
    mutationFn: () => runSourceNow(source.id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["gov-sources"] });
      toast({ title: `Run complete: ${result.status}`, description: `Created ${result.created}, published ${result.published}` });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <JobRowShell
      name={source.label}
      typeLabel={`Scrape — ${ORG_TYPE_LABEL[source.category]}`}
      schedule={scheduleOf(source)}
      onScheduleChange={(next) => updateMutation.mutate(next)}
      enabled={source.enabled}
      onToggle={(v) => updateMutation.mutate({ enabled: v })}
      lastStatus={source.lastScrapeStatus}
      lastError={source.lastScrapeError}
      onRun={() => runMutation.mutate()}
      running={runMutation.isPending}
    />
  );
}

function JobVacancyJobRow({ template }: { template: GovJobVacancyPromptTemplate }) {
  const qc = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: (input: Partial<ScheduleFieldsValue> & { enabled?: boolean }) =>
      saveJobVacancyPromptTemplate(template.category, { prompt: template.prompt, enabled: template.enabled, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gov-job-vacancy-prompt-templates"] }),
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });
  const runMutation = useMutation({
    mutationFn: () => runJobVacancyPromptTemplateNow(template.category),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["gov-job-vacancy-prompt-templates"] });
      toast({ title: `Run complete: ${result.status}`, description: `Created ${result.created}, published ${result.published}` });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <JobRowShell
      name={`${ORG_TYPE_LABEL[template.category]} Job-Vacancy Prompt`}
      typeLabel="Search Prompt"
      schedule={scheduleOf(template)}
      onScheduleChange={(next) => updateMutation.mutate(next)}
      enabled={template.enabled}
      onToggle={(v) => updateMutation.mutate({ enabled: v })}
      lastStatus={template.lastRunStatus}
      lastError={template.lastRunError}
      onRun={() => runMutation.mutate()}
      running={runMutation.isPending}
    />
  );
}

function CurrentAffairsJobRow({ template }: { template: GovCurrentAffairsPromptTemplate }) {
  const qc = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: (input: Partial<ScheduleFieldsValue> & { enabled?: boolean }) =>
      saveCurrentAffairsPromptTemplate({ prompt: template.prompt, enabled: template.enabled, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gov-current-affairs-prompt-template"] }),
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });
  const runMutation = useMutation({
    mutationFn: () => runCurrentAffairsPromptTemplateNow(),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["gov-current-affairs-prompt-template"] });
      toast({ title: `Run complete: ${result.status}`, description: `Created ${result.created}, published ${result.published}` });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <JobRowShell
      name="Current Affairs Prompt"
      typeLabel="Search Prompt"
      schedule={scheduleOf(template)}
      onScheduleChange={(next) => updateMutation.mutate(next)}
      enabled={template.enabled}
      onToggle={(v) => updateMutation.mutate({ enabled: v })}
      lastStatus={template.lastRunStatus}
      lastError={template.lastRunError}
      onRun={() => runMutation.mutate()}
      running={runMutation.isPending}
    />
  );
}

type AddJobKind = "source" | "job-vacancy" | "current-affairs";

function AddJobDialog({ open, onClose, existingCategories, currentAffairsConfigured }: {
  open: boolean;
  onClose: () => void;
  existingCategories: GovOrgType[];
  currentAffairsConfigured: boolean;
}) {
  const qc = useQueryClient();
  const availableCategories = JOB_VACANCY_CATEGORIES.filter((c) => !existingCategories.includes(c));
  const [kind, setKind] = useState<AddJobKind>("source");
  const [schedule, setSchedule] = useState<ScheduleFieldsValue>(DEFAULT_SCHEDULE);

  const [category, setCategory] = useState<GovOrgType>("ssc");
  const [contentType, setContentType] = useState<GovSourceContentType>("recruitment");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const [promptCategory, setPromptCategory] = useState<GovOrgType>(availableCategories[0] ?? "ssc");
  const [promptText, setPromptText] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (kind === "source") {
        return createSource({ category, contentType, fetchMode: "url", label, url, enabled: true, ...schedule });
      }
      if (kind === "job-vacancy") {
        return saveJobVacancyPromptTemplate(promptCategory, { prompt: promptText, enabled: true, ...schedule });
      }
      return saveCurrentAffairsPromptTemplate({ prompt: promptText, enabled: true, ...schedule });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-sources"] });
      qc.invalidateQueries({ queryKey: ["gov-job-vacancy-prompt-templates"] });
      qc.invalidateQueries({ queryKey: ["gov-current-affairs-prompt-template"] });
      toast({ title: "Job added" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const canSubmit =
    kind === "source" ? !!(label.trim() && url.trim()) :
    kind === "job-vacancy" ? !!(promptText.trim() && availableCategories.length > 0) :
    !currentAffairsConfigured && !!promptText.trim();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Job</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <FormField label="Job Type" required>
            <Select value={kind} onValueChange={(v) => setKind(v as AddJobKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="source">Scrape a Source URL</SelectItem>
                <SelectItem value="job-vacancy" disabled={availableCategories.length === 0}>
                  Job-Vacancy Search Prompt{availableCategories.length === 0 ? " (all categories configured)" : ""}
                </SelectItem>
                <SelectItem value="current-affairs" disabled={currentAffairsConfigured}>
                  Current-Affairs Search Prompt{currentAffairsConfigured ? " (already configured)" : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {kind === "source" && (
            <>
              <FormField label="Category" required>
                <Select value={category} onValueChange={(v) => setCategory(v as GovOrgType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ORG_TYPE_LABEL) as GovOrgType[]).map((t) => <SelectItem key={t} value={t}>{ORG_TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Content Type" required>
                <Select value={contentType} onValueChange={(v) => setContentType(v as GovSourceContentType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recruitment">Recruitments</SelectItem>
                    <SelectItem value="current_affair">Current Affairs</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Label" required>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. SSC — Latest Notifications" />
              </FormField>
              <FormField label="URL" required>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ssc.nic.in/notifications" />
              </FormField>
            </>
          )}

          {kind === "job-vacancy" && (
            <>
              <FormField label="Category" required>
                <Select value={promptCategory} onValueChange={(v) => setPromptCategory(v as GovOrgType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((c) => <SelectItem key={c} value={c}>{ORG_TYPE_LABEL[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Prompt" required>
                <Textarea
                  value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={8}
                  className="font-mono text-xs" placeholder="Paste the full job-vacancy research prompt here."
                />
              </FormField>
            </>
          )}

          {kind === "current-affairs" && (
            <FormField label="Prompt" required>
              <Textarea
                value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={8}
                className="font-mono text-xs" placeholder="Paste the full current-affairs research prompt here."
              />
            </FormField>
          )}

          <FormField label="Schedule" required>
            <ScheduleFields value={schedule} onChange={setSchedule} />
          </FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>Add Job</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GovExamJobsSettings() {
  const [showAdd, setShowAdd] = useState(false);
  const { data: sources, isLoading: loadingSources } = useQuery({ queryKey: ["gov-sources"], queryFn: listSources });
  const { data: jobVacancyTemplates, isLoading: loadingJobVacancy } = useQuery({
    queryKey: ["gov-job-vacancy-prompt-templates"],
    queryFn: listJobVacancyPromptTemplates,
  });
  const { data: currentAffairsTemplate, isLoading: loadingCurrentAffairs } = useQuery({
    queryKey: ["gov-current-affairs-prompt-template"],
    queryFn: getCurrentAffairsPromptTemplate,
  });

  const isLoading = loadingSources || loadingJobVacancy || loadingCurrentAffairs;
  const existingCategories = jobVacancyTemplates?.map((t) => t.category) ?? [];
  const isEmpty = !sources?.length && !jobVacancyTemplates?.length && !currentAffairsTemplate;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Government Exam Jobs</CardTitle>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Job</Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-gray-400 mb-3">
          Every source scrape and every search prompt runs on its own independent schedule — configure frequency and
          time here, or trigger any one of them immediately with Run Now.
        </p>
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : isEmpty ? (
          <p className="text-sm text-gray-400">No jobs configured yet — click Add Job to get started.</p>
        ) : (
          <div className="space-y-2">
            {sources?.map((s) => <SourceJobRow key={s.id} source={s} />)}
            {jobVacancyTemplates?.map((t) => <JobVacancyJobRow key={t.category} template={t} />)}
            {currentAffairsTemplate && <CurrentAffairsJobRow template={currentAffairsTemplate} />}
          </div>
        )}
      </CardContent>

      {showAdd && (
        <AddJobDialog
          open={showAdd}
          onClose={() => setShowAdd(false)}
          existingCategories={existingCategories}
          currentAffairsConfigured={!!currentAffairsTemplate}
        />
      )}
    </Card>
  );
}

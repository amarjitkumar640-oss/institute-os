import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Settings2, Bell, RefreshCw, Camera, Loader2, X, Building2, Sparkles, Plus, Trash2 } from "lucide-react";
import { getTenantSettings, updateTenantSettings, uploadTenantLogo, deleteTenantLogo } from "@/api/tenants";
import { getNotificationRouting, updateNotificationRouting } from "@/api/notifications";
import { listJobs, runJobNow, updateJob, type Job } from "@/api/jobs";
import { GovExamJobsSettings } from "./GovExamJobsSettings";
import {
  getProviderStatus, listProviderModels, listModelCatalog, createModelCatalogEntry, updateModelCatalogEntry, deleteModelCatalogEntry,
  listModelAssignments, setModelAssignment, PURPOSE_REQUIRED_CAPABILITY,
  type AiProviderType, type AiModelPurpose, type AiModelCatalogEntry,
} from "@/api/aiSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { titleCase, formatDateTime } from "@/lib/utils";

function extractAiSettingsError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function BrandingSettings() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ["tenant-settings"], queryFn: getTenantSettings });
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [accent, setAccent] = useState("");
  const [background, setBackground] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setPrimary(settings.branding.primary ?? "#C0392B");
      setSecondary(settings.branding.secondary ?? "#");
      setAccent(settings.branding.accent ?? "#");
      setBackground(settings.branding.background ?? "#");
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: updateTenantSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to save settings" }),
  });

  const uploadLogoMutation = useMutation({
    mutationFn: uploadTenantLogo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-settings"] });
      toast({ title: "Logo updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Logo upload failed" }),
  });
  const deleteLogoMutation = useMutation({
    mutationFn: deleteTenantLogo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-settings"] });
      toast({ title: "Logo removed" });
    },
    onError: () => toast({ variant: "destructive", title: "Could not remove logo" }),
  });

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadLogoMutation.mutate(file);
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-sm">Institute Logo</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-5">
          <div className="relative shrink-0">
            {settings?.branding.logoUrl ? (
              <img src={settings.branding.logoUrl} alt={settings.name} className="h-20 w-20 rounded-2xl object-cover border border-gray-100" />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-violet-50 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-violet-300" />
              </div>
            )}
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadLogoMutation.isPending}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-gray-50"
              title={settings?.branding.logoUrl ? "Replace logo" : "Add logo"}
            >
              {uploadLogoMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
                : <Camera className="h-3.5 w-3.5 text-gray-600" />}
            </button>
            {settings?.branding.logoUrl && (
              <button
                type="button"
                onClick={() => deleteLogoMutation.mutate()}
                disabled={deleteLogoMutation.isPending}
                className="absolute -bottom-1 -left-1 h-7 w-7 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-red-50"
                title="Remove logo"
              >
                <X className="h-3.5 w-3.5 text-red-500" />
              </button>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
          </div>
          <div className="text-sm text-gray-400">
            Shown on the login screen, sidebar, and the mobile app. Square images work best.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Login Method</CardTitle></CardHeader>
        <CardContent>
          <FormField label="How staff log in">
            <Select
              value={settings?.loginMethod ?? "phone"}
              onValueChange={(v) => mutation.mutate({ loginMethod: v as "phone" | "email_username" })}
            >
              <SelectTrigger className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">Phone Number</SelectItem>
                <SelectItem value="email_username">Email / Username</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Brand Colors</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Primary Color">
              <div className="flex items-center gap-2">
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-12 rounded border border-gray-200" />
                <Input value={primary} onChange={(e) => setPrimary(e.target.value)} className="font-mono text-sm" maxLength={7} />
              </div>
            </FormField>
            <FormField label="Secondary Color">
              <div className="flex items-center gap-2">
                <input type="color" value={secondary || "#000000"} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-12 rounded border border-gray-200" />
                <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} className="font-mono text-sm" maxLength={7} />
              </div>
            </FormField>
            <FormField label="Accent Color">
              <div className="flex items-center gap-2">
                <input type="color" value={accent || "#000000"} onChange={(e) => setAccent(e.target.value)} className="h-9 w-12 rounded border border-gray-200" />
                <Input value={accent} onChange={(e) => setAccent(e.target.value)} className="font-mono text-sm" maxLength={7} />
              </div>
            </FormField>
            <FormField label="Background Color">
              <div className="flex items-center gap-2">
                <input type="color" value={background || "#000000"} onChange={(e) => setBackground(e.target.value)} className="h-9 w-12 rounded border border-gray-200" />
                <Input value={background} onChange={(e) => setBackground(e.target.value)} className="font-mono text-sm" maxLength={7} />
              </div>
            </FormField>
          </div>
          <Button onClick={() => mutation.mutate({ primary, secondary, accent, background })} disabled={mutation.isPending}>
            Save Colors
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Notification Timing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Class Reminder (minutes before)">
              <Input
                type="number"
                defaultValue={settings?.classReminderMinutes ?? 30}
                onBlur={(e) => mutation.mutate({ classReminderMinutes: Number(e.target.value) })}
                min={1}
                max={120}
              />
            </FormField>
            <FormField label="Overdue Grace Days">
              <Input
                type="number"
                defaultValue={settings?.overdueGraceDays ?? 3}
                onBlur={(e) => mutation.mutate({ overdueGraceDays: Number(e.target.value) })}
                min={0}
                max={60}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Legal &amp; Billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-400 -mt-1">
            Shown on generated invoices for CSR-sponsored courses (Sponsors → Invoices) — the seller details on a
            tax invoice, alongside the sponsor's own.
          </p>
          <FormField label="Registered Legal Name">
            <Input
              defaultValue={settings?.legalName ?? ""}
              onBlur={(e) => mutation.mutate({ legalName: e.target.value || null })}
              placeholder="Defaults to the institute name above if left blank"
            />
          </FormField>
          <FormField label="Registered Address">
            <Input
              defaultValue={settings?.registeredAddress ?? ""}
              onBlur={(e) => mutation.mutate({ registeredAddress: e.target.value || null })}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="GSTIN">
              <Input
                defaultValue={settings?.gstin ?? ""}
                onBlur={(e) => mutation.mutate({ gstin: e.target.value || null })}
                className="font-mono text-sm"
                maxLength={20}
              />
            </FormField>
            <FormField label="GST State Code">
              <Input
                defaultValue={settings?.stateCode ?? ""}
                onBlur={(e) => mutation.mutate({ stateCode: e.target.value || null })}
                placeholder="e.g. 27"
                className="font-mono text-sm"
                maxLength={2}
              />
            </FormField>
          </div>
          <FormField label="Bank Details">
            <Input
              defaultValue={settings?.bankDetails ?? ""}
              onBlur={(e) => mutation.mutate({ bankDetails: e.target.value || null })}
              placeholder="Account name, number, IFSC — shown in the invoice footer"
            />
          </FormField>
        </CardContent>
      </Card>
    </div>
  );
}

const ROLES = ["admin", "teacher", "frontdesk"] as const;

function NotificationRoutingSettings() {
  const qc = useQueryClient();
  const { data: routing, isLoading } = useQuery({
    queryKey: ["notification-routing"],
    queryFn: getNotificationRouting,
  });

  const mutation = useMutation({
    mutationFn: ({ type, roles }: { type: string; roles: string[] }) => updateNotificationRouting(type, roles),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-routing"] });
      toast({ title: "Routing updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  function toggleRole(type: string, currentRoles: string[], role: string) {
    const next = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    mutation.mutate({ type, roles: next });
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Who receives each notification</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 font-medium text-gray-500">Notification Type</th>
              {ROLES.map((r) => (
                <th key={r} className="text-center py-2 font-medium text-gray-500 capitalize w-28">{r}</th>
              ))}
              <th className="text-center py-2 font-medium text-gray-500 w-24">Default?</th>
            </tr>
          </thead>
          <tbody>
            {(routing ?? []).filter((r) => r.configurable).map((row) => (
              <tr key={row.type} className="border-b border-gray-50">
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-800">{titleCase(row.type)}</p>
                </td>
                {ROLES.map((role) => (
                  <td key={role} className="py-3 text-center">
                    <Checkbox
                      checked={row.roles.includes(role)}
                      onCheckedChange={() => toggleRole(row.type, row.roles, role)}
                    />
                  </td>
                ))}
                <td className="py-3 text-center text-xs text-gray-400">
                  {row.isDefault ? "Default" : "Custom"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function statusBadge(status: string | undefined) {
  if (status === "success") return <Badge variant="success">Success</Badge>;
  if (status === "failure") return <Badge variant="danger">Failed</Badge>;
  if (status === "running") return <Badge variant="warning">Running</Badge>;
  return <Badge variant="outline">Never run</Badge>;
}

function JobIntervalCell({ job, onSave }: { job: Job; onSave: (minutes: number) => void }) {
  const [value, setValue] = useState(String(job.intervalMinutes));

  useEffect(() => setValue(String(job.intervalMinutes)), [job.intervalMinutes]);

  return (
    <Input
      type="number"
      min={1}
      max={1440}
      value={value}
      className="w-20 h-8"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const n = Number(value);
        if (n > 0 && n !== job.intervalMinutes) onSave(n);
      }}
    />
  );
}

function SystemJobsSettings() {
  const qc = useQueryClient();
  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: listJobs,
    refetchInterval: 15_000,
  });

  const runMutation = useMutation({
    mutationFn: runJobNow,
    onSuccess: (_, key) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      // batch-status-sweep changes Batch.status directly — without this,
      // a page that already had the batch list cached (e.g. Batches,
      // Batch Detail) keeps showing the pre-sweep status until something
      // else happens to invalidate it, even though the run succeeded.
      if (key === "batch-status-sweep") {
        qc.invalidateQueries({ queryKey: ["batches"] });
        qc.invalidateQueries({ queryKey: ["batch"] });
      }
      toast({ title: `${key} completed` });
    },
    onError: (err: any) =>
      toast({
        variant: "destructive",
        title: "Job failed",
        description: err?.response?.data?.error ?? "Check the error detail in the table below.",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: { intervalMinutes?: number; isEnabled?: boolean } }) =>
      updateJob(key, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Job updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  const columns: ColumnDef<Job>[] = [
    {
      id: "job",
      header: "Job",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-gray-800">{row.original.label}</p>
          <p className="text-xs text-gray-400">{row.original.description}</p>
        </div>
      ),
    },
    {
      id: "enabled",
      header: "Enabled",
      cell: ({ row }) => (
        <Switch
          checked={row.original.isEnabled}
          onCheckedChange={(checked) => updateMutation.mutate({ key: row.original.key, payload: { isEnabled: checked } })}
          disabled={updateMutation.isPending}
        />
      ),
    },
    {
      id: "interval",
      header: "Interval (min)",
      cell: ({ row }) => (
        <JobIntervalCell
          job={row.original}
          onSave={(minutes) => updateMutation.mutate({ key: row.original.key, payload: { intervalMinutes: minutes } })}
        />
      ),
    },
    {
      id: "lastRun",
      header: "Last Run",
      cell: ({ row }) => (
        <div>
          {statusBadge(row.original.lastRun?.status)}
          <p className="text-xs text-gray-400 mt-1">
            {formatDateTime(row.original.lastRun?.finishedAt ?? row.original.lastRun?.startedAt)}
          </p>
        </div>
      ),
    },
    {
      id: "detail",
      header: "Detail",
      cell: ({ row }) => {
        const run = row.original.lastRun;
        if (!run) return <span className="text-xs text-gray-400">—</span>;
        if (run.status === "failure") {
          return (
            <p className="text-xs text-red-600 max-w-xs truncate" title={run.errorMessage ?? ""}>
              {run.errorMessage}
            </p>
          );
        }
        if (run.resultSummary) {
          return (
            <p className="text-xs text-gray-500">
              {Object.entries(run.resultSummary).map(([k, v]) => `${k}: ${v}`).join(", ")}
            </p>
          );
        }
        return <span className="text-xs text-gray-400">—</span>;
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        // runMutation is shared across every row (one useMutation, not one
        // per job) — .isPending alone is true for ALL rows while ANY job is
        // running. .variables is the argument the in-flight call was made
        // with, so comparing it to this row's key scopes the spinner/disable
        // to only the job actually running, not every "Run Now" button.
        const isThisJobRunning = runMutation.isPending && runMutation.variables === row.original.key;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => runMutation.mutate(row.original.key)}
                disabled={isThisJobRunning || row.original.lastRun?.status === "running"}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isThisJobRunning ? "animate-spin" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run Now</TooltipContent>
          </Tooltip>
        );
      },
    },
  ];

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Background Jobs</CardTitle></CardHeader>
      <CardContent>
        <DataTable columns={columns} data={jobs ?? []} pageSize={10} />
      </CardContent>
    </Card>
  );
}

const PROVIDER_TYPES: AiProviderType[] = ["openai", "groq", "anthropic", "google"];
const PROVIDER_LABEL: Record<AiProviderType, string> = { openai: "OpenAI", groq: "Groq", anthropic: "Anthropic", google: "Google" };
const PURPOSES: AiModelPurpose[] = ["chat", "reasoning", "websearch", "embedding"];
const PURPOSE_LABEL: Record<AiModelPurpose, string> = {
  chat: "Chat", reasoning: "Reasoning (important tools)", websearch: "Web Search", embedding: "Embedding",
};

const modelCatalogSchema = z.object({
  provider: z.enum(["openai", "groq", "anthropic", "google"]),
  modelId: z.string().min(1, "Required"),
  label: z.string().min(1, "Required"),
  fallbackProvider: z.enum(["openai", "groq", "anthropic", "google"]).or(z.literal("")).optional(),
  fallbackModelId: z.string().optional(),
});
type ModelCatalogFormValues = z.infer<typeof modelCatalogSchema>;

function ModelCatalogFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<ModelCatalogFormValues>({
    resolver: zodResolver(modelCatalogSchema),
    defaultValues: { provider: "groq", modelId: "", label: "", fallbackProvider: "", fallbackModelId: "" },
  });
  const provider = watch("provider");
  const label = watch("label");
  const fallbackProvider = watch("fallbackProvider");

  const { data: providerModels, isLoading: loadingProviderModels, isError: providerModelsFailed } = useQuery({
    queryKey: ["ai-provider-models", provider],
    queryFn: () => listProviderModels(provider),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  function pickProviderModel(id: string) {
    setValue("modelId", id);
    if (!label) {
      const picked = providerModels?.find((m) => m.id === id);
      if (picked) setValue("label", picked.label);
    }
  }

  const mutation = useMutation({
    mutationFn: (values: ModelCatalogFormValues) =>
      createModelCatalogEntry({
        ...values,
        fallbackProvider: values.fallbackProvider || undefined,
        fallbackModelId: values.fallbackModelId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-model-catalog"] });
      toast({ title: "Model added" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractAiSettingsError(err) }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Model</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <FormField label="Provider" required>
            <Select value={provider} onValueChange={(v) => setValue("provider", v as AiProviderType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDER_TYPES.map((p) => <SelectItem key={p} value={p}>{PROVIDER_LABEL[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          {loadingProviderModels ? (
            <Skeleton className="h-9 w-full" />
          ) : providerModelsFailed || !providerModels?.length ? (
            <p className="text-xs text-gray-400">Live model list unavailable — enter the Model ID manually below.</p>
          ) : (
            <FormField label="Pick from live models">
              <Select value="__pick__" onValueChange={pickProviderModel}>
                <SelectTrigger><SelectValue placeholder={`${providerModels.length} models from ${PROVIDER_LABEL[provider]}`} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__pick__" disabled>{providerModels.length} models from {PROVIDER_LABEL[provider]}</SelectItem>
                  {providerModels.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField label="Model ID" required error={errors.modelId}>
            <Input {...register("modelId")} placeholder="e.g. gpt-4o, claude-sonnet-5" />
          </FormField>
          <FormField label="Label" required error={errors.label}>
            <Input {...register("label")} placeholder="e.g. GPT-4o (strong reasoning)" />
          </FormField>
          <FormField label="Fallback Provider (optional)">
            <Select value={fallbackProvider || "__none__"} onValueChange={(v) => setValue("fallbackProvider", v === "__none__" ? "" : (v as AiProviderType))}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {PROVIDER_TYPES.map((p) => <SelectItem key={p} value={p}>{PROVIDER_LABEL[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          {fallbackProvider && (
            <FormField label="Fallback Model ID">
              <Input {...register("fallbackModelId")} placeholder="e.g. gpt-4o-mini" />
            </FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AiModelsSettings() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: providers, isLoading: loadingProviders } = useQuery({ queryKey: ["ai-provider-status"], queryFn: getProviderStatus });
  const { data: catalog, isLoading: loadingCatalog } = useQuery({ queryKey: ["ai-model-catalog"], queryFn: listModelCatalog });
  const { data: assignments, isLoading: loadingAssignments } = useQuery({ queryKey: ["ai-model-assignments"], queryFn: listModelAssignments });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateModelCatalogEntry(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-model-catalog"] }),
    onError: (err: unknown) => toast({ variant: "destructive", title: extractAiSettingsError(err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteModelCatalogEntry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-model-catalog"] });
      toast({ title: "Deleted" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractAiSettingsError(err) }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ purpose, modelEntryId }: { purpose: AiModelPurpose; modelEntryId: string }) => setModelAssignment(purpose, modelEntryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-model-assignments"] });
      toast({ title: "Assignment updated" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractAiSettingsError(err) }),
  });

  const enabledCatalog = (catalog ?? []).filter((m) => m.enabled);
  const assignmentByPurpose = new Map((assignments ?? []).map((a) => [a.purpose, a]));
  const providerCapabilitiesByType = new Map((providers ?? []).map((p) => [p.provider, p.capabilities]));

  function catalogForPurpose(purpose: AiModelPurpose) {
    const requiredCapability = PURPOSE_REQUIRED_CAPABILITY[purpose];
    return enabledCatalog.filter((entry) => providerCapabilitiesByType.get(entry.provider)?.[requiredCapability]);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-sm">Providers</CardTitle></CardHeader>
        <CardContent>
          {loadingProviders ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {providers?.map((p) => (
                <Badge key={p.provider} variant={p.configured ? "success" : "outline"}>
                  {PROVIDER_LABEL[p.provider]} — {p.configured ? "configured" : "not configured"}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            API keys are set via environment variables, not here — this only shows which providers are usable.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Model Catalog</CardTitle>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Model</Button>
        </CardHeader>
        <CardContent>
          {loadingCatalog ? (
            <Skeleton className="h-24 w-full" />
          ) : !catalog?.length ? (
            <p className="text-sm text-gray-400">No models added yet.</p>
          ) : (
            <div className="space-y-2">
              {catalog.map((entry: AiModelCatalogEntry) => (
                <div key={entry.id} className="flex items-center gap-4 bg-gray-50/50 rounded-xl border border-gray-100 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{entry.label}</p>
                      <Badge variant="outline">{PROVIDER_LABEL[entry.provider]}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{entry.modelId}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      checked={entry.enabled}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: entry.id, enabled: v })}
                    />
                    <Button
                      size="sm" variant="ghost" className="text-red-600"
                      onClick={() => { if (confirm(`Delete "${entry.label}"?`)) deleteMutation.mutate(entry.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Purpose Assignment</CardTitle></CardHeader>
        <CardContent>
          {loadingAssignments ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-4">
              {PURPOSES.map((purpose) => {
                const current = assignmentByPurpose.get(purpose);
                const compatibleCatalog = catalogForPurpose(purpose);
                return (
                  <FormField key={purpose} label={PURPOSE_LABEL[purpose]}>
                    <Select
                      value={current?.modelEntryId ?? "__unassigned__"}
                      onValueChange={(v) => { if (v !== "__unassigned__") assignMutation.mutate({ purpose, modelEntryId: v }); }}
                    >
                      <SelectTrigger className="w-80"><SelectValue placeholder="Using system default" /></SelectTrigger>
                      <SelectContent>
                        {!current && <SelectItem value="__unassigned__">Using system default</SelectItem>}
                        {compatibleCatalog.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>{entry.label} ({PROVIDER_LABEL[entry.provider]})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!compatibleCatalog.length && (
                      <p className="text-xs text-gray-400 mt-1">
                        No enabled model supports {PURPOSE_REQUIRED_CAPABILITY[purpose] === "webSearch" ? "web search" : PURPOSE_REQUIRED_CAPABILITY[purpose]} yet
                        {purpose === "websearch" && " — only OpenAI and Anthropic support native web search today"}.
                      </p>
                    )}
                  </FormField>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && <ModelCatalogFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <h1 className="text-xl font-bold text-gray-900">Organization Settings</h1>
      </div>
      <div className="flex-1 p-6">
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">
              <Settings2 className="mr-2 h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="mr-2 h-4 w-4" />
              Notification Routing
            </TabsTrigger>
            <TabsTrigger value="system">
              <RefreshCw className="mr-2 h-4 w-4" />
              System
            </TabsTrigger>
            <TabsTrigger value="ai-models">
              <Sparkles className="mr-2 h-4 w-4" />
              AI Models
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <BrandingSettings />
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <NotificationRoutingSettings />
          </TabsContent>

          <TabsContent value="system" className="mt-4">
            <Tabs defaultValue="background-jobs">
              <TabsList>
                <TabsTrigger value="background-jobs">System Background Jobs</TabsTrigger>
                <TabsTrigger value="gov-exam-jobs">Government Exam Jobs</TabsTrigger>
              </TabsList>

              <TabsContent value="background-jobs" className="mt-4">
                <SystemJobsSettings />
              </TabsContent>

              <TabsContent value="gov-exam-jobs" className="mt-4">
                <GovExamJobsSettings />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="ai-models" className="mt-4">
            <AiModelsSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

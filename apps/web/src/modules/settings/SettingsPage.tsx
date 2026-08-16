import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Settings2, Bell, RefreshCw } from "lucide-react";
import { getTenantSettings, updateTenantSettings } from "@/api/tenants";
import { getNotificationRouting, updateNotificationRouting } from "@/api/notifications";
import { listJobs, runJobNow, updateJob, type Job } from "@/api/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/FormField";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { titleCase, formatDateTime } from "@/lib/utils";

function BrandingSettings() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ["tenant-settings"], queryFn: getTenantSettings });
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [accent, setAccent] = useState("");

  useEffect(() => {
    if (settings) {
      setPrimary(settings.branding.primary ?? "#C0392B");
      setSecondary(settings.branding.secondary ?? "#");
      setAccent(settings.branding.accent ?? "#");
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

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-6">
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
          <div className="grid grid-cols-3 gap-4">
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
          </div>
          <Button onClick={() => mutation.mutate({ primary, secondary, accent })} disabled={mutation.isPending}>
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
      cell: ({ row }) => (
        <Button
          size="sm"
          onClick={() => runMutation.mutate(row.original.key)}
          disabled={runMutation.isPending || row.original.lastRun?.status === "running"}
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${runMutation.isPending ? "animate-spin" : ""}`} />
          Run Now
        </Button>
      ),
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
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <BrandingSettings />
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <NotificationRoutingSettings />
          </TabsContent>

          <TabsContent value="system" className="mt-4">
            <SystemJobsSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

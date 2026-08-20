import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Search, UserCog, Key, Building2, X } from "lucide-react";
import { useForm, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { listStaff, createStaff, updateStaff, resetPassword, type Staff } from "@/api/staff";
import { listAssignableCenters, assignStaffToCenter, removeStaffFromCenter } from "@/api/centers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatDate, initials } from "@/lib/utils";

// The API's error body is usually a plain string, but a Zod validation
// failure (400) sends { error: { formErrors, fieldErrors } } instead —
// rendering that object directly as toast text crashes the page. Flatten
// whichever shape shows up into one readable string.
function apiErrorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const flat = data as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const messages = [...(flat.formErrors ?? []), ...Object.values(flat.fieldErrors ?? {}).flat()];
    if (messages.length) return messages.join(" ");
  }
  return "Something went wrong";
}

const createStaffSchema = z.object({
  fullName: z.string().min(1, "Required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(6, "Required"),
  username: z.string().min(3).optional(),
  // A staff member can hold more than one role at once (e.g. admin +
  // teacher at the same center).
  roles: z.array(z.enum(["admin", "teacher", "frontdesk"])).min(1, "Select at least one role"),
  password: z.string().min(6, "At least 6 characters"),
});
type CreateStaffForm = z.infer<typeof createStaffSchema>;

const ROLE_OPTIONS: Array<{ value: "admin" | "teacher" | "frontdesk"; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Teacher" },
  { value: "frontdesk", label: "Front Desk" },
];

function RoleCheckboxes({ selected, onChange }: { selected: ("admin" | "teacher" | "frontdesk")[]; onChange: (roles: ("admin" | "teacher" | "frontdesk")[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {ROLE_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={selected.includes(opt.value)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...selected, opt.value] : selected.filter((r) => r !== opt.value))
            }
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function CreateStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<CreateStaffForm>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: { roles: ["frontdesk"] },
  });
  const selectedRoles = watch("roles");

  const mutation = useMutation({
    mutationFn: createStaff,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast({ title: "Staff account created" });
      onClose();
    },
    onError: (err: unknown) => {
      toast({ variant: "destructive", title: apiErrorMessage(err) });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Staff Account</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <FormField label="Full Name" error={errors.fullName} required>
            <Input {...register("fullName")} />
          </FormField>
          <FormField label="Email" error={errors.email} required>
            <Input {...register("email")} type="email" />
          </FormField>
          <FormField label="Phone" error={errors.phone} required>
            <Input {...register("phone")} />
          </FormField>
          <FormField label="Username (optional)" error={errors.username}>
            <Input {...register("username")} placeholder="For username login" />
          </FormField>
          <FormField label="Roles" error={errors.roles as unknown as FieldError | undefined} required>
            <RoleCheckboxes selected={selectedRoles} onChange={(roles) => setValue("roles", roles)} />
          </FormField>
          <FormField label="Password" error={errors.password} required>
            <Input {...register("password")} type="password" placeholder="At least 6 characters" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Create Account</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditStaffDialog({ staff, open, onClose }: { staff: Staff; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setValue, watch, formState: { isSubmitting } } = useForm({
    defaultValues: { fullName: staff.fullName, phone: staff.phone, username: staff.username ?? "", roles: staff.roles },
  });
  const selectedRoles = watch("roles");

  const mutation = useMutation({
    mutationFn: (d: { fullName?: string; phone?: string; username?: string | null; roles?: ("admin" | "teacher" | "frontdesk")[] }) =>
      updateStaff(staff.id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast({ title: "Staff updated" });
      onClose();
    },
    onError: (err: unknown) => {
      toast({ variant: "destructive", title: apiErrorMessage(err) });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Staff</DialogTitle></DialogHeader>
        <form
          onSubmit={handleSubmit((d) =>
            // An empty username input means "no username," but the API's
            // schema requires either at least 3 characters or nothing at all
            // — an empty string satisfies neither and gets rejected.
            mutation.mutate({ ...d, username: d.username?.trim() ? d.username.trim() : null })
          )}
          className="space-y-4"
        >
          <FormField label="Full Name">
            <Input {...register("fullName")} />
          </FormField>
          <FormField label="Phone">
            <Input {...register("phone")} />
          </FormField>
          <FormField label="Username">
            <Input {...register("username")} />
          </FormField>
          <FormField label="Roles">
            <RoleCheckboxes selected={selectedRoles} onChange={(roles) => setValue("roles", roles)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ staffId, open, onClose }: { staffId: string; open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleReset() {
    if (password.length < 6) { toast({ variant: "destructive", title: "Password must be at least 6 characters" }); return; }
    if (password !== confirm) { toast({ variant: "destructive", title: "Passwords do not match" }); return; }
    setLoading(true);
    try {
      await resetPassword(staffId, password);
      toast({ title: "Password reset successfully" });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Reset failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <FormField label="New Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
          </FormField>
          <FormField label="Confirm New Password" error={mismatch ? ({ message: "Passwords do not match" } as FieldError) : undefined}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleReset} disabled={loading || !password || mismatch}>Reset Password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageCentersDialog({ staff, open, onClose, onUpdated }: {
  staff: Staff;
  open: boolean;
  onClose: () => void;
  onUpdated: (assignments: Staff["centerAssignments"]) => void;
}) {
  const { data: centers, isLoading } = useQuery({ queryKey: ["centers-assignable"], queryFn: listAssignableCenters, enabled: open });
  const [assignments, setAssignments] = useState(staff.centerAssignments);
  const [pendingRoles, setPendingRoles] = useState<Record<string, ("admin" | "teacher" | "frontdesk")[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  function getAssignment(centerId: string) {
    return assignments.find((a) => a.center.id === centerId);
  }
  function getRolesForCenter(centerId: string): ("admin" | "teacher" | "frontdesk")[] {
    return pendingRoles[centerId] ?? getAssignment(centerId)?.roles ?? ["frontdesk"];
  }

  async function assign(centerId: string, centerName: string) {
    const roles = getRolesForCenter(centerId);
    if (roles.length === 0) return;
    setBusyId(centerId);
    try {
      await assignStaffToCenter(centerId, staff.id, roles);
      const next = [...assignments.filter((a) => a.center.id !== centerId), { roles, center: { id: centerId, name: centerName } }];
      setAssignments(next);
      setPendingRoles((prev) => { const p = { ...prev }; delete p[centerId]; return p; });
      onUpdated(next);
      toast({ title: "Center assignment saved" });
    } catch {
      toast({ variant: "destructive", title: "Could not save assignment" });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(centerId: string) {
    setBusyId(centerId);
    try {
      await removeStaffFromCenter(centerId, staff.id);
      const next = assignments.filter((a) => a.center.id !== centerId);
      setAssignments(next);
      onUpdated(next);
      toast({ title: "Removed from center" });
    } catch {
      toast({ variant: "destructive", title: "Could not remove assignment" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Center Access — {staff.fullName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500 -mt-2">
          Assign roles per center. A staff member may hold different roles at different centers.
        </p>
        {isLoading ? (
          <div className="space-y-2 py-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : (centers ?? []).length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No centers yet. Create one first.</div>
        ) : (
          <div className="max-h-96 overflow-auto space-y-2">
            {(centers ?? []).map((center) => {
              const assignment = getAssignment(center.id);
              const isAssigned = !!assignment;
              const selectedRoles = getRolesForCenter(center.id);
              const rolesChanged = pendingRoles[center.id] !== undefined &&
                !(assignment && assignment.roles.length === selectedRoles.length && assignment.roles.every((r) => selectedRoles.includes(r)));
              const isBusy = busyId === center.id;

              return (
                <div key={center.id} className={`rounded-lg border p-3 ${isAssigned ? "border-green-300" : "border-gray-200"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${isAssigned ? "bg-green-500" : "bg-gray-300"}`} />
                      <span className="text-sm font-medium text-gray-900">{center.name}</span>
                    </div>
                    {isAssigned && (
                      <button
                        className="text-gray-400 hover:text-red-600"
                        onClick={() => remove(center.id)}
                        disabled={isBusy}
                        title="Remove from center"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mb-2">
                    {ROLE_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={selectedRoles.includes(opt.value)}
                          onCheckedChange={(checked) =>
                            setPendingRoles((prev) => ({
                              ...prev,
                              [center.id]: checked ? [...selectedRoles, opt.value] : selectedRoles.filter((r) => r !== opt.value),
                            }))
                          }
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant={isAssigned && !rolesChanged ? "outline" : "default"}
                    disabled={isBusy || selectedRoles.length === 0 || (isAssigned && !rolesChanged)}
                    onClick={() => assign(center.id, center.name)}
                  >
                    {isAssigned ? (rolesChanged ? "Save Changes" : "Assigned") : "Assign"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROLE_COLORS: Record<string, "default" | "info" | "warning"> = {
  admin: "info",
  teacher: "warning",
  frontdesk: "default",
};

export function StaffPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const [managingCenters, setManagingCenters] = useState<Staff | null>(null);

  const { data: staff, isLoading } = useQuery({ queryKey: ["staff"], queryFn: listStaff });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateStaff(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
    onError: (err: unknown) => {
      toast({ variant: "destructive", title: apiErrorMessage(err) });
    },
  });

  const filtered = (staff ?? []).filter((s) =>
    s.fullName.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    s.phone.includes(search)
  );

  const columns: ColumnDef<Staff>[] = [
    {
      accessorKey: "fullName",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.photoUrl ? (
            <img
              src={row.original.photoUrl}
              alt={row.original.fullName}
              className="h-9 w-9 rounded-2xl object-cover shrink-0"
            />
          ) : (
            <div
              className="h-9 w-9 rounded-2xl flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ background: "var(--color-primary,#7C3AED)" }}
            >
              {initials(row.original.fullName)}
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900 text-sm">{row.original.fullName}</p>
            <p className="text-xs text-gray-400">{row.original.phone}</p>
          </div>
        </div>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((r) => (
            <Badge key={r} variant={ROLE_COLORS[r] ?? "default"} className="capitalize">{r}</Badge>
          ))}
        </div>
      ),
    },
    {
      id: "centers",
      header: "Centers",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.centerAssignments.slice(0, 2).map((ca, i) => (
            <span key={i} className="text-xs text-gray-500">{ca.center.name}</span>
          ))}
          {row.original.centerAssignments.length === 0 && <span className="text-xs text-gray-400">None</span>}
        </div>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Active",
      cell: ({ row }) => (
        <Switch
          checked={row.original.isActive}
          onCheckedChange={(v) => toggleActiveMutation.mutate({ id: row.original.id, isActive: v })}
        />
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => <span className="text-sm text-gray-500">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(row.original)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setManagingCenters(row.original)} title="Manage Centers">
            <Building2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setResettingPassword(row.original.id)} title="Reset Password">
            <Key className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <h1 className="text-xl font-bold text-gray-900">Staff</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Staff
        </Button>
      </div>
      <div className="flex-1 p-7 space-y-5">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={UserCog} title="No staff found" actionLabel="Add Staff" onAction={() => setShowCreate(true)} />
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </div>

      {showCreate && <CreateStaffDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {editing && <EditStaffDialog staff={editing} open={!!editing} onClose={() => setEditing(null)} />}
      {resettingPassword && (
        <ResetPasswordDialog staffId={resettingPassword} open={!!resettingPassword} onClose={() => setResettingPassword(null)} />
      )}
      {managingCenters && (
        <ManageCentersDialog
          staff={managingCenters}
          open={!!managingCenters}
          onClose={() => setManagingCenters(null)}
          onUpdated={(assignments) => {
            setManagingCenters((prev) => prev && { ...prev, centerAssignments: assignments });
            qc.invalidateQueries({ queryKey: ["staff"] });
          }}
        />
      )}
    </div>
  );
}

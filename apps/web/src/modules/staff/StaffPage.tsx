import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Search, UserCog, Key } from "lucide-react";
import { useForm, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { listStaff, createStaff, updateStaff, resetPassword, type Staff } from "@/api/staff";
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
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (password.length < 6) { toast({ variant: "destructive", title: "Password must be at least 6 characters" }); return; }
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
        <FormField label="New Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleReset} disabled={loading}>Reset Password</Button>
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
          <div
            className="h-9 w-9 rounded-2xl flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ background: "var(--color-primary,#7C3AED)" }}
          >
            {initials(row.original.fullName)}
          </div>
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
          <Button size="sm" variant="ghost" onClick={() => setResettingPassword(row.original.id)}>
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
    </div>
  );
}

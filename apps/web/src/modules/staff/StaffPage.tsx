import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Search, UserCog, Key } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { listStaff, createStaff, updateStaff, resetPassword, type Staff } from "@/api/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatDate, initials } from "@/lib/utils";

const createStaffSchema = z.object({
  fullName: z.string().min(1, "Required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(6, "Required"),
  username: z.string().min(3).optional(),
  role: z.enum(["admin", "teacher", "frontdesk"]),
  password: z.string().min(6, "At least 6 characters"),
});
type CreateStaffForm = z.infer<typeof createStaffSchema>;

function CreateStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<CreateStaffForm>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: { role: "frontdesk" },
  });

  const mutation = useMutation({
    mutationFn: createStaff,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast({ title: "Staff account created" });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error";
      toast({ variant: "destructive", title: msg });
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
          <FormField label="Role" error={errors.role} required>
            <Select onValueChange={(v) => setValue("role", v as "admin" | "teacher" | "frontdesk")} defaultValue="frontdesk">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="frontdesk">Front Desk</SelectItem>
              </SelectContent>
            </Select>
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
  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: { fullName: staff.fullName, phone: staff.phone, username: staff.username ?? "", role: staff.role },
  });

  const mutation = useMutation({
    mutationFn: (d: { fullName?: string; phone?: string; username?: string | null; role?: "admin" | "teacher" | "frontdesk" }) =>
      updateStaff(staff.id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast({ title: "Staff updated" });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error";
      toast({ variant: "destructive", title: msg });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Staff</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate({ ...d, role: d.role as "admin" | "teacher" | "frontdesk" }))} className="space-y-4">
          <FormField label="Full Name">
            <Input {...register("fullName")} />
          </FormField>
          <FormField label="Phone">
            <Input {...register("phone")} />
          </FormField>
          <FormField label="Username">
            <Input {...register("username")} />
          </FormField>
          <FormField label="Role">
            <Select onValueChange={(v) => setValue("role", v as "admin" | "teacher" | "frontdesk")} defaultValue={staff.role}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="frontdesk">Front Desk</SelectItem>
              </SelectContent>
            </Select>
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
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error";
      toast({ variant: "destructive", title: msg });
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
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <Badge variant={ROLE_COLORS[row.original.role] ?? "default"} className="capitalize">{row.original.role}</Badge>
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

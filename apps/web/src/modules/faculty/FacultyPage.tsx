import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Search, GraduationCap, Trash2, CheckCircle, Eye, EyeOff, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFacultySchema } from "@institute-os/shared";
import { type z } from "zod";
import { listFaculty, createFaculty, updateFaculty, deleteFaculty, type Faculty } from "@/api/faculty";
import { listSubjects } from "@/api/subjects";
import { listStaff, createStaff } from "@/api/staff";
import { listAssignableCenters } from "@/api/centers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DataTable } from "@/components/DataTable";
import { IconAction } from "@/components/ui/icon-action";
import { TruncatedText } from "@/components/ui/truncated-text";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatDate, initials } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

type FacultyForm = z.infer<typeof createFacultySchema>;

// ── Login Access section ───────────────────────────────────────────────────────

function LoginAccessSection({ faculty, onUpdated }: { faculty: Faculty; onUpdated: () => void }) {
  const [mode, setMode]         = useState<null | "create" | "link">(null);
  const [email, setEmail]       = useState(faculty.email);
  const [phone, setPhone]       = useState(faculty.phone);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [linkStaffId, setLinkStaffId] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const { data: staffList } = useQuery({ queryKey: ["staff"], queryFn: listStaff });
  const eligibleTeachers = (staffList ?? []).filter(
    (s) => s.roles.includes("teacher") && !s.linkedFaculty
  );

  const linked = faculty.linkedStaff;

  async function handleUnlink() {
    if (!confirm("Unlink this teacher login from the faculty profile?")) return;
    setLoading(true);
    setError(null);
    try {
      await updateFaculty(faculty.id, { staffId: null });
      toast({ title: "Login unlinked" });
      onUpdated();
    } catch {
      setError("Failed to unlink. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLink() {
    if (!linkStaffId) return;
    setLoading(true);
    setError(null);
    try {
      await updateFaculty(faculty.id, { staffId: linkStaffId });
      toast({ title: "Teacher login linked" });
      onUpdated();
      setMode(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Failed to link account";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAndLink() {
    if (!email || !phone || !password) {
      setError("Email, phone, and password are all required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const newStaff = await createStaff({ fullName: faculty.fullName, email, phone, password, roles: ["teacher"] });
      await updateFaculty(faculty.id, { staffId: newStaff.id });
      toast({ title: "Login created and linked" });
      onUpdated();
      setMode(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Failed to create login";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-4 mt-2">
      <p className="text-sm font-semibold text-gray-700 mb-3">Login Access</p>

      {linked ? (
        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{linked.fullName}</p>
            <p className="text-xs text-gray-500">Can log in as this teacher</p>
          </div>
          <Button
            size="sm" variant="ghost" className="text-red-500 hover:text-red-700 shrink-0"
            onClick={handleUnlink} disabled={loading}
          >
            {loading ? "…" : "Unlink"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            No teacher login linked yet. Create a new login for{" "}
            <span className="font-medium text-gray-600">{faculty.fullName.split(" ")[0]}</span>,
            or link an existing teacher staff account.
          </p>

          <div className="flex gap-2">
            <Button
              size="sm" variant="outline"
              onClick={() => { setMode(mode === "create" ? null : "create"); setError(null); }}
            >
              {mode === "create" ? "Cancel" : "Create New Login"}
            </Button>
            <Button
              size="sm" variant="ghost"
              onClick={() => { setMode(mode === "link" ? null : "link"); setError(null); }}
            >
              {mode === "link" ? "Cancel" : "Link Existing"}
            </Button>
          </div>

          {mode === "create" && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Email">
                  <Input
                    type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </FormField>
                <FormField label="Phone">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="Phone number"
                  />
                </FormField>
              </div>
              <FormField label="Password">
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>
              <p className="text-xs text-gray-400">
                {faculty.fullName.split(" ")[0]} can change this password after first login.
              </p>
              <Button size="sm" onClick={handleCreateAndLink} disabled={loading} className="w-full">
                {loading ? "Creating…" : "Create & Link Account"}
              </Button>
            </div>
          )}

          {mode === "link" && (
            <div className="flex gap-2">
              <Select value={linkStaffId} onValueChange={setLinkStaffId}>
                <SelectTrigger className="flex-1">
                  <SelectValue
                    placeholder={
                      eligibleTeachers.length === 0
                        ? "No unlinked teacher accounts"
                        : "Select a teacher account…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {eligibleTeachers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName} — {s.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleLink} disabled={!linkStaffId || loading}>
                {loading ? "Linking…" : "Link"}
              </Button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

// ── Faculty form dialog ────────────────────────────────────────────────────────

function FacultyFormDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: Faculty }) {
  const { currentCenter } = useAuth();
  const qc = useQueryClient();
  const { data: subjects } = useQuery({ queryKey: ["subjects"], queryFn: () => listSubjects() });
  const { data: centers } = useQuery({ queryKey: ["centers-assignable"], queryFn: listAssignableCenters, enabled: !currentCenter });

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FacultyForm>({
    resolver: zodResolver(createFacultySchema),
    defaultValues: existing ? {
      fullName:        existing.fullName,
      phone:           existing.phone,
      email:           existing.email,
      qualification:   existing.qualification,
      experienceYears: existing.experienceYears,
      joiningDate:     new Date(existing.joiningDate),
      subjectIds:      existing.subjects.map((s) => s.id),
    } : { subjectIds: [], experienceYears: 0 },
  });

  const selectedSubjectIds = watch("subjectIds") ?? [];

  function toggleSubject(id: string) {
    const next = selectedSubjectIds.includes(id)
      ? selectedSubjectIds.filter((s) => s !== id)
      : [...selectedSubjectIds, id];
    setValue("subjectIds", next);
  }

  const mutation = useMutation({
    mutationFn: (d: FacultyForm) => {
      const joiningDate = new Date(d.joiningDate).toISOString().slice(0, 10);
      return existing
        ? updateFaculty(existing.id, { ...d, subjectIds: d.subjectIds, joiningDate })
        : createFaculty({ ...d, joiningDate });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faculty"] });
      toast({ title: existing ? "Faculty updated" : "Faculty created" });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error";
      toast({ variant: "destructive", title: msg });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? "Edit Faculty" : "Add Faculty"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Full Name" error={errors.fullName} required>
              <Input {...register("fullName")} placeholder="Full name" />
            </FormField>
            <FormField label="Phone" error={errors.phone} required>
              <Input {...register("phone")} placeholder="Phone number" />
            </FormField>
            <FormField label="Email" error={errors.email} required>
              <Input {...register("email")} type="email" placeholder="email@example.com" />
            </FormField>
            <FormField label="Qualification" error={errors.qualification} required>
              <Input {...register("qualification")} placeholder="e.g. B.Tech, M.Sc" />
            </FormField>
            <FormField label="Experience (years)" error={errors.experienceYears}>
              <Input {...register("experienceYears", { valueAsNumber: true })} type="number" min={0} />
            </FormField>
            <FormField label="Joining Date" error={errors.joiningDate} required>
              <Input {...register("joiningDate")} type="date" />
            </FormField>
            {!currentCenter && (
              <FormField label="Center" error={errors.centerId} required>
                <Select onValueChange={(v) => setValue("centerId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select center" /></SelectTrigger>
                  <SelectContent>
                    {(centers ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Teaching Subjects</p>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              {(subjects ?? []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={selectedSubjectIds.includes(s.id)} onCheckedChange={() => toggleSubject(s.id)} />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{existing ? "Save" : "Add Faculty"}</Button>
          </DialogFooter>
        </form>

        {/* Login Access — only visible when editing */}
        {existing && (
          <LoginAccessSection
            faculty={existing}
            onUpdated={() => qc.invalidateQueries({ queryKey: ["faculty"] })}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Faculty page ───────────────────────────────────────────────────────────────

export function FacultyPage() {
  const qc = useQueryClient();
  const [search, setSearch]   = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Faculty | null>(null);

  const { data: facultyData, isLoading } = useQuery({
    queryKey: ["faculty"],
    queryFn: () => listFaculty(),
  });
  const faculty = facultyData?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: deleteFaculty,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faculty"] });
      toast({ title: "Faculty removed" });
    },
    onError: () => toast({ variant: "destructive", title: "Cannot delete faculty" }),
  });

  const filtered = faculty.filter((f) =>
    f.fullName.toLowerCase().includes(search.toLowerCase()) ||
    f.email.toLowerCase().includes(search.toLowerCase())
  );

  const columns: ColumnDef<Faculty>[] = [
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
          <div className="min-w-0 max-w-[180px]">
            <TruncatedText text={row.original.fullName} className="font-semibold text-gray-900 text-sm" />
            <TruncatedText text={row.original.email} className="text-xs text-gray-400" />
          </div>
        </div>
      ),
    },
    { accessorKey: "phone", header: "Phone" },
    {
      accessorKey: "qualification",
      header: "Qualification",
      cell: ({ row }) => <TruncatedText text={row.original.qualification} className="text-sm max-w-[160px]" />,
    },
    {
      id: "subjects",
      header: "Subjects",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.subjects ?? []).slice(0, 2).map((s) => {
            const color = s.examCategories?.[0]?.color ?? "#6B7280";
            return (
              <Badge key={s.id} style={{ background: color + "18", color }}>{s.name}</Badge>
            );
          })}
          {(row.original.subjects ?? []).length > 2 && (
            <Badge variant="default">+{row.original.subjects.length - 2}</Badge>
          )}
        </div>
      ),
    },
    {
      id: "login",
      header: "Login",
      cell: ({ row }) => row.original.linkedStaff ? (
        <div className="flex items-center gap-1.5 text-green-600">
          <CheckCircle className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Linked</span>
        </div>
      ) : (
        <span className="text-xs text-gray-400">No login</span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Active",
      cell: ({ row }) => (
        <Switch
          checked={row.original.isActive}
          onCheckedChange={(v) => updateFaculty(row.original.id, { isActive: v }).then(() => qc.invalidateQueries({ queryKey: ["faculty"] }))}
        />
      ),
    },
    {
      accessorKey: "joiningDate",
      header: "Joined",
      cell: ({ row }) => <span className="text-sm text-gray-500">{formatDate(row.original.joiningDate)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <IconAction label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(row.original)} />
          <IconAction
            label="Delete" icon={<Trash2 className="h-3.5 w-3.5" />} variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => { if (confirm("Remove this faculty?")) deleteMutation.mutate(row.original.id); }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Faculty</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage faculty profiles and subject assignments</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Add Faculty
        </Button>
      </div>
      <div className="flex-1 p-7 space-y-5">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search faculty..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No faculty found" actionLabel="Add Faculty" onAction={() => setShowCreate(true)} />
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </div>
      {showCreate && <FacultyFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {editing && <FacultyFormDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />}
    </div>
  );
}

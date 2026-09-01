import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Search, GraduationCap, Trash2, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSubjectSchema } from "@institute-os/shared";
import { type z } from "zod";
import { listSubjects, createSubject, updateSubject, deleteSubject, listExamCategories, type Subject } from "@/api/subjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAction } from "@/components/ui/icon-action";
import { toast } from "@/components/ui/use-toast";

type SubjectForm = z.infer<typeof createSubjectSchema>;

function SubjectFormDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: Subject }) {
  const qc = useQueryClient();
  const { data: examCategories } = useQuery({ queryKey: ["exam-categories"], queryFn: listExamCategories });

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<SubjectForm>({
    resolver: zodResolver(createSubjectSchema),
    defaultValues: existing ? {
      name: existing.name,
      examCategoryIds: existing.examCategories.map((e) => e.id),
    } : { examCategoryIds: [] },
  });

  const selectedIds = watch("examCategoryIds") ?? [];

  function toggleExamCat(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((c) => c !== id) : [...selectedIds, id];
    setValue("examCategoryIds", next);
  }

  const mutation = useMutation({
    mutationFn: (d: SubjectForm) =>
      existing ? updateSubject(existing.id, d) : createSubject(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast({ title: existing ? "Subject updated" : "Subject created" });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Error";
      toast({ variant: "destructive", title: msg });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit Subject" : "Create Subject"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <FormField label="Subject Name" error={errors.name} required>
            <Input {...register("name")} placeholder="e.g. Quantitative Aptitude" />
          </FormField>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Exam Categories</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {(examCategories ?? []).map((ec) => (
                <label key={ec.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={selectedIds.includes(ec.id)} onCheckedChange={() => toggleExamCat(ec.id)} />
                  <span className="text-sm">{ec.label}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{existing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SubjectsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  const { data: subjects, isLoading } = useQuery({ queryKey: ["subjects"], queryFn: () => listSubjects() });

  const deleteMutation = useMutation({
    mutationFn: deleteSubject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast({ title: "Subject deleted" });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Cannot delete subject";
      toast({ variant: "destructive", title: msg });
    },
  });

  const filtered = (subjects ?? []).filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const columns: ColumnDef<Subject>[] = [
    { accessorKey: "name", header: "Subject Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    {
      id: "categories",
      header: "Exam Categories",
      cell: ({ row }) => {
        const cats = row.original.examCategories ?? [];
        return (
          <div className="flex flex-wrap gap-1">
            {cats.length === 0 ? "—" : cats.map((ec) => (
              <span
                key={ec.id}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ background: ec.color + "18", color: ec.color }}
              >
                {ec.label}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "facultyCount",
      header: "Faculty Count",
      cell: ({ row }) => row.original.facultyCount,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <IconAction label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(row.original)} />
          <IconAction
            label="Delete" icon={<Trash2 className="h-3.5 w-3.5" />} variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => { if (confirm("Delete this subject?")) deleteMutation.mutate(row.original.id); }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Subjects</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage teaching subjects and exam category mappings</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Create Subject
        </Button>
      </div>
      <div className="flex-1 p-7 space-y-5">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search subjects..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No subjects found" actionLabel="Create Subject" onAction={() => setShowCreate(true)} />
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </div>
      {showCreate && <SubjectFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {editing && <SubjectFormDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />}
    </div>
  );
}

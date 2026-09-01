import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, GripVertical, Star, Tags, Pencil } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  listCurrentAffairCategories, createCurrentAffairCategory, updateCurrentAffairCategory,
  reorderCurrentAffairCategories, deleteCurrentAffairCategory,
  type CurrentAffairCategory,
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
import { IconAction } from "@/components/ui/icon-action";
import { toast } from "@/components/ui/use-toast";

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

const categorySchema = z.object({
  key: z.string().min(1, "Required").max(50).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  labelEn: z.string().min(1, "Required").max(100),
  labelHi: z.string().min(1, "Required").max(100),
  shortLabelEn: z.string().min(1, "Required").max(50),
  shortLabelHi: z.string().min(1, "Required").max(50),
  priority: z.enum(["primary", "secondary"]),
  isVisible: z.boolean(),
  isDefault: z.boolean(),
});
type CategoryFormValues = z.infer<typeof categorySchema>;

function CategoryFormDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: CurrentAffairCategory }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: existing ? {
      key: existing.key, labelEn: existing.labelEn, labelHi: existing.labelHi,
      shortLabelEn: existing.shortLabelEn, shortLabelHi: existing.shortLabelHi,
      priority: existing.priority, isVisible: existing.isVisible, isDefault: existing.isDefault,
    } : {
      key: "", labelEn: "", labelHi: "", shortLabelEn: "", shortLabelHi: "",
      priority: "primary", isVisible: true, isDefault: false,
    },
  });
  const priority = watch("priority");
  const isVisible = watch("isVisible");
  const isDefault = watch("isDefault");

  const mutation = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      existing ? updateCurrentAffairCategory(existing.id, values) : createCurrentAffairCategory(values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current-affair-categories-admin"] });
      qc.invalidateQueries({ queryKey: ["current-affair-categories"] });
      toast({ title: existing ? "Updated" : "Created" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} Category</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <FormField label="Key" required error={errors.key}>
            <Input {...register("key")} placeholder="banking-finance" disabled={!!existing} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Label (English)" required error={errors.labelEn}>
              <Input {...register("labelEn")} placeholder="Banking & Finance" />
            </FormField>
            <FormField label="Label (Hindi)" required error={errors.labelHi}>
              <Input {...register("labelHi")} placeholder="बैंकिंग" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Short Label (English)" required error={errors.shortLabelEn}>
              <Input {...register("shortLabelEn")} placeholder="Banking & Finance" />
            </FormField>
            <FormField label="Short Label (Hindi)" required error={errors.shortLabelHi}>
              <Input {...register("shortLabelHi")} placeholder="Banking & Finance" />
            </FormField>
          </div>

          <FormField label="Priority" required>
            <Select value={priority} onValueChange={(v) => setValue("priority", v as "primary" | "secondary")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary — always shown</SelectItem>
                <SelectItem value="secondary">Secondary — tucked under "More"</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Visible</p>
              <p className="text-xs text-gray-400">Shown on the public portal</p>
            </div>
            <Switch checked={isVisible} onCheckedChange={(v) => setValue("isVisible", v)} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Default category</p>
              <p className="text-xs text-gray-400">Fallback when the scraper can't detect a category. Selecting this unsets the current default.</p>
            </div>
            <Switch checked={isDefault} onCheckedChange={(v) => setValue("isDefault", v)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SortableRow({
  category, onEdit, onDelete,
}: {
  category: CurrentAffairCategory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-white border rounded-lg px-3 py-2.5">
      <button {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500" aria-label="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{category.labelEn}</p>
          <span className="text-xs text-gray-400">{category.labelHi}</span>
          {category.isDefault && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{category.key}</p>
      </div>

      <Badge variant={category.priority === "primary" ? "default" : "outline"}>{category.priority}</Badge>
      {!category.isVisible && <Badge variant="warning">hidden</Badge>}

      <IconAction label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit} />
      <IconAction label="Delete" icon={<Trash2 className="h-3.5 w-3.5" />} variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onDelete} />
    </div>
  );
}

export function CurrentAffairCategoriesTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CurrentAffairCategory | null>(null);
  const [orderedCategories, setOrderedCategories] = useState<CurrentAffairCategory[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["current-affair-categories-admin"],
    queryFn: listCurrentAffairCategories,
  });

  useEffect(() => {
    if (data) setOrderedCategories(data);
  }, [data]);

  const reorderMutation = useMutation({
    mutationFn: reorderCurrentAffairCategories,
    onSuccess: (result) => {
      qc.setQueryData(["current-affair-categories-admin"], result);
      qc.invalidateQueries({ queryKey: ["current-affair-categories"] });
    },
    onError: (err: unknown) => {
      toast({ variant: "destructive", title: extractError(err) });
      if (data) setOrderedCategories(data);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCurrentAffairCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current-affair-categories-admin"] });
      qc.invalidateQueries({ queryKey: ["current-affair-categories"] });
      toast({ title: "Deleted" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedCategories.findIndex((c) => c.id === active.id);
    const newIndex = orderedCategories.findIndex((c) => c.id === over.id);
    const next = arrayMove(orderedCategories, oldIndex, newIndex);
    setOrderedCategories(next);
    reorderMutation.mutate(next.map((c) => c.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">Drag to reorder. Primary categories always show on the portal; secondary ones are tucked under "More".</p>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Category</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !orderedCategories.length ? (
        <EmptyState icon={Tags} title="No categories found" actionLabel="Add Category" onAction={() => setShowCreate(true)} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedCategories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {orderedCategories.map((c) => (
                <SortableRow
                  key={c.id}
                  category={c}
                  onEdit={() => setEditing(c)}
                  onDelete={() => {
                    if (confirm(`Delete "${c.labelEn}"?`)) deleteMutation.mutate(c.id);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showCreate && <CategoryFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {editing && <CategoryFormDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />}
    </div>
  );
}

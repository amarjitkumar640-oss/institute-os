import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ImageOff, Megaphone, Trophy, Images, type LucideIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import {
  listSiteHighlights, createSiteHighlight, updateSiteHighlight, deleteSiteHighlight,
  type SiteHighlight, type SiteHighlightType, type SiteHighlightInput,
} from "@/api/siteContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";

const TYPE_META: Record<SiteHighlightType, { label: string; singular: string; icon: LucideIcon }> = {
  announcement: { label: "Announcements", singular: "Announcement", icon: Megaphone },
  result:       { label: "Selections",    singular: "Selection",    icon: Trophy },
  gallery:      { label: "Gallery",       singular: "Photo",        icon: Images },
};

interface FormValues {
  title: string;
  description: string;
  isActive: boolean;
  position: string; // meta.position — only shown/used for "result"
  exam: string;      // meta.exam — only shown/used for "result"
}

function HighlightFormDialog({ open, onClose, type, existing }: {
  open: boolean; onClose: () => void; type: SiteHighlightType; existing?: SiteHighlight;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: existing ? {
      title: existing.title,
      description: existing.description ?? "",
      isActive: existing.isActive,
      position: existing.meta?.position ?? "",
      exam: existing.meta?.exam ?? "",
    } : { title: "", description: "", isActive: true, position: "", exam: "" },
  });
  const isActive = watch("isActive");

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const input: SiteHighlightInput = {
        type,
        title: values.title,
        description: values.description || undefined,
        isActive: values.isActive,
        meta: type === "result" ? { position: values.position, exam: values.exam } : undefined,
        image: file ?? undefined,
      };
      return existing ? updateSiteHighlight(existing.id, input) : createSiteHighlight(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-highlights"] });
      toast({ title: existing ? "Updated" : "Added" });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      toast({ variant: "destructive", title: typeof msg === "string" ? msg : "Something went wrong" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} {TYPE_META[type].singular}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <FormField label="Title" required>
            <Input {...register("title", { required: true })} placeholder="e.g. New batch starting Monday" />
          </FormField>
          <FormField label="Description">
            <Textarea {...register("description")} rows={3} />
          </FormField>
          {type === "result" && (
            <>
              <FormField label="Selected Position">
                <Input {...register("position")} placeholder='e.g. "SSC CGL – Tax Assistant"' />
              </FormField>
              <FormField label="Exam / Service">
                <Input {...register("exam")} placeholder='e.g. "SSC CGL 2025"' />
              </FormField>
            </>
          )}
          <FormField label="Image">
            <input
              type="file" accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm"
            />
            {existing?.imageUrl && !file && <p className="text-xs text-gray-400 mt-1">Leave blank to keep the current image.</p>}
          </FormField>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setValue("isActive", e.target.checked)} />
            Visible on site
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SiteContentPage() {
  const qc = useQueryClient();
  const [activeType, setActiveType] = useState<SiteHighlightType>("announcement");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SiteHighlight | null>(null);

  const { data: highlights, isLoading, isError } = useQuery({ queryKey: ["site-highlights"], queryFn: listSiteHighlights });

  const deleteMutation = useMutation({
    mutationFn: deleteSiteHighlight,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-highlights"] });
      toast({ title: "Deleted" });
    },
    onError: () => toast({ variant: "destructive", title: "Could not delete" }),
  });

  const filtered = (highlights ?? []).filter((h) => h.type === activeType);
  const { label, singular, icon: Icon } = TYPE_META[activeType];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Marketing Site</h1>
          <p className="text-sm text-gray-400 mt-0.5">Announcements, selections, and gallery photos shown on thesuccess.in</p>
        </div>
        {!isError && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add {singular}
          </Button>
        )}
      </div>

      <div className="flex-1 p-7 space-y-5">
        <Tabs value={activeType} onValueChange={(v) => setActiveType(v as SiteHighlightType)}>
          <TabsList>
            {(Object.keys(TYPE_META) as SiteHighlightType[]).map((t) => (
              <TabsTrigger key={t} value={t}>{TYPE_META[t].label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : isError ? (
          <EmptyState icon={Icon} title="Not available" description="This feature isn't set up for your institute." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Icon} title={`No ${label.toLowerCase()} yet`} actionLabel={`Add ${singular}`} onAction={() => setShowCreate(true)} />
        ) : (
          <div className="space-y-2">
            {filtered.map((h) => (
              <div key={h.id} className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 p-4">
                {h.imageUrl ? (
                  <img src={h.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                    <ImageOff className="h-5 w-5 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{h.title}</p>
                  {h.description && <p className="text-xs text-gray-400 truncate">{h.description}</p>}
                  <Badge variant={h.isActive ? "success" : "default"} className="mt-1">{h.isActive ? "Visible" : "Hidden"}</Badge>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setEditing(h)}>Edit</Button>
                  <Button
                    size="sm" variant="ghost" className="text-red-600"
                    onClick={() => { if (confirm("Delete this item?")) deleteMutation.mutate(h.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <HighlightFormDialog open={showCreate} onClose={() => setShowCreate(false)} type={activeType} />}
      {editing && <HighlightFormDialog open={!!editing} onClose={() => setEditing(null)} type={editing.type} existing={editing} />}
    </div>
  );
}

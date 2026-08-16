import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { patchSession, type ClassSession } from "@/api/schedule";
import { listSubjects } from "@/api/subjects";
import { listFaculty } from "@/api/faculty";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

// Lets an admin/frontdesk override a single occurrence's subject and/or
// faculty (e.g. "Computer" won't run today, Teacher B covers Maths instead)
// without touching the recurring slot template. The API notifies the
// outgoing/incoming teacher (or the same teacher on a subject-only change)
// as a side effect of the PATCH — no notification logic lives here.
// Shared by both SchedulePage.tsx (the standalone Schedule nav item) and
// BatchDetailPage.tsx's Schedule tab, which independently render their own
// session tables today — not something to unify here.
export function SessionReassignDialog({ session, onClose }: { session: ClassSession; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: subjects } = useQuery({ queryKey: ["subjects"], queryFn: () => listSubjects() });
  const { data: facultyResult } = useQuery({ queryKey: ["faculty-all"], queryFn: () => listFaculty({ isActive: true, limit: 100 }) });

  const [subjectId, setSubjectId] = useState(session.subject?.id ?? "");
  const [facultyId, setFacultyId] = useState(session.faculty?.id ?? "");

  const mutation = useMutation({
    mutationFn: () => patchSession(session.id, {
      subjectId: subjectId || null,
      facultyId: facultyId || null,
    }),
    onSuccess: () => {
      // Prefix match — covers both SchedulePage's ["sessions", batchId, from, to, statusFilter]
      // and BatchDetailPage's ["sessions", batchId, from, to] query keys.
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: "Session updated" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reassign Session</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <FormField label="Subject">
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>
                {(subjects ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Faculty">
            <Select value={facultyId} onValueChange={setFacultyId}>
              <SelectTrigger><SelectValue placeholder="Select faculty" /></SelectTrigger>
              <SelectContent>
                {(facultyResult?.data ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

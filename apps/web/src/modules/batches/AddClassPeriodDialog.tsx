import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { listFaculty } from "@/api/faculty";
import { listSubjects } from "@/api/subjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type DayOfWeek = typeof DAY_ORDER[number];
export const DAY_LABELS: Record<DayOfWeek, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };

export interface ClassPeriodDraft {
  id: string;
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
  subjectId: string;
  subjectName: string;
  facultyId: string;
  facultyName: string;
  room: string;
}

function newDraftId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AddClassPeriodDialog({
  open, initial, onClose, onSave,
}: {
  open: boolean;
  initial: ClassPeriodDraft | null;
  onClose: () => void;
  onSave: (draft: ClassPeriodDraft) => void;
}) {
  const [days, setDays]           = useState<Set<DayOfWeek>>(new Set());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime]     = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [room, setRoom]           = useState("");
  const [error, setError]         = useState("");

  const { data: facultyRes } = useQuery({ queryKey: ["faculty-list"], queryFn: () => listFaculty({ isActive: true, limit: 100 }) });
  const { data: subjects }   = useQuery({ queryKey: ["subjects-list"], queryFn: () => listSubjects() });
  const facultyList = facultyRes?.data ?? [];

  useEffect(() => {
    if (!open) return;
    setDays(new Set(initial?.days ?? []));
    setStartTime(initial?.startTime ?? "");
    setEndTime(initial?.endTime ?? "");
    setSubjectId(initial?.subjectId ?? "");
    setFacultyId(initial?.facultyId ?? "");
    setRoom(initial?.room ?? "");
    setError("");
  }, [open, initial]);

  function toggleDay(day: DayOfWeek) {
    setDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
    setError("");
  }

  function handleSave() {
    if (days.size === 0)          { setError("Select at least one class day"); return; }
    if (!startTime || !endTime)   { setError("Select both start and end time"); return; }
    if (startTime >= endTime)     { setError("Start time must be before end time"); return; }

    onSave({
      id: initial?.id ?? newDraftId(),
      days: Array.from(days),
      startTime,
      endTime,
      subjectId,
      subjectName: subjects?.find((s) => s.id === subjectId)?.name ?? "",
      facultyId,
      facultyName: facultyList.find((f) => f.id === facultyId)?.fullName ?? "",
      room: room.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? "Edit Class Period" : "Add Class Period"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Class Days</p>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_ORDER.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold border-[1.5px] transition-colors",
                    days.has(day)
                      ? "bg-[var(--color-primary,#7C3AED)] text-white border-[var(--color-primary,#7C3AED)]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  )}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Time" required>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => { setStartTime(e.target.value); setError(""); }}
                  className="pl-9"
                />
              </div>
            </FormField>
            <FormField label="End Time" required>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => { setEndTime(e.target.value); setError(""); }}
                  className="pl-9"
                />
              </div>
            </FormField>
          </div>

          <FormField label="Subject (optional)">
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Faculty (optional)">
            <Select value={facultyId} onValueChange={setFacultyId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {facultyList.map((f) => <SelectItem key={f.id} value={f.id}>{f.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Room / Location (optional)">
            <Input placeholder="e.g. Room 101" value={room} onChange={(e) => setRoom(e.target.value)} />
          </FormField>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={handleSave}>{initial ? "Save Period" : "Add Period"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

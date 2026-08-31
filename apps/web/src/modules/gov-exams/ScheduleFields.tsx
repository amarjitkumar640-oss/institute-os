import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { GovScheduleFrequency } from "@/api/govExams";

const FREQUENCY_LABEL: Record<GovScheduleFrequency, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const DAY_OF_WEEK_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ScheduleFieldsValue {
  scheduleFrequency: GovScheduleFrequency;
  /** "HH:MM" — only meaningful (and only rendered) for daily/weekly/monthly. */
  scheduleTimeOfDay: string;
  /** 0=Sunday..6=Saturday — only meaningful (and only rendered) for weekly. */
  scheduleDayOfWeek: number;
  /** 1-31 — only meaningful (and only rendered) for monthly. */
  scheduleDayOfMonth: number;
}

// Real clock-time scheduling — a frequency picker, plus a time-of-day (IST)
// and day-of-week/day-of-month picker that only appear when the chosen
// frequency actually needs them. Used by both SourcesTab and
// SearchPromptsTab so every source/prompt gets the same schedule editor.
export function ScheduleFields({ value, onChange }: { value: ScheduleFieldsValue; onChange: (next: ScheduleFieldsValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.scheduleFrequency}
        onValueChange={(v) => onChange({ ...value, scheduleFrequency: v as GovScheduleFrequency })}
      >
        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(FREQUENCY_LABEL) as GovScheduleFrequency[]).map((f) => (
            <SelectItem key={f} value={f}>{FREQUENCY_LABEL[f]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.scheduleFrequency !== "hourly" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="time"
            value={value.scheduleTimeOfDay}
            onChange={(e) => onChange({ ...value, scheduleTimeOfDay: e.target.value })}
            className="w-28 h-8 py-1"
          />
          <span className="text-xs text-gray-400">IST</span>
        </div>
      )}

      {value.scheduleFrequency === "weekly" && (
        <Select
          value={String(value.scheduleDayOfWeek)}
          onValueChange={(v) => onChange({ ...value, scheduleDayOfWeek: Number(v) })}
        >
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DAY_OF_WEEK_LABEL.map((label, i) => <SelectItem key={i} value={String(i)}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {value.scheduleFrequency === "monthly" && (
        <Select
          value={String(value.scheduleDayOfMonth)}
          onValueChange={(v) => onChange({ ...value, scheduleDayOfMonth: Number(v) })}
        >
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export const DEFAULT_SCHEDULE: ScheduleFieldsValue = {
  scheduleFrequency: "hourly",
  scheduleTimeOfDay: "09:00",
  scheduleDayOfWeek: 1,
  scheduleDayOfMonth: 1,
};

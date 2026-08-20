import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shared field value types (admit + edit wizards) ─────────────────────────────

export type Gender          = "male" | "female";
export type Qualification   = "class10" | "class12" | "graduation" | "post_graduation";
export type CoursePreference = "ssc" | "banking" | "railway" | "foundation" | "others";
export type DurationPref    = "3months" | "6months" | "1year";
export type PreferredTiming = "morning" | "midday" | "evening";
export type PaymentMode     = "cash" | "online";

export interface FormErrors { [key: string]: string }

// ── Step progress bar ─────────────────────────────────────────────────────────

export function StepBar({ current, steps }: { current: number; steps: readonly string[] }) {
  return (
    <div className="flex items-center px-1 py-4">
      {steps.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors",
                  done   && "bg-[var(--color-primary,#7C3AED)] border-[var(--color-primary,#7C3AED)] text-white",
                  active && "border-[var(--color-primary,#7C3AED)] text-[var(--color-primary,#7C3AED)] bg-white",
                  !done && !active && "border-gray-200 text-gray-400 bg-white"
                )}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-semibold whitespace-nowrap",
                  active ? "text-[var(--color-primary,#7C3AED)]" : done ? "text-[var(--color-primary,#7C3AED)]" : "text-gray-400"
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("flex-1 h-0.5 mb-5 mx-1", done ? "bg-[var(--color-primary,#7C3AED)]" : "bg-gray-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Option pills ──────────────────────────────────────────────────────────────

export function OptionPills<T extends string>({
  options, value, onSelect, color = "var(--color-primary,#7C3AED)",
}: {
  options: { key: T; label: string }[];
  value: T | null | undefined;
  onSelect: (k: T) => void;
  color?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-[1.5px] transition-colors",
              active ? "text-white" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            )}
            style={active ? { background: color, borderColor: color } : {}}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Card selector (duration / timing / payment) ───────────────────────────────

export function CardSelector<T extends string>({
  options, value, onSelect,
}: {
  options: { key: T; icon: React.ReactNode; label: string; sub: string }[];
  value: T | null | undefined;
  onSelect: (k: T) => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(({ key, icon, label, sub }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-2.5 py-2 px-3 rounded-xl border-[1.5px] text-left transition-colors",
              active
                ? "border-[var(--color-primary,#7C3AED)] bg-[var(--color-primary,#7C3AED)]/5"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            )}
          >
            <span
              className={cn(
                "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center",
                active ? "bg-[var(--color-primary,#7C3AED)]/10 text-[var(--color-primary,#7C3AED)]" : "bg-gray-100 text-gray-400"
              )}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <p className={cn("text-xs font-bold leading-none", active ? "text-[var(--color-primary,#7C3AED)]" : "text-gray-700")}>{label}</p>
              <p className={cn("text-[10px] mt-0.5", active ? "text-[var(--color-primary,#7C3AED)]/70" : "text-gray-400")}>{sub}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Qualification grid ────────────────────────────────────────────────────────

import { BookOpen, GraduationCap } from "lucide-react";

const QUAL_OPTS: { key: Qualification; icon: React.ReactNode; label: string; sub: string }[] = [
  { key: "class10",         icon: <BookOpen className="h-5 w-5" />,      label: "Class 10",        sub: "Secondary"         },
  { key: "class12",         icon: <GraduationCap className="h-5 w-5" />, label: "Class 12",        sub: "Senior Secondary"  },
  { key: "graduation",      icon: <GraduationCap className="h-5 w-5" />, label: "Graduation",      sub: "Bachelor's"        },
  { key: "post_graduation", icon: <GraduationCap className="h-5 w-5" />, label: "Post Grad",       sub: "Master's"          },
];

export function QualGrid({ value, onSelect }: { value: Qualification | null | undefined; onSelect: (k: Qualification) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {QUAL_OPTS.map(({ key, icon, label, sub }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-2.5 py-2 px-3 rounded-xl border-[1.5px] text-left transition-colors",
              active
                ? "border-[var(--color-accent,#0EA5E9)] bg-[var(--color-accent,#0EA5E9)]/5"
                : "border-gray-200 bg-white hover:border-gray-300"
            )}
          >
            <span
              className={cn(
                "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center",
                active ? "bg-[var(--color-accent,#0EA5E9)]/10 text-[var(--color-accent,#0EA5E9)]" : "bg-gray-100 text-gray-400"
              )}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <p className={cn("text-xs font-bold leading-none", active ? "text-[var(--color-accent,#0EA5E9)]" : "text-gray-700")}>{label}</p>
              <p className={cn("text-[10px] mt-0.5", active ? "text-[var(--color-accent,#0EA5E9)]/70" : "text-gray-400")}>{sub}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

export function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
      {icon} {label}
    </div>
  );
}

import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// Matches apps/site's .btn-primary / .btn-outline exactly (same gradient,
// radius, shadow) so buttons read as the same site's design system.
const buttonClasses = (variant: "primary" | "outline") =>
  cn(
    "inline-flex items-center gap-2 font-bold text-sm px-5 py-2.5 rounded-xl transition-transform hover:-translate-y-0.5",
    variant === "primary" && "text-white bg-gradient-to-br from-primary to-[#5f1f18] shadow-[0_10px_24px_-8px_rgba(143,46,35,0.55)]",
    variant === "outline" && "bg-white text-primary border-[1.5px] border-primary/25",
  );

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" }) {
  return (
    <button className={cn(buttonClasses(variant), className)} {...props}>
      {children}
    </button>
  );
}

/** For external links (target=_blank official URLs) — a real page load, intentionally. */
export function LinkButton({
  children,
  variant = "primary",
  className,
  href,
}: { children: React.ReactNode; variant?: "primary" | "outline"; className?: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn(buttonClasses(variant), className)}>
      {children}
    </a>
  );
}

/** For internal navigation — react-router client-side transition, not a full page load. */
export function RouteButton({
  children,
  variant = "primary",
  className,
  to,
}: { children: React.ReactNode; variant?: "primary" | "outline"; className?: string; to: string }) {
  return (
    <Link to={to} className={cn(buttonClasses(variant), className)}>
      {children}
    </Link>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide bg-accent/20 text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-black/5", className)} />;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h3 className="font-heading text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-soft max-w-sm">{description}</p>}
    </div>
  );
}

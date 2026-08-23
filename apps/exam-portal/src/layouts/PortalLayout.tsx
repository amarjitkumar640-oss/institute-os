import { NavLink, Outlet, Link } from "react-router-dom";
import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", to: "/", end: true },
  { label: "Jobs", to: "/jobs" },
  { label: "Current Affairs", to: "/current-affairs" },
  { label: "Exam Calendar", to: "/calendar" },
  { label: "Eligibility Checker", to: "/eligibility-checker" },
];

export function PortalLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Sticky + backdrop-blur, matching apps/site's header exactly. */}
      <header className="sticky top-0 z-50 bg-surface/85 backdrop-blur-md border-b border-ink/[0.08]">
        <div className="max-w-[1140px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-[18px] shrink-0">
            <span className="w-[38px] h-[38px] rounded-xl bg-primary text-white flex items-center justify-center">
              <Landmark className="h-5 w-5" />
            </span>
            <span className="font-heading text-ink">Government Jobs</span>
          </Link>
          <nav className="flex items-center gap-6 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn("text-sm font-semibold whitespace-nowrap transition-colors", isActive ? "text-primary" : "text-ink-soft hover:text-primary")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <a href="/" className="hidden sm:inline-flex items-center gap-2 text-sm font-bold text-primary border-[1.5px] border-primary/25 bg-white px-4 py-2 rounded-xl shrink-0">
            ← Main Site
          </a>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ink/[0.08] py-9 mt-10">
        <div className="max-w-[1140px] mx-auto px-6 text-xs text-ink-soft text-center">
          Government Exam Intelligence by The Success Tutorial Classes — job vacancies, exam calendar, and current
          affairs for SSC, Banking, Railway, and other competitive exams.
        </div>
      </footer>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useTenant } from "@/context/TenantContext";
import { getTenantPublic } from "@/api/auth";
import { initials } from "@/lib/utils";

export function AuthLayout() {
  const { tenantId } = useTenant();
  const [orgName, setOrgName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Public (unauthenticated) endpoint — this layout wraps the login screen
  // itself, so there's no session yet to read the tenant name/logo from.
  // LoginPage fetches the same tenant for its own purposes (login method,
  // brand color); this is a separate call rather than threading that state
  // down, to keep the two components independent.
  useEffect(() => {
    if (!tenantId) return;
    getTenantPublic(tenantId).then((t) => {
      setOrgName(t.name);
      setLogoUrl(t.branding.logoUrl);
    }).catch(() => {});
  }, [tenantId]);

  const displayName = orgName || "Institute OS";
  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden"
      style={{ background: "color-mix(in srgb, var(--color-primary,#7C3AED) 8%, white)" }}
    >
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb animate-blob absolute opacity-45" style={{ width: 380, height: 380, top: "-60px", left: "-80px", background: "var(--color-primary,#7C3AED)" }} />
        <div className="orb animate-blob-slow absolute opacity-30" style={{ width: 450, height: 450, bottom: "-80px", right: "-60px", background: "color-mix(in srgb, var(--color-primary,#7C3AED) 60%, white)", animationDelay: "5s" }} />
        <div className="orb animate-blob absolute opacity-20" style={{ width: 280, height: 280, top: "50%", right: "20%", background: "color-mix(in srgb, var(--color-primary,#7C3AED) 35%, white)", animationDelay: "9s" }} />
      </div>

      <div className="relative w-full max-w-5xl flex rounded-[28px] overflow-hidden shadow-shell bg-white animate-scale-in" style={{ minHeight: "580px" }}>
        {/* Left decorative panel */}
        <div
          className="hidden lg:flex lg:w-[44%] relative overflow-hidden flex-col"
          style={{ background: "linear-gradient(140deg, color-mix(in srgb, var(--color-primary,#7C3AED) 85%, black) 0%, color-mix(in srgb, var(--color-primary,#7C3AED) 92%, black) 50%, var(--color-primary,#7C3AED) 100%)" }}
        >
          {/* Inner decorative blobs */}
          <div className="absolute top-[-20%] right-[-20%] h-80 w-80 rounded-full opacity-20 blur-3xl bg-purple-300 animate-float-slow" />
          <div className="absolute bottom-[-15%] left-[-15%] h-60 w-60 rounded-full opacity-15 blur-2xl bg-violet-300 animate-float" style={{ animationDelay: "2s" }} />
          {/* Dot grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.9) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="relative z-10 flex flex-col justify-between p-10 h-full">
            {/* Logo */}
            <div className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: "100ms" }}>
              {logoUrl ? (
                <img src={logoUrl} alt={displayName} className="h-10 w-10 rounded-2xl object-cover border border-white/20" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white font-bold text-sm border border-white/20 backdrop-blur-sm">
                  {initials(displayName)}
                </div>
              )}
              <span className="text-white font-bold text-lg tracking-tight truncate max-w-[200px]">{displayName}</span>
            </div>

            {/* Hero text */}
            <div className="space-y-5">
              <div className="animate-slide-up" style={{ animationDelay: "200ms" }}>
                <h1 className="text-3xl font-bold text-white leading-snug">
                  Manage smarter,<br />
                  <span className="text-purple-200">grow faster.</span>
                </h1>
                <p className="text-purple-200/60 text-sm leading-relaxed mt-3 max-w-xs">
                  Complete institute management — students, fees, faculty, schedule and more in one platform.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 animate-slide-up" style={{ animationDelay: "320ms" }}>
                {["Students", "Fees", "Schedule", "Analytics"].map((f, i) => (
                  <span
                    key={f}
                    className="px-3 py-1.5 rounded-full text-xs font-medium text-white/70 border border-white/15 bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors animate-float"
                    style={{ animationDelay: `${i * 0.5}s` }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-8 animate-slide-up" style={{ animationDelay: "440ms" }}>
              {[["10k+", "Students"], ["500+", "Institutes"], ["99.9%", "Uptime"]].map(([v, l]) => (
                <div key={l} className="text-center group">
                  <p className="text-2xl font-bold text-white group-hover:scale-110 transition-transform duration-200">{v}</p>
                  <p className="text-xs text-white/40 mt-0.5">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex-1 flex items-center justify-center p-10 bg-white">
          <div className="w-full max-w-sm animate-slide-up" style={{ animationDelay: "150ms" }}>
            {/* Mobile logo */}
            <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={displayName} className="h-9 w-9 rounded-xl object-cover" />
              ) : (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-white font-bold text-sm"
                  style={{ background: "var(--color-primary,#7C3AED)" }}
                >
                  {initials(displayName)}
                </div>
              )}
              <span className="font-bold text-gray-900 text-lg truncate max-w-[200px]">{displayName}</span>
            </div>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

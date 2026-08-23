import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useLang } from "@/i18n";

// Mirrors apps/site's actual brand/footer/FAB chrome (logo, name, colors,
// fonts, social links) so this portal reads as a continuation of that site,
// not a separate product — but keeps a single nav row (this app's own pages)
// plus one clear way back, rather than duplicating the site's full nav here.
const TENANT_SLUG = "success-tutorial";

interface TenantBranding {
  name: string;
  logoUrl: string | null;
}

export function PortalLayout() {
  const [tenant, setTenant] = useState<TenantBranding | null>(null);
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    fetch(`/api/tenants/slug/${TENANT_SLUG}/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (t) setTenant({ name: t.name, logoUrl: t.branding?.logoUrl ?? null });
      })
      .catch(() => {});
  }, []);

  const PORTAL_TABS = [
    { label: t("navHome"), to: "/", end: true },
    { label: t("navJobs"), to: "/jobs" },
    { label: t("navCurrentAffairs"), to: "/current-affairs" },
    { label: t("navCalendar"), to: "/calendar" },
    { label: t("navEligibility"), to: "/eligibility-checker" },
  ];

  const brandName = tenant?.name ?? "The Success Tutorial Classes";
  const initials = brandName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-surface font-sans text-ink">
      <header className="sticky top-0 z-50 bg-surface/85 backdrop-blur-md border-b border-ink/[0.08]">
        <div className="max-w-[1320px] mx-auto px-6 py-3.5 flex items-center justify-between gap-5">
          <a href="/" className="flex items-center gap-2 font-bold text-[18.5px] shrink-0">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={brandName} className="w-[34px] h-[34px] rounded-[11px] object-cover" />
            ) : (
              <span className="w-[34px] h-[34px] rounded-[11px] bg-primary text-white flex items-center justify-center text-[13px] font-extrabold">
                {initials || "ST"}
              </span>
            )}
            <span className="font-heading text-ink">{brandName}</span>
          </a>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {PORTAL_TABS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-2 rounded-lg text-[13px] font-bold whitespace-nowrap transition-colors",
                    isActive ? "text-primary bg-primary/[0.08]" : "text-ink-soft hover:text-primary",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex border-[1.5px] border-primary/20 rounded-full p-[3px] bg-white">
              <button
                type="button"
                onClick={() => setLang("hi")}
                className={cn("text-[12px] font-bold px-[11px] py-[6px] rounded-full transition-colors", lang === "hi" ? "bg-primary text-white" : "text-ink-soft")}
              >
                हिं
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={cn("text-[12px] font-bold px-[11px] py-[6px] rounded-full transition-colors", lang === "en" ? "bg-primary text-white" : "text-ink-soft")}
              >
                EN
              </button>
            </div>
            <a
              href="/"
              className="hidden sm:inline-flex items-center gap-2 text-[13px] font-bold text-primary border-[1.5px] border-primary/25 bg-white px-4 py-2 rounded-xl hover:-translate-y-0.5 transition-transform"
            >
              {t("backToMainSite")}
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ink/[0.08] py-9 mt-10">
        <div className="max-w-[1140px] mx-auto px-6 flex flex-col items-center gap-3.5 text-center">
          <div className="flex items-center gap-3.5">
            <a
              href="https://www.youtube.com/@thesuccesstutorialclassesg8451"
              target="_blank"
              rel="noopener"
              aria-label="YouTube"
              title="YouTube"
              className="w-9 h-9 rounded-full bg-white border border-ink/10 flex items-center justify-center hover:-translate-y-0.5 transition-transform"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000">
                <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.51 3.5 12 3.5 12 3.5s-7.51 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14C4.49 20.5 12 20.5 12 20.5s7.51 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81ZM9.6 15.6V8.4L15.8 12Z" />
              </svg>
            </a>
            <a
              href="https://wa.me/"
              target="_blank"
              rel="noopener"
              aria-label="WhatsApp"
              title="WhatsApp"
              className="w-9 h-9 rounded-full bg-white border border-ink/10 flex items-center justify-center hover:-translate-y-0.5 transition-transform"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="#25D366">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.36 5.07L2 22l5.07-1.33A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.6 0-3.1-.44-4.38-1.2l-.31-.18-3 .79.8-2.92-.2-.3A7.94 7.94 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8zm4.4-5.6c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.62-1.18-1.39-1.32-1.63-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.48-.4-.4-.54-.4-.14 0-.3-.02-.46-.02s-.42.06-.64.3c-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.43-.58 1.63-1.15.2-.56.2-1.04.14-1.15-.06-.1-.22-.16-.46-.28z" />
              </svg>
            </a>
          </div>
          <p className="text-xs text-ink-soft">
            {new Date().getFullYear()} {brandName}. {t("footerRights")}
          </p>
        </div>
      </footer>

      <div className="fixed bottom-[22px] right-[22px] z-[60] flex flex-col gap-3">
        <a
          href="https://www.youtube.com/@thesuccesstutorialclassesg8451"
          target="_blank"
          rel="noopener"
          aria-label="Watch us on YouTube"
          title="Watch us on YouTube"
          className="w-[54px] h-[54px] rounded-full bg-[#FF0000] flex items-center justify-center shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
            <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.51 3.5 12 3.5 12 3.5s-7.51 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14C4.49 20.5 12 20.5 12 20.5s7.51 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81ZM9.6 15.6V8.4L15.8 12Z" />
          </svg>
        </a>
        <a
          href="https://wa.me/"
          target="_blank"
          rel="noopener"
          aria-label="Chat on WhatsApp"
          title="Chat with us on WhatsApp"
          className="w-[54px] h-[54px] rounded-full bg-[#25D366] flex items-center justify-center shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)]"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.36 5.07L2 22l5.07-1.33A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.6 0-3.1-.44-4.38-1.2l-.31-.18-3 .79.8-2.92-.2-.3A7.94 7.94 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8zm4.4-5.6c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.62-1.18-1.39-1.32-1.63-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.48-.4-.4-.54-.4-.14 0-.3-.02-.46-.02s-.42.06-.64.3c-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.43-.58 1.63-1.15.2-.56.2-1.04.14-1.15-.06-.1-.22-.16-.46-.28z" />
          </svg>
        </a>
      </div>
    </div>
  );
}

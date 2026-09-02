import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, PackageX, Rocket, PenLine, Star, BookOpen, GraduationCap, Sparkles } from "lucide-react";
import { getTenantBySlug } from "@/api/auth";
import { getLatestReleaseBySlug, type AppReleaseAudience } from "@/api/appReleases";
import { initials } from "@/lib/utils";

// Fixed positions/sizes (not random) so the layout is stable across
// re-renders — only the color cycling through [primary, secondary, accent]
// and the float animation timing vary.
const FLOATERS: { Icon: typeof PenLine; className: string; size: number; delay: string; slow?: boolean }[] = [
  { Icon: PenLine,       className: "top-[10%] left-[6%]",  size: 30, delay: "0s"    },
  { Icon: Star,          className: "top-[68%] left-[5%]",  size: 22, delay: "0.6s", slow: true },
  { Icon: BookOpen,      className: "top-[16%] right-[8%]", size: 26, delay: "1.1s" },
  { Icon: GraduationCap, className: "top-[64%] right-[7%]", size: 32, delay: "0.3s", slow: true },
  { Icon: Sparkles,      className: "top-[40%] left-[2%]",  size: 18, delay: "1.6s" },
];

// Real confetti for a real action (the download actually starting) — not
// decorative filler. Ported from the reference's vanilla-JS burst, using the
// Web Animations API directly since this is a one-shot DOM effect that
// doesn't benefit from being modeled as React state.
function burstConfetti(originEl: HTMLElement, colors: string[]) {
  const rect = originEl.getBoundingClientRect();
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("div");
    const size = 5 + Math.random() * 5;
    Object.assign(p.style, {
      position: "fixed",
      left: `${rect.left + rect.width / 2}px`,
      top: `${rect.top}px`,
      width: `${size}px`,
      height: `${size * (Math.random() > 0.5 ? 1 : 2.2)}px`,
      background: colors[i % colors.length],
      borderRadius: Math.random() > 0.5 ? "50%" : "2px",
      zIndex: "9999",
      pointerEvents: "none",
    });
    document.body.appendChild(p);
    const angle = Math.random() * Math.PI + Math.PI; // upward spread
    const distance = 90 + Math.random() * 140;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 40;
    const rot = (Math.random() - 0.5) * 540;
    p.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 1200 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" },
    ).onfinish = () => p.remove();
  }
}

// Public, unauthenticated — a shareable link (/download/<tenantSlug>) so
// anyone can get the APK directly, without a developer sending the file
// person-to-person. Not wrapped in AuthLayout/AppLayout, same reasoning as
// ApplyPage.tsx: a standalone page with no nav shell.
export function DownloadPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [downloading, setDownloading] = useState(false);
  // Percent while the total size is known from Content-Length; null while
  // not downloading; "indeterminate" for the rare case a proxy strips that
  // header, so the bar can still say *something* is happening.
  const [downloadProgress, setDownloadProgress] = useState<number | "indeterminate" | null>(null);
  const [downloadError, setDownloadError] = useState(false);
  const downloadBtnRef = useRef<HTMLButtonElement>(null);
  // Staff (Admin/Teacher/Frontdesk) is the only build that exists today —
  // Student is future scope, selecting it just surfaces the same "Coming
  // Soon" empty state below since no release is registered for it yet.
  const [audience, setAudience] = useState<AppReleaseAudience>("staff");

  const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useQuery({
    queryKey: ["public-tenant", tenantSlug],
    queryFn:  () => getTenantBySlug(tenantSlug!),
    enabled:  !!tenantSlug,
    retry:    false,
  });

  const { data: release, isLoading: releaseLoading, isError: releaseError, refetch } = useQuery({
    queryKey: ["public-latest-release", tenantSlug, audience],
    queryFn:  () => getLatestReleaseBySlug(tenantSlug!, audience),
    enabled:  !!tenant,
    retry:    false,
  });

  // Falls back to this exact warm marigold/coral/teal trio — not the app's
  // usual violet default — when a tenant has only set a primary color (the
  // common case). Keeps the page's character intact instead of collapsing
  // to a single flat hue for every under-configured tenant.
  const primary   = tenant?.branding.primary   ?? "#F59E0B";
  const secondary = tenant?.branding.secondary ?? "#FF6F59";
  const accent    = tenant?.branding.accent    ?? "#12968A";

  useEffect(() => {
    document.documentElement.style.setProperty("--color-primary", primary);
  }, [primary]);

  const particles = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 3 + Math.random() * 4,
      color: [primary, secondary, accent][i % 3],
      duration: 2.2 + Math.random() * 2.2,
      delay: Math.random() * 3,
    })),
    [primary, secondary, accent],
  );

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(false);
    setDownloadProgress(0);
    try {
      // The signed URL expires (30 min server-side) — get a fresh one right
      // before downloading rather than trusting whatever was fetched when
      // the page first loaded, in case the visitor sat on this page a while.
      const { data: fresh } = await refetch();
      if (!fresh) return;

      if (downloadBtnRef.current) burstConfetti(downloadBtnRef.current, [primary, secondary, accent]);

      // fetch() + a streamed reader (instead of a plain navigation) is what
      // lets us show real percentage progress for a ~120MB file — the S3
      // bucket already allows cross-origin GETs (Access-Control-Allow-Origin: *),
      // so this works without a proxy. The tradeoff: the whole file is held
      // in memory as a Blob before it can be saved, unlike a native download
      // which streams straight to disk. Acceptable at this file size.
      const res = await fetch(fresh.downloadUrl);
      if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);

      const totalStr = res.headers.get("Content-Length");
      const total = totalStr ? Number(totalStr) : 0;
      if (!total) setDownloadProgress("indeterminate");

      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (total) setDownloadProgress(Math.min(99, Math.round((received / total) * 100)));
      }
      setDownloadProgress(100);

      const blob = new Blob(chunks, { type: "application/vnd.android.package-archive" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${tenantSlug}-v${release?.versionName ?? "latest"}.apk`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser's save dialog a moment to pick up the blob before
      // the URL is revoked out from under it.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
      setTimeout(() => setDownloadProgress(null), 1500);
    }
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center p-4"
      style={{
        background:
          `radial-gradient(circle at 12% 8%, color-mix(in srgb, ${primary} 18%, white) 0%, transparent 45%),` +
          `radial-gradient(circle at 90% 15%, color-mix(in srgb, ${secondary} 20%, white) 0%, transparent 40%),` +
          `radial-gradient(circle at 80% 90%, color-mix(in srgb, ${accent} 22%, white) 0%, transparent 45%),` +
          `#FFF8EC`,
      }}
    >
      {/* Ruled-paper line texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: "linear-gradient(#E9DFC6 1px, transparent 1px)",
          backgroundSize: "100% 42px",
          maskImage: "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
        }}
      />

      {/* Morphing gradient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="orb animate-blob absolute opacity-40" style={{ width: 420, height: 420, top: -140, left: -120, background: `radial-gradient(circle, ${primary}66, transparent 70%)` }} />
        <div className="orb animate-blob-slow absolute opacity-35" style={{ width: 380, height: 380, bottom: -160, right: -100, background: `radial-gradient(circle, ${secondary}66, transparent 70%)`, animationDelay: "1s" }} />
        <div className="orb animate-blob absolute opacity-30" style={{ width: 320, height: 320, bottom: "10%", left: -140, background: `radial-gradient(circle, ${accent}66, transparent 70%)`, animationDelay: "2s" }} />
      </div>

      {/* Floating stationery */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden motion-reduce:hidden">
        {FLOATERS.map(({ Icon, className, size, delay, slow }, i) => (
          <div key={i} className={`absolute ${className} ${slow ? "animate-float-slow" : "animate-float"}`} style={{ animationDelay: delay }}>
            <Icon size={size} className="opacity-50 drop-shadow-sm" style={{ color: [primary, secondary, accent][i % 3] }} />
          </div>
        ))}
      </div>

      {/* Twinkling particles */}
      <div className="fixed inset-0 pointer-events-none motion-reduce:hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute rounded-full animate-pulse"
            style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, background: p.color, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }}
          />
        ))}
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm rounded-[28px] bg-[#fffdf9] shadow-shell border border-black/5 px-9 pt-10 pb-9 animate-scale-in">
        {/* Torn notebook edge */}
        <div
          className="absolute left-0 right-0 -top-[14px] h-4 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 10px 10px, #fffdf9 9px, transparent 10px)", backgroundSize: "20px 20px", backgroundPosition: "-2px 0" }}
        />

        {tenantLoading && (
          <div className="flex justify-center py-14">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: primary }} />
          </div>
        )}

        {tenantError && !tenantLoading && (
          <div className="text-center py-8">
            <PackageX className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <h1 className="text-lg font-bold text-gray-900">Organization not found</h1>
            <p className="text-sm text-gray-500 mt-1">Check the link and try again.</p>
          </div>
        )}

        {tenant && (
          <>
            {/* Badge */}
            <div className="relative w-[100px] h-[100px] mx-auto mb-5">
              <div className="absolute -inset-3 rounded-full blur-xl opacity-50 animate-pulse" style={{ background: `radial-gradient(circle, ${primary}66, transparent 70%)`, animationDuration: "2.4s" }} />
              <div className="absolute inset-0 rounded-full animate-spin-slow" style={{ background: `conic-gradient(from 0deg, ${primary}, ${secondary}, ${accent}, ${primary})` }} />
              <div className="absolute inset-[5px] rounded-full bg-[#fffdf9]" />
              <div
                className="absolute inset-[9px] rounded-full flex items-center justify-center overflow-hidden shadow-inner"
                style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${primary} 55%, white), ${primary})` }}
              >
                {tenant.branding.logoUrl ? (
                  <img src={tenant.branding.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-extrabold text-2xl">{initials(tenant.name)}</span>
                )}
              </div>
            </div>

            <h1 className="text-center text-2xl font-extrabold tracking-tight text-gray-900 mb-1">{tenant.name}</h1>
            <p className="text-center text-sm font-semibold text-gray-500 mb-5">Get the app for Android</p>

            <div className="flex justify-center gap-1.5 mb-7">
              {([
                { value: "staff" as const,   label: "Staff App" },
                { value: "student" as const, label: "Student App" },
              ]).map((opt) => {
                const active = audience === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAudience(opt.value)}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors"
                    style={
                      active
                        ? { background: primary, color: "#fff" }
                        : { background: "transparent", color: "#9CA3AF", border: "1px solid #E5E7EB" }
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {releaseLoading && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: primary }} />
              </div>
            )}

            {(releaseError || (!releaseLoading && !release)) && (
              <div className="text-center">
                <div
                  className="rounded-2xl p-5"
                  style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${primary} 12%, white), color-mix(in srgb, ${primary} 5%, white))`, border: `1px solid color-mix(in srgb, ${primary} 30%, white)` }}
                >
                  <p className="text-sm text-gray-600 leading-relaxed">
                    We're putting the finishing touches on the app.
                    <br />Check back on this page soon.
                  </p>
                </div>
                <div
                  className="relative overflow-hidden inline-flex items-center gap-2 mt-4 px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-lg"
                  style={{ background: "linear-gradient(135deg, #201A3B, #34285F)" }}
                >
                  <Rocket className="h-4 w-4 shrink-0" style={{ color: primary }} />
                  Coming Soon
                  <span
                    className="absolute inset-y-0 left-0 w-2/5 animate-shimmer motion-reduce:hidden"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)" }}
                  />
                </div>
              </div>
            )}

            {release && (
              <>
                <div
                  className="rounded-2xl p-4 mb-5"
                  style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${primary} 10%, white), color-mix(in srgb, ${primary} 4%, white))`, border: `1px solid color-mix(in srgb, ${primary} 25%, white)` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-900">Version {release.versionName}</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: primary }}>Latest</span>
                  </div>
                  {release.changelog && <p className="text-xs text-gray-500 mt-2 leading-relaxed">{release.changelog}</p>}
                </div>

                <button
                  ref={downloadBtnRef}
                  onClick={handleDownload}
                  disabled={downloading}
                  className="relative w-full h-12 rounded-2xl font-bold text-white flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98] disabled:opacity-100 overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${primary}, color-mix(in srgb, ${primary} 70%, black))` }}
                >
                  {typeof downloadProgress === "number" && (
                    <span
                      className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-200 ease-out"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  )}
                  <span className="relative flex items-center justify-center gap-2">
                    {downloading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {downloadProgress === "indeterminate"
                          ? "Downloading…"
                          : `Downloading… ${downloadProgress ?? 0}%`}
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Download APK
                      </>
                    )}
                  </span>
                </button>

                {downloadError && (
                  <p className="text-center text-xs text-red-500 mt-2 font-semibold">
                    Download failed — check your connection and try again.
                  </p>
                )}

                <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed">
                  After downloading, open the file to install. Android will ask permission to
                  install from this source — that's normal and only needed the first time.
                </p>
              </>
            )}

            {/* Decorative bottom dots */}
            <div className="flex justify-center gap-1.5 mt-7">
              {[primary, secondary, accent].map((c, i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: c, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

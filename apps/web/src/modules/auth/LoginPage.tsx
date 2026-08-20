import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, ArrowRight, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { login, getTenantPublic, forgotPassword, resetPassword, validateResetCode } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

const loginSchema = z.object({
  identifier: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});
type LoginForm = z.infer<typeof loginSchema>;

// Inline panel, not a separate route — the email link and this page both
// need { tenantId, identifier, code }, and keeping it in one component
// means the "enter code" step can reuse whatever identifier the user just
// typed in step 1, without round-tripping it through the URL.
function ForgotPasswordPanel({
  tenantId, loginMethod, onBack, initialIdentifier, initialCode,
}: {
  tenantId: string;
  loginMethod: "phone" | "email_username";
  onBack: () => void;
  // Set when arriving from the emailed reset link (/login?resetTenantId=...) —
  // skips straight to the "enter new password" step instead of "request".
  initialIdentifier?: string;
  initialCode?: string;
}) {
  const arrivedFromLink = !!(initialIdentifier && initialCode);
  const [step, setStep] = useState<"checking" | "request" | "reset" | "expired" | "done">(arrivedFromLink ? "checking" : "request");
  const [identifier, setIdentifier] = useState(initialIdentifier ?? "");
  const [code, setCode] = useState(initialCode ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Checks the emailed link's code BEFORE showing the reset form, so a
  // stale/already-used link says "expired" up front instead of only failing
  // after the user has typed a new password and hit submit.
  useEffect(() => {
    if (!arrivedFromLink) return;
    let cancelled = false;
    validateResetCode(tenantId, initialIdentifier!, initialCode!)
      .then((valid) => { if (!cancelled) setStep(valid ? "reset" : "expired"); })
      // A network hiccup here shouldn't itself block the reset flow — fall
      // back to showing the form; resetPassword() still validates for real
      // on submit either way.
      .catch(() => { if (!cancelled) setStep("reset"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRequest() {
    if (!identifier.trim()) return;
    setSubmitting(true);
    try {
      await forgotPassword(tenantId, identifier.trim());
      setStep("reset");
    } catch (err: unknown) {
      // A 502 here means the account exists but the mail/SMS provider
      // failed to deliver (see auth.routes.ts) — surfaced with its real
      // message so the user isn't left checking an inbox that was never
      // going to receive anything. Any other failure (network, etc.) falls
      // back to a generic message.
      const apiMessage = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast({ variant: "destructive", title: apiMessage ?? "Something went wrong", description: apiMessage ? undefined : "Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    if (!code.trim()) { toast({ variant: "destructive", title: "Enter the code you received" }); return; }
    if (password.length < 6) { toast({ variant: "destructive", title: "Password must be at least 6 characters" }); return; }
    if (password !== confirm) { toast({ variant: "destructive", title: "Passwords do not match" }); return; }
    setSubmitting(true);
    try {
      await resetPassword(tenantId, identifier.trim(), code.trim(), password);
      setStep("done");
    } catch {
      toast({ variant: "destructive", title: "Invalid or expired code", description: "Request a new one and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "checking") {
    return (
      <div className="animate-scale-in text-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-gray-300 mx-auto" />
      </div>
    );
  }

  if (step === "expired") {
    return (
      <div className="animate-scale-in text-center py-4">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <XCircle className="h-7 w-7 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">This link has expired</h2>
        <p className="text-sm text-gray-400 mt-1 mb-6">
          Reset links only work for a limited time, or once. Request a new one below.
        </p>
        <Button className="w-full h-11 font-semibold" onClick={() => { setCode(""); setStep("request"); }}>
          Request a New Link
        </Button>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="animate-scale-in text-center py-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Password reset</h2>
        <p className="text-sm text-gray-400 mt-1 mb-6">You can now sign in with your new password.</p>
        <Button className="w-full h-11 font-semibold" onClick={onBack}>Back to Sign In</Button>
      </div>
    );
  }

  if (step === "reset") {
    return (
      <div className="animate-scale-in">
        <button onClick={() => setStep("request")} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4">
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Enter reset code</h2>
        {/* Deliberately conditional ("if...") rather than asserting a code was
            sent — we never confirm or deny that an account exists for a given
            identifier (see auth.routes.ts's forgot-password handler), so this
            copy can't claim delivery happened either. */}
        <p className="text-gray-400 mt-1 text-sm mb-6">
          {loginMethod === "phone"
            ? "If that phone number matches an account, we've texted a 6-digit code to it."
            : "If that email or username matches an account, we've emailed a reset code to it — paste it below."}
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Code</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={loginMethod === "phone" ? "6-digit code" : "Reset code"} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">New Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Confirm New Password</label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" />
          </div>
          <Button className="w-full h-11 font-semibold mt-2" onClick={handleReset} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset Password"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-scale-in">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" />Back to Sign In
      </button>
      <h2 className="text-2xl font-bold text-gray-900">Reset your password</h2>
      <p className="text-gray-400 mt-1 text-sm mb-6">
        Enter your {loginMethod === "phone" ? "phone number" : "email or username"} and we'll send you a reset code.
      </p>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700">
          {loginMethod === "phone" ? "Phone number" : "Email or username"}
        </label>
        <Input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={loginMethod === "phone" ? "+91 00000 00000" : "you@example.com"}
        />
      </div>
      <Button className="w-full h-11 font-semibold mt-4" onClick={handleRequest} disabled={submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reset Code"}
      </Button>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login: storeLogin, isAuthenticated, needsCenterPick } = useAuth();
  const { tenantId } = useTenant();
  const [searchParams] = useSearchParams();
  const resetIdentifier = searchParams.get("resetIdentifier") ?? undefined;
  const resetCode = searchParams.get("resetCode") ?? undefined;
  // The emailed reset link carries its own tenantId — the recipient may be
  // opening it in a browser that's never visited this institute's /org/:slug
  // link before, so TenantContext wouldn't have anything resolved yet.
  const resetTenantId = searchParams.get("resetTenantId") ?? undefined;
  const effectiveTenantId = resetTenantId ?? tenantId ?? undefined;
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(!!(resetIdentifier && resetCode));
  const [orgName, setOrgName] = useState("");
  const [loginMethod, setLoginMethod] = useState<"phone" | "email_username">("phone");
  // undefined = not fetched yet; null = fetched, tenant has no custom color
  const [primary, setPrimary] = useState<string | null | undefined>(undefined);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (isAuthenticated && !needsCenterPick) navigate("/dashboard", { replace: true });
    else if (needsCenterPick) navigate("/pick-center", { replace: true });
  }, [isAuthenticated, needsCenterPick, navigate]);

  useEffect(() => {
    if (!effectiveTenantId) return;
    getTenantPublic(effectiveTenantId).then((t) => {
      setOrgName(t.name);
      setLoginMethod(t.loginMethod);
      setPrimary(t.branding.primary);
    }).catch(() => {});
  }, [effectiveTenantId]);

  // Same pattern as AppLayout.tsx/ApplyPage.tsx — resolved tenant's brand
  // color drives the login screen (AuthLayout's gradient panel + orbs, and
  // this page's own accents) via the shared --color-primary CSS variable.
  // Only acts once the real value is known (primary !== null) — on first
  // mount this effect would otherwise briefly overwrite the correct color
  // that index.html's inline script (or TenantContext's resolveSlug) already
  // applied synchronously, with the "#7C3AED" placeholder, causing exactly
  // the flash this is meant to prevent.
  useEffect(() => {
    if (primary === undefined) return;
    const resolved = primary ?? "#7C3AED";
    document.documentElement.style.setProperty("--color-primary", resolved);
    try {
      localStorage.setItem("resolved_tenant_primary", resolved);
    } catch {}
  }, [primary]);

  async function onSubmit(values: LoginForm) {
    if (!tenantId) {
      toast({ variant: "destructive", title: "No organization selected", description: "Use your institute's login link, or contact support." });
      return;
    }
    try {
      const result = await login({ tenantId, identifier: values.identifier, password: values.password });
      const { needsCenterPick } = await storeLogin(result);
      navigate(needsCenterPick ? "/pick-center" : "/dashboard", { replace: true });
    } catch {
      toast({ variant: "destructive", title: "Login failed", description: "Invalid credentials. Please try again." });
    }
  }

  if (showForgotPassword && effectiveTenantId) {
    return (
      <ForgotPasswordPanel
        tenantId={effectiveTenantId}
        loginMethod={loginMethod}
        onBack={() => setShowForgotPassword(false)}
        initialIdentifier={resetIdentifier}
        initialCode={resetCode}
      />
    );
  }

  return (
    <div className="animate-scale-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
        <p className="text-gray-400 mt-1 text-sm">
          Sign in to <span className="font-semibold text-gray-700">{orgName || "Institute OS"}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">
            {loginMethod === "phone" ? "Phone number" : "Email or username"}
          </label>
          <Input
            {...register("identifier")}
            placeholder={loginMethod === "phone" ? "+91 00000 00000" : "you@example.com"}
            autoComplete="username"
            className={errors.identifier ? "border-red-300" : ""}
          />
          {errors.identifier && <p className="text-xs text-red-500">{errors.identifier.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-700">Password</label>
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-xs font-medium text-[var(--color-primary,#7C3AED)] hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
              className={`pr-10 ${errors.password ? "border-red-300" : ""}`}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full h-11 font-semibold mt-2" disabled={isSubmitting}>
          {isSubmitting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><span>Sign In</span><ArrowRight className="h-4 w-4" /></>
          }
        </Button>
      </form>

      <p className="text-center text-xs text-gray-300 mt-8">Secured by Institute OS · All rights reserved</p>
    </div>
  );
}

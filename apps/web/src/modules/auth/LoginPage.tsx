import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { login, getTenantPublic } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

const loginSchema = z.object({
  identifier: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { login: storeLogin, isAuthenticated, needsCenterPick } = useAuth();
  const { tenantId } = useTenant();
  const [showPassword, setShowPassword] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [loginMethod, setLoginMethod] = useState<"phone" | "email_username">("phone");

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (isAuthenticated && !needsCenterPick) navigate("/dashboard", { replace: true });
    else if (needsCenterPick) navigate("/pick-center", { replace: true });
  }, [isAuthenticated, needsCenterPick, navigate]);

  useEffect(() => {
    if (!tenantId) return;
    getTenantPublic(tenantId).then((t) => {
      setOrgName(t.name);
      setLoginMethod(t.loginMethod);
    }).catch(() => {});
  }, [tenantId]);

  async function onSubmit(values: LoginForm) {
    if (!tenantId) {
      toast({ variant: "destructive", title: "No organization selected", description: "Use your institute's login link, or contact support." });
      return;
    }
    try {
      const result = await login({ tenantId, identifier: values.identifier, password: values.password });
      storeLogin(result);
      if (result.centers.length > 1 && !result.currentCenter) navigate("/pick-center", { replace: true });
      else navigate("/dashboard", { replace: true });
    } catch {
      toast({ variant: "destructive", title: "Login failed", description: "Invalid credentials. Please try again." });
    }
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
          <label className="text-sm font-semibold text-gray-700">Password</label>
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

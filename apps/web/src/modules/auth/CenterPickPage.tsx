import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Globe, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { selectCenter } from "@/api/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export function CenterPickPage() {
  const { centers, selectCenter: storeSelectCenter, logout } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSelect() {
    if (!selected) return;
    setLoading(true);
    try {
      const result = await selectCenter(selected === "__all__" ? null : selected);
      storeSelectCenter(result.center, result.accessToken, result.refreshToken, result.roles, result.activeRole, result.permissions);
      navigate("/dashboard", { replace: true });
    } catch {
      toast({ variant: "destructive", title: "Failed to select center" });
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center">
        <CardTitle>Select Center</CardTitle>
        <CardDescription>Choose which center you want to manage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {centers.length > 1 && (
          <button
            onClick={() => setSelected("__all__")}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all",
              selected === "__all__"
                ? "border-[var(--color-primary,#C0392B)] bg-red-50"
                : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 flex-shrink-0">
              <Globe className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">All Centers</p>
              <p className="text-sm text-gray-500">Aggregated view across every center</p>
            </div>
          </button>
        )}
        {centers.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all",
              selected === c.id
                ? "border-[var(--color-primary,#C0392B)] bg-red-50"
                : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 flex-shrink-0">
              <Building2 className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{c.name}</p>
              <p className="text-sm text-gray-500 capitalize">{c.roles.join(", ")}</p>
            </div>
          </button>
        ))}
        <div className="pt-2 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleLogout}>
            Back to Login
          </Button>
          <Button className="flex-1" onClick={handleSelect} disabled={!selected || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

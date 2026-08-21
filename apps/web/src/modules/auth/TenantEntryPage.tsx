import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useTenant } from "@/context/TenantContext";

// Shareable per-institute entry link (e.g. /org/default) — resolves the slug
// to a tenant id via TenantContext, stores it, then hands off to the normal
// login flow. Not wrapped in AuthLayout: it's a near-instant redirect, not a
// screen anyone lingers on.
export function TenantEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { resolveSlug } = useTenant();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) { setNotFound(true); return; }
    resolveSlug(slug).then((ok) => {
      if (ok) navigate("/login", { replace: true });
      else setNotFound(true);
    });
  }, [slug, resolveSlug, navigate]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-900">Organization not found</h1>
          <p className="text-sm text-gray-500 mt-1">Check the link and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );
}

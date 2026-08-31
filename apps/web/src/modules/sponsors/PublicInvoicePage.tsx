import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, FileX, Loader2, Landmark } from "lucide-react";
import { getPublicSponsorInvoice } from "@/api/sponsors";
import { formatCurrency, formatDate } from "@/lib/utils";

// Public, unauthenticated — a shareable link so a sponsor company can view
// and download their invoice without logging in. Not wrapped in
// AuthLayout/AppLayout, same reasoning as ApplyPage.tsx/DownloadPage.tsx: a
// standalone page with no nav shell.
export function PublicInvoicePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [downloading, setDownloading] = useState(false);

  const { data: invoice, isLoading, isError, refetch } = useQuery({
    queryKey: ["public-sponsor-invoice", shareToken],
    queryFn: () => getPublicSponsorInvoice(shareToken!),
    enabled: !!shareToken,
    retry: false,
  });

  async function handleDownload() {
    setDownloading(true);
    try {
      // The signed URL expires — get a fresh one right before downloading
      // rather than trusting whatever was fetched when the page first
      // loaded, same reasoning as DownloadPage.tsx's APK download.
      const { data: fresh } = await refetch();
      if (fresh) window.location.href = fresh.downloadUrl;
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-sm border border-gray-100 p-8 text-center">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" />}

        {isError && !isLoading && (
          <>
            <FileX className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <h1 className="text-lg font-semibold text-gray-900">Invoice not found</h1>
            <p className="text-sm text-gray-500 mt-1">Check the link and try again.</p>
          </>
        )}

        {invoice && (
          <>
            <div className="h-14 w-14 rounded-full bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <Landmark className="h-6 w-6 text-violet-500" />
            </div>
            <p className="text-xs font-mono text-gray-400">{invoice.invoiceNumber}</p>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(invoice.totalAmount)}</h1>
            <p className="text-sm text-gray-500 mt-1">Billed to {invoice.sponsorName}</p>
            <p className="text-xs text-gray-400 mt-1">Issued {formatDate(invoice.issueDate)}</p>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full h-11 mt-6 rounded-xl bg-violet-600 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-violet-700 transition-colors disabled:opacity-70"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </button>
          </>
        )}
      </div>
    </div>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Exported so code outside the component tree (AuthContext.tsx, an ancestor
// of QueryClientProvider — see main.tsx — so it can't call useQueryClient())
// can invalidate/clear the cache directly when the authenticated scope
// changes (center switch, login, logout).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

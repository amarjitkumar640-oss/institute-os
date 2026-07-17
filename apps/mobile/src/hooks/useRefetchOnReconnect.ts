import { useEffect, useRef } from "react";
import { useNetwork } from "../context/NetworkContext";

/**
 * Calls `refetch` automatically whenever internet reconnects.
 * Always uses the latest version of `refetch` — safe to pass inline closures
 * that capture current state (e.g. search, filter).
 */
export function useRefetchOnReconnect(refetch: () => void) {
  const { justReconnected } = useNetwork();
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (justReconnected) refetchRef.current();
  }, [justReconnected]);
}

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

interface NetworkContextValue {
  isOnline:        boolean;
  justReconnected: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({ isOnline: true, justReconnected: false });

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline,        setIsOnline]        = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized    = useRef(false);
  const prevOnline     = useRef(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;

      // Detect offline→online transition outside of a state updater (no side-effects in updaters)
      if (initialized.current && !prevOnline.current && online) {
        setJustReconnected(true);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => setJustReconnected(false), 2500);
      }

      initialized.current = true;
      prevOnline.current  = online;
      setIsOnline(online);
    });

    return () => {
      unsub();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, justReconnected }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { fetchUnreadCount } from "../api/notifications";
import { useAuth } from "./AuthContext";

interface NotificationBadgeValue {
  unreadCount: number;
  refreshUnread: () => void;
}

const NotificationBadgeContext = createContext<NotificationBadgeValue>({
  unreadCount: 0,
  refreshUnread: () => {},
});

export function useNotificationBadge() {
  return useContext(NotificationBadgeContext);
}

// Single source of truth for the unread-notifications bell badge — refreshed on login,
// on any incoming push, and whenever the app returns to the foreground. Previously the
// admin and teacher dashboards each ran this independently via useFocusEffect, so the
// badge only updated while whichever dashboard screen happened to be mounted.
export function NotificationBadgeProvider({ children }: { children: React.ReactNode }) {
  const { staff } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(() => {
    if (!staff) { setUnreadCount(0); return; }
    fetchUnreadCount().then(setUnreadCount).catch(() => {});
  }, [staff]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  useEffect(() => {
    let sub: Notifications.EventSubscription | null = null;
    try { sub = Notifications.addNotificationReceivedListener(refreshUnread); } catch {}
    return () => { sub?.remove(); };
  }, [refreshUnread]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") refreshUnread();
    });
    return () => sub.remove();
  }, [refreshUnread]);

  return (
    <NotificationBadgeContext.Provider value={{ unreadCount, refreshUnread }}>
      {children}
    </NotificationBadgeContext.Provider>
  );
}

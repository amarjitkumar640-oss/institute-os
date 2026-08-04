import { apiClient } from "./client";

export type NotificationType =
  | "session_cancelled"
  | "session_rescheduled"
  | "session_assigned"
  | "class_reminder"
  | "new_enrollment"
  | "installment_overdue"
  | "batch_capacity";

export interface NotificationItem {
  id:        string;
  type:      NotificationType;
  title:     string;
  body:      string;
  data:      Record<string, any> | null;
  readAt:    string | null;
  createdAt: string;
}

export async function fetchNotifications(params?: { page?: number; limit?: number }) {
  const { data } = await apiClient.get<{
    data: NotificationItem[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }>("/notifications", { params });
  return data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>("/notifications/unread-count");
  return data.count;
}

export async function markNotificationRead(id: string): Promise<NotificationItem> {
  const { data } = await apiClient.patch<NotificationItem>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.patch("/notifications/read-all");
}

// ── Admin: notification routing (which roles receive each type) ───────────────

export interface NotificationRoutingEntry {
  type:         NotificationType;
  roles:        ("admin" | "teacher" | "frontdesk")[];
  isDefault:    boolean;
  configurable: boolean;
}

export async function fetchNotificationRouting(): Promise<NotificationRoutingEntry[]> {
  const { data } = await apiClient.get<NotificationRoutingEntry[]>("/notifications/routing");
  return data;
}

export async function updateNotificationRouting(
  type: NotificationType,
  roles: ("admin" | "teacher" | "frontdesk")[],
): Promise<NotificationRoutingEntry> {
  const { data } = await apiClient.patch<NotificationRoutingEntry>(`/notifications/routing/${type}`, { roles });
  return data;
}

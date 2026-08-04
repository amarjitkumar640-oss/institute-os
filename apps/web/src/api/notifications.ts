import { apiClient } from "./client";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationRouting {
  type: string;
  roles: string[];
  isDefault: boolean;
  configurable: boolean;
}

export async function listNotifications(params?: { page?: number; limit?: number }): Promise<{
  data: Notification[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> {
  const { data } = await apiClient.get("/api/notifications", { params });
  return data;
}

export async function getUnreadCount(): Promise<{ count: number }> {
  const { data } = await apiClient.get<{ count: number }>("/api/notifications/unread-count");
  return data;
}

export async function markRead(id: string): Promise<Notification> {
  const { data } = await apiClient.patch<Notification>(`/api/notifications/${id}/read`);
  return data;
}

export async function markAllRead(): Promise<void> {
  await apiClient.patch("/api/notifications/read-all");
}

export async function getNotificationRouting(): Promise<NotificationRouting[]> {
  const { data } = await apiClient.get<NotificationRouting[]>("/api/notifications/routing");
  return data;
}

export async function updateNotificationRouting(type: string, roles: string[]): Promise<NotificationRouting> {
  const { data } = await apiClient.patch<NotificationRouting>(`/api/notifications/routing/${type}`, { roles });
  return data;
}

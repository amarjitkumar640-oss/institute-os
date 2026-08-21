import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { apiClient } from "../api/client";

function isNativeAvailable(): boolean {
  try {
    Notifications.getPermissionsAsync();
    return true;
  } catch {
    return false;
  }
}

// One Android channel per NotificationType — channel IDs must exactly match
// what the API sends as android.notification.channelId (see
// apps/api/src/modules/notifications/notification.service.ts's TYPE_META),
// or Android 8+ silently drops the push. Colors mirror the in-app
// notification list's per-type palette. These are fixed semantic colors,
// not tenant-brand-derived — channels are created once at cold start,
// before any tenant theme is loaded, and Android won't let you recolor an
// existing channel later anyway.
const NOTIFICATION_CHANNELS: {
  id: string; name: string; importance: Notifications.AndroidImportance; color: string;
}[] = [
  { id: "session_cancelled",       name: "Cancelled Classes",   importance: Notifications.AndroidImportance.MAX,     color: "#C0392B" },
  { id: "session_rescheduled",     name: "Rescheduled Classes", importance: Notifications.AndroidImportance.HIGH,    color: "#F5B301" },
  { id: "session_assigned",        name: "Class Assignments",   importance: Notifications.AndroidImportance.HIGH,    color: "#2CA6A4" },
  { id: "session_subject_changed", name: "Class Subject Changes", importance: Notifications.AndroidImportance.HIGH, color: "#8E44AD" },
  { id: "class_reminder",      name: "Class Reminders",     importance: Notifications.AndroidImportance.HIGH,    color: "#2563A8" },
  { id: "new_enrollment",       name: "New Enrollments",      importance: Notifications.AndroidImportance.DEFAULT, color: "#1B9C63" },
  { id: "installment_overdue", name: "Fee Alerts",          importance: Notifications.AndroidImportance.MAX,     color: "#C0392B" },
  { id: "batch_capacity",      name: "Batch Capacity",      importance: Notifications.AndroidImportance.DEFAULT, color: "#5B2D8E" },
  { id: "new_application",     name: "Admission Applications", importance: Notifications.AndroidImportance.DEFAULT, color: "#2563A8" },
];

// Called once at app start — sets the foreground handler and creates the
// per-type Android notification channels (sound + vibration + distinct
// importance/color per type, so e.g. fee alerts can't be muted by muting
// new-enrollment pings).
export function setupNotifications(): void {
  if (!isNativeAvailable()) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList:   true,
      shouldPlaySound:  true,
      shouldSetBadge:   true,
    }),
  });

  if (Platform.OS === "android") {
    for (const channel of NOTIFICATION_CHANNELS) {
      Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: channel.importance,
        vibrationPattern: [0, 250, 250, 250],
        enableLights: true,
        lightColor: channel.color,
      }).catch(console.error);
    }
  }
}

// Gets the native FCM device token (Android) or APNs token (iOS) directly,
// bypassing the Expo push relay entirely. This token is registered with our
// API, which sends pushes via Firebase Admin SDK.
export async function registerPushToken(): Promise<void> {
  if (!Device.isDevice || !isNativeAvailable()) return;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const tokenData = await Notifications.getDevicePushTokenAsync();
    console.log("[push] native token type:", tokenData.type, "token:", tokenData.data.slice(0, 20) + "...");
    await apiClient.put("/notifications/push-token", { token: tokenData.data });
  } catch (e) {
    console.error("[push] registerPushToken failed:", e);
  }
}

export async function deregisterPushToken(): Promise<void> {
  if (!Device.isDevice || !isNativeAvailable()) return;
  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    await apiClient.delete("/notifications/push-token", { data: { token: tokenData.data } });
  } catch {
    // best-effort on logout
  }
}

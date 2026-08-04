import * as admin from "firebase-admin";
import { readFileSync } from "fs";
import { join } from "path";

let _messaging: admin.messaging.Messaging | null = null;
let _initAttempted = false;

function getMessaging(): admin.messaging.Messaging | null {
  if (_initAttempted) return _messaging;
  _initAttempted = true;

  try {
    const keyPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
      join(__dirname, "../../firebase-service-account.json");
    const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8")) as admin.ServiceAccount;
    const app =
      admin.apps.length > 0
        ? admin.apps[0]!
        : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    _messaging = admin.messaging(app);
  } catch (e) {
    console.warn("[fcm] Firebase Admin not initialized (missing service account):", (e as Error).message);
    _messaging = null;
  }

  return _messaging;
}

export type FcmPushOptions = {
  // Must match a channel ID already created client-side (see
  // apps/mobile/src/lib/pushNotifications.ts) — Android 8+ silently drops
  // the notification if the channel doesn't exist on the device.
  channelId: string;
  // Tints the Android status-bar/shade small icon for this notification.
  color: string;
  // Groups same-type notifications into a collapsed stack on iOS.
  threadId: string;
  // Recipient's live unread count, shown on the iOS app icon. Android's
  // launcher-derived badge isn't controllable via this payload the same way.
  badge?: number;
};

// Send FCM push to one or more device tokens. Fire-and-forget — errors are
// logged but never thrown, so a push failure never breaks the calling flow.
export function sendFcm(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string> | undefined,
  opts: FcmPushOptions,
): void {
  if (tokens.length === 0) return;
  const messaging = getMessaging();
  if (!messaging) return;

  const safeData = data ?? {};

  // Send one message per token so partial failures are isolated.
  for (const token of tokens) {
    messaging
      .send({
        token,
        notification: { title, body },
        data: safeData,
        android: {
          priority: "high",
          notification: { sound: "default", channelId: opts.channelId, color: opts.color },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              threadId: opts.threadId,
              ...(opts.badge !== undefined && { badge: opts.badge }),
            },
          },
        },
      })
      .catch((e: unknown) => console.error("[fcm] send failed for token:", token, e));
  }
}

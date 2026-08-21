import twilio, { type Twilio } from "twilio";
import { env } from "./env";

let _client: Twilio | null = null;
let _initAttempted = false;

// Same lazy-init-and-warn-once shape as lib/firebase.ts's getMessaging() and
// lib/email.ts's getTransporter() — an unconfigured environment degrades to
// a console warning, not a crash.
function getClient(): Twilio | null {
  if (_initAttempted) return _client;
  _initAttempted = true;

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    console.warn("[sms] Twilio not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER) — SMS will not be sent.");
    return null;
  }

  _client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return _client;
}

export async function sendSms(toPhone: string, body: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    await client.messages.create({ from: env.TWILIO_FROM_NUMBER, to: toPhone, body });
    return true;
  } catch (e) {
    console.error("[sms] send failed:", e);
    return false;
  }
}

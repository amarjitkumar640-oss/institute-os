import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let _transporter: Transporter | null = null;
let _initAttempted = false;

// Generic SMTP, not a vendor-specific SDK — works unchanged against SES's
// SMTP interface, Gmail, SendGrid's SMTP relay, or any other provider, so
// the choice of provider is purely an env-var/ops decision, never a code
// change. Same lazy-init-and-warn-once shape as lib/firebase.ts's
// getMessaging(), so an unconfigured environment degrades the same way a
// missing Firebase service account does — a console warning, not a crash.
function getTransporter(): Transporter | null {
  if (_initAttempted) return _transporter;
  _initAttempted = true;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    console.warn("[email] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM) — emails will not be sent.");
    return null;
  }

  _transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return _transporter;
}

// Fire-and-forget from the caller's perspective in spirit, but awaited here
// so the route can tell the difference between "sent" and "not configured"
// for its own logging — unlike sendFcm, there's no fan-out across many
// recipients to isolate failures for, just the one email.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  try {
    await transporter.sendMail({ from: env.SMTP_FROM, to, subject, html });
    return true;
  } catch (e) {
    console.error("[email] send failed:", e);
    return false;
  }
}

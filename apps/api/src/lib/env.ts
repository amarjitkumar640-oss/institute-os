import { cleanEnv, str, num } from "envalid";

export const env = cleanEnv(process.env, {
  DATABASE_URL: str(),
  PORT: num({ default: 4000 }),
  JWT_ACCESS_SECRET: str(),
  JWT_REFRESH_SECRET: str(),
  JWT_ACCESS_TTL: str({ default: "15m" }),
  JWT_REFRESH_TTL: str({ default: "7d" }),
  S3_ENDPOINT: str(),
  S3_ACCESS_KEY: str(),
  S3_SECRET_KEY: str(),
  S3_BUCKET: str(),

  // Password reset — all optional. Unset means that channel is unconfigured;
  // see lib/email.ts / lib/sms.ts, which log a warning and no-op rather than
  // fail the request when their provider isn't configured (same convention
  // as lib/firebase.ts's getMessaging()).
  SMTP_HOST: str({ default: "" }),
  SMTP_PORT: num({ default: 587 }),
  SMTP_USER: str({ default: "" }),
  SMTP_PASS: str({ default: "" }),
  SMTP_FROM: str({ default: "" }),
  TWILIO_ACCOUNT_SID: str({ default: "" }),
  TWILIO_AUTH_TOKEN: str({ default: "" }),
  TWILIO_FROM_NUMBER: str({ default: "" }),
  // Base URL of the web portal, used to build the emailed reset link
  // (`${WEB_APP_URL}/reset-password?...`).
  WEB_APP_URL: str({ default: "http://localhost:3000" }),

  // Standalone marketing site (apps/site) — deliberately separate from the
  // multi-tenant operational app: public content lives under one fixed
  // tenant rather than being resolved per-request. Content management itself
  // goes through the normal apps/web staff login (see site-admin.routes.ts,
  // apps/web/src/modules/site-content), not a separate credential.
  SITE_TENANT_SLUG: str({ default: "" }),

  // Government Exam Intelligence — Step 4 automated scraping. AI extraction
  // itself goes through the shared in-process AIGateway (see
  // lib/aiGateway.ts) — no separate gateway URL/key here. Optional; unset
  // means scraping no-ops with a warning rather than crashing the server
  // (same convention as SMTP/Twilio above) — the sweep job just records an
  // error on the source and moves on.
  FIRECRAWL_API_KEY: str({ default: "" }),

  // AI provider keys for @amarjit_gts/universal-ai-sdk's createAI() (see
  // lib/aiGateway.ts) — the SDK's own ai-core package already reads these
  // independently from process.env via its own env schema; declared here
  // too, read-only, purely so ai-settings.service.ts's getProviderStatus()
  // has a typed way to check presence (never returns the values). All
  // optional — unset means that provider isn't usable yet.
  OPENAI_API_KEY: str({ default: "" }),
  GROQ_API_KEY: str({ default: "" }),
  ANTHROPIC_API_KEY: str({ default: "" }),
  GOOGLE_API_KEY: str({ default: "" }),
});

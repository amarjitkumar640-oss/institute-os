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
});

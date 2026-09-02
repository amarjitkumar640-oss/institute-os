// Publishes a native APK build as a new AppRelease — the "native path" of
// the non-Play-Store update flow (see the plan for the "OTA path" instead,
// which is just `eas update`, no APK/script involved).
//
// Usage (after `eas build --profile <tenant>-preview` + `eas build:download`):
//
//   API_URL=https://api.example.com \
//   S3_ENDPOINT=... S3_ACCESS_KEY=... S3_SECRET_KEY=... S3_BUCKET=... \
//   TENANT_ID=<uuid> VERSION_NAME=1.1.0 VERSION_CODE=2 \
//   ADMIN_IDENTIFIER=<phone/email/username> ADMIN_PASSWORD=<password> \
//   CHANGELOG="Fixes X, adds Y" AUDIENCE=staff \
//   npx tsx scripts/publish-release.ts ./build.apk
//
// AUDIENCE defaults to "staff" (Admin/Teacher/Frontdesk, the only build that
// exists today) — pass AUDIENCE=student once a student build exists.
//
// Uploads the APK straight to S3/MinIO (never through the API server —
// buffering a 50-100MB file in the API's Express process is the wrong call,
// see the plan) and only then registers its metadata via POST /app-releases,
// authenticated as that tenant's own admin account (reuses existing auth
// infra, no new secrets beyond an admin login the tenant already has).

import { readFileSync } from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const apkPath = process.argv[2];
  if (!apkPath) {
    console.error("Usage: npx tsx scripts/publish-release.ts <path-to-apk>");
    process.exit(1);
  }

  const apiUrl      = requireEnv("API_URL").replace(/\/$/, "");
  const s3Endpoint  = requireEnv("S3_ENDPOINT");
  const s3AccessKey = requireEnv("S3_ACCESS_KEY");
  const s3SecretKey = requireEnv("S3_SECRET_KEY");
  const s3Bucket    = requireEnv("S3_BUCKET");
  const tenantId    = requireEnv("TENANT_ID");
  const versionName = requireEnv("VERSION_NAME");
  const versionCode = Number(requireEnv("VERSION_CODE"));
  const identifier   = requireEnv("ADMIN_IDENTIFIER");
  const password      = requireEnv("ADMIN_PASSWORD");
  const changelog    = process.env.CHANGELOG ?? undefined;
  // "staff" (Admin/Teacher/Frontdesk, the only build that exists today) or
  // "student" (future scope) — keeps staff and student builds in separate
  // release lines so the download page can offer them independently.
  const audience = process.env.AUDIENCE === "student" ? "student" : "staff";

  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    console.error("VERSION_CODE must be a positive integer");
    process.exit(1);
  }

  console.log(`Uploading ${apkPath} to S3...`);
  const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: "us-east-1",
    credentials: { accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey },
    forcePathStyle: true,
  });
  const s3Key = `releases/${tenantId}/${audience}/${versionCode}.apk`;
  await s3.send(new PutObjectCommand({
    Bucket: s3Bucket,
    Key: s3Key,
    Body: readFileSync(apkPath),
    ContentType: "application/vnd.android.package-archive",
  }));
  console.log(`Uploaded to ${s3Key}`);

  console.log("Logging in as tenant admin...");
  const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, identifier, password }),
  });
  if (!loginRes.ok) {
    console.error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
    process.exit(1);
  }
  const { accessToken } = (await loginRes.json()) as { accessToken: string };

  console.log("Registering release...");
  const releaseRes = await fetch(`${apiUrl}/api/app-releases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ tenantId, audience, versionName, versionCode, s3Key, changelog }),
  });
  if (!releaseRes.ok) {
    console.error(`Release registration failed: ${releaseRes.status} ${await releaseRes.text()}`);
    process.exit(1);
  }

  console.log(`Published ${audience} version ${versionName} (code ${versionCode}) for tenant ${tenantId}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

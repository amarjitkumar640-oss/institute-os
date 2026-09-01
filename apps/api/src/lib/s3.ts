import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function uploadPhoto(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

// The bucket is private — callers must never construct/store a plain URL.
// This mints a short-lived signed GET URL from a stored object key instead.
export async function getSignedPhotoUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: 3600 });
}

export async function deletePhoto(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

// Fetches an object's actual bytes (not a signed URL) — for server-side use
// like embedding a tenant's logo into a generated PDF, where a browser-facing
// URL is useless. Same key-shape as getSignedPhotoUrl.
export async function getPhotoBuffer(key: string): Promise<Buffer> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of obj.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// Freshly minted per request, never a stored link (same private-bucket
// reasoning as resolveLogoUrl). 30 minutes, not the 1hr photo default —
// long enough to complete a 50-100MB APK download even on slow mobile
// bandwidth (~27min worst case at 0.5 Mbps), without leaving a private
// link valid far longer than a download should ever take.
export async function getSignedApkUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: 1800 });
}

// `logoUrl` is either a plain external URL (an admin pasted a link to an
// already-public image) or an object key in our own private bucket (set via
// the logo upload flow) — the bucket doesn't support public-read objects
// (Oracle's S3-compat layer doesn't honor per-object ACLs the way AWS does),
// so a stored key must be signed into a short-lived URL on every read,
// exactly like student photos.
export async function resolveLogoUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) return logoUrl;
  return getSignedPhotoUrl(logoUrl);
}

// Every uploaded object lives under {tenantId}/{centerId}/... so objects are
// physically organized per institute and per branch, not just isolated by DB
// query filters. centerId can be null (e.g. a student before center
// assignment, or a staff member's session in all-centers mode), so a fixed
// placeholder keeps the path shape consistent rather than making the
// segment count vary.
export function s3PathPrefix(tenantId: string, centerId: string | null): string {
  return `${tenantId}/${centerId ?? "no-center"}`;
}

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

// Every uploaded object lives under {tenantId}/{centerId}/... so objects are
// physically organized per institute and per branch, not just isolated by DB
// query filters. centerId can be null (e.g. a student before center
// assignment, or a staff member's session in all-centers mode), so a fixed
// placeholder keeps the path shape consistent rather than making the
// segment count vary.
export function s3PathPrefix(tenantId: string, centerId: string | null): string {
  return `${tenantId}/${centerId ?? "no-center"}`;
}

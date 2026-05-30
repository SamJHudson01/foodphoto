import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
const bucket = process.env.CLOUDFLARE_R2_BUCKET;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/$/, "");

function requireEnv(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function getClient() {
  return new S3Client({
    region: "auto",
    endpoint: requireEnv(endpoint, "CLOUDFLARE_R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv(accessKeyId, "CLOUDFLARE_R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv(secretAccessKey, "CLOUDFLARE_R2_SECRET_ACCESS_KEY")
    }
  });
}

export function createPhotoKey(userId: string, entryId: string, extension: string) {
  return `users/${userId}/entries/${entryId}.${extension}`;
}

export function publicPhotoUrl(key: string) {
  return `${requireEnv(publicBaseUrl, "CLOUDFLARE_R2_PUBLIC_BASE_URL")}/${key}`;
}

export async function putPhotoObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: requireEnv(bucket, "CLOUDFLARE_R2_BUCKET"),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
}

export async function deletePhotoObject(key: string) {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: requireEnv(bucket, "CLOUDFLARE_R2_BUCKET"),
      Key: key
    })
  );
}

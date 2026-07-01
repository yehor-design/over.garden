import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  booleanServerEnv,
  numberServerEnv,
  requiredServerEnv,
} from "@/lib/env";

export interface CreateQuarantineUploadUrlInput {
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface QuarantineUploadUrl {
  uploadUrl: string;
  objectKey: string;
  bucket: string;
  expiresInSeconds: number;
}

let cachedR2Client: S3Client | undefined;

function r2Client() {
  cachedR2Client ??= new S3Client({
    region: "auto",
    endpoint: requiredServerEnv("R2_ENDPOINT"),
    forcePathStyle: booleanServerEnv("R2_FORCE_PATH_STYLE"),
    credentials: {
      accessKeyId: requiredServerEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredServerEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  return cachedR2Client;
}

export async function createQuarantineUploadUrl({
  objectKey,
  contentType,
  expiresInSeconds = numberServerEnv("R2_UPLOAD_URL_TTL_SECONDS", 900),
}: CreateQuarantineUploadUrlInput): Promise<QuarantineUploadUrl> {
  const bucket = requiredServerEnv("R2_QUARANTINE_BUCKET");
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
    Metadata: {
      privacy_state: "quarantine",
    },
  });

  return {
    uploadUrl: await getSignedUrl(r2Client(), command, {
      expiresIn: expiresInSeconds,
    }),
    objectKey,
    bucket,
    expiresInSeconds,
  };
}


export async function getQuarantineObjectBuffer(objectKey: string): Promise<Buffer> {
  const response = await r2Client().send(
    new GetObjectCommand({
      Bucket: requiredServerEnv("R2_QUARANTINE_BUCKET"),
      Key: objectKey,
    }),
  );

  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Quarantine object ${objectKey} has no body.`);
  return Buffer.from(bytes);
}

export async function putPublicDerivativeObject(
  objectKey: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await r2Client().send(
    new PutObjectCommand({
      Bucket: requiredServerEnv("R2_PUBLIC_BUCKET"),
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export async function deleteQuarantineObject(objectKey: string): Promise<void> {
  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: requiredServerEnv("R2_QUARANTINE_BUCKET"),
      Key: objectKey,
    }),
  );
}

export async function deletePublicDerivativeObject(
  objectKey: string,
): Promise<void> {
  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: requiredServerEnv("R2_PUBLIC_BUCKET"),
      Key: objectKey,
    }),
  );
}

export function getPublicDerivativeUrl(objectKey: string): string {
  const baseUrl = requiredServerEnv("R2_PUBLIC_BASE_URL");
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(objectKey.replace(/^\/+/, ""), normalizedBase).toString();
}

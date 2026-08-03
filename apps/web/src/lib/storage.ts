import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
  contentLength: number;
  expiresInSeconds?: number;
}

export interface QuarantineUploadUrl {
  uploadUrl: string;
  objectKey: string;
  bucket: string;
  expiresInSeconds: number;
}

export type MediaProviderObjectState =
  | "present"
  | "not_found"
  | "indeterminate_auth"
  | "indeterminate_transport"
  | "provider_error";

let cachedR2Client: S3Client | undefined;
const MEDIA_PROVIDER_REQUEST_TIMEOUT_MS = 5_000;

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
  contentLength,
  expiresInSeconds = numberServerEnv("R2_UPLOAD_URL_TTL_SECONDS", 900),
}: CreateQuarantineUploadUrlInput): Promise<QuarantineUploadUrl> {
  const bucket = requiredServerEnv("R2_QUARANTINE_BUCKET");
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
    ContentLength: contentLength,
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

export async function getQuarantineObjectBuffer(
  objectKey: string,
  maxBytes: number,
  abortSignal?: AbortSignal,
): Promise<Buffer> {
  const response = await r2Client().send(
    new GetObjectCommand({
      Bucket: requiredServerEnv("R2_QUARANTINE_BUCKET"),
      Key: objectKey,
    }),
    { abortSignal: boundedMediaProviderSignal(abortSignal) },
  );

  if ((response.ContentLength ?? 0) > maxBytes) {
    throw new Error("Quarantine object exceeds the allowed image size.");
  }

  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Quarantine object ${objectKey} has no body.`);
  if (bytes.byteLength > maxBytes) {
    throw new Error("Quarantine object exceeds the allowed image size.");
  }
  return Buffer.from(bytes);
}

/**
 * Reads a processed derivative for a server-to-server transform. Callers must
 * prove the asset's owner, readiness and original-absence state before calling
 * this helper; object keys are never exposed to the browser or an external API.
 */
export async function getPublicDerivativeObjectBuffer(
  objectKey: string,
  maxBytes: number,
  abortSignal?: AbortSignal,
): Promise<Buffer> {
  const response = await r2Client().send(
    new GetObjectCommand({
      Bucket: requiredServerEnv("R2_PUBLIC_BUCKET"),
      Key: objectKey,
    }),
    { abortSignal: boundedMediaProviderSignal(abortSignal) },
  );

  if ((response.ContentLength ?? 0) > maxBytes) {
    throw new Error("Public derivative exceeds the allowed image size.");
  }

  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error("Public derivative has no body.");
  if (bytes.byteLength > maxBytes) {
    throw new Error("Public derivative exceeds the allowed image size.");
  }
  return Buffer.from(bytes);
}

export async function putPublicDerivativeObject(
  objectKey: string,
  body: Buffer,
  contentType: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  await r2Client().send(
    new PutObjectCommand({
      Bucket: requiredServerEnv("R2_PUBLIC_BUCKET"),
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
    { abortSignal: boundedMediaProviderSignal(abortSignal) },
  );
}

function boundedMediaProviderSignal(parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

export async function copyPublicDerivativeObject(
  sourceObjectKey: string,
  destinationObjectKey: string,
): Promise<void> {
  const bucket = requiredServerEnv("R2_PUBLIC_BUCKET");
  await r2Client().send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: destinationObjectKey,
      CopySource: `${bucket}/${sourceObjectKey}`,
      CacheControl: "public, max-age=31536000, immutable",
      MetadataDirective: "REPLACE",
      ContentType: "image/png",
    }),
    { abortSignal: AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS) },
  );
}

export async function deleteQuarantineObject(
  objectKey: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: requiredServerEnv("R2_QUARANTINE_BUCKET"),
      Key: objectKey,
    }),
    {
      abortSignal:
        abortSignal ?? AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS),
    },
  );
}

export async function quarantineObjectExists(
  objectKey: string,
): Promise<boolean> {
  const state = await probeQuarantineObjectState(objectKey);
  if (state === "present") return true;
  if (state === "not_found") return false;
  throw new Error(`Quarantine provider proof was ${state}.`);
}

export async function probeQuarantineObjectState(
  objectKey: string,
  abortSignal?: AbortSignal,
): Promise<MediaProviderObjectState> {
  return probeObjectState(
    requiredServerEnv("R2_QUARANTINE_BUCKET"),
    objectKey,
    abortSignal,
  );
}

export async function probePublicDerivativeObjectState(
  objectKey: string,
  abortSignal?: AbortSignal,
): Promise<MediaProviderObjectState> {
  return probeObjectState(
    requiredServerEnv("R2_PUBLIC_BUCKET"),
    objectKey,
    abortSignal,
  );
}

export async function deletePublicDerivativeObject(
  objectKey: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: requiredServerEnv("R2_PUBLIC_BUCKET"),
      Key: objectKey,
    }),
    {
      abortSignal:
        abortSignal ?? AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS),
    },
  );
}

export function getPublicDerivativeUrl(objectKey: string): string {
  const baseUrl = requiredServerEnv("R2_PUBLIC_BASE_URL");
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(objectKey.replace(/^\/+/, ""), normalizedBase).toString();
}

async function probeObjectState(
  bucket: string,
  objectKey: string,
  abortSignal?: AbortSignal,
): Promise<MediaProviderObjectState> {
  try {
    await r2Client().send(
      new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
      {
        abortSignal:
          abortSignal ?? AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS),
      },
    );
    return "present";
  } catch (error) {
    return classifyMediaProviderError(error);
  }
}

export function classifyMediaProviderError(
  error: unknown,
): Exclude<MediaProviderObjectState, "present"> {
  const candidate = error as {
    name?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const status = candidate?.$metadata?.httpStatusCode;
  const name = candidate?.name ?? candidate?.code ?? "";
  if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
    return "not_found";
  }
  if (
    status === 401 ||
    status === 403 ||
    /^(?:AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch|ExpiredToken)$/i.test(
      name,
    )
  ) {
    return "indeterminate_auth";
  }
  if (typeof status === "number") return "provider_error";
  if (
    error instanceof TypeError ||
    /(?:timeout|timed out|abort|network|socket|connect|dns|tls|econn|enotfound)/i.test(
      error instanceof Error ? error.message : "",
    )
  ) {
    return "indeterminate_transport";
  }
  return "provider_error";
}

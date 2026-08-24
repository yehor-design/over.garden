import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { requiredServerEnv } from "@/lib/env";
import { resolveR2ForcePathStyle } from "@/lib/r2-addressing-contract";

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
    forcePathStyle: resolveR2ForcePathStyle(),
    // Keep provider-side fixture PUTs compatible with R2 without adding an
    // SDK-calculated body checksum contract that the app does not persist.
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: requiredServerEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredServerEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  return cachedR2Client;
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
      ContentType: "image/webp",
    }),
    { abortSignal: AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS) },
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

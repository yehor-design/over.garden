import { randomUUID } from "node:crypto";

import {
  createQuarantineUploadUrl,
  resolveEffectiveR2PresignTtlSeconds,
  resolveR2UploadUrlTtlConfiguration,
} from "@/lib/storage";
import { createQuarantinedMediaAsset } from "@/server/media/media-repository";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { isAllowedComposerImageSize } from "@/lib/media/image-limits";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export async function POST(request: Request) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return documentMutationAdmissionResponse(admission);
  }
  const scope = admission.scope;
  const body = (await request.json()) as {
    contentType?: string;
    sizeBytes?: number;
    journalEntryId?: string;
  };
  const contentType = body.contentType;
  const sizeBytes = body.sizeBytes;

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return Response.json(
      { error: "Unsupported image content type." },
      { status: 400 },
    );
  }

  if (typeof sizeBytes !== "number" || !isAllowedComposerImageSize(sizeBytes)) {
    return Response.json(
      { error: "Image size must be between 1 byte and 12 MB." },
      { status: 400 },
    );
  }

  if (body.journalEntryId) {
    return Response.json(
      { error: "Upload cannot bind media to an entry directly." },
      { status: 400 },
    );
  }

  const extension = contentType.split("/")[1] ?? "bin";
  const uploadGenerationId = randomUUID();
  const publicObjectId = randomUUID();
  const objectKey = `quarantine/${uploadGenerationId}.${extension}`;
  const ttlConfiguration = resolveR2UploadUrlTtlConfiguration();
  const expiresInSeconds = resolveEffectiveR2PresignTtlSeconds({
    configuration: ttlConfiguration,
    envelopeExpiresAtSeconds: admission.envelopeExpiresAtSeconds,
    nowSeconds: Math.floor(Date.now() / 1_000),
  });
  const mediaAsset = await createQuarantinedMediaAsset(scope, {
    quarantineKey: objectKey,
    declaredMediaType: contentType,
    declaredSizeBytes: sizeBytes,
    uploadGenerationId,
    publicObjectId,
  });
  const upload = await createQuarantineUploadUrl({
    objectKey,
    contentType,
    contentLength: sizeBytes,
    expiresInSeconds,
  });

  return Response.json({
    mediaAssetId: mediaAsset.id,
    uploadUrl: upload.uploadUrl,
    expiresInSeconds: upload.expiresInSeconds,
    uploadUrlTtlSource: ttlConfiguration.source,
    uploadUrlTtlConfiguredSeconds: ttlConfiguration.effectiveSeconds,
  });
}

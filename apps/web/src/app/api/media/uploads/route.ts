import { randomUUID } from "node:crypto";

import {
  createQuarantineUploadUrl,
  resolveEffectiveR2PresignTtlSeconds,
  resolveR2UploadUrlTtlConfiguration,
} from "@/lib/storage";
import {
  createQuarantinedMediaAsset,
  findMediaAssetByUploadGeneration,
} from "@/server/media/media-repository";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { isAllowedComposerImageSize } from "@/lib/media/image-limits";
import {
  hasCurrentOnlineJournalProtocol,
  legacyClientRetiredResponse,
} from "@/lib/garden/entry-contracts";
import type { RequestScope } from "@/server/request-scope";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return privateNoStore(documentMutationAdmissionResponse(admission));
  }
  if (!hasCurrentOnlineJournalProtocol(request)) {
    return privateNoStore(legacyClientRetiredResponse());
  }
  try {
    return privateNoStore(
      await createMediaUpload(
        request,
        admission.scope,
        admission.envelopeExpiresAtSeconds,
      ),
    );
  } catch {
    return privateNoStore(
      Response.json({ code: "media_upload_unavailable" }, { status: 503 }),
    );
  }
}

async function createMediaUpload(
  request: Request,
  scope: RequestScope,
  envelopeExpiresAtSeconds: number,
) {
  const body = (await request.json()) as {
    contentType?: string;
    sizeBytes?: number;
    journalEntryId?: string;
    uploadGenerationId?: string;
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

  if (
    body.uploadGenerationId !== undefined &&
    !UUID.test(body.uploadGenerationId)
  ) {
    return Response.json(
      { code: "media_upload_generation_invalid" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const extension = contentType.split("/")[1] ?? "bin";
  const uploadGenerationId = body.uploadGenerationId ?? randomUUID();
  const publicObjectId = randomUUID();
  const objectKey = `quarantine/${uploadGenerationId}.${extension}`;
  const ttlConfiguration = resolveR2UploadUrlTtlConfiguration();
  const expiresInSeconds = resolveEffectiveR2PresignTtlSeconds({
    configuration: ttlConfiguration,
    envelopeExpiresAtSeconds,
    nowSeconds: Math.floor(Date.now() / 1_000),
  });
  let mediaAsset = await findMediaAssetByUploadGeneration(
    scope,
    uploadGenerationId,
  );
  if (!mediaAsset) {
    try {
      mediaAsset = await createQuarantinedMediaAsset(scope, {
        quarantineKey: objectKey,
        declaredMediaType: contentType,
        declaredSizeBytes: sizeBytes,
        uploadGenerationId,
        publicObjectId,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent identical retry can win the unique generation insert.
      mediaAsset = await findMediaAssetByUploadGeneration(
        scope,
        uploadGenerationId,
      );
      if (!mediaAsset) {
        return Response.json(
          { code: "media_upload_generation_unavailable" },
          {
            status: 409,
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      }
    }
  }
  if (
    mediaAsset.declared_media_type !== contentType ||
    Number(mediaAsset.declared_size_bytes) !== sizeBytes
  ) {
    return Response.json(
      { code: "media_upload_generation_conflict" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const uploadRequired = mediaAsset.media_readiness_state === "quarantined";
  if (!uploadRequired) {
    return Response.json(
      { mediaAssetId: mediaAsset.id, uploadRequired: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const upload = await createQuarantineUploadUrl({
    objectKey: mediaAsset.quarantine_key,
    contentType,
    contentLength: sizeBytes,
    expiresInSeconds,
  });

  return Response.json({
    mediaAssetId: mediaAsset.id,
    uploadRequired: true,
    uploadUrl: upload.uploadUrl,
    expiresInSeconds: upload.expiresInSeconds,
    uploadUrlTtlSource: ttlConfiguration.source,
    uploadUrlTtlConfiguredSeconds: ttlConfiguration.effectiveSeconds,
  });
}

function privateNoStore(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

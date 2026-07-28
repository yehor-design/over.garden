import { randomUUID } from "node:crypto";

import { createQuarantineUploadUrl } from "@/lib/storage";
import { AuthenticationRequiredError } from "@/server/auth-session";
import { authIntentRequiredResponse } from "@/server/auth-intent-http";
import { createQuarantinedMediaAsset } from "@/server/media/media-repository";
import {
  PilotWriteAccessError,
  requireWriteEligibleRequestScope,
} from "@/server/pilot-write-access";
import { isAllowedComposerImageSize } from "@/lib/media/image-limits";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export async function POST(request: Request) {
  let scope: Awaited<ReturnType<typeof requireWriteEligibleRequestScope>>;
  try {
    scope = await requireWriteEligibleRequestScope();
  } catch (error) {
    if (error instanceof PilotWriteAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    return authIntentRequiredResponse(request, {
      action: "save",
      fallbackReturnTo: "/garden",
      message: "Sign in to continue this photo save.",
    });
  }
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
  });

  return Response.json({
    mediaAssetId: mediaAsset.id,
    uploadUrl: upload.uploadUrl,
    expiresInSeconds: upload.expiresInSeconds,
  });
}

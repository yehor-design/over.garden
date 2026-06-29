import { randomUUID } from "node:crypto";

import { createQuarantineUploadUrl } from "@/lib/storage";
import { requireCurrentUserId } from "@/server/auth-session";
import { createQuarantinedMediaAsset } from "@/server/media/media-repository";
import { scopedToUser } from "@/server/request-scope";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: Request) {
  const userId = await requireCurrentUserId();
  const scope = scopedToUser(userId);
  const body = (await request.json()) as {
    contentType?: string;
    journalEntryId?: string;
  };
  const contentType = body.contentType;

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return Response.json(
      { error: "Unsupported image content type." },
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
  const objectKey = `quarantine/${userId}/${randomUUID()}.${extension}`;
  const mediaAsset = await createQuarantinedMediaAsset(scope, objectKey);
  const upload = await createQuarantineUploadUrl({ objectKey, contentType });

  return Response.json({
    mediaAssetId: mediaAsset.id,
    ...upload,
  });
}

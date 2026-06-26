import { requireCurrentUserId } from "@/server/auth-session";
import {
  getMediaAssetForOwner,
  markMediaAssetProcessed,
} from "@/server/media/media-repository";
import { processQuarantinedImage } from "@/server/media/processor";
import { scopedToUser } from "@/server/request-scope";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await requireCurrentUserId();
  const scope = scopedToUser(userId);
  const body = (await request.json()) as { mediaAssetId?: string };

  if (!body.mediaAssetId) {
    return Response.json({ error: "mediaAssetId is required." }, { status: 400 });
  }

  const asset = await getMediaAssetForOwner(scope, body.mediaAssetId);
  const derivative = await processQuarantinedImage(asset);
  const updated = await markMediaAssetProcessed(
    scope,
    asset.id,
    derivative.derivativeKey,
  );

  return Response.json({ mediaAsset: updated, ...derivative });
}

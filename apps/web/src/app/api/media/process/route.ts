import {
  AuthenticationRequiredError,
  requireCurrentUserId,
} from "@/server/auth-session";
import { authIntentRequiredResponse } from "@/server/auth-intent-http";
import {
  getMediaAssetForOwner,
  markMediaAssetFailed,
  markMediaAssetProcessed,
} from "@/server/media/media-repository";
import { processQuarantinedImage } from "@/server/media/processor";
import { scopedToUser } from "@/server/request-scope";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireCurrentUserId();
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    return authIntentRequiredResponse(request, {
      action: "save",
      fallbackReturnTo: "/garden",
      message: "Sign in to continue this photo save.",
    });
  }
  const scope = scopedToUser(userId);
  const body = (await request.json()) as { mediaAssetId?: string };

  if (!body.mediaAssetId) {
    return Response.json(
      { error: "mediaAssetId is required." },
      { status: 400 },
    );
  }

  const asset = await getMediaAssetForOwner(scope, body.mediaAssetId);

  try {
    const derivative = await processQuarantinedImage(asset);
    const updated = await markMediaAssetProcessed(
      scope,
      asset.id,
      derivative.derivativeKey,
    );

    return Response.json({
      mediaAsset: {
        id: updated.id,
        status: updated.status,
        derivative_key: updated.derivative_key,
      },
      ...derivative,
    });
  } catch {
    await markMediaAssetFailed(scope, asset.id);
    return Response.json(
      {
        error:
          "Image processing failed. Upload another photo or save without it.",
      },
      { status: 500 },
    );
  }
}

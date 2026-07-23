import { AuthenticationRequiredError } from "@/server/auth-session";
import { authIntentRequiredResponse } from "@/server/auth-intent-http";
import { deleteQuarantineObject, getPublicDerivativeUrl } from "@/lib/storage";
import {
  getMediaAssetForOwner,
  markMediaAssetFailed,
  markMediaAssetOriginalDeleted,
  markMediaAssetProcessed,
} from "@/server/media/media-repository";
import {
  MediaLaunchQualityError,
  processQuarantinedImage,
} from "@/server/media/processor";
import {
  PilotWriteAccessError,
  requireWriteEligibleRequestScope,
} from "@/server/pilot-write-access";

export const runtime = "nodejs";

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
  const body = (await request.json()) as { mediaAssetId?: string };

  if (!body.mediaAssetId) {
    return Response.json(
      { error: "mediaAssetId is required." },
      { status: 400 },
    );
  }

  const asset = await getMediaAssetForOwner(scope, body.mediaAssetId);
  let processedStateIsDurable =
    asset.status === "processed" && Boolean(asset.derivative_key);

  try {
    let derivativeKey = asset.derivative_key;
    let publicUrl = derivativeKey
      ? getPublicDerivativeUrl(derivativeKey)
      : null;
    let updated = asset;
    let intrinsicWidth = asset.intrinsic_width;
    let intrinsicHeight = asset.intrinsic_height;
    let focalX = Number(asset.focal_x ?? 0.5);
    let focalY = Number(asset.focal_y ?? 0.5);

    if (!processedStateIsDurable) {
      const derivative = await processQuarantinedImage(asset);
      derivativeKey = derivative.derivativeKey;
      publicUrl = derivative.publicUrl;
      intrinsicWidth = derivative.intrinsicWidth;
      intrinsicHeight = derivative.intrinsicHeight;
      updated = await markMediaAssetProcessed(
        scope,
        asset.id,
        derivative.derivativeKey,
        {
          intrinsicWidth: derivative.intrinsicWidth,
          intrinsicHeight: derivative.intrinsicHeight,
        },
      );
      focalX = Number(updated.focal_x ?? 0.5);
      focalY = Number(updated.focal_y ?? 0.5);
      processedStateIsDurable = true;
    }

    if (!derivativeKey || !publicUrl) {
      throw new Error("Processed media is missing its derivative.");
    }

    if (!updated.original_deleted_at) {
      await deleteQuarantineObject(asset.quarantine_key);
      updated = await markMediaAssetOriginalDeleted(scope, asset.id);
    }

    return Response.json({
      mediaAsset: {
        id: updated.id,
        status: updated.status,
        derivative_key: updated.derivative_key,
        intrinsicWidth,
        intrinsicHeight,
        focalX,
        focalY,
      },
      derivativeKey,
      publicUrl,
    });
  } catch (error) {
    if (!processedStateIsDurable) {
      await markMediaAssetFailed(scope, asset.id);
    }
    if (error instanceof MediaLaunchQualityError) {
      return Response.json({ error: error.message, code: error.code }, { status: 422 });
    }
    return Response.json(
      {
        error:
          "Image processing failed. Upload another photo or save without it.",
      },
      { status: 500 },
    );
  }
}

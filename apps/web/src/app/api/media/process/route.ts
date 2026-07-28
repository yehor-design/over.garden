import { AuthenticationRequiredError } from "@/server/auth-session";
import { authIntentRequiredResponse } from "@/server/auth-intent-http";
import { getPublicDerivativeUrl } from "@/lib/storage";
import {
  claimMediaAssetForProcessing,
  findMediaAssetForOwner,
  markClaimedMediaDerivativeWritten,
  releaseMediaProcessingClaim,
  settleClaimedMediaPublicReady,
} from "@/server/media/media-repository";
import {
  MediaLaunchQualityError,
  processQuarantinedImage,
} from "@/server/media/processor";
import {
  SAFE_MEDIA_PROCESSING_TIMEOUT_MS,
  SafeMediaAdmissionError,
} from "@/server/media/safe-media-admission";
import { revokeMediaObjectBytes } from "@/server/media/lifecycle-revoke";
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

  const asset = await findMediaAssetForOwner(scope, body.mediaAssetId);
  if (!asset) {
    return Response.json(
      { error: "Media asset is unavailable." },
      { status: 404 },
    );
  }
  if (
    asset.status === "processed" &&
    asset.media_readiness_state === "public_ready" &&
    asset.derivative_key &&
    asset.original_deleted_at &&
    asset.public_object_id &&
    !asset.revoked_at
  ) {
    return Response.json({
      mediaAsset: { id: asset.id, status: asset.status },
      publicUrl: getPublicDerivativeUrl(asset.derivative_key),
    });
  }
  const claim = await claimMediaAssetForProcessing(scope, asset.id);
  if (!claim) {
    return Response.json(
      { error: "Image processing is already in progress." },
      { status: 409 },
    );
  }

  try {
    let derivativeKey = claim.asset.derivative_key;
    if (claim.phase === "process_original") {
      const derivative = await withProcessingDeadline((abortSignal) =>
        processQuarantinedImage(claim.asset, abortSignal),
      );
      derivativeKey = derivative.derivativeKey;
      const written = await markClaimedMediaDerivativeWritten(
        scope,
        claim,
        derivative,
      );
      if (!written) {
        const staleCleanup = await revokeMediaObjectBytes({
          bucket: "public_derivative",
          objectKey: derivative.derivativeKey,
        });
        if (staleCleanup.outcome !== "confirmed_gone") {
          throw new Error("Superseded derivative cleanup was indeterminate.");
        }
        throw new Error("Media processing claim was superseded.");
      }
    }
    if (!derivativeKey) {
      throw new Error("Recoverable media claim has no derivative.");
    }

    const proof = await revokeMediaObjectBytes({
      bucket: "quarantine",
      objectKey: claim.asset.quarantine_key,
    });
    if (proof.outcome !== "confirmed_gone") {
      throw new Error("Original absence is not authoritative.");
    }
    const updated = await settleClaimedMediaPublicReady(scope, claim);
    if (!updated?.derivative_key)
      throw new Error("Media processing claim was superseded.");

    return Response.json({
      mediaAsset: {
        id: updated.id,
        status: updated.status,
        intrinsicWidth: updated.intrinsic_width,
        intrinsicHeight: updated.intrinsic_height,
        focalX: Number(updated.focal_x ?? 0.5),
        focalY: Number(updated.focal_y ?? 0.5),
      },
      publicUrl: getPublicDerivativeUrl(updated.derivative_key),
    });
  } catch (error) {
    const terminal =
      error instanceof SafeMediaAdmissionError ||
      (error instanceof MediaLaunchQualityError &&
        error.qualityClass === "reject");
    await releaseMediaProcessingClaim(scope, claim, terminal);
    if (error instanceof MediaLaunchQualityError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 422 },
      );
    }
    if (error instanceof SafeMediaAdmissionError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 422 },
      );
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

async function withProcessingDeadline<T>(
  operation: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort(new Error("Media processing deadline exceeded."));
          reject(new Error("Media processing deadline exceeded."));
        }, SAFE_MEDIA_PROCESSING_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

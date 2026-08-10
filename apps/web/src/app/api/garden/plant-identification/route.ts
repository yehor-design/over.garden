import { getPublicDerivativeObjectBuffer } from "@/lib/storage";
import { authIntentRequiredResponse } from "@/server/auth-intent-http";
import { findExactSelectableSpeciesByScientificName } from "@/server/catalog-repository";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { getPlantObjectPage } from "@/server/journal-repository";
import { findMediaAssetForOwner } from "@/server/media/media-repository";
import {
  buildPlantNetFingerprint,
  identifyPlantSpecies,
  isPlantNetSpeciesIdentificationEnabled,
  PlantNetAdapterError,
  PLANTNET_MAX_IMAGES,
  PLANTNET_ORGANS,
  PLANTNET_POLICY_VERSION,
  reencodePlantNetImage,
  type PlantNetOrgan,
} from "@/server/plantnet-species-adapter";
import {
  claimPlantIdentificationSubmission,
  createOrReadPlantIdentificationRequest,
  readPlantIdentificationReceipt,
  settlePlantIdentificationCandidates,
  settlePlantIdentificationFailure,
  type IdentificationCandidateInput,
  type PlantIdentificationErrorClass,
} from "@/server/plant-identification-repository";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    if (admission.transportResult !== "AUTHENTICATION_REQUIRED") {
      return documentMutationAdmissionResponse(admission);
    }
    return authIntentRequiredResponse(request, {
      action: "save",
      fallbackReturnTo: "/garden",
      message: "Sign in to identify this plant photo.",
    });
  }
  const scope = admission.scope;

  const input = parseIdentificationInput(
    await request.json().catch(() => null),
  );
  if (!input) return Response.json({ state: "invalid_media" }, { status: 400 });
  if (!isPlantNetSpeciesIdentificationEnabled()) {
    return Response.json(
      { state: "provider_unavailable", candidates: [] },
      { status: 503 },
    );
  }

  const objectPage = await getPlantObjectPage(scope, input.plantObjectId);
  if (
    !objectPage ||
    objectPage.plantObject.object_kind !== "plant" ||
    !["unknown", "user_added"].includes(objectPage.plantObject.variety_state)
  ) {
    return Response.json({ state: "invalid_media" }, { status: 422 });
  }
  const galleryAssetIds = new Set(
    objectPage.gallery_media.map((asset) => asset.id),
  );
  if (!input.mediaAssetIds.every((id) => galleryAssetIds.has(id))) {
    return Response.json({ state: "invalid_media" }, { status: 422 });
  }

  const resolvedAssets = await Promise.all(
    input.mediaAssetIds.map(async (mediaAssetId) => {
      const asset = await findMediaAssetForOwner(scope, mediaAssetId);
      if (
        !asset ||
        asset.status !== "processed" ||
        asset.media_readiness_state !== "public_ready" ||
        !asset.original_deleted_at ||
        !asset.derivative_key ||
        asset.revoked_at
      ) {
        return null;
      }
      const derivative = await getPublicDerivativeObjectBuffer(
        asset.derivative_key,
        12 * 1024 * 1024,
      );
      const safeImage = await reencodePlantNetImage(derivative);
      return { mediaAssetId: asset.id, safeImage };
    }),
  );
  if (resolvedAssets.some((asset) => asset === null)) {
    return Response.json({ state: "invalid_media" }, { status: 422 });
  }
  const assets = resolvedAssets as Array<{
    mediaAssetId: string;
    safeImage: Awaited<ReturnType<typeof reencodePlantNetImage>>;
  }>;
  const fingerprint = buildPlantNetFingerprint({
    ownerUserId: scope.userId,
    images: assets.map((asset, index) => ({
      derivativeSha256: asset.safeImage.sha256,
      organ: input.organs[index]!,
    })),
  });
  const identified = await createOrReadPlantIdentificationRequest(scope, {
    plantObjectId: input.plantObjectId,
    fingerprint,
    mediaManifest: assets.map((asset) => ({
      mediaAssetId: asset.mediaAssetId,
      derivativeSha256: asset.safeImage.sha256,
    })),
    organs: input.organs,
    policyVersion: PLANTNET_POLICY_VERSION,
  });
  const claim = await claimPlantIdentificationSubmission(scope, identified.id);
  if (!claim) {
    const receipt = await readPlantIdentificationReceipt(scope, identified.id);
    return Response.json(
      receipt ?? { state: "provider_unavailable", candidates: [] },
    );
  }

  try {
    const provider = await identifyPlantSpecies(
      assets.map((asset, index) => ({
        bytes: asset.safeImage.bytes,
        organ: input.organs[index]!,
      })),
    );
    const candidates: IdentificationCandidateInput[] = await Promise.all(
      provider.candidates.map(async (candidate) => {
        const mapping = await findExactSelectableSpeciesByScientificName(
          candidate.scientificName,
        );
        return {
          ...candidate,
          mappingStatus: mapping.status,
          catalogItemId: mapping.status === "mapped" ? mapping.item.id : null,
        };
      }),
    );
    await settlePlantIdentificationCandidates(scope, {
      requestId: identified.id,
      claimToken: claim.claimToken,
      durationMs: provider.durationMs,
      quotaRemaining: provider.quotaRemaining,
      modelVersion: provider.modelVersion,
      candidates,
    });
  } catch (error) {
    const errorClass: PlantIdentificationErrorClass =
      error instanceof PlantNetAdapterError
        ? error.code
        : "provider_unavailable";
    await settlePlantIdentificationFailure(scope, {
      requestId: identified.id,
      claimToken: claim.claimToken,
      errorClass,
    });
  }

  const receipt = await readPlantIdentificationReceipt(scope, identified.id);
  return Response.json(
    receipt ?? { state: "provider_unavailable", candidates: [] },
  );
}

function parseIdentificationInput(value: unknown): {
  plantObjectId: string;
  mediaAssetIds: string[];
  organs: PlantNetOrgan[];
} | null {
  if (!isRecord(value)) return null;
  const mediaAssetIds = value.mediaAssetIds;
  const organs = value.organs;
  if (!Array.isArray(mediaAssetIds) || !Array.isArray(organs)) return null;
  if (
    mediaAssetIds.length < 1 ||
    mediaAssetIds.length > PLANTNET_MAX_IMAGES ||
    organs.length !== mediaAssetIds.length ||
    new Set(mediaAssetIds).size !== mediaAssetIds.length ||
    !mediaAssetIds.every(
      (id) => typeof id === "string" && UUID_PATTERN.test(id),
    ) ||
    !organs.every(
      (organ) =>
        typeof organ === "string" &&
        PLANTNET_ORGANS.includes(organ as PlantNetOrgan),
    )
  ) {
    return null;
  }
  const target = value.plantObjectId;
  if (typeof target !== "string" || !UUID_PATTERN.test(target)) {
    return null;
  }
  return {
    plantObjectId: target,
    mediaAssetIds: mediaAssetIds as string[],
    organs: organs as PlantNetOrgan[],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

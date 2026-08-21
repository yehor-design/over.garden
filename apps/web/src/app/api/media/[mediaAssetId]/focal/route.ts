import { revalidatePath } from "next/cache";

import {
  findMediaAssetForOwner,
  updateMediaAssetFocalForOwner,
} from "@/server/media/media-repository";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { convergePublicProjectionsNow } from "@/server/search/public-projection-outbox";
import { resolveMediaFocalPoint } from "@/lib/media/presentation-contract";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ mediaAssetId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return documentMutationAdmissionResponse(admission);
  }
  const scope = admission.scope;

  const { mediaAssetId } = await context.params;
  if (!mediaAssetId) {
    return Response.json(
      { error: "mediaAssetId is required." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    focalX?: unknown;
    focalY?: unknown;
    expectedRevision?: unknown;
  };

  const rawX = typeof body.focalX === "number" ? body.focalX : Number.NaN;
  const rawY = typeof body.focalY === "number" ? body.focalY : Number.NaN;
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return Response.json(
      { error: "Focal coordinates must be finite numbers." },
      { status: 400 },
    );
  }

  const focalResolution = resolveMediaFocalPoint({ x: rawX, y: rawY });
  const focal = focalResolution.focal;
  if (focalResolution.serveClass === "clamped") {
    const asset = await findMediaAssetForOwner(scope, mediaAssetId);
    if (!asset) {
      return Response.json(
        { error: "Media asset not found." },
        { status: 404 },
      );
    }
    return Response.json({
      mediaAsset: {
        id: asset.id,
        focalX: focal.x,
        focalY: focal.y,
        intrinsicWidth: asset.intrinsic_width,
        intrinsicHeight: asset.intrinsic_height,
      },
      journalRevision: null,
      canonicalMutation: "none",
      serveClass: focalResolution.serveClass,
    });
  }

  const expectedRevision =
    typeof body.expectedRevision === "number"
      ? body.expectedRevision
      : body.expectedRevision == null
        ? null
        : Number(body.expectedRevision);

  try {
    const result = await updateMediaAssetFocalForOwner(scope, {
      mediaAssetId,
      focalX: focal.x,
      focalY: focal.y,
      expectedRevision,
    });

    revalidatePath("/garden");
    if (result.publicSlug) {
      revalidatePath(`/journal/${result.publicSlug}`);
      for (const locale of ["uk", "bg", "ru"] as const) {
        revalidatePath(`/${locale}/journal/${result.publicSlug}`);
      }
    }
    revalidatePath("/feed");
    revalidatePath("/journals");

    if (
      result.journalEntryId &&
      result.visibility === "public" &&
      result.journalRevision != null
    ) {
      // OVE-242: the intent is already durable from the focal transaction;
      // this only converges it now.
      await convergePublicProjectionsNow([result.journalEntryId]).catch(
        () => undefined,
      );
    }

    return Response.json({
      mediaAsset: {
        id: result.asset.id,
        focalX: Number(result.asset.focal_x),
        focalY: Number(result.asset.focal_y),
        intrinsicWidth: result.asset.intrinsic_width,
        intrinsicHeight: result.asset.intrinsic_height,
      },
      journalRevision: result.journalRevision,
      canonicalMutation: "updated",
      serveClass: focalResolution.serveClass,
    });
  } catch (error) {
    const statusCode =
      error instanceof Error &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 400;
    const message =
      error instanceof Error ? error.message : "Could not save focal point.";
    return Response.json({ error: message }, { status: statusCode });
  }
}

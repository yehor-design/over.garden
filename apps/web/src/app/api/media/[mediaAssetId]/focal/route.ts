import { AuthenticationRequiredError } from "@/server/auth-session";
import { authIntentRequiredResponse } from "@/server/auth-intent-http";
import { revalidatePath } from "next/cache";

import { updateMediaAssetFocalForOwner } from "@/server/media/media-repository";
import {
  PilotWriteAccessError,
  requireWriteEligibleRequestScope,
} from "@/server/pilot-write-access";
import { enqueueJournalEntryIndexJob } from "@/server/search/public-journal-parity";
import { normalizeFocalPoint } from "@/lib/media/presentation-contract";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ mediaAssetId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
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
      message: "Sign in to adjust this photo.",
    });
  }

  const { mediaAssetId } = await context.params;
  if (!mediaAssetId) {
    return Response.json({ error: "mediaAssetId is required." }, { status: 400 });
  }

  const body = (await request.json()) as {
    focalX?: unknown;
    focalY?: unknown;
    expectedRevision?: unknown;
  };

  const rawX = typeof body.focalX === "number" ? body.focalX : Number.NaN;
  const rawY = typeof body.focalY === "number" ? body.focalY : Number.NaN;
  if (
    !Number.isFinite(rawX) ||
    !Number.isFinite(rawY) ||
    rawX < 0 ||
    rawX > 1 ||
    rawY < 0 ||
    rawY > 1
  ) {
    return Response.json(
      { error: "Focal coordinates must be between 0 and 1." },
      { status: 400 },
    );
  }

  const focal = normalizeFocalPoint({ x: rawX, y: rawY });
  // Reject if normalize fail-closed because client sent invalid that somehow passed range
  // (normalize only fails closed outside range / non-finite — already gated above).

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
      await enqueueJournalEntryIndexJob({
        journalEntryId: result.journalEntryId,
        userId: scope.userId,
        idempotencyKey: `journal_entry_index:${result.journalEntryId}:${result.journalRevision}:focal`,
      });
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

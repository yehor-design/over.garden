import { revalidatePath } from "next/cache";

import {
  InvalidOwnedPhotoPayload,
  parseOwnedPhotoPayload,
} from "@/lib/garden/owned-photo";
import {
  gardenSpacePath,
  gardenSpaceSettingsPath,
  isSpaceId,
} from "@/lib/garden/space-page";
import {
  BoundedJsonInvalidError,
  BoundedJsonPayloadTooLargeError,
  readBoundedJsonRequest,
} from "@/server/bounded-json-request";
import {
  claimOwnedPhoto,
  finalizeOwnedPhoto,
} from "@/server/media/owned-photo-handoff";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { changeSpacePhoto } from "@/server/space-page-repository";
import { settleSection } from "@/server/workspace-failure";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const MAX_BYTES = 16 * 1024;

type SpacePhotoResponse =
  | { status: "saved" }
  | { status: "missing" }
  | { status: "photo_unavailable" }
  | { status: "unavailable"; digest: string };

function reply(body: SpacePhotoResponse, status: number) {
  return Response.json(body, { status, headers });
}

/**
 * Give a space its photo or replace it (`PUT`), or take it away (`DELETE`),
 * from the space's settings (ADR-0036 D1, DESIGN.md §5.25). The photo was
 * cropped and encoded in the browser and staged; it is claimed here under the
 * space's id and written in one transaction with the old photo's files queued
 * for revocation.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params;
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    const response = mutationScopeResponse(admission);
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
  if (!isSpaceId(spaceId)) return reply({ status: "missing" }, 404);

  let photo: ReturnType<typeof parseOwnedPhotoPayload>;
  try {
    const body = await readBoundedJsonRequest(request, MAX_BYTES);
    photo = parseOwnedPhotoPayload(
      body && typeof body === "object" ? (body as Record<string, unknown>).photo : undefined,
    );
  } catch (error) {
    if (error instanceof BoundedJsonPayloadTooLargeError) {
      return Response.json({ error: "too_large" }, { status: 413, headers });
    }
    if (error instanceof InvalidOwnedPhotoPayload || error instanceof BoundedJsonInvalidError) {
      return Response.json({ error: "invalid_request" }, { status: 400, headers });
    }
    throw error;
  }
  if (!photo) return Response.json({ error: "invalid_request" }, { status: 400, headers });

  let claimed: Awaited<ReturnType<typeof claimOwnedPhoto>>;
  try {
    claimed = await claimOwnedPhoto({
      ownerUserId: admission.scope.userId,
      publishId: spaceId.toLowerCase(),
      photo,
    });
  } catch {
    return reply({ status: "photo_unavailable" }, 409);
  }
  const result = await settleSection(
    () => changeSpacePhoto(admission.scope, { spaceId, photo: claimed }),
    { deadlineMs: 6000, surface: "space-settings", section: "photo" },
  );
  if (result.status !== "ready") {
    return reply({ status: "unavailable", digest: result.digest }, 503);
  }
  if (result.value.status === "missing") return reply({ status: "missing" }, 404);
  await finalizeOwnedPhoto({
    ownerUserId: admission.scope.userId,
    publishId: spaceId.toLowerCase(),
    stagingSessionId: claimed.stagingSessionId,
    receiptSetDigest: claimed.receiptSetDigest,
  });
  revalidateSpace(spaceId);
  return reply({ status: "saved" }, 200);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params;
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    const response = mutationScopeResponse(admission);
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
  if (!isSpaceId(spaceId)) return reply({ status: "missing" }, 404);
  const result = await settleSection(
    () => changeSpacePhoto(admission.scope, { spaceId, photo: null }),
    { deadlineMs: 4500, surface: "space-settings", section: "photo" },
  );
  if (result.status !== "ready") {
    return reply({ status: "unavailable", digest: result.digest }, 503);
  }
  if (result.value.status === "missing") return reply({ status: "missing" }, 404);
  revalidateSpace(spaceId);
  return reply({ status: "saved" }, 200);
}

function revalidateSpace(spaceId: string) {
  revalidatePath("/garden");
  revalidatePath(gardenSpacePath(spaceId));
  revalidatePath(gardenSpaceSettingsPath(spaceId));
}

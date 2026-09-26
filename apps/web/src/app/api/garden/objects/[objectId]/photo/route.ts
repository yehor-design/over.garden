import { revalidatePath } from "next/cache";

import {
  InvalidOwnedPhotoPayload,
  parseOwnedPhotoPayload,
} from "@/lib/garden/owned-photo";
import { isObjectSetupUuid } from "@/lib/garden/object-setup";
import { publicCacheTag } from "@/lib/public-cache-tags";
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
import { changeObjectPhoto } from "@/server/object-photo-repository";
import { revalidatePublicCacheTags } from "@/server/public-cache-revalidation";
import { settleSection } from "@/server/workspace-failure";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const MAX_BYTES = 16 * 1024;

type ObjectPhotoResponse =
  | { status: "saved" }
  | { status: "missing" }
  | { status: "photo_unavailable" }
  | { status: "unavailable"; digest: string };

function reply(body: ObjectPhotoResponse, status: number) {
  return Response.json(body, { status, headers });
}

/**
 * Give a plant or an animal its photo or replace it (`PUT`), or take it away
 * (`DELETE`), from the object's settings (OVE-524, ADR-0036 D1). The photo was
 * cropped and encoded in the browser and staged; it is claimed here under the
 * object's id and written in one transaction with the old photo's files
 * queued for revocation. It is the passport's cover at once.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await context.params;
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    const response = mutationScopeResponse(admission);
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
  if (!isObjectSetupUuid(objectId)) return reply({ status: "missing" }, 404);
  const id = objectId.toLowerCase();

  let photo: ReturnType<typeof parseOwnedPhotoPayload>;
  try {
    const body = await readBoundedJsonRequest(request, MAX_BYTES);
    photo = parseOwnedPhotoPayload(
      body && typeof body === "object"
        ? (body as Record<string, unknown>).photo
        : undefined,
    );
  } catch (error) {
    if (error instanceof BoundedJsonPayloadTooLargeError) {
      return Response.json({ error: "too_large" }, { status: 413, headers });
    }
    if (
      error instanceof InvalidOwnedPhotoPayload ||
      error instanceof BoundedJsonInvalidError
    ) {
      return Response.json(
        { error: "invalid_request" },
        { status: 400, headers },
      );
    }
    throw error;
  }
  if (!photo) {
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers },
    );
  }

  let claimed: Awaited<ReturnType<typeof claimOwnedPhoto>>;
  try {
    claimed = await claimOwnedPhoto({
      ownerUserId: admission.scope.userId,
      publishId: id,
      photo,
    });
  } catch {
    return reply({ status: "photo_unavailable" }, 409);
  }
  const result = await settleSection(
    () => changeObjectPhoto(admission.scope, { objectId: id, photo: claimed }),
    { deadlineMs: 6000, surface: "object-settings", section: "photo" },
  );
  if (result.status !== "ready") {
    return reply({ status: "unavailable", digest: result.digest }, 503);
  }
  if (result.value.status === "missing")
    return reply({ status: "missing" }, 404);
  await finalizeOwnedPhoto({
    ownerUserId: admission.scope.userId,
    publishId: id,
    stagingSessionId: claimed.stagingSessionId,
    receiptSetDigest: claimed.receiptSetDigest,
  });
  revalidateObject(id);
  return reply({ status: "saved" }, 200);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await context.params;
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    const response = mutationScopeResponse(admission);
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
  if (!isObjectSetupUuid(objectId)) return reply({ status: "missing" }, 404);
  const id = objectId.toLowerCase();
  const result = await settleSection(
    () => changeObjectPhoto(admission.scope, { objectId: id, photo: null }),
    { deadlineMs: 4500, surface: "object-settings", section: "photo" },
  );
  if (result.status !== "ready") {
    return reply({ status: "unavailable", digest: result.digest }, 503);
  }
  if (result.value.status === "missing")
    return reply({ status: "missing" }, 404);
  revalidateObject(id);
  return reply({ status: "saved" }, 200);
}

/** The owner's pages and, when it is public, the passport the photo covers. */
function revalidateObject(objectId: string) {
  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${objectId}`, "layout");
  revalidatePublicCacheTags([publicCacheTag.object(objectId)], "expire");
}

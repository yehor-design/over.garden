import {
  InvalidObjectSetupRequest,
  parseObjectSetupRequest,
  type ObjectSetupResponse,
} from "@/lib/garden/object-setup";
import {
  BoundedJsonInvalidError,
  BoundedJsonPayloadTooLargeError,
  readBoundedJsonRequest,
} from "@/server/bounded-json-request";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  claimOwnedPhoto,
  finalizeOwnedPhoto,
  type ClaimedOwnedPhoto,
} from "@/server/media/owned-photo-handoff";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import {
  createOwnedObject,
  findOwnedObjectByName,
  isObjectIdentitySelectable,
  readOwnedObjectForReplay,
} from "@/server/object-setup-repository";
import { settleSection } from "@/server/workspace-failure";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
// A name, the two choices, and one photo's staging receipts (up to three
// signed tokens) with its 16 px placeholder.
const MAX_BYTES = 16 * 1024;

function reply(body: ObjectSetupResponse, status: number) {
  return Response.json(body, { status, headers });
}

/**
 * Add one plant or animal (`OVE-485`, `OVE-524`). Authorization is the session
 * at the moment of the write (ADR-0022 rule 6); the body's request id makes a
 * retry of the same intent read back the first result. Nothing is published.
 */
export async function POST(request: Request) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    const response = mutationScopeResponse(admission);
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }

  let parsed: ReturnType<typeof parseObjectSetupRequest>;
  try {
    parsed = parseObjectSetupRequest(
      await readBoundedJsonRequest(request, MAX_BYTES),
    );
  } catch (error) {
    if (error instanceof BoundedJsonPayloadTooLargeError) {
      return Response.json({ error: "too_large" }, { status: 413, headers });
    }
    if (
      error instanceof InvalidObjectSetupRequest ||
      error instanceof BoundedJsonInvalidError
    ) {
      return Response.json(
        { error: "invalid_request" },
        { status: 400, headers },
      );
    }
    throw error;
  }
  if (!parsed.ok)
    return reply({ status: "invalid", errors: parsed.errors }, 422);
  const input = parsed.input;

  // A photo is claimed from staging before the object is written, under the
  // object's own id (ADR-0036 D1). A retry of an intent that already created
  // the object reads it back instead: its photo was claimed the first time,
  // and a durable job finalizes it whatever happened to that response.
  let photo: ClaimedOwnedPhoto | null = null;
  if (input.photo) {
    const prior = await readOwnedObjectForReplay(
      admission.scope,
      input.requestId,
    );
    if (prior === "conflict") return reply({ status: "conflict" }, 409);
    if (prior) {
      return reply({ status: "created", object: prior, replayed: true }, 200);
    }
    if (!input.allowDuplicateName) {
      const sameName = await findOwnedObjectByName(admission.scope, input);
      if (sameName) {
        return reply({ status: "duplicate_name", existing: sameName }, 409);
      }
    }
    if (!(await isObjectIdentitySelectable(input))) {
      return reply({ status: "identity_unavailable" }, 422);
    }
    try {
      photo = await claimOwnedPhoto({
        ownerUserId: admission.scope.userId,
        publishId: input.requestId,
        photo: input.photo,
      });
    } catch {
      return reply({ status: "photo_unavailable" }, 409);
    }
  }

  // A new cultivar or breed entry is named in the gardener's language.
  const locale = await getRequestInterfaceLocale();
  const result = await settleSection(
    () =>
      createOwnedObject(admission.scope, input, undefined, { photo, locale }),
    { deadlineMs: 6000, surface: "object-setup", section: "create" },
  );
  if (result.status !== "ready") {
    // Committed or not, the same request id retried reads back the answer.
    return reply({ status: "unavailable", digest: result.digest }, 503);
  }
  const outcome = result.value;
  switch (outcome.status) {
    case "created":
      if (photo && !outcome.replayed) {
        await finalizeOwnedPhoto({
          ownerUserId: admission.scope.userId,
          publishId: outcome.object.id,
          stagingSessionId: photo.stagingSessionId,
          receiptSetDigest: photo.receiptSetDigest,
        });
      }
      return reply(outcome, outcome.replayed ? 200 : 201);
    case "duplicate_name":
      return reply(outcome, 409);
    case "space_unavailable":
    case "identity_unavailable":
      return reply({ status: outcome.status }, 422);
    default:
      return reply({ status: "conflict" }, 409);
  }
}

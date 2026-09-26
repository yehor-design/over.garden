import {
  InvalidSpaceSetupRequest,
  parseSpaceSetupRequest,
  type SpaceSetupResponse,
} from "@/lib/garden/space-setup";
import {
  BoundedJsonInvalidError,
  BoundedJsonPayloadTooLargeError,
  readBoundedJsonRequest,
} from "@/server/bounded-json-request";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import {
  claimOwnedPhoto,
  finalizeOwnedPhoto,
  type ClaimedOwnedPhoto,
} from "@/server/media/owned-photo-handoff";
import {
  createOwnedSpace,
  findOwnedSpaceByName,
  readOwnedSpaceForReplay,
} from "@/server/space-repository";
import { settleSection } from "@/server/workspace-failure";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
// A name, the flags, and one photo's staging receipts (up to three signed
// tokens) with its 16 px placeholder.
const MAX_BYTES = 16 * 1024;

function reply(body: SpaceSetupResponse, status: number) {
  return Response.json(body, { status, headers });
}

/**
 * Create one empty space (`OVE-484`). Authorization is the session at the
 * moment of the write (ADR-0022 rule 6); the body's request id makes a retry
 * of the same intent read back the first result.
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

  let parsed: ReturnType<typeof parseSpaceSetupRequest>;
  try {
    parsed = parseSpaceSetupRequest(
      await readBoundedJsonRequest(request, MAX_BYTES),
    );
  } catch (error) {
    if (error instanceof BoundedJsonPayloadTooLargeError) {
      return Response.json({ error: "too_large" }, { status: 413, headers });
    }
    if (
      error instanceof InvalidSpaceSetupRequest ||
      error instanceof BoundedJsonInvalidError
    ) {
      return Response.json(
        { error: "invalid_request" },
        { status: 400, headers },
      );
    }
    throw error;
  }
  if (!parsed.ok) {
    return reply({ status: "invalid", errors: parsed.errors }, 422);
  }
  const input = parsed.input;

  // A photo is claimed from staging before the space is written, under the
  // space's own id (ADR-0036 D1). A retry of an intent that already created
  // the space reads it back instead: its photo was claimed the first time,
  // and a durable job finalizes it whatever happened to that response.
  let photo: ClaimedOwnedPhoto | null = null;
  if (input.photo) {
    const prior = await readOwnedSpaceForReplay(admission.scope, input.requestId);
    if (prior === "conflict") return reply({ status: "conflict" }, 409);
    if (prior) return reply({ status: "created", space: prior, replayed: true }, 200);
    if (!input.allowDuplicateName) {
      const sameName = await findOwnedSpaceByName(admission.scope, input.displayName);
      if (sameName) return reply({ status: "duplicate_name", existing: sameName }, 409);
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

  const result = await settleSection(
    () => createOwnedSpace(admission.scope, input, undefined, { photo }),
    { deadlineMs: 6000, surface: "space-setup", section: "create" },
  );
  if (result.status !== "ready") {
    // The write may or may not have committed. The same request id retried
    // reads back the answer, so the client says exactly that.
    return reply({ status: "unavailable", digest: result.digest }, 503);
  }
  const outcome = result.value;
  if (outcome.status === "created") {
    if (photo && !outcome.replayed) {
      await finalizeOwnedPhoto({
        ownerUserId: admission.scope.userId,
        publishId: outcome.space.id,
        stagingSessionId: photo.stagingSessionId,
        receiptSetDigest: photo.receiptSetDigest,
      });
    }
    return reply(outcome, outcome.replayed ? 200 : 201);
  }
  if (outcome.status === "duplicate_name") return reply(outcome, 409);
  return reply({ status: "conflict" }, 409);
}

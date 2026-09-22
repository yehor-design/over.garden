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
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { createOwnedObject } from "@/server/object-setup-repository";
import { settleSection } from "@/server/workspace-failure";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const MAX_BYTES = 4 * 1024;

function reply(body: ObjectSetupResponse, status: number) {
  return Response.json(body, { status, headers });
}

/**
 * Add one plant or animal (`OVE-485`). Authorization is the session at the
 * moment of the write (ADR-0022 rule 6); the body's request id makes a retry
 * of the same intent read back the first result. Nothing is published.
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

  const result = await settleSection(
    () => createOwnedObject(admission.scope, input),
    { deadlineMs: 4500, surface: "object-setup", section: "create" },
  );
  if (result.status !== "ready") {
    // Committed or not, the same request id retried reads back the answer.
    return reply({ status: "unavailable", digest: result.digest }, 503);
  }
  const outcome = result.value;
  switch (outcome.status) {
    case "created":
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

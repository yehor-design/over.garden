import { connection } from "next/server";

import { isUuid } from "@/lib/media/ephemeral-staging-contract";
import { issueEphemeralStagingSessionToken } from "@/server/media/ephemeral-staging-capability";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";

/**
 * One capability per composer session (OVE-372). The composer calls this
 * once when it opens and again when the capability is about to expire; every
 * upload and touch then goes straight to the staging Worker with it. The
 * same `stagingSessionId` may be presented again for renewal; the Worker's
 * Durable Object binds the session to the first owner that uses it.
 */
export async function POST(request: Request) {
  await connection();
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    return privateNoStore(mutationScopeResponse(admission));
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 1_024) return invalidSession();
  const body = await readBoundedJson(request, 1_024);
  if (!isRecord(body) || !isUuid(body.stagingSessionId)) {
    return invalidSession();
  }
  if (Object.keys(body).some((key) => key !== "stagingSessionId")) {
    return invalidSession();
  }
  try {
    const issued = await issueEphemeralStagingSessionToken({
      ownerUserId: admission.scope.userId,
      stagingSessionId: body.stagingSessionId,
    });
    return privateNoStore(
      Response.json({
        stagingSessionId: body.stagingSessionId,
        sessionCapability: issued.capability,
        expiresAt: issued.expiresAtSeconds,
      }),
    );
  } catch {
    return privateNoStore(
      Response.json({ code: "staging_session_unavailable" }, { status: 503 }),
    );
  }
}

function invalidSession() {
  return privateNoStore(
    Response.json({ code: "staging_session_invalid" }, { status: 400 }),
  );
}

async function readBoundedJson(request: Request, maxBytes: number) {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "application/json"
  ) {
    return null;
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function privateNoStore(response: Response) {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

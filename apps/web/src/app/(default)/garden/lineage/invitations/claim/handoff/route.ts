import { NextResponse } from "next/server";

import {
  LINEAGE_CLAIM_COOKIE_MAX_AGE_SECONDS,
  LINEAGE_CLAIM_COOKIE_NAME,
  LINEAGE_INVITATION_CLAIM_PATH,
} from "@/lib/lineage/claim-handoff";
import { sealLineageClaimToken } from "@/server/lineage-claim-cookie";
import { inspectLineageInviteToken } from "@/server/lineage-invite-token";

/**
 * Moves the token out of the address into an `httpOnly` cookie scoped to the
 * claim page, so no later request, screenshot or analytics event carries it.
 *
 * A link that is not ours and a link whose thirty days are over are two
 * answers (`OVE-495`, criterion 9): the first means "open it again, it was
 * copied wrong", the second "ask for a new one". Neither sets the cookie.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
  } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const inspection =
    token && token.length <= 4096
      ? inspectLineageInviteToken(token)
      : ({ state: "invalid" } as const);

  if (inspection.state !== "valid") {
    return Response.json(
      {
        error:
          inspection.state === "expired"
            ? "lineage_invitation_expired"
            : "lineage_invitation_invalid",
      },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ next: LINEAGE_INVITATION_CLAIM_PATH });
  response.cookies.set({
    name: LINEAGE_CLAIM_COOKIE_NAME,
    value: sealLineageClaimToken(token),
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: LINEAGE_INVITATION_CLAIM_PATH,
    maxAge: LINEAGE_CLAIM_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

function isSecureRequest(request: Request) {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  return forwardedProtocol
    ? forwardedProtocol === "https"
    : new URL(request.url).protocol === "https:";
}

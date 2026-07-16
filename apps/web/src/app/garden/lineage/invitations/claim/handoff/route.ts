import { NextResponse } from "next/server";

import {
  LINEAGE_CLAIM_COOKIE_MAX_AGE_SECONDS,
  LINEAGE_CLAIM_COOKIE_NAME,
  LINEAGE_INVITATION_CLAIM_PATH,
} from "@/lib/lineage/claim-handoff";
import { sealLineageClaimToken } from "@/server/lineage-claim-cookie";
import { verifyLineageInviteToken } from "@/server/lineage-invite-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
  } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token || token.length > 4096 || !verifyLineageInviteToken(token)) {
    return Response.json(
      { error: "lineage_invitation_unavailable" },
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

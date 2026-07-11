import { NextResponse } from "next/server";

import { lineageInvitationClaimPath } from "@/lib/garden/public-paths";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import { createAuthIntentToken } from "@/server/auth-intent-token";
import { signLineageInviteToken } from "@/server/lineage-invite-token";

export const dynamic = "force-dynamic";

interface VisualFixtureIntentRouteContext {
  params: Promise<{ scenarioId: string }>;
}

export async function GET(
  request: Request,
  { params }: VisualFixtureIntentRouteContext,
) {
  if (!tryResolveVisualFixtureEnvironment(process.env)) {
    return new Response(null, { status: 404 });
  }

  const { scenarioId } = await params;
  const scenario = VISUAL_FIXTURE_MANIFEST.intentEvidence.scenarios.find(
    (candidate) => candidate.id === scenarioId,
  );
  if (!scenario) return new Response(null, { status: 404 });

  if (scenario.action === "claim") {
    const inviteToken = signLineageInviteToken({
      pendingIdentityId:
        VISUAL_FIXTURE_MANIFEST.lineageEvidence.claimPendingIdentityId,
      edgeId: VISUAL_FIXTURE_MANIFEST.lineageEvidence.claimEdgeId,
      createdAt: new Date(),
      ttlSeconds: 15 * 60,
    });
    return NextResponse.redirect(
      new URL(lineageInvitationClaimPath(inviteToken), request.url),
      303,
    );
  }

  const tokenNow =
    scenario.tokenMode === "expired"
      ? Date.now() - 15 * 60_000 - 1_000
      : Date.now();
  const issuedToken = createAuthIntentToken(
    {
      action: scenario.action,
      returnTo: scenario.returnTo,
      ...(scenario.target ? { target: scenario.target } : {}),
    },
    { now: tokenNow },
  );
  const token =
    scenario.tokenMode === "invalid"
      ? invalidateToken(issuedToken)
      : issuedToken;
  const destination = new URL("/auth/intent", request.url);
  destination.searchParams.set("intent", token);

  return NextResponse.redirect(destination, 303);
}

function invalidateToken(token: string) {
  const segments = token.split(".");
  const tag = segments[3];
  if (!tag) return `${token}.invalid`;

  segments[3] = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
  return segments.join(".");
}

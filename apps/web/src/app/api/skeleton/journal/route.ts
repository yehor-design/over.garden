import {
  isWalkingSkeletonRequestHostAllowed,
  tryResolveWalkingSkeletonEnvironment,
} from "@/lib/walking-skeleton/environment";
import {
  AuthenticationRequiredError,
  requireCurrentUserId,
} from "@/server/auth-session";
import {
  listMyRecentJournalEntries,
} from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function GET(request: Request) {
  if (!isWalkingSkeletonRequestAllowed(request)) {
    return notFoundResponse();
  }

  try {
    const userId = await requireCurrentUserId();
    const entries = await listMyRecentJournalEntries(scopedToUser(userId), 10);
    return Response.json({ entries }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!isWalkingSkeletonRequestAllowed(request)) {
    return notFoundResponse();
  }
  return Response.json(
    { code: "atomic_journal_protocol_required" },
    { status: 410, headers: NO_STORE_HEADERS },
  );
}

function notFoundResponse() {
  return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
}

function isWalkingSkeletonRequestAllowed(request: Request) {
  return (
    tryResolveWalkingSkeletonEnvironment(process.env) !== null &&
    isWalkingSkeletonRequestHostAllowed(request.url) &&
    isWalkingSkeletonRequestHostAllowed(request.headers.get("host"))
  );
}

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    { error: "The request could not be completed." },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

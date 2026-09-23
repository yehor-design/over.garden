import {
  buildAuthIntentResumeHref,
  type AuthIntentPayload,
} from "@/lib/auth/auth-intent-contract";
import { oauthErrorCodeForRedirect } from "@/lib/auth/social-oauth";
import { getCurrentSession } from "@/server/auth-session";
import {
  type AuthIntentTokenErrorCode,
  verifyAuthIntentToken,
} from "@/server/auth-intent-token";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("intent") ?? "";
  let intent: AuthIntentPayload;

  try {
    intent = verifyAuthIntentToken(token);
  } catch (error) {
    const code = tokenErrorCode(error);
    const query = new URLSearchParams();
    if (code === "expired" && token) query.set("intent", token);
    query.set("state", code);
    return seeOther(`/auth/intent?${query.toString()}`);
  }

  const session = await getCurrentSession();
  if (!session?.user?.id) {
    const query = new URLSearchParams();
    query.set("intent", token);
    query.set("state", "auth-required");
    const oauthError = oauthErrorCodeForRedirect(
      url.searchParams.get("error") ?? undefined,
    );
    if (oauthError) query.set("error", oauthError);
    return seeOther(`/auth/intent?${query.toString()}`);
  }

  return seeOther(buildAuthIntentResumeHref(intent));
}

/**
 * A relative `Location` (`OVE-504`): `request.url` names the host the server
 * thinks it has, and an absolute redirect built from it could move the reader
 * to another origin mid-flow, away from their language and session cookies.
 */
function seeOther(path: string) {
  return new Response(null, { status: 303, headers: { location: path } });
}

function tokenErrorCode(error: unknown): AuthIntentTokenErrorCode {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "expired"
    ? "expired"
    : "invalid";
}

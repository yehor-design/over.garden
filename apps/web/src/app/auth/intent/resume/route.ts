import { NextResponse } from "next/server";

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

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("intent") ?? "";
  let intent: AuthIntentPayload;

  try {
    intent = verifyAuthIntentToken(token);
  } catch (error) {
    const code = tokenErrorCode(error);
    const authUrl = new URL("/auth/intent", request.url);
    if (code === "expired" && token) authUrl.searchParams.set("intent", token);
    authUrl.searchParams.set("state", code);
    return NextResponse.redirect(authUrl, 303);
  }

  const session = await getCurrentSession();
  if (!session?.user?.id) {
    const authUrl = new URL("/auth/intent", request.url);
    authUrl.searchParams.set("intent", token);
    authUrl.searchParams.set("state", "auth-required");
    const oauthError = oauthErrorCodeForRedirect(
      url.searchParams.get("error") ?? undefined,
    );
    if (oauthError) authUrl.searchParams.set("error", oauthError);
    return NextResponse.redirect(authUrl, 303);
  }

  return NextResponse.redirect(
    new URL(buildAuthIntentResumeHref(intent), request.url),
    303,
  );
}

function tokenErrorCode(error: unknown): AuthIntentTokenErrorCode {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "expired"
    ? "expired"
    : "invalid";
}

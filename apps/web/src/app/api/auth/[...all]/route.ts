import { after, NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { denyRetiredSocialProviderRequest } from "@/lib/auth/retired-social-provider";
import {
  equalizePasswordResetAdmission,
  isTrustedPasswordResetOrigin,
  parsePasswordResetRequest,
  PASSWORD_RESET_RESPONSE,
  PASSWORD_RESET_RESPONSE_HEADERS,
} from "@/server/auth/auth-email-outbox";
import { drainAuthEmailOutbox } from "@/server/auth/auth-email-outbox-consumer";
import { bridgeLegacyEmailVerificationRequest } from "@/server/auth/legacy-email-verification-bridge";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";

export const maxDuration = 60;

const handler = toNextJsHandler(auth);
const AUTHENTICATED_ACCOUNT_MUTATION_PATHS = new Set([
  "/api/auth/change-email",
  "/api/auth/change-password",
  "/api/auth/delete-user",
  "/api/auth/link-social",
  "/api/auth/revoke-other-sessions",
  "/api/auth/revoke-session",
  "/api/auth/revoke-sessions",
  "/api/auth/set-password",
  "/api/auth/unlink-account",
  "/api/auth/update-session",
  "/api/auth/update-user",
]);

export async function GET(request: Request) {
  const retiredProviderDenial = await denyRetiredSocialProviderRequest(request);
  if (retiredProviderDenial) return retiredProviderDenial;

  return handler.GET(await bridgeLegacyEmailVerificationRequest(request));
}

export const { PATCH, PUT, DELETE } = handler;

export async function POST(request: Request) {
  const retiredProviderDenial = await denyRetiredSocialProviderRequest(request);
  if (retiredProviderDenial) return retiredProviderDenial;

  if (isPasswordResetRequest(request)) {
    return await requestPasswordReset(request);
  }

  if (isAuthenticatedAccountMutationRequest(request)) {
    const admission = await resolveMutationScope({
      expectedOwnerUserId: ownerUserIdFromRequest(request),
      authoritative: true,
    });
    if (admission.status === "rejected") {
      return mutationScopeResponse(admission);
    }
  }

  return handler.POST(request);
}

function isPasswordResetRequest(request: Request): boolean {
  return new URL(request.url).pathname.endsWith(
    "/api/auth/request-password-reset",
  );
}

export function isAuthenticatedAccountMutationRequest(
  request: Request,
): boolean {
  return AUTHENTICATED_ACCOUNT_MUTATION_PATHS.has(
    new URL(request.url).pathname,
  );
}

async function requestPasswordReset(request: Request): Promise<Response> {
  if (!isTrustedPasswordResetOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await request
    .clone()
    .json()
    .catch(() => null);
  const parsed = parsePasswordResetRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const betterAuthResponse = await handler.POST(request);
  if (!betterAuthResponse.ok) return betterAuthResponse;

  await equalizePasswordResetAdmission(parsed.email);
  after(async () => {
    try {
      await drainAuthEmailOutbox();
    } catch {
      // The outbox remains durable and the daily Cron fallback will reclaim it.
      // Do not emit request-, recipient-, or provider-derived error details.
    }
  });

  return NextResponse.json(PASSWORD_RESET_RESPONSE, {
    status: 200,
    headers: PASSWORD_RESET_RESPONSE_HEADERS,
  });
}

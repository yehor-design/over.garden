import "server-only";

import { after, NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import {
  equalizePasswordResetAdmission,
  isTrustedPasswordResetOrigin,
  parsePasswordResetRequest,
  PASSWORD_RESET_RESPONSE,
  PASSWORD_RESET_RESPONSE_HEADERS,
} from "@/server/auth/auth-email-outbox";
import { drainAuthEmailOutbox } from "@/server/auth/auth-email-outbox-consumer";

const handler = toNextJsHandler(auth);

/**
 * Asking for a password-reset link, whoever asks.
 *
 * It is the body of `POST /api/auth/request-password-reset`, moved here so the
 * help screen's Server Action can answer through exactly the same path
 * (`OVE-504`): Better Auth's handler — the route that applies its per-address
 * rate limit, which a direct `auth.api` call would skip — then the equalised
 * lookup, then the durable outbox. Whoever calls it gets the same answer for an
 * address with an account and one without.
 */
export async function handlePasswordResetRequest(
  request: Request,
): Promise<Response> {
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

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
import { bridgeLegacyEmailVerificationRequest } from "@/server/auth/legacy-email-verification-bridge";

export const runtime = "nodejs";
export const maxDuration = 60;

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  return handler.GET(await bridgeLegacyEmailVerificationRequest(request));
}

export const { PATCH, PUT, DELETE } = handler;

export async function POST(request: Request) {
  if (isPasswordResetRequest(request)) {
    return await requestPasswordReset(request);
  }

  return handler.POST(request);
}

function isPasswordResetRequest(request: Request): boolean {
  return new URL(request.url).pathname.endsWith(
    "/api/auth/request-password-reset",
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

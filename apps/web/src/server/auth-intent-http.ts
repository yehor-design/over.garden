import "server-only";

import type { AuthIntentAction } from "@/lib/auth/auth-intent-contract";
import { normalizeAuthIntentDraft } from "@/lib/auth/auth-intent-contract";
import { AUTH_INTENT_RETURN_HEADER } from "@/lib/auth/auth-intent-http-contract";
import { createAuthIntentToken } from "@/server/auth-intent-token";

export function authIntentRequiredResponse(
  request: Request,
  options: {
    action: AuthIntentAction;
    fallbackReturnTo: string;
    message: string;
  },
) {
  const returnTo = safeIntentReturnTo(
    request.headers.get(AUTH_INTENT_RETURN_HEADER),
    options.action,
    options.fallbackReturnTo,
  );
  const token = createAuthIntentToken({
    action: options.action,
    returnTo,
  });

  return Response.json(
    {
      error: options.message,
      authIntentUrl: `/auth/intent?intent=${encodeURIComponent(token)}`,
    },
    { status: 401 },
  );
}

function safeIntentReturnTo(
  candidate: string | null,
  action: AuthIntentAction,
  fallback: string,
) {
  for (const returnTo of [candidate, fallback]) {
    if (!returnTo) continue;
    try {
      return normalizeAuthIntentDraft({ action, returnTo }).returnTo;
    } catch {
      continue;
    }
  }

  return "/garden";
}

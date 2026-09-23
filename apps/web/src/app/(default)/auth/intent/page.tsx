import { redirect } from "next/navigation";

import { buildAuthIntentResumeHref } from "@/lib/auth/auth-intent-contract";
import {
  AuthIntentTokenError,
  verifyAuthIntentToken,
} from "@/server/auth-intent-token";
import { getCurrentSession } from "@/server/auth-session";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";

/**
 * The intent screen is a redirect, not a page.
 *
 * It used to render a second, differently designed sign-in surface — a centred
 * dialog card with its own heading, its own prompt and its own cancel control —
 * beside the full-width one at `/garden`. There is one sign-in screen now, so
 * this route's only job is to hand it the two things the token carries: where to
 * return, and what the reader was trying to do.
 *
 * The signed token itself is unchanged. It still holds the target and the exact
 * control to resume, and `/auth/intent/resume` still consumes it, so nothing
 * about resuming a comment, a bookmark or a follow regresses.
 *
 * An **expired** token (`OVE-504`) no longer resumes. It used to be forwarded to
 * the resume route, which refused it and sent the reader back here, which
 * forwarded it again: a signed-in reader holding an action older than fifteen
 * minutes got a redirect loop, and a guest got the same loop right after
 * signing in. The token still names the page, so an expired one returns the
 * reader to that page — plain, with nothing resumed — and the sign-in screen
 * says why. A token that does not verify at all says that instead.
 */
export default async function AuthIntentRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await (searchParams ??
    Promise.resolve<Record<string, string | string[] | undefined>>({}));
  const token = first(params.intent);
  const state = first(params.state);

  if (!token) {
    redirect(
      buildSignInHref({
        notice:
          state === "invalid" || state === "expired" ? "intent-invalid" : null,
      }),
    );
  }

  let intent;
  let expired = false;
  try {
    intent = verifyAuthIntentToken(token);
  } catch (error) {
    if (
      error instanceof AuthIntentTokenError &&
      error.code === "expired" &&
      error.intent
    ) {
      intent = error.intent;
      expired = true;
    } else {
      intent = null;
    }
  }

  if (!intent) redirect(buildSignInHref({ notice: "intent-invalid" }));

  const session = await getCurrentSession();

  if (expired) {
    if (session?.user?.id) redirect(intent.returnTo);
    // No `intent`: its heading promises the action continues, and this one
    // will not. The notice says so, and the page is where signing in lands.
    redirect(
      buildSignInHref({ returnTo: intent.returnTo, notice: "intent-expired" }),
    );
  }

  if (session?.user?.id) {
    redirect(buildAuthIntentResumeHref(intent));
  }

  const next = `/auth/intent/resume?intent=${encodeURIComponent(token)}`;
  redirect(buildSignInHref({ returnTo: next, intent: intent.action }));
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

import { redirect } from "next/navigation";

import {
  AuthIntentTokenError,
  verifyAuthIntentToken,
} from "@/server/auth-intent-token";
import { getCurrentSession } from "@/server/auth-session";

/**
 * The intent screen is now a redirect, not a page.
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
 */
export default async function AuthIntentRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await (searchParams ??
    Promise.resolve<Record<string, string | string[] | undefined>>({}));
  const token = first(params.intent);

  if (!token) redirect("/auth/sign-in");

  let intent;
  try {
    intent = verifyAuthIntentToken(token);
  } catch (error) {
    // An expired token still names the action and the page the reader came
    // from, so it can send them back to where they were rather than nowhere.
    intent =
      error instanceof AuthIntentTokenError && error.code === "expired"
        ? error.intent
        : null;
  }

  if (!intent) redirect("/auth/sign-in");

  const session = await getCurrentSession();
  if (session?.user?.id) {
    redirect(`/auth/intent/resume?intent=${encodeURIComponent(token)}`);
  }

  const next = `/auth/intent/resume?intent=${encodeURIComponent(token)}`;
  redirect(
    `/auth/sign-in?next=${encodeURIComponent(next)}&intent=${encodeURIComponent(intent.action)}`,
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

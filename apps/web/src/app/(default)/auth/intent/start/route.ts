import {
  buildAuthIntentResumeHref,
  normalizeAuthIntentDraft,
  type AuthIntentDraft,
} from "@/lib/auth/auth-intent-contract";
import { getCurrentSession } from "@/server/auth-session";
import { createAuthIntentToken } from "@/server/auth-intent-token";

export async function POST(request: Request) {
  let intent: AuthIntentDraft;
  try {
    const formData = await request.formData();
    const targetKind = stringField(formData, "targetKind");
    const targetRef = stringField(formData, "targetRef");
    intent = normalizeAuthIntentDraft({
      action: stringField(formData, "action"),
      returnTo: stringField(formData, "returnTo"),
      ...(targetKind && targetRef
        ? { target: { kind: targetKind, ref: targetRef } }
        : {}),
      control: stringField(formData, "control"),
    });
  } catch {
    return redirect(request, "/auth/intent?state=invalid");
  }

  const session = await getCurrentSession();
  if (session?.user?.id) {
    return redirect(request, buildAuthIntentResumeHref(intent));
  }

  const token = createAuthIntentToken(intent);
  return redirect(request, `/auth/intent?intent=${encodeURIComponent(token)}`);
}

function stringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * A relative `Location` (`OVE-504`). `request.url` names the host the server
 * thinks it has — `localhost` under `next start`, whatever a proxy forwarded
 * elsewhere — and an absolute redirect built from it can move the reader to
 * another origin mid-flow, where their language and session cookies are not.
 * The browser resolves a relative one against the address it is actually on.
 */
function redirect(_request: Request, path: string) {
  return new Response(null, { status: 303, headers: { location: path } });
}

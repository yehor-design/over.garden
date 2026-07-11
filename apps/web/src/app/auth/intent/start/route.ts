import { NextResponse } from "next/server";

import {
  buildAuthIntentResumeHref,
  normalizeAuthIntentDraft,
  type AuthIntentDraft,
} from "@/lib/auth/auth-intent-contract";
import { getCurrentSession } from "@/server/auth-session";
import { createAuthIntentToken } from "@/server/auth-intent-token";

export const runtime = "nodejs";

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
  const authUrl = new URL("/auth/intent", request.url);
  authUrl.searchParams.set("intent", token);
  return NextResponse.redirect(authUrl, 303);
}

function stringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function redirect(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

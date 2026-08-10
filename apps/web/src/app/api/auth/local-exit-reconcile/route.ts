import { auth } from "@/lib/auth";
import { hasCurrentSessionBinding } from "@/lib/auth/current-session-binding";
import {
  CURRENT_SESSION_BINDING_HEADER,
  executeCurrentSessionExit,
  readSetCookieHeaders,
} from "@/lib/auth/sign-out-hardening";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "cache-control": "private, no-store",
} as const;

export async function POST(request: Request): Promise<Response> {
  if (!isAdmittedLocalExitRequest(request)) return emptyResponse();

  const result = await executeCurrentSessionExit(request.headers, (context) =>
    auth.api.signOut(context),
  );
  const headers = new Headers(RESPONSE_HEADERS);
  for (const cookie of readSetCookieHeaders(result.response.headers)) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { status: 204, headers });
}

function isAdmittedLocalExitRequest(request: Request) {
  if (request.body !== null) return false;
  const requestUrl = new URL(request.url);
  if (request.headers.get("origin") !== requestUrl.origin) return false;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  return hasCurrentSessionBinding(
    request.headers.get(CURRENT_SESSION_BINDING_HEADER),
  );
}

function emptyResponse() {
  return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
}

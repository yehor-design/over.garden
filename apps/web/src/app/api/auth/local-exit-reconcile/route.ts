import { auth } from "@/lib/auth";
import { hasCurrentSessionBinding } from "@/lib/auth/current-session-binding";
import {
  CURRENT_SESSION_BINDING_HEADER,
  executeCurrentSessionExit,
  readSetCookieHeaders,
} from "@/lib/auth/sign-out-hardening";

export const runtime = "nodejs";

const EMPTY_BODY_READ_TIMEOUT_MS = 100;
const MAX_EMPTY_BODY_CHUNKS = 2;

const RESPONSE_HEADERS = {
  "cache-control": "private, no-store",
} as const;

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdmittedLocalExitRequest(request))) return emptyResponse();

  let canonicalHttpAttemptStarted = false;
  const result = await executeCurrentSessionExit(
    request.headers,
    (context) => {
      if (!canonicalHttpAttemptStarted) {
        canonicalHttpAttemptStarted = true;
        return auth.handler(
          createCanonicalSignOutRequest(request, context.headers),
        );
      }
      return auth.api.signOut(context);
    },
  );
  console.info(
    `[auth] local-exit reconciliation outcome: ${result.outcome}`,
  );
  const headers = new Headers(RESPONSE_HEADERS);
  for (const cookie of readSetCookieHeaders(result.response.headers)) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { status: 204, headers });
}

function createCanonicalSignOutRequest(
  request: Request,
  headers: Headers,
) {
  const canonicalHeaders = new Headers(headers);
  canonicalHeaders.delete("content-length");
  canonicalHeaders.set("content-type", "application/json");

  return new Request(new URL("/api/auth/sign-out", request.url), {
    method: "POST",
    headers: canonicalHeaders,
    body: "{}",
  });
}

async function isAdmittedLocalExitRequest(request: Request) {
  const requestUrl = new URL(request.url);
  if (request.headers.get("origin") !== requestUrl.origin) return false;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  if (
    !hasCurrentSessionBinding(
      request.headers.get(CURRENT_SESSION_BINDING_HEADER),
    )
  ) {
    return false;
  }
  return requestHasNoPayload(request);
}

async function requestHasNoPayload(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && contentLength !== "0") return false;
  if (request.body === null) return true;

  const reader = request.body.getReader();
  try {
    for (let index = 0; index < MAX_EMPTY_BODY_CHUNKS; index += 1) {
      const result = await readBodyChunkWithinDeadline(reader);
      if (!result) return false;
      if (result.done) return true;
      if (result.value.byteLength > 0) return false;
    }
    return false;
  } catch {
    return false;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function readBodyChunkWithinDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array> | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(
      () => resolve(null),
      EMPTY_BODY_READ_TIMEOUT_MS,
    );
    reader.read().then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      () => {
        clearTimeout(timeout);
        resolve(null);
      },
    );
  });
}

function emptyResponse() {
  return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
}

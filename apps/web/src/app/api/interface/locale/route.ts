import { NextResponse } from "next/server";

import {
  INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
  INTERFACE_LOCALE_COOKIE_NAME,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  INTERFACE_MARKET_REQUEST_HEADER,
  isInterfaceLocaleAllowed,
  normalizeInterfaceMarket,
} from "@/lib/interface-market";
import {
  INTERFACE_API_CACHE_CONTROL,
  isForbiddenInterfaceSubrequest,
  isSameOriginInterfaceRequest,
} from "@/lib/interface-request-guard";

const MAX_REQUEST_BODY_LENGTH = 64;

export function GET() {
  return response(null, 405, { Allow: "POST" });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.search) return response(null, 400);

  if (
    !isSameOriginInterfaceRequest(request) ||
    request.headers.has("referer")
  ) {
    return response(null, 403);
  }
  if (isForbiddenInterfaceSubrequest(request.headers)) {
    return response(null, 400);
  }
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    return response(null, 415);
  }
  if (
    normalizeInterfaceMarket(
      request.headers.get(INTERFACE_MARKET_REQUEST_HEADER),
    ) !== "bulgaria"
  ) {
    return response(null, 403);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_BODY_LENGTH
  ) {
    return response(null, 413);
  }

  const bodyRead = await readBoundedUtf8Body(request, MAX_REQUEST_BODY_LENGTH);
  if (!bodyRead.ok) return response(null, bodyRead.status);

  let body: unknown;
  try {
    body = JSON.parse(bodyRead.value);
  } catch {
    return response(null, 400);
  }
  if (!isLocalePreferenceBody(body)) return response(null, 400);

  const result = response(null, 204);
  result.cookies.set({
    name: INTERFACE_LOCALE_COOKIE_NAME,
    value: body.locale,
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
  });
  return result;
}

async function readBoundedUtf8Body(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: string } | { ok: false; status: 400 | 413 }> {
  if (!request.body) return { ok: true, value: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      ok: true,
      value: new TextDecoder("utf-8", { fatal: true }).decode(body),
    };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function isLocalePreferenceBody(
  value: unknown,
): value is { locale: "bg" | "ru" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    typeof record.locale === "string" &&
    isInterfaceLocaleAllowed("bulgaria", record.locale as InterfaceLocale)
  );
}

function response(
  body: BodyInit | null,
  status: number,
  headers?: HeadersInit,
) {
  return new NextResponse(body, {
    status,
    headers: {
      "Cache-Control": INTERFACE_API_CACHE_CONTROL,
      ...headers,
    },
  });
}

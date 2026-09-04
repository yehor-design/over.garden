import { NextResponse } from "next/server";

import {
  INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
  INTERFACE_LOCALE_COOKIE_NAME,
} from "@/lib/interface-localization";
import {
  INTERFACE_MARKET_REQUEST_HEADER,
  isInterfaceLocaleAllowed,
  normalizeInterfaceMarket,
} from "@/lib/interface-market";
import { isPublicLocale } from "@/lib/public-localization";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import {
  INTERFACE_API_CACHE_CONTROL,
  hasInterfaceMutationReferer,
  isForbiddenInterfaceSubrequest,
  isSameOriginInterfaceRequest,
} from "@/lib/interface-request-guard";

/**
 * Remembers an interface language for a surface that cannot use a Server Action.
 *
 * That is one surface: the raw lifecycle document — the 404 and the seven-day
 * 410 tombstone — which is hand-written HTML with no React and no client bundle.
 * Everything else uses a link (the locale is in the path) or
 * `setInterfaceLocaleAction`.
 *
 * It therefore speaks the only language that surface has: a form post, answered
 * with a redirect back to the page. The previous contract was JSON with a `204`
 * and no body, which existed because an inline 110-line script drove it through
 * a two-phase commit; that script is gone (OVE-379).
 */
export function GET() {
  return response(null, 405, { Allow: "POST" });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.search) return response(null, 400);

  if (
    !isSameOriginInterfaceRequest(request) ||
    hasInterfaceMutationReferer(request.headers)
  ) {
    return response(null, 403);
  }
  if (isForbiddenInterfaceSubrequest(request.headers)) {
    return response(null, 400);
  }
  if (
    normalizeInterfaceMarket(
      request.headers.get(INTERFACE_MARKET_REQUEST_HEADER),
    ) !== "bulgaria"
  ) {
    return response(null, 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return response(null, 400);
  }

  const requested = formData.get("locale");
  if (typeof requested !== "string" || !isPublicLocale(requested)) {
    return response(null, 400);
  }
  if (!isInterfaceLocaleAllowed("bulgaria", requested)) {
    return response(null, 403);
  }

  // The reader goes back to the page they were on, through the same same-origin
  // boundary every other return path uses.
  const returnTo = normalizeInternalReturnPath(formData.get("returnTo"), "/");
  const result = NextResponse.redirect(new URL(returnTo, request.url), 303);
  result.headers.set("Cache-Control", INTERFACE_API_CACHE_CONTROL);
  result.cookies.set({
    name: INTERFACE_LOCALE_COOKIE_NAME,
    value: requested,
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
  });
  return result;
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

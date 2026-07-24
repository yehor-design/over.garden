export const INTERFACE_API_CACHE_CONTROL =
  "private, no-store, max-age=0, s-maxage=0, must-revalidate";

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1",
]);

export function isForbiddenInterfaceSubrequest(headers: Headers) {
  const purpose = headers.get("purpose")?.toLowerCase() ?? "";
  const secPurpose = headers.get("sec-purpose")?.toLowerCase() ?? "";

  return (
    headers.has("rsc") ||
    headers.has("next-router-state-tree") ||
    headers.has("next-action") ||
    headers.has("next-router-prefetch") ||
    headers.has("x-middleware-prefetch") ||
    purpose.includes("prefetch") ||
    secPurpose.includes("prefetch")
  );
}

/**
 * Same-origin check for interface mutations.
 *
 * Local HTTP treats loopback host aliases as one origin: browsers may send
 * `Origin: http://127.0.0.1:3000` while the App Router `request.url` is
 * canonicalized to `http://localhost:3000` (or the reverse).
 */
export function isSameOriginInterfaceRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }

  if (
    canonicalizeInterfaceOrigin(origin) !==
    canonicalizeInterfaceOrigin(requestOrigin)
  ) {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  return !fetchSite || fetchSite === "same-origin";
}

/** True when a non-empty Referer is present (blank no-referrer is allowed). */
export function hasInterfaceMutationReferer(headers: Headers) {
  const referer = headers.get("referer");
  return typeof referer === "string" && referer.trim().length > 0;
}

function canonicalizeInterfaceOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase())) {
      url.hostname = "localhost";
    }
    return url.origin;
  } catch {
    return origin;
  }
}

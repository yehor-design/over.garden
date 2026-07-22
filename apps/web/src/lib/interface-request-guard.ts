export const INTERFACE_API_CACHE_CONTROL =
  "private, no-store, max-age=0, s-maxage=0, must-revalidate";

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

export function isSameOriginInterfaceRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return false;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  return !fetchSite || fetchSite === "same-origin";
}

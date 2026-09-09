import { stripLocalePrefix } from "@/lib/public-localization";

const RETIRED_PATH_PREFIXES = [
  "/join",
  "/garden/pilot-smoke",
  "/garden/pilot-health",
  "/garden/pilot-learning",
  // The Release Center, its editions and extension-pack pages, and the older
  // curation path (ADR-0025). A workspace catch-all would stream a 200 shell
  // before it could say not found, so the proxy answers first.
  "/garden/catalog",
  // The owner's diagnostics page (ADR-0027). Removing the route directory is
  // enough for `/health`, which `isUnknownRootPath` then answers, but not for
  // `/bg/health`: a locale prefix is a segment the App Router can serve, so the
  // path reaches `[locale]/[handle]` and streams a profile not-found shell at
  // HTTP 200.
  "/health",
] as const;

/**
 * The owner's two curation surfaces live under a retired namespace
 * (ADR-0026 D10): they are named here rather than un-retiring
 * `/garden/catalog`, so `/garden/catalog/registry` and every other retired
 * descendant keeps answering 404.
 */
const REINSTATED_PATHS = [
  "/garden/catalog/queue",
  "/garden/catalog/sources",
] as const;

function trimTrailingSlashes(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

/**
 * Keeps retired product-control-plane namespaces from falling through to a
 * public profile or a streamed App Router not-found response with HTTP 200.
 */
export function isRetiredControlPlanePath(pathname: string) {
  const normalizedPath = normalizeReservedPath(pathname);
  const strippedPath = stripLocalePrefix(normalizedPath);
  const canonicalPath = trimTrailingSlashes(strippedPath.path);

  if (canonicalPath === "/admin" || canonicalPath.startsWith("/admin/"))
    return true;

  if (REINSTATED_PATHS.some((path) => canonicalPath === path)) return false;

  return RETIRED_PATH_PREFIXES.some(
    (prefix) =>
      canonicalPath === prefix || canonicalPath.startsWith(`${prefix}/`),
  );
}

function normalizeReservedPath(pathname: string) {
  let normalized = pathname;

  // Decode a bounded number of times so double-encoded separators cannot
  // bypass a reserved namespace while malformed input still fails closed.
  for (let pass = 0; pass < 3; pass += 1) {
    const slashNormalized = normalized.replace(/%2f|%5c/gi, "/");
    try {
      const decoded = decodeURIComponent(slashNormalized);
      normalized = decoded;
      if (decoded === slashNormalized) break;
    } catch {
      normalized = slashNormalized;
      break;
    }
  }

  return normalized
    .replace(/%2f|%5c/gi, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
}

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

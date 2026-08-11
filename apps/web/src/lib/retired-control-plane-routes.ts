import { stripLocalePrefix } from "@/lib/public-localization";

const RETIRED_EXACT_PATHS = new Set(["/admin"]);

const RETIRED_PATH_PREFIXES = [
  "/admin/users",
  "/join",
  "/garden/pilot-smoke",
  "/garden/pilot-health",
  "/garden/pilot-learning",
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
  const canonicalPath = trimTrailingSlashes(
    stripLocalePrefix(pathname).path,
  );

  if (RETIRED_EXACT_PATHS.has(canonicalPath)) return true;

  return RETIRED_PATH_PREFIXES.some(
    (prefix) =>
      canonicalPath === prefix || canonicalPath.startsWith(`${prefix}/`),
  );
}

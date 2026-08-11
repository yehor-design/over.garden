import { stripLocalePrefix } from "@/lib/public-localization";

const RETIRED_EXACT_PATHS = new Set(["/admin"]);

const RETIRED_PATH_PREFIXES = [
  "/admin/users",
  "/join",
  "/garden/pilot-smoke",
  "/garden/pilot-health",
  "/garden/pilot-learning",
] as const;

function isPreservedAdminPath(pathname: string) {
  if (
    pathname === "/admin/communities" ||
    pathname === "/admin/moderation/comments"
  ) {
    return true;
  }

  const communitySlug = pathname.slice("/admin/communities/".length);
  return (
    pathname.startsWith("/admin/communities/") &&
    communitySlug.length > 0 &&
    !communitySlug.includes("/")
  );
}

function trimTrailingSlashes(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

/**
 * Keeps retired product-control-plane namespaces from falling through to a
 * public profile or a streamed App Router not-found response with HTTP 200.
 */
export function isRetiredControlPlanePath(pathname: string) {
  const strippedPath = stripLocalePrefix(pathname);
  const canonicalPath = trimTrailingSlashes(strippedPath.path);

  if (RETIRED_EXACT_PATHS.has(canonicalPath)) return true;
  if (canonicalPath.startsWith("/admin/")) {
    return strippedPath.locale !== null || !isPreservedAdminPath(canonicalPath);
  }

  return RETIRED_PATH_PREFIXES.some(
    (prefix) =>
      canonicalPath === prefix || canonicalPath.startsWith(`${prefix}/`),
  );
}

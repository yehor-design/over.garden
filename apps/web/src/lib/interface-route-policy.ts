import {
  localizedPath,
  stripLocalePrefix,
  type PublicLocale,
} from "./public-localization";
import { AUTH_INTENT_ACTIONS } from "./auth/auth-intent-contract";

export const INTERFACE_LOCALE_PREFERENCE_ENDPOINT = "/api/interface/locale";
export const INTERFACE_CONTEXT_ENDPOINT = "/api/interface/context";

export type InterfaceRouteMode =
  | "localized-link"
  | "same-path-preference"
  | "non-ui";

export type InterfaceLanguageControlPlacement =
  | "site-shell"
  | "utility"
  | "none";

export type SessionRecheckMode =
  | "compatibility_fenced"
  | "effect_closed_non_fencing";

export const INTERFACE_UTILITY_CONTROL_PREFIXES = [
  "/admin/communities",
  "/admin/moderation/comments",
  "/health",
  "/garden/catalog/curation",
  "/garden/privacy/erasure-requests",
] as const;

/**
 * A small allow-list of routes that remain useful while the local garden
 * ownership check is fail-closed. These routes must not render garden payloads
 * or authenticated navigation. They contain only the native account-erasure
 * request and its separately server-authorized owner review, so a failed local
 * garden hydration cannot trap a person in an account or prevent a requested
 * erasure from being completed.
 */
const SESSION_CONVERGENCE_SAFE_EXIT_PATHS = [
  "/erasure",
  "/garden/privacy/erasure-requests",
] as const;

export interface InterfaceRoutePolicy {
  id: string;
  mode: InterfaceRouteMode;
  exactPaths?: readonly string[];
  prefixes?: readonly string[];
  safeQueryKeys: readonly string[];
  preserveClientFragment: boolean;
}

export type InterfaceRouteSearchInput =
  | string
  | Pick<URLSearchParams, "entries">
  | null
  | undefined;

const NO_QUERY_KEYS: readonly string[] = [];
const MAX_QUERY_VALUE_LENGTH = 256;
const MAX_QUERY_LENGTH = 1_200;
const MAX_QUERY_ENTRIES = 24;
const SAFE_FRAGMENT = /^[A-Za-z][A-Za-z0-9._~-]{0,127}$/;
const UNSAFE_QUERY_VALUE = /[\u0000-\u001f\u007f]/;
const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENCODED_PRIVATE_PATH_DELIMITER = /%(?:00|23|25|26|2f|3a|3d|3f|40|5c)/i;
const ENCODED_PATH_OCTET = /%[0-9a-f]{2}/i;
const PRIVATE_PATH_SEGMENT_MARKER =
  /(?:^|[-_.])(?:auth|bearer|claim|credential|email|invite|jwt|magic|otp|passcode|password|private|reset|secret|session|token|verify)(?:$|[-_.])/i;
const EXPLICIT_PRIVATE_VALUE_SEGMENT =
  /^(?:credential|invite|jwt|password|private|reset|secret|session|token)(?:[-_.](?:code|credential|key|secret|signature|token|v\d+|[A-Za-z0-9_-]{8,}))+$/i;
const LONG_HEX_PATH_SEGMENT = /^[0-9a-f]{24,}$/i;
const TOKEN_LIKE_PATH_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;
const DOT_TOKEN_PATH_SEGMENT =
  /^[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{4,}){1,2}$/;
const PUBLIC_SEMANTIC_SLUG =
  /^[\p{Letter}\p{Number}]+(?:-[\p{Letter}\p{Number}]+)*$/u;
const PUBLIC_PROFILE_HANDLE = /^[a-z0-9][a-z0-9_]{2,29}$/;
const AUTH_INTENT_ACTION_SET = new Set<string>(AUTH_INTENT_ACTIONS);
const PUBLIC_OBJECT_KINDS = new Set(["all", "plant", "animal"]);
const PUBLIC_OBJECT_IDENTITIES = new Set([
  "all",
  "plant_variety",
  "species",
  "breed",
  "provisional",
  "unknown",
  "unavailable",
]);
const PUBLIC_BOOKMARK_KINDS = new Set([
  "all",
  "journal_entry",
  "lineage_object",
  "variety",
  "topic",
]);
const PUBLIC_WISHLIST_KINDS = new Set([
  "all",
  "plant_variety",
  "species",
  "breed",
]);
const PUBLIC_FEED_SOURCES = new Set(["all", "people", "objects", "topics"]);
const PUBLIC_JOURNAL_SEASONS = new Set([
  "all",
  "winter",
  "spring",
  "summer",
  "autumn",
]);
const PUBLIC_JOURNAL_SORTS = new Set(["relevance", "recent", "oldest"]);
const PUBLIC_KNOWLEDGE_TYPES = new Set(["all", "guide", "answer", "topic"]);
const PROFILE_ACTIONS = new Set([
  "followed",
  "unfollowed",
  "blocked",
  "unblocked",
  "reported",
  "unavailable",
]);
const COMMUNITY_ACTIONS = new Set([
  "joined",
  "left",
  "contributed",
  "reported",
  "blocked",
  "unavailable",
]);
const ENGAGEMENT_STATUSES = new Set([
  "liked",
  "unliked",
  "like-rate-limited",
  "comment-rate-limited",
  "lineage-question-rate-limited",
  "interaction-unavailable",
  "bookmarked",
  "bookmark-removed",
  "commented",
  "followed",
  "unfollowed",
  "comment-deleted",
  "comment-reported",
  "comment-author-blocked",
  "comment-unavailable",
  "comment-precise-location",
  "preferences-saved",
  "notification-updated",
]);
const NOTIFICATION_FILTERS = new Set([
  "all",
  "comments",
  "follows",
  "mentions",
  "claims",
  "system",
]);

export const INTERFACE_ROUTE_POLICIES = [
  {
    id: "non-ui",
    mode: "non-ui",
    prefixes: ["/api", "/_next", "/__visual-fixtures", "/skeleton"],
    safeQueryKeys: NO_QUERY_KEYS,
    preserveClientFragment: false,
  },
  {
    id: "public-market-content",
    mode: "localized-link",
    exactPaths: ["/markets/ukraine", "/markets/bulgaria"],
    safeQueryKeys: NO_QUERY_KEYS,
    preserveClientFragment: true,
  },
  {
    id: "public-home",
    mode: "localized-link",
    exactPaths: ["/"],
    safeQueryKeys: ["kind"],
    preserveClientFragment: true,
  },
  {
    id: "public-feed",
    mode: "localized-link",
    exactPaths: ["/feed"],
    safeQueryKeys: ["source", "kind"],
    preserveClientFragment: true,
  },
  {
    id: "public-object-directory",
    mode: "localized-link",
    exactPaths: ["/objects"],
    safeQueryKeys: ["kind", "identity", "page"],
    preserveClientFragment: true,
  },
  {
    id: "public-journal-directory",
    mode: "localized-link",
    exactPaths: ["/journals"],
    safeQueryKeys: ["kind", "season", "sort", "page"],
    preserveClientFragment: true,
  },
  {
    id: "public-knowledge-directory",
    mode: "localized-link",
    exactPaths: ["/knowledge"],
    safeQueryKeys: ["type", "kind"],
    preserveClientFragment: true,
  },
  {
    id: "public-social-directories",
    mode: "localized-link",
    exactPaths: ["/bookmarks", "/wishlist"],
    safeQueryKeys: ["kind", "page", "engagement"],
    preserveClientFragment: true,
  },
  {
    id: "public-notifications",
    mode: "localized-link",
    exactPaths: ["/notifications"],
    safeQueryKeys: ["filter", "unread", "view", "engagement"],
    preserveClientFragment: true,
  },
  {
    id: "public-communities-directory",
    mode: "localized-link",
    exactPaths: ["/communities"],
    safeQueryKeys: ["kind"],
    preserveClientFragment: true,
  },
  {
    id: "public-legal-and-editorial-index",
    mode: "localized-link",
    exactPaths: ["/privacy", "/first-publication-disclosure", "/blog"],
    safeQueryKeys: NO_QUERY_KEYS,
    preserveClientFragment: true,
  },
  {
    id: "public-community-detail",
    mode: "localized-link",
    prefixes: ["/communities/"],
    safeQueryKeys: ["kind", "communityAction", "authIntent"],
    preserveClientFragment: true,
  },
  {
    id: "public-topic-detail",
    mode: "localized-link",
    prefixes: ["/topics/"],
    safeQueryKeys: ["authIntent"],
    preserveClientFragment: true,
  },
  {
    id: "public-journal-detail",
    mode: "localized-link",
    prefixes: ["/journal/"],
    safeQueryKeys: ["from", "engagement", "authIntent"],
    preserveClientFragment: true,
  },
  {
    id: "public-authored-detail",
    mode: "localized-link",
    prefixes: ["/blog/", "/guides/", "/answers/"],
    safeQueryKeys: NO_QUERY_KEYS,
    preserveClientFragment: true,
  },
  {
    id: "public-profile",
    mode: "localized-link",
    prefixes: ["/@", "/%40"],
    safeQueryKeys: ["profileAction", "authIntent"],
    preserveClientFragment: true,
  },
] as const satisfies readonly InterfaceRoutePolicy[];

const DEFAULT_RENDERED_ROUTE_POLICY = {
  id: "canonical-unprefixed-product-route",
  mode: "same-path-preference",
  safeQueryKeys: NO_QUERY_KEYS,
  preserveClientFragment: true,
} as const satisfies InterfaceRoutePolicy;

const GENERIC_PREFIXED_RENDERED_ROUTE_POLICY = {
  id: "generic-prefixed-rendered-not-found",
  mode: "localized-link",
  safeQueryKeys: NO_QUERY_KEYS,
  preserveClientFragment: true,
} as const satisfies InterfaceRoutePolicy;

export function getInterfaceRoutePolicy(
  pathname: string,
): InterfaceRoutePolicy {
  const directPath = normalizePath(pathname);
  const directNonUiPolicy = INTERFACE_ROUTE_POLICIES.find(
    (policy) =>
      policy.mode === "non-ui" && matchesPolicyPath(policy, directPath),
  );
  if (directNonUiPolicy) return directNonUiPolicy;

  const strippedPath = stripLocalePrefix(pathname);
  const basePath = normalizePath(strippedPath.path);
  const matchedPolicy = INTERFACE_ROUTE_POLICIES.find(
    (policy) => policy.mode !== "non-ui" && matchesPolicyPath(policy, basePath),
  );

  if (matchedPolicy) return matchedPolicy;
  if (strippedPath.locale === "bg" || strippedPath.locale === "ru") {
    return GENERIC_PREFIXED_RENDERED_ROUTE_POLICY;
  }

  return DEFAULT_RENDERED_ROUTE_POLICY;
}

/**
 * One placement authority for the React-owned interface language control.
 * Raw lifecycle documents remain outside this rendered-route policy.
 */
export function getInterfaceLanguageControlPlacement(
  pathname: string,
): InterfaceLanguageControlPlacement {
  const basePath = normalizeBasePath(pathname);
  if (getInterfaceRoutePolicy(pathname).mode === "non-ui") return "none";
  if (
    INTERFACE_UTILITY_CONTROL_PREFIXES.some(
      (prefix) => basePath === prefix || basePath.startsWith(`${prefix}/`),
    )
  ) {
    return "utility";
  }
  return "site-shell";
}

export function isSessionConvergenceSafeExitRoute(pathname: string) {
  const basePath = normalizeBasePath(pathname);
  return SESSION_CONVERGENCE_SAFE_EXIT_PATHS.some(
    (safeExitPath) => basePath === safeExitPath,
  );
}

/**
 * OVE-286 admits only the existing-entry editor whose complete owner-data
 * effect closure already passes OVE-290 generation admission. OVE-291 owns
 * every later expansion, so this matcher intentionally has no prefix mode.
 */
export function getSessionRecheckMode(pathname: string): SessionRecheckMode {
  const match = pathname.match(/^\/garden\/entries\/([^/]+)\/edit$/);
  return match?.[1] && UUID_PATH_SEGMENT.test(match[1])
    ? "effect_closed_non_fencing"
    : "compatibility_fenced";
}

export function sanitizeInterfaceRouteSearch(
  pathname: string,
  search: InterfaceRouteSearchInput,
  targetLocale?: PublicLocale,
) {
  const policy = getInterfaceRoutePolicy(pathname);
  if (policy.safeQueryKeys.length === 0 || !search) return "";

  const allowedKeys = new Set(policy.safeQueryKeys);
  const input = toSearchParams(search);
  const output = new URLSearchParams();
  const seenKeys = new Set<string>();
  let acceptedEntries = 0;

  for (const [key, value] of input.entries()) {
    if (acceptedEntries >= MAX_QUERY_ENTRIES) break;
    if (!allowedKeys.has(key) || seenKeys.has(key)) continue;
    if (
      value.length > MAX_QUERY_VALUE_LENGTH ||
      UNSAFE_QUERY_VALUE.test(value)
    ) {
      continue;
    }

    const safeValue = sanitizeInterfaceRouteQueryValue(
      pathname,
      key,
      value,
      targetLocale,
    );
    if (safeValue === null) continue;

    output.set(key, safeValue);
    if (output.toString().length > MAX_QUERY_LENGTH) {
      output.delete(key);
      break;
    }
    seenKeys.add(key);
    acceptedEntries += 1;
  }

  const serialized = output.toString();
  return serialized ? `?${serialized}` : "";
}

export function sanitizeInterfaceRouteFragment(
  pathname: string,
  fragment: string | null | undefined,
) {
  const policy = getInterfaceRoutePolicy(pathname);
  if (!policy.preserveClientFragment || !fragment) return "";

  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return SAFE_FRAGMENT.test(value) ? `#${value}` : "";
}

export function buildLocalizedInterfaceTarget(input: {
  locale: PublicLocale;
  pathname: string;
  search?: InterfaceRouteSearchInput;
  fragment?: string | null;
}): string | null {
  const policy = getInterfaceRoutePolicy(input.pathname);
  const basePath = normalizeBasePath(input.pathname);
  if (policy.mode !== "localized-link") return null;
  if (localizedPathMayCarryPrivateState(policy, basePath)) {
    return localizedPath(input.locale, "/");
  }

  return `${localizedPath(
    input.locale,
    basePath,
  )}${sanitizeInterfaceRouteSearch(
    input.pathname,
    input.search,
    input.locale,
  )}${sanitizeInterfaceRouteFragment(input.pathname, input.fragment)}`;
}

function matchesPolicyPath(policy: InterfaceRoutePolicy, pathname: string) {
  return (
    policy.exactPaths?.includes(pathname) ||
    policy.prefixes?.some((prefix) => matchesPolicyPrefix(prefix, pathname)) ||
    false
  );
}

function matchesPolicyPrefix(prefix: string, pathname: string) {
  if (prefix === "/@" || prefix === "/%40") {
    return pathname.startsWith(prefix);
  }

  const base = prefix.replace(/\/$/, "");
  return pathname === base || pathname.startsWith(`${base}/`);
}

function normalizeBasePath(pathname: string) {
  const { path } = stripLocalePrefix(pathname);
  return normalizePath(path);
}

function normalizePath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function toSearchParams(search: InterfaceRouteSearchInput) {
  if (typeof search === "string") {
    return new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
  }

  const params = new URLSearchParams();
  if (!search) return params;
  for (const [key, value] of search.entries()) params.append(key, value);
  return params;
}

function sanitizeInterfaceRouteQueryValue(
  pathname: string,
  key: string,
  value: string,
  targetLocale?: PublicLocale,
) {
  switch (key) {
    case "kind": {
      const basePath = normalizeBasePath(pathname);
      const allowedKinds =
        basePath === "/bookmarks"
          ? PUBLIC_BOOKMARK_KINDS
          : basePath === "/wishlist"
            ? PUBLIC_WISHLIST_KINDS
            : PUBLIC_OBJECT_KINDS;
      return allowedKinds.has(value) ? value : null;
    }
    case "identity":
      return PUBLIC_OBJECT_IDENTITIES.has(value) ? value : null;
    case "source":
      return PUBLIC_FEED_SOURCES.has(value) ? value : null;
    case "season":
      return PUBLIC_JOURNAL_SEASONS.has(value) ? value : null;
    case "sort":
      return PUBLIC_JOURNAL_SORTS.has(value) ? value : null;
    case "type":
      return PUBLIC_KNOWLEDGE_TYPES.has(value) ? value : null;
    case "page": {
      if (!/^[1-9][0-9]{0,3}$/.test(value)) return null;
      const page = Number(value);
      return page <= 1_000 ? String(page) : null;
    }
    case "authIntent":
      return AUTH_INTENT_ACTION_SET.has(value) ? value : null;
    case "profileAction":
      return PROFILE_ACTIONS.has(value) ? value : null;
    case "communityAction":
      return COMMUNITY_ACTIONS.has(value) ? value : null;
    case "engagement":
      return ENGAGEMENT_STATUSES.has(value) ? value : null;
    case "filter":
      return NOTIFICATION_FILTERS.has(value) ? value : null;
    case "unread":
      return value === "1" ? value : null;
    case "view":
      return value === "grouped" || value === "individual" ? value : null;
    case "from":
      return sanitizePublicJournalDirectoryReturnTo(value, targetLocale);
    default:
      return null;
  }
}

function sanitizePublicJournalDirectoryReturnTo(
  value: string,
  targetLocale?: PublicLocale,
) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return null;
  }

  try {
    const url = new URL(value, "https://over.garden");
    if (
      url.origin !== "https://over.garden" ||
      !/^\/(?:bg\/|ru\/)?journals$/.test(url.pathname) ||
      url.hash
    ) {
      return null;
    }

    const search = sanitizeInterfaceRouteSearch("/journals", url.searchParams);
    const pathname = targetLocale
      ? localizedPath(targetLocale, "/journals")
      : url.pathname;
    return `${pathname}${search}`;
  } catch {
    return null;
  }
}

/**
 * A generic prefixed route is already a not-found document, so copying an
 * opaque or credential-shaped segment to another locale has no continuity
 * value. Unknown routes accept only ordinary decoded segments. Known public
 * detail routes instead apply their slug/handle shape before rejecting opaque
 * secret-shaped values, so semantic slugs remain localizable while a token
 * disguised as a dynamic public segment still converges to the target-locale
 * root.
 */
function localizedPathMayCarryPrivateState(
  policy: InterfaceRoutePolicy,
  pathname: string,
) {
  if (policy.id === GENERIC_PREFIXED_RENDERED_ROUTE_POLICY.id) {
    return genericRenderedPathMayCarryPrivateState(pathname);
  }

  const dynamicSegment = knownPublicDynamicSegment(policy.id, pathname);
  if (dynamicSegment === null) return false;

  if (ENCODED_PRIVATE_PATH_DELIMITER.test(dynamicSegment)) return true;
  const decodedSegment = decodePathSegment(dynamicSegment);
  if (decodedSegment === null) return true;

  if (policy.id === "public-profile") {
    return !PUBLIC_PROFILE_HANDLE.test(decodedSegment);
  }

  return (
    decodedSegment.length > 160 ||
    !PUBLIC_SEMANTIC_SLUG.test(decodedSegment) ||
    UUID_PATH_SEGMENT.test(decodedSegment) ||
    EXPLICIT_PRIVATE_VALUE_SEGMENT.test(decodedSegment) ||
    LONG_HEX_PATH_SEGMENT.test(decodedSegment) ||
    DOT_TOKEN_PATH_SEGMENT.test(decodedSegment) ||
    (TOKEN_LIKE_PATH_SEGMENT.test(decodedSegment) &&
      !decodedSegment.includes("-") &&
      /[A-Za-z]/.test(decodedSegment) &&
      /[0-9]/.test(decodedSegment))
  );
}

function knownPublicDynamicSegment(policyId: string, pathname: string) {
  const prefixes =
    policyId === "public-journal-detail"
      ? ["/journal/"]
      : policyId === "public-community-detail"
        ? ["/communities/"]
        : policyId === "public-topic-detail"
          ? ["/topics/"]
          : policyId === "public-authored-detail"
            ? ["/blog/", "/guides/", "/answers/"]
            : policyId === "public-profile"
              ? ["/@", "/%40"]
              : null;
  if (!prefixes) return null;

  const prefix = prefixes.find((candidate) => pathname.startsWith(candidate));
  if (!prefix) return "";
  const segment = pathname.slice(prefix.length);
  return segment.includes("/") ? "" : segment;
}

function genericRenderedPathMayCarryPrivateState(pathname: string) {
  if (pathname.length > 512 || ENCODED_PATH_OCTET.test(pathname)) {
    return true;
  }

  for (const rawSegment of pathname.split("/").filter(Boolean)) {
    if (rawSegment.length > 160) return true;

    const segment = decodePathSegment(rawSegment);
    if (segment === null) return true;

    if (
      UNSAFE_QUERY_VALUE.test(segment) ||
      /[\\/?#:=@&]/.test(segment) ||
      UUID_PATH_SEGMENT.test(segment) ||
      PRIVATE_PATH_SEGMENT_MARKER.test(segment) ||
      LONG_HEX_PATH_SEGMENT.test(segment) ||
      DOT_TOKEN_PATH_SEGMENT.test(segment) ||
      TOKEN_LIKE_PATH_SEGMENT.test(segment)
    ) {
      return true;
    }
  }

  return false;
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

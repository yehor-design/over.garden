import "server-only";

import {
  DEFAULT_PUBLIC_LOCALE,
  stripLocalePrefix,
  type PublicLocale,
} from "@/lib/public-localization";

export type PublicSurfaceKind =
  | "marketing_landing"
  | "knowledge_hub"
  | "public_feed"
  | "catalog_browse"
  | "editorial_blog"
  | "guide"
  | "aeo_answer"
  | "journal_entry"
  | "variety_aggregation"
  | "topic_aggregation"
  | "object_passport"
  | "profile"
  | "community"
  | "lineage_graph"
  | "missing";

export type NonDiscoveryRouteKind = "workspace" | "auth" | "operator";
export type PublicSurfaceIndexValue = "noindex" | "indexable";
export type PublicSurfaceCandidateState =
  | "candidate"
  | "not_public_candidate"
  | "candidate_input_unresolved";

/**
 * ADR-0022, D3: every live public page is indexable. The only refusals are a
 * page that is not a public candidate (workspace, auth, operator, a record
 * that is gone), a listing with nothing on it, a load that could not resolve
 * the page at all, or a canonical path that does not match the locale.
 */
export type PublicSurfaceIndexReason =
  | "not_public_candidate"
  | "empty_listing"
  | "candidate_input_unresolved"
  | "non_equivalent_locale"
  | "workspace_route_noindex"
  | "auth_route_noindex"
  | "operator_route_noindex";

export interface PublicSurfaceCandidateInput {
  candidateState: PublicSurfaceCandidateState;
  /** False only for a listing that currently shows nothing. */
  hasContent: boolean | null;
  canonicalPath: string | null;
  equivalentLocales: readonly PublicLocale[] | null;
  surfaceKind: PublicSurfaceKind;
}

export interface PublicSurfaceIndexState {
  value: PublicSurfaceIndexValue;
  isIndexable: boolean;
  sitemapEligible: boolean;
  robots: {
    index: boolean;
    follow: boolean;
  };
  reasons: PublicSurfaceIndexReason[];
}

export const AUTHORED_PUBLIC_SURFACE_LASTMOD = "2026-07-03T00:00:00.000Z";

const VALID_LOCALES = new Set<PublicLocale>(["uk", "bg", "ru"]);

export function evaluatePublicSurfaceIndexability(
  input: PublicSurfaceCandidateInput,
): PublicSurfaceIndexState {
  if (input.candidateState === "not_public_candidate") {
    return noindex(["not_public_candidate"]);
  }
  if (
    input.candidateState === "candidate_input_unresolved" ||
    typeof input.hasContent !== "boolean" ||
    !isCanonicalPath(input.canonicalPath) ||
    !isEquivalentLocaleList(input.equivalentLocales)
  ) {
    return noindex(["candidate_input_unresolved"]);
  }

  const reasons: PublicSurfaceIndexReason[] = [];
  const canonicalLocale =
    stripLocalePrefix(input.canonicalPath).locale ?? DEFAULT_PUBLIC_LOCALE;
  if (
    input.equivalentLocales.length > 0 &&
    !input.equivalentLocales.includes(canonicalLocale)
  ) {
    reasons.push("non_equivalent_locale");
  }
  if (!input.hasContent) {
    reasons.push("empty_listing");
  }

  return reasons.length === 0 ? indexable() : noindex(reasons);
}

export function evaluateNonDiscoveryRouteIndexability(
  kind: NonDiscoveryRouteKind,
): PublicSurfaceIndexState {
  switch (kind) {
    case "workspace":
      return noindex(["workspace_route_noindex"]);
    case "auth":
      return noindex(["auth_route_noindex"]);
    case "operator":
      return noindex(["operator_route_noindex"]);
  }
}

export function formatRobotsMetaContent(state: PublicSurfaceIndexState) {
  return state.isIndexable ? "index, follow" : "noindex, nofollow";
}

function isCanonicalPath(value: string | null): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    value.trim() === value &&
    !value.includes("?") &&
    !value.includes("#")
  );
}

function isEquivalentLocaleList(
  value: readonly PublicLocale[] | null,
): value is readonly PublicLocale[] {
  return (
    Array.isArray(value) &&
    value.every((locale) => VALID_LOCALES.has(locale)) &&
    new Set(value).size === value.length
  );
}

function indexable(): PublicSurfaceIndexState {
  return {
    value: "indexable",
    isIndexable: true,
    sitemapEligible: true,
    robots: { index: true, follow: true },
    reasons: [],
  };
}

function noindex(
  reasons: readonly PublicSurfaceIndexReason[],
): PublicSurfaceIndexState {
  return {
    value: "noindex",
    isIndexable: false,
    sitemapEligible: false,
    robots: { index: false, follow: false },
    reasons: [...reasons],
  };
}

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
 * the page at all, a canonical path that does not match the locale, or a
 * species page that is not published (`OVE-519`): it is reachable but
 * `noindex` while no public entry is about it or one of its forms.
 */
export type PublicSurfaceIndexReason =
  | "not_public_candidate"
  | "empty_listing"
  | "candidate_input_unresolved"
  | "non_equivalent_locale"
  | "organism_unpublished"
  | "workspace_route_noindex"
  | "auth_route_noindex"
  | "operator_route_noindex";

export interface PublicSurfaceCandidateInput {
  candidateState: PublicSurfaceCandidateState;
  /** False only for a listing that currently shows nothing. */
  hasContent: boolean | null;
  canonicalPath: string | null;
  /**
   * The locale of the route family the request was served from, when the
   * surface knows it. A page served under a prefix its canonical does not carry
   * is a duplicate of the canonical — but only where that prefix is an
   * *address*. Since OVE-460 an unprefixed canonical renders from the reader's
   * locale subtree at its own URL, so for a surface with no translated
   * addresses the served locale says which language the reader asked for and
   * nothing about duplication.
   */
  servedLocale?: PublicLocale | null;
  equivalentLocales: readonly PublicLocale[] | null;
  surfaceKind: PublicSurfaceKind;
  /**
   * Species pages only: the publication rule (`catalog-publication.ts`,
   * `OVE-519`) — true while a public entry is about the organism or one of
   * its forms; null for every other surface.
   */
  published?: boolean | null;
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
  // Only where the surface has a locale-paired address to be a duplicate of.
  // A surface that is never translated — a gardener's entry — has one address,
  // unprefixed, and since OVE-460 the locale subtree it renders from is the
  // reader's language rather than a second spelling of the page: the prefixed
  // spelling still 308s here. Comparing the two unconditionally made every
  // entry `noindex, nofollow` for anyone whose language was not the default,
  // measured on production within minutes of the deploy.
  if (
    input.servedLocale &&
    input.servedLocale !== canonicalLocale &&
    input.equivalentLocales.length > 0
  ) {
    reasons.push("non_equivalent_locale");
  }
  if (!input.hasContent) {
    reasons.push("empty_listing");
  }
  if (
    input.surfaceKind === "variety_aggregation" &&
    input.published === false
  ) {
    reasons.push("organism_unpublished");
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

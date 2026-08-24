import "server-only";

import type { PublicProjectionQualityClass } from "@/lib/public-projection-quality";
import {
  DEFAULT_PUBLIC_LOCALE,
  stripLocalePrefix,
  type PublicLocale,
} from "@/lib/public-localization";

export const PUBLIC_SURFACE_INDEXABILITY_THRESHOLD = {
  minimumQualityClass: "partial",
  minimumWordCount: 120,
  minimumDistinctEntities: 1,
  maximumStalenessDays: 540,
} as const;

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

export type PublicSurfaceIndexReason =
  | "not_public_candidate"
  | "quality_class_below_threshold"
  | "word_count_below_threshold"
  | "distinct_entity_count_below_threshold"
  | "surface_stale"
  | "candidate_input_unresolved"
  | "non_equivalent_locale"
  | "workspace_route_noindex"
  | "auth_route_noindex"
  | "operator_route_noindex";

export interface PublicSurfaceCandidateInput {
  candidateState: PublicSurfaceCandidateState;
  qualityClass: PublicProjectionQualityClass | null;
  visibleWordCount: number | null;
  distinctPublicEntityIds: readonly string[] | null;
  meaningfulContentAt: string | null;
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
  threshold: typeof PUBLIC_SURFACE_INDEXABILITY_THRESHOLD;
}

export interface PublicSurfaceEvaluationOptions {
  evaluatedAt: string | Date;
}

export const AUTHORED_PUBLIC_SURFACE_LASTMOD = "2026-07-03T00:00:00.000Z";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
const QUALITY_RANK: Record<PublicProjectionQualityClass, number> = {
  unverified: 0,
  partial: 1,
  verified: 2,
};
const VALID_LOCALES = new Set<PublicLocale>(["uk", "bg", "ru"]);

export function evaluatePublicSurfaceIndexability(
  input: PublicSurfaceCandidateInput,
  options: PublicSurfaceEvaluationOptions,
): PublicSurfaceIndexState {
  if (input.candidateState === "not_public_candidate") {
    return noindex(["not_public_candidate"]);
  }
  if (input.candidateState === "candidate_input_unresolved") {
    return noindex(["candidate_input_unresolved"]);
  }

  const evaluatedAt = toValidDate(options.evaluatedAt);
  const meaningfulContentAt = toValidDate(input.meaningfulContentAt);
  if (
    !evaluatedAt ||
    !meaningfulContentAt ||
    meaningfulContentAt.getTime() > evaluatedAt.getTime() ||
    !isQualityClass(input.qualityClass) ||
    !isFiniteNonNegativeInteger(input.visibleWordCount) ||
    !isEntityIdList(input.distinctPublicEntityIds) ||
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
  if (
    QUALITY_RANK[input.qualityClass] <
    QUALITY_RANK[PUBLIC_SURFACE_INDEXABILITY_THRESHOLD.minimumQualityClass]
  ) {
    reasons.push("quality_class_below_threshold");
  }
  if (
    input.visibleWordCount <
    PUBLIC_SURFACE_INDEXABILITY_THRESHOLD.minimumWordCount
  ) {
    reasons.push("word_count_below_threshold");
  }
  if (
    new Set(input.distinctPublicEntityIds).size <
    PUBLIC_SURFACE_INDEXABILITY_THRESHOLD.minimumDistinctEntities
  ) {
    reasons.push("distinct_entity_count_below_threshold");
  }

  const stalenessDays =
    (evaluatedAt.getTime() - meaningfulContentAt.getTime()) /
    MILLISECONDS_PER_DAY;
  if (
    stalenessDays > PUBLIC_SURFACE_INDEXABILITY_THRESHOLD.maximumStalenessDays
  ) {
    reasons.push("surface_stale");
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

function isQualityClass(
  value: PublicProjectionQualityClass | null,
): value is PublicProjectionQualityClass {
  return value === "verified" || value === "partial" || value === "unverified";
}

function isFiniteNonNegativeInteger(value: number | null): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function isEntityIdList(
  value: readonly string[] | null,
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((entityId) =>
      typeof entityId === "string" ? entityId.trim().length > 0 : false,
    )
  );
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

function toValidDate(value: string | Date | null) {
  if (value === null) return null;
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function indexable(): PublicSurfaceIndexState {
  return {
    value: "indexable",
    isIndexable: true,
    sitemapEligible: true,
    robots: { index: true, follow: true },
    reasons: [],
    threshold: PUBLIC_SURFACE_INDEXABILITY_THRESHOLD,
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
    threshold: PUBLIC_SURFACE_INDEXABILITY_THRESHOLD,
  };
}

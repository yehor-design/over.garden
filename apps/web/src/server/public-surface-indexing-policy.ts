import "server-only";

export const PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD = {
  minPublicEntryCount: 3,
  minAggregateBodyLength: 600,
  trustedSeededCatalogSources: [
    "ua_state_register",
    "species_backbone",
    "ua_official_bee_breed",
    "vertebrate_breed_ontology",
    "eu_common_catalogue_bg",
    "eu_oj_eur_lex_common_catalogue",
  ],
} as const;

export type PublicSurfaceKind =
  | "marketing_landing"
  | "public_feed"
  | "editorial_blog"
  | "guide"
  | "aeo_answer"
  | "journal_entry"
  | "variety_aggregation"
  | "topic_aggregation"
  | "object_passport"
  | "profile"
  | "lineage_graph"
  | "missing";

export type NonDiscoveryRouteKind = "workspace" | "auth" | "operator";

export type PublicSurfaceIndexValue = "noindex" | "indexable";

export type PublicSurfaceIndexReason =
  | "authored_useful_surface"
  | "public_feed_noindex"
  | "workspace_route_noindex"
  | "auth_route_noindex"
  | "operator_route_noindex"
  | "journal_marked_noindex"
  | "entry_count_below_threshold"
  | "body_length_below_threshold"
  | "catalog_trust_below_threshold"
  | "topic_trust_below_threshold"
  | "object_passport_noindex"
  | "public_profile_noindex"
  | "lineage_graph_noindex"
  | "missing_public_surface";

export type PublicAggregationCatalogStatus = "seeded" | "confirmed";
export type PublicTopicTrustState = "curated" | "untrusted";

export interface PublicSurfaceIndexState {
  value: PublicSurfaceIndexValue;
  isIndexable: boolean;
  sitemapEligible: boolean;
  robots: {
    index: boolean;
    follow: boolean;
  };
  reasons: PublicSurfaceIndexReason[];
  threshold: typeof PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD;
}

export type PublicSurfaceIndexInput =
  | {
      kind: Extract<
        PublicSurfaceKind,
        "marketing_landing" | "editorial_blog" | "guide" | "aeo_answer"
      >;
    }
  | {
      kind: "journal_entry";
      publicNoindex: boolean;
    }
  | {
      kind: "variety_aggregation";
      entryCount: number;
      aggregateBodyLength: number;
      catalogStatus: PublicAggregationCatalogStatus | string;
      catalogSource: string;
    }
  | {
      kind: "topic_aggregation";
      entryCount: number;
      aggregateBodyLength: number;
      topicTrust: PublicTopicTrustState;
    }
  | {
      kind:
        | "public_feed"
        | "object_passport"
        | "profile"
        | "lineage_graph"
        | "missing";
    };

export interface StaticIndexablePublicSurface {
  kind: Extract<
    PublicSurfaceKind,
    "marketing_landing" | "editorial_blog" | "guide" | "aeo_answer"
  >;
  path: string;
  lastModified: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}

export const AUTHORED_PUBLIC_SURFACE_LASTMOD = "2026-07-03T00:00:00.000Z";

const STATIC_PUBLIC_SURFACES: StaticIndexablePublicSurface[] = [];

export function evaluatePublicSurfaceIndexability(
  input: PublicSurfaceIndexInput,
): PublicSurfaceIndexState {
  switch (input.kind) {
    case "marketing_landing":
    case "editorial_blog":
    case "guide":
    case "aeo_answer":
      return indexable(["authored_useful_surface"]);

    case "public_feed":
      return noindex(["public_feed_noindex"]);

    case "journal_entry":
      return input.publicNoindex
        ? noindex(["journal_marked_noindex"])
        : indexable([]);

    case "variety_aggregation":
      return evaluateVarietyAggregationIndexability(input);

    case "topic_aggregation":
      return evaluateTopicAggregationIndexability(input);

    case "object_passport":
      return noindex(["object_passport_noindex"]);

    case "profile":
      return noindex(["public_profile_noindex"]);

    case "lineage_graph":
      return noindex(["lineage_graph_noindex"]);

    case "missing":
      return noindex(["missing_public_surface"]);
  }
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

export function listStaticIndexablePublicSurfaces() {
  return STATIC_PUBLIC_SURFACES.filter(
    (surface) =>
      evaluatePublicSurfaceIndexability({ kind: surface.kind }).sitemapEligible,
  );
}

export function formatRobotsMetaContent(state: PublicSurfaceIndexState) {
  return state.isIndexable ? "index, follow" : "noindex, nofollow";
}

export function isTrustedPublicAggregationCatalogSource(input: {
  catalogStatus: PublicAggregationCatalogStatus | string;
  catalogSource: string;
}) {
  if (input.catalogStatus === "confirmed") return true;

  return (
    input.catalogStatus === "seeded" &&
    (
      PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.trustedSeededCatalogSources as readonly string[]
    ).includes(input.catalogSource)
  );
}

function evaluateVarietyAggregationIndexability(input: {
  entryCount: number;
  aggregateBodyLength: number;
  catalogStatus: PublicAggregationCatalogStatus | string;
  catalogSource: string;
}): PublicSurfaceIndexState {
  const reasons = publicAggregationContentReasons(input);

  if (!isTrustedPublicAggregationCatalogSource(input)) {
    reasons.push("catalog_trust_below_threshold");
  }

  return reasons.length === 0 ? indexable([]) : noindex(reasons);
}

function evaluateTopicAggregationIndexability(input: {
  entryCount: number;
  aggregateBodyLength: number;
  topicTrust: PublicTopicTrustState;
}): PublicSurfaceIndexState {
  const reasons = publicAggregationContentReasons(input);

  if (input.topicTrust !== "curated") {
    reasons.push("topic_trust_below_threshold");
  }

  return reasons.length === 0 ? indexable([]) : noindex(reasons);
}

function publicAggregationContentReasons(input: {
  entryCount: number;
  aggregateBodyLength: number;
}) {
  const reasons: PublicSurfaceIndexReason[] = [];

  if (
    input.entryCount <
    PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minPublicEntryCount
  ) {
    reasons.push("entry_count_below_threshold");
  }

  if (
    input.aggregateBodyLength <
    PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minAggregateBodyLength
  ) {
    reasons.push("body_length_below_threshold");
  }

  return reasons;
}

function indexable(
  reasons: PublicSurfaceIndexReason[],
): PublicSurfaceIndexState {
  return {
    value: "indexable",
    isIndexable: true,
    sitemapEligible: true,
    robots: {
      index: true,
      follow: true,
    },
    reasons,
    threshold: PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD,
  };
}

function noindex(reasons: PublicSurfaceIndexReason[]): PublicSurfaceIndexState {
  return {
    value: "noindex",
    isIndexable: false,
    sitemapEligible: false,
    robots: {
      index: false,
      follow: false,
    },
    reasons,
    threshold: PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD,
  };
}

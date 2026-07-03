import "server-only";

import { PUBLIC_LOCALES, localizedPath } from "@/lib/public-localization";

export const PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD = {
  minPublicEntryCount: 3,
  minAggregateBodyLength: 600,
} as const;

export type PublicSurfaceKind =
  | "marketing_landing"
  | "editorial_blog"
  | "guide"
  | "aeo_answer"
  | "journal_entry"
  | "variety_aggregation"
  | "topic_aggregation"
  | "profile"
  | "lineage_graph"
  | "missing";

export type PublicSurfaceIndexValue = "noindex" | "indexable";

export type PublicSurfaceIndexReason =
  | "authored_useful_surface"
  | "journal_marked_noindex"
  | "entry_count_below_threshold"
  | "body_length_below_threshold"
  | "public_profile_noindex"
  | "lineage_graph_noindex"
  | "missing_public_surface";

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
      kind: "variety_aggregation" | "topic_aggregation";
      entryCount: number;
      aggregateBodyLength: number;
    }
  | {
      kind: "profile" | "lineage_graph" | "missing";
    };

export interface StaticIndexablePublicSurface {
  kind: Extract<
    PublicSurfaceKind,
    "marketing_landing" | "editorial_blog" | "guide" | "aeo_answer"
  >;
  path: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}

const STATIC_PUBLIC_SURFACES: StaticIndexablePublicSurface[] = [
  ...PUBLIC_LOCALES.map(
    (locale): StaticIndexablePublicSurface => ({
      kind: "marketing_landing",
      path: localizedPath(locale, "/"),
      changeFrequency: "weekly",
      priority: 0.8,
    }),
  ),
];

export function evaluatePublicSurfaceIndexability(
  input: PublicSurfaceIndexInput,
): PublicSurfaceIndexState {
  switch (input.kind) {
    case "marketing_landing":
    case "editorial_blog":
    case "guide":
    case "aeo_answer":
      return indexable(["authored_useful_surface"]);

    case "journal_entry":
      return input.publicNoindex
        ? noindex(["journal_marked_noindex"])
        : indexable([]);

    case "variety_aggregation":
    case "topic_aggregation":
      return evaluateAggregationIndexability(input);

    case "profile":
      return noindex(["public_profile_noindex"]);

    case "lineage_graph":
      return noindex(["lineage_graph_noindex"]);

    case "missing":
      return noindex(["missing_public_surface"]);
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

function evaluateAggregationIndexability(input: {
  entryCount: number;
  aggregateBodyLength: number;
}): PublicSurfaceIndexState {
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

  return reasons.length === 0 ? indexable([]) : noindex(reasons);
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

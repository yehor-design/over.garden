import "server-only";

import type { PublicProjectionQualityClass } from "@/lib/public-projection-quality";
import type { PublicLocale } from "@/lib/public-localization";
import {
  evaluatePublicSurfaceIndexability,
  type PublicSurfaceCandidateInput,
  type PublicSurfaceCandidateState,
  type PublicSurfaceIndexState,
  type PublicSurfaceKind,
} from "@/server/public-surface-indexing-policy";

export const PUBLIC_SURFACE_DISCOVERY_INVENTORY = [
  inventory(
    "localized_home",
    "public_feed",
    "candidate",
    "src/app/[locale]/page.tsx",
  ),
  inventory(
    "localized_journals_directory",
    "public_feed",
    "candidate",
    "src/app/[locale]/journals/page.tsx",
  ),
  inventory(
    "localized_journal_entry",
    "journal_entry",
    "candidate",
    "src/app/[locale]/journal/[slug]/page.tsx",
  ),
  inventory(
    "localized_profile",
    "profile",
    "candidate",
    "src/app/[locale]/[profileHandle]/page.tsx",
  ),
  inventory(
    "localized_blog_index",
    "editorial_blog",
    "candidate",
    "src/app/[locale]/blog/page.tsx",
  ),
  inventory(
    "localized_blog_post",
    "editorial_blog",
    "candidate",
    "src/app/[locale]/blog/[slug]/page.tsx",
  ),
  inventory(
    "localized_guide",
    "guide",
    "candidate",
    "src/app/[locale]/guides/[slug]/page.tsx",
  ),
  inventory(
    "localized_answer",
    "aeo_answer",
    "candidate",
    "src/app/[locale]/answers/[slug]/page.tsx",
  ),
  inventory(
    "localized_knowledge_hub",
    "knowledge_hub",
    "candidate",
    "src/app/[locale]/knowledge/page.tsx",
  ),
  inventory(
    "localized_market",
    "marketing_landing",
    "candidate",
    "src/app/[locale]/markets/[market]/page.tsx",
  ),
  inventory(
    "localized_catalog_browse",
    "catalog_browse",
    "candidate",
    "src/app/[locale]/objects/page.tsx",
  ),
  inventory(
    "stable_registry_catalog_browse",
    "catalog_browse",
    "candidate",
    "src/app/stable-registry-public-pages.tsx",
  ),
  inventory(
    "stable_registry_catalog_detail",
    "variety_aggregation",
    "candidate",
    "src/app/stable-registry-public-pages.tsx",
  ),
  inventory(
    "stable_registry_eppo_browse",
    "catalog_browse",
    "candidate",
    "src/app/stable-registry-public-pages.tsx",
  ),
  inventory(
    "stable_registry_eppo_detail",
    "variety_aggregation",
    "candidate",
    "src/app/stable-registry-public-pages.tsx",
  ),
  inventory(
    "localized_topic",
    "topic_aggregation",
    "candidate",
    "src/app/[locale]/topics/[slug]/page.tsx",
  ),
  inventory(
    "localized_community_directory",
    "community",
    "candidate",
    "src/app/[locale]/communities/page.tsx",
  ),
  inventory(
    "localized_community",
    "community",
    "candidate",
    "src/app/[locale]/communities/[slug]/page.tsx",
  ),
  inventory(
    "catalog_evidence",
    "variety_aggregation",
    "candidate",
    "src/server/public-variety-metadata.ts",
  ),
  inventory(
    "lineage_object",
    "object_passport",
    "candidate",
    "src/app/lineage/objects/[objectId]/page.tsx",
  ),
  inventory(
    "privacy",
    "missing",
    "non_candidate",
    "src/app/[locale]/privacy/page.tsx",
  ),
  inventory(
    "first_publication_disclosure",
    "missing",
    "non_candidate",
    "src/app/[locale]/first-publication-disclosure/page.tsx",
  ),
  inventory(
    "authored_sitemap",
    "knowledge_hub",
    "candidate",
    "src/server/public-localized-content.ts",
  ),
  inventory(
    "variety_sitemap",
    "variety_aggregation",
    "candidate",
    "src/server/public-variety-repository.ts",
  ),
  inventory(
    "topic_sitemap",
    "topic_aggregation",
    "candidate",
    "src/server/public-sitemap.ts",
  ),
  inventory(
    "public_variety_repository",
    "variety_aggregation",
    "candidate",
    "src/server/public-variety-repository.ts",
  ),
  inventory(
    "public_topic_repository",
    "topic_aggregation",
    "candidate",
    "src/server/public-topic-repository.ts",
  ),
] as const;

export type PublicSurfaceDiscoveryConsumerId =
  (typeof PUBLIC_SURFACE_DISCOVERY_INVENTORY)[number]["consumerId"];

export interface PublicSurfaceDiscoverySource {
  consumerId: PublicSurfaceDiscoveryConsumerId;
  candidateState: PublicSurfaceCandidateState;
  /** Text the page shows; a listing with none of it is an empty listing. */
  visibleText: readonly string[] | null;
  /** Entities the page lists; a listing with none of them is empty. */
  distinctPublicEntityIds: readonly string[] | null;
  canonicalPath: string | null;
  equivalentLocales: readonly PublicLocale[] | null;
}

export interface PublicSurfaceDiscoveryResult {
  consumerId: PublicSurfaceDiscoveryConsumerId;
  candidateInput: PublicSurfaceCandidateInput;
  decision: PublicSurfaceIndexState;
}

export interface PublicSurfaceDiscoveryPayloadResult<
  Payload,
> extends PublicSurfaceDiscoveryResult {
  payload: Payload | null;
}

export function resolvePublicSurfaceDiscovery(
  source: PublicSurfaceDiscoverySource,
): PublicSurfaceDiscoveryResult {
  const owner = inventoryOwner(source.consumerId);
  const candidateState =
    owner.candidateClass === "non_candidate"
      ? "not_public_candidate"
      : source.candidateState;
  const candidateInput: PublicSurfaceCandidateInput =
    candidateState === "candidate"
      ? {
          candidateState,
          hasContent: hasVisibleContent(source),
          canonicalPath: source.canonicalPath,
          equivalentLocales: normalizeLocales(source.equivalentLocales),
          surfaceKind: owner.surfaceKind,
        }
      : unresolvedCandidateInput(owner.surfaceKind, candidateState);

  return {
    consumerId: source.consumerId,
    candidateInput,
    decision: evaluatePublicSurfaceIndexability(candidateInput),
  };
}

export function resolvePublicSurfaceDiscoveryForRequest(
  source: PublicSurfaceDiscoverySource,
) {
  return resolvePublicSurfaceDiscovery(source);
}

export function resolveUnresolvedPublicSurfaceDiscovery(
  consumerId: PublicSurfaceDiscoveryConsumerId,
) {
  return unresolvedResult(consumerId);
}

export function resolveNonCandidatePublicSurfaceDiscovery(
  consumerId: PublicSurfaceDiscoveryConsumerId,
) {
  return resolvePublicSurfaceDiscovery({
    consumerId,
    candidateState: "not_public_candidate",
    visibleText: null,
    distinctPublicEntityIds: null,
    canonicalPath: null,
    equivalentLocales: null,
  });
}

/**
 * Loads the page's discovery source with no deadline (ADR-0022, D3): a slow
 * database never turns a live page into `noindex`. A load that fails leaves
 * the page unresolved, which is the only remaining `noindex` for a live route.
 */
export async function resolvePublicSurfaceDiscoveryFromLoad(input: {
  consumerId: PublicSurfaceDiscoveryConsumerId;
  loadSource: () => Promise<PublicSurfaceDiscoverySource>;
}): Promise<PublicSurfaceDiscoveryResult> {
  try {
    const source = await input.loadSource();
    if (source.consumerId !== input.consumerId) {
      return unresolvedResult(input.consumerId);
    }
    return resolvePublicSurfaceDiscovery(source);
  } catch {
    return unresolvedResult(input.consumerId);
  }
}

export async function resolvePublicSurfacePayload<Payload>(input: {
  consumerId: PublicSurfaceDiscoveryConsumerId;
  load: () => Promise<{
    source: PublicSurfaceDiscoverySource;
    payload: Payload;
  }>;
}): Promise<PublicSurfaceDiscoveryPayloadResult<Payload>> {
  try {
    const loaded = await input.load();
    if (loaded.source.consumerId !== input.consumerId) {
      return { ...unresolvedResult(input.consumerId), payload: null };
    }
    return {
      ...resolvePublicSurfaceDiscovery(loaded.source),
      payload: loaded.payload,
    };
  } catch {
    return { ...unresolvedResult(input.consumerId), payload: null };
  }
}

export function countMeaningfulVisibleWords(values: readonly string[] | null) {
  if (!values) return null;
  return values
    .join(" ")
    .trim()
    .split(/\s+/u)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

export function combinePublicProjectionQualityClasses(
  values: readonly (PublicProjectionQualityClass | null | undefined)[],
): PublicProjectionQualityClass {
  if (values.length === 0 || values.some((value) => value == null)) {
    return "unverified";
  }
  if (values.includes("unverified")) return "unverified";
  return values.includes("partial") ? "partial" : "verified";
}

export function latestMeaningfulContentTimestamp(
  values: readonly (Date | string | null | undefined)[],
) {
  const timestamps = values.flatMap((value) => {
    if (value == null) return [];
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? [date.getTime()] : [];
  });
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function hasVisibleContent(source: PublicSurfaceDiscoverySource) {
  const words = countMeaningfulVisibleWords(source.visibleText) ?? 0;
  const entities = normalizeEntityIds(source.distinctPublicEntityIds) ?? [];
  return words > 0 || entities.length > 0;
}

function normalizeEntityIds(value: readonly string[] | null) {
  if (!value) return null;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function normalizeLocales(value: readonly PublicLocale[] | null) {
  if (!value) return null;
  return [...new Set(value)];
}

function unresolvedResult(consumerId: PublicSurfaceDiscoveryConsumerId) {
  const owner = inventoryOwner(consumerId);
  const candidateInput = unresolvedCandidateInput(
    owner.surfaceKind,
    "candidate_input_unresolved",
  );
  return {
    consumerId,
    candidateInput,
    decision: evaluatePublicSurfaceIndexability(candidateInput),
  };
}

function unresolvedCandidateInput(
  surfaceKind: PublicSurfaceKind,
  candidateState: Exclude<PublicSurfaceCandidateState, "candidate">,
): PublicSurfaceCandidateInput {
  return {
    candidateState,
    hasContent: null,
    canonicalPath: null,
    equivalentLocales: null,
    surfaceKind,
  };
}

function inventoryOwner(consumerId: PublicSurfaceDiscoveryConsumerId) {
  const owner = PUBLIC_SURFACE_DISCOVERY_INVENTORY.find(
    (entry) => entry.consumerId === consumerId,
  );
  if (!owner) throw new Error("Unknown public discovery consumer.");
  return owner;
}

function inventory<
  ConsumerId extends string,
  SurfaceKind extends PublicSurfaceKind,
  CandidateClass extends "candidate" | "non_candidate",
>(
  consumerId: ConsumerId,
  surfaceKind: SurfaceKind,
  candidateClass: CandidateClass,
  sourceOwner: string,
) {
  return { consumerId, surfaceKind, candidateClass, sourceOwner } as const;
}

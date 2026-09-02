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
    "src/app/sitemap.ts",
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

export const PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS = 150;

export type PublicSurfaceDiscoveryConsumerId =
  (typeof PUBLIC_SURFACE_DISCOVERY_INVENTORY)[number]["consumerId"];

export interface PublicSurfaceDiscoverySource {
  consumerId: PublicSurfaceDiscoveryConsumerId;
  candidateState: PublicSurfaceCandidateState;
  qualityClass: PublicProjectionQualityClass | null;
  visibleText: readonly string[] | null;
  distinctPublicEntityIds: readonly string[] | null;
  meaningfulContentAt: string | null;
  canonicalPath: string | null;
  equivalentLocales: readonly PublicLocale[] | null;
}

export interface PublicSurfaceDiscoveryResult {
  consumerId: PublicSurfaceDiscoveryConsumerId;
  candidateInput: PublicSurfaceCandidateInput;
  decision: PublicSurfaceIndexState;
}

export interface PublicSurfaceDiscoveryDeadlineResult extends PublicSurfaceDiscoveryResult {
  terminalClass: "resolved" | "timed_out" | "cancelled" | "unavailable";
  durationMs: number;
}

export interface PublicSurfaceDiscoveryPayloadDeadlineResult<
  Payload,
> extends PublicSurfaceDiscoveryDeadlineResult {
  payload: Payload | null;
}

export function resolvePublicSurfaceDiscovery(
  source: PublicSurfaceDiscoverySource,
  options: { evaluatedAt: string | Date },
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
          qualityClass: source.qualityClass,
          visibleWordCount: countMeaningfulVisibleWords(source.visibleText),
          distinctPublicEntityIds: normalizeEntityIds(
            source.distinctPublicEntityIds,
          ),
          meaningfulContentAt: source.meaningfulContentAt,
          canonicalPath: source.canonicalPath,
          equivalentLocales: normalizeLocales(source.equivalentLocales),
          surfaceKind: owner.surfaceKind,
        }
      : unresolvedCandidateInput(owner.surfaceKind, candidateState);

  return {
    consumerId: source.consumerId,
    candidateInput,
    decision: evaluatePublicSurfaceIndexability(candidateInput, options),
  };
}

export function resolvePublicSurfaceDiscoveryForRequest(
  source: PublicSurfaceDiscoverySource,
  evaluatedAt: string | Date = new Date(),
) {
  return resolvePublicSurfaceDiscovery(source, { evaluatedAt });
}

export function resolveUnresolvedPublicSurfaceDiscovery(
  consumerId: PublicSurfaceDiscoveryConsumerId,
  evaluatedAt: string | Date = new Date(),
) {
  return unresolvedResult(consumerId, evaluatedAt);
}

export function resolveNonCandidatePublicSurfaceDiscovery(
  consumerId: PublicSurfaceDiscoveryConsumerId,
  evaluatedAt: string | Date = new Date(),
) {
  return resolvePublicSurfaceDiscovery(
    {
      consumerId,
      candidateState: "not_public_candidate",
      qualityClass: null,
      visibleText: null,
      distinctPublicEntityIds: null,
      meaningfulContentAt: null,
      canonicalPath: null,
      equivalentLocales: null,
    },
    { evaluatedAt },
  );
}

export async function resolvePublicSurfaceDiscoveryWithDeadline(input: {
  consumerId: PublicSurfaceDiscoveryConsumerId;
  evaluatedAt: string | Date;
  deadlineMs: number;
  loadSource: () => Promise<PublicSurfaceDiscoverySource>;
  signal?: AbortSignal;
}): Promise<PublicSurfaceDiscoveryDeadlineResult> {
  if (!Number.isFinite(input.deadlineMs) || input.deadlineMs <= 0) {
    return deadlineResult(
      unresolvedResult(input.consumerId, input.evaluatedAt),
      "timed_out",
      performance.now(),
    );
  }
  const startedAt = performance.now();
  if (input.signal?.aborted) {
    return deadlineResult(
      unresolvedResult(input.consumerId, input.evaluatedAt),
      "cancelled",
      startedAt,
    );
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (
      result: PublicSurfaceDiscoveryResult,
      terminalClass: PublicSurfaceDiscoveryDeadlineResult["terminalClass"],
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
      resolve(deadlineResult(result, terminalClass, startedAt));
    };
    const abort = () =>
      finish(
        unresolvedResult(input.consumerId, input.evaluatedAt),
        "cancelled",
      );
    const timer = setTimeout(
      () =>
        finish(
          unresolvedResult(input.consumerId, input.evaluatedAt),
          "timed_out",
        ),
      input.deadlineMs,
    );
    input.signal?.addEventListener("abort", abort, { once: true });

    Promise.resolve()
      .then(input.loadSource)
      .then((source) => {
        if (source.consumerId !== input.consumerId) {
          finish(
            unresolvedResult(input.consumerId, input.evaluatedAt),
            "unavailable",
          );
          return;
        }
        finish(
          resolvePublicSurfaceDiscovery(source, {
            evaluatedAt: input.evaluatedAt,
          }),
          "resolved",
        );
      })
      .catch(() =>
        finish(
          unresolvedResult(input.consumerId, input.evaluatedAt),
          "unavailable",
        ),
      );
  });
}

export async function resolvePublicSurfacePayloadWithDeadline<Payload>(input: {
  consumerId: PublicSurfaceDiscoveryConsumerId;
  evaluatedAt: string | Date;
  deadlineMs: number;
  load: () => Promise<{
    source: PublicSurfaceDiscoverySource;
    payload: Payload;
  }>;
  signal?: AbortSignal;
}): Promise<PublicSurfaceDiscoveryPayloadDeadlineResult<Payload>> {
  let payload: Payload | null = null;
  const result = await resolvePublicSurfaceDiscoveryWithDeadline({
    consumerId: input.consumerId,
    evaluatedAt: input.evaluatedAt,
    deadlineMs: input.deadlineMs,
    ...(input.signal ? { signal: input.signal } : {}),
    loadSource: async () => {
      const loaded = await input.load();
      payload = loaded.payload;
      return loaded.source;
    },
  });
  return {
    ...result,
    payload: result.terminalClass === "resolved" ? payload : null,
  };
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

function normalizeEntityIds(value: readonly string[] | null) {
  if (!value) return null;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function normalizeLocales(value: readonly PublicLocale[] | null) {
  if (!value) return null;
  return [...new Set(value)];
}

function unresolvedResult(
  consumerId: PublicSurfaceDiscoveryConsumerId,
  evaluatedAt: string | Date,
) {
  const owner = inventoryOwner(consumerId);
  const candidateInput = unresolvedCandidateInput(
    owner.surfaceKind,
    "candidate_input_unresolved",
  );
  return {
    consumerId,
    candidateInput,
    decision: evaluatePublicSurfaceIndexability(candidateInput, {
      evaluatedAt,
    }),
  };
}

function unresolvedCandidateInput(
  surfaceKind: PublicSurfaceKind,
  candidateState: Exclude<PublicSurfaceCandidateState, "candidate">,
): PublicSurfaceCandidateInput {
  return {
    candidateState,
    qualityClass: null,
    visibleWordCount: null,
    distinctPublicEntityIds: null,
    meaningfulContentAt: null,
    canonicalPath: null,
    equivalentLocales: null,
    surfaceKind,
  };
}

function deadlineResult(
  result: PublicSurfaceDiscoveryResult,
  terminalClass: PublicSurfaceDiscoveryDeadlineResult["terminalClass"],
  startedAt: number,
): PublicSurfaceDiscoveryDeadlineResult {
  return {
    ...result,
    terminalClass,
    durationMs: Math.max(0, performance.now() - startedAt),
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

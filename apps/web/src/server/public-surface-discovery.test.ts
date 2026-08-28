import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_SURFACE_DISCOVERY_INVENTORY,
  resolvePublicSurfaceDiscovery,
  resolvePublicSurfacePayloadWithDeadline,
  resolvePublicSurfaceDiscoveryWithDeadline,
  type PublicSurfaceDiscoverySource,
} from "./public-surface-discovery";

const EVALUATED_AT = "2026-08-24T00:00:00.000Z";

function richSource(
  overrides: Partial<PublicSurfaceDiscoverySource> = {},
): PublicSurfaceDiscoverySource {
  return {
    consumerId: "localized_journal_entry",
    candidateState: "candidate",
    qualityClass: "partial",
    visibleText: [
      Array.from({ length: 120 }, (_, index) => `word${index}`).join(" "),
    ],
    distinctPublicEntityIds: ["plant-1"],
    meaningfulContentAt: "2026-08-23T00:00:00.000Z",
    canonicalPath: "/journal/season-note",
    equivalentLocales: ["uk"],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("public surface discovery adapter", () => {
  it("registers every current route and repository consumer exactly once", () => {
    const ids = PUBLIC_SURFACE_DISCOVERY_INVENTORY.map(
      (entry) => entry.consumerId,
    );

    expect(ids).toEqual([
      "localized_home",
      "localized_journals_directory",
      "localized_journal_entry",
      "localized_profile",
      "localized_blog_index",
      "localized_blog_post",
      "localized_guide",
      "localized_answer",
      "localized_knowledge_hub",
      "localized_market",
      "localized_catalog_browse",
      "stable_registry_catalog_browse",
      "stable_registry_catalog_detail",
      "stable_registry_eppo_browse",
      "stable_registry_eppo_detail",
      "localized_topic",
      "localized_community_directory",
      "localized_community",
      "catalog_evidence",
      "lineage_object",
      "privacy",
      "first_publication_disclosure",
      "authored_sitemap",
      "variety_sitemap",
      "topic_sitemap",
      "public_variety_repository",
      "public_topic_repository",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("derives the measured decision from visible facts and explicit entities", () => {
    const result = resolvePublicSurfaceDiscovery(richSource(), {
      evaluatedAt: EVALUATED_AT,
    });

    expect(result.decision).toMatchObject({
      value: "indexable",
      reasons: [],
    });
    expect(result.candidateInput).toMatchObject({
      surfaceKind: "journal_entry",
      visibleWordCount: 120,
      distinctPublicEntityIds: ["plant-1"],
    });
  });

  it("refuses coordinate-bearing visible text through the authoritative firewall", () => {
    const result = resolvePublicSurfaceDiscovery(
      richSource({ visibleText: ["Garden note at 50.45010, 30.52340"] }),
      { evaluatedAt: EVALUATED_AT },
    );

    expect(result.decision).toMatchObject({
      value: "noindex",
      reasons: ["not_public_candidate"],
    });
  });

  it("keeps thin Stable Registry catalog and source pages behind the shared threshold", () => {
    const result = resolvePublicSurfaceDiscovery(
      richSource({
        consumerId: "stable_registry_eppo_detail",
        qualityClass: "partial",
        visibleText: ["source evidence"],
        distinctPublicEntityIds: ["SOLLC"],
        canonicalPath: "/sources/eppo/SOLLC",
      }),
      { evaluatedAt: EVALUATED_AT },
    );

    expect(result.decision).toMatchObject({
      value: "noindex",
      reasons: ["word_count_below_threshold"],
    });
  });

  it("times out without accepting a late source result", async () => {
    vi.useFakeTimers();
    const pending = resolvePublicSurfaceDiscoveryWithDeadline({
      consumerId: "localized_journal_entry",
      evaluatedAt: EVALUATED_AT,
      deadlineMs: 150,
      loadSource: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(richSource()), 500);
        }),
    });

    await vi.advanceTimersByTimeAsync(150);
    const result = await pending;
    await vi.advanceTimersByTimeAsync(500);

    expect(result).toMatchObject({
      terminalClass: "timed_out",
      decision: {
        value: "noindex",
        reasons: ["candidate_input_unresolved"],
      },
    });
  });

  it("cancels before resolution and never admits the source", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await resolvePublicSurfaceDiscoveryWithDeadline({
      consumerId: "localized_journal_entry",
      evaluatedAt: EVALUATED_AT,
      deadlineMs: 150,
      signal: controller.signal,
      loadSource: async () => richSource(),
    });

    expect(result).toMatchObject({
      terminalClass: "cancelled",
      decision: {
        value: "noindex",
        reasons: ["candidate_input_unresolved"],
      },
    });
  });

  it("drops a payload that completes after the metadata deadline", async () => {
    vi.useFakeTimers();
    const pending = resolvePublicSurfacePayloadWithDeadline<string>({
      consumerId: "localized_journal_entry",
      evaluatedAt: EVALUATED_AT,
      deadlineMs: 150,
      load: () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ source: richSource(), payload: "late-page" }),
            500,
          );
        }),
    });

    await vi.advanceTimersByTimeAsync(150);
    const result = await pending;
    await vi.advanceTimersByTimeAsync(500);

    expect(result).toMatchObject({
      terminalClass: "timed_out",
      payload: null,
      decision: { value: "noindex" },
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_SURFACE_DISCOVERY_INVENTORY,
  resolvePublicSurfaceDiscovery,
  resolveNonCandidatePublicSurfaceDiscovery,
  resolvePublicSurfacePayload,
  resolvePublicSurfaceDiscoveryFromLoad,
  type PublicSurfaceDiscoverySource,
} from "./public-surface-discovery";


function richSource(
  overrides: Partial<PublicSurfaceDiscoverySource> = {},
): PublicSurfaceDiscoverySource {
  return {
    consumerId: "localized_journal_entry",
    candidateState: "candidate",
    visibleText: [
      Array.from({ length: 120 }, (_, index) => `word${index}`).join(" "),
    ],
    distinctPublicEntityIds: ["plant-1"],
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

  it("indexes a live page from its visible facts without a measured threshold", () => {
    const result = resolvePublicSurfaceDiscovery(richSource());
    expect(result.decision.isIndexable).toBe(true);
    expect(result.candidateInput).toMatchObject({
      candidateState: "candidate",
      hasContent: true,
      surfaceKind: "journal_entry",
    });
    expect(
      resolvePublicSurfaceDiscovery(
        richSource({ visibleText: ["Домат"], distinctPublicEntityIds: [] }),
      ).decision.isIndexable,
    ).toBe(true);
  });

  it("marks a listing with nothing on it noindex and a non-candidate route noindex", () => {
    expect(
      resolvePublicSurfaceDiscovery(
        richSource({ visibleText: [], distinctPublicEntityIds: [] }),
      ).decision.reasons,
    ).toEqual(["empty_listing"]);
    expect(
      resolvePublicSurfaceDiscovery(
        richSource({ consumerId: "privacy", canonicalPath: "/bg/privacy" }),
      ).decision.reasons,
    ).toEqual(["not_public_candidate"]);
    expect(
      resolveNonCandidatePublicSurfaceDiscovery("localized_home").decision
        .reasons,
    ).toEqual(["not_public_candidate"]);
  });

  it("never turns a slow load into noindex and keeps a failed load unresolved", async () => {
    const slow = await resolvePublicSurfaceDiscoveryFromLoad({
      consumerId: "localized_journal_entry",
      loadSource: () =>
        new Promise((resolve) => setTimeout(() => resolve(richSource()), 20)),
    });
    expect(slow.decision.isIndexable).toBe(true);

    const failed = await resolvePublicSurfacePayload({
      consumerId: "localized_journal_entry",
      load: async () => {
        throw new Error("database unavailable");
      },
    });
    expect(failed.payload).toBeNull();
    expect(failed.decision.reasons).toEqual(["candidate_input_unresolved"]);

    const loaded = await resolvePublicSurfacePayload({
      consumerId: "localized_journal_entry",
      load: async () => ({ source: richSource(), payload: { id: "entry" } }),
    });
    expect(loaded.payload).toEqual({ id: "entry" });
    expect(loaded.decision.isIndexable).toBe(true);

    const foreign = await resolvePublicSurfacePayload({
      consumerId: "localized_home",
      load: async () => ({ source: richSource(), payload: { id: "entry" } }),
    });
    expect(foreign.payload).toBeNull();
  });
});

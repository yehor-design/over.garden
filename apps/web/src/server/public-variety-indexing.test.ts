import { describe, expect, it } from "vitest";

import { evaluatePublicVarietyIndexState } from "./public-variety-indexing";
import type { PublicSurfaceDiscoverySource } from "./public-surface-discovery";

function source(
  overrides: Partial<PublicSurfaceDiscoverySource> = {},
): PublicSurfaceDiscoverySource & {
  consumerId: "public_variety_repository";
} {
  return {
    consumerId: "public_variety_repository",
    candidateState: "candidate",
    visibleText: ["Домати Черi"],
    distinctPublicEntityIds: ["catalog:plant_variety:tomato"],
    canonicalPath: "/variety/tomato",
    equivalentLocales: [],
    ...overrides,
  } as PublicSurfaceDiscoverySource & {
    consumerId: "public_variety_repository";
  };
}

describe("public variety indexability (ADR-0022, D3)", () => {
  it("indexes a variety page that shows anything, without a catalog trust gate", () => {
    expect(evaluatePublicVarietyIndexState(source())).toMatchObject({
      value: "indexable",
      reasons: [],
    });
    expect(
      evaluatePublicVarietyIndexState(
        source({ visibleText: [], distinctPublicEntityIds: ["one"] }),
      ).value,
    ).toBe("indexable");
  });

  it("keeps only an empty projection out of the index", () => {
    expect(
      evaluatePublicVarietyIndexState(
        source({ visibleText: [], distinctPublicEntityIds: [] }),
      ),
    ).toMatchObject({
      value: "noindex",
      sitemapEligible: false,
      robots: { index: false, follow: false },
      reasons: ["empty_listing"],
    });
  });
});

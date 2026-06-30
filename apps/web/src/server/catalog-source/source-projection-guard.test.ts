import { describe, expect, it } from "vitest";

import {
  CatalogSourceProjectionBlockedError,
  assertCatalogSourceProductProjectionAllowed,
  checkCatalogSourceProductProjection,
  type CatalogSourceReadinessManifest,
} from "./source-projection-guard";

const bgReviewedSubsetGate = {
  issueKey: "OVE-61",
  gateId: "ove-61-bg-official-variety-reviewed-subset",
  scope: "reviewed_subset",
} as const;

const beeManualSeedGate = {
  issueKey: "OVE-60",
  gateId: "ove-60-ua-official-bee-breed-manual-seed",
  scope: "manual_seed",
} as const;

describe("catalog source product projection guard", () => {
  it("allows OVE-55 approved sources to project catalog items and typeahead aliases", () => {
    expect(
      assertCatalogSourceProductProjectionAllowed({
        sourceSlug: "ua-state-register",
        productSurface: "catalog_items",
        productSource: "ua_state_register",
        productSourceId:
          "ua-state-register:2025-07-15:RegisterVarietis:83070006",
      }).allowed,
    ).toBe(true);

    expect(
      assertCatalogSourceProductProjectionAllowed({
        sourceSlug: "grin-global",
        productSurface: "catalog_item_names",
        productSource: "grin_genebank_candidate",
        productSourceId: "GRIN:NPGS:OVE62:RED-CHERRY-TOMATO",
      }).allowed,
    ).toBe(true);
  });

  it("blocks conditional EU/Common Catalogue projection unless the bounded OVE-61 gate matches", () => {
    const blocked = checkCatalogSourceProductProjection({
      sourceSlug: "eu-common-catalogue",
      sourceVersion: "2026-06-30-bg-proof-subset",
      sourceRecordKey: "EU-PVP:BG:SADOVO-1",
      productSurface: "catalog_items",
      productSource: "eu_common_catalogue_bg",
      productSourceId: "EU-PVP:BG:SADOVO-1",
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.verdict).toBe("USE-WITH-CONDITIONS");
    expect(blocked.message).toContain("Next action:");

    const allowed = assertCatalogSourceProductProjectionAllowed({
      sourceSlug: "eu-common-catalogue",
      sourceVersion: "2026-06-30-bg-proof-subset",
      sourceRecordKey: "EU-PVP:BG:SADOVO-1",
      productSurface: "catalog_item_names",
      productSource: "eu_common_catalogue_bg",
      productSourceId: "EU-PVP:BG:SADOVO-1",
      explicitGate: bgReviewedSubsetGate,
    });

    expect(allowed.verdict).toBe("SOURCE-SPECIFIC-GATE");
    expect(allowed.gateIssueKey).toBe("OVE-61");
  });

  it("does not turn the OVE-61 bounded proof into bulk EU/Common Catalogue approval", () => {
    expect(() =>
      assertCatalogSourceProductProjectionAllowed({
        sourceSlug: "eu-common-catalogue",
        sourceVersion: "2026-06-30-bg-proof-subset",
        sourceRecordKey: "IASAS-OSL-2026:PDF:LOW-CONFIDENCE-ROW",
        productSurface: "catalog_items",
        productSource: "eu_common_catalogue_bg",
        productSourceId: "IASAS-OSL-2026:PDF:LOW-CONFIDENCE-ROW",
        explicitGate: bgReviewedSubsetGate,
      }),
    ).toThrow(CatalogSourceProjectionBlockedError);
  });

  it("allows only the named OVE-60 official bee manual seed path", () => {
    const allowed = assertCatalogSourceProductProjectionAllowed({
      sourceSlug: "ua-official-bee-breeds",
      sourceVersion: "law-1492-iii-manual-seed-2026-06-30",
      sourceRecordKey: "ua-law-1492-iii:bee-breed:carpathian",
      productSurface: "catalog_item_names",
      productSource: "ua_official_bee_breed",
      productSourceId: "ua-official-bee-breeds:carpathian",
      explicitGate: beeManualSeedGate,
    });

    expect(allowed.verdict).toBe("SOURCE-SPECIFIC-GATE");
    expect(allowed.gateIssueKey).toBe("OVE-60");

    expect(() =>
      assertCatalogSourceProductProjectionAllowed({
        sourceSlug: "ua-official-bee-breeds",
        sourceVersion: "law-1492-iii-manual-seed-2026-06-30",
        sourceRecordKey: "ua-law-1492-iii:bee-breed:unreviewed",
        productSurface: "catalog_items",
        productSource: "ua_official_bee_breed",
        productSourceId: "ua-official-bee-breeds:unreviewed",
        explicitGate: beeManualSeedGate,
      }),
    ).toThrow(CatalogSourceProjectionBlockedError);
  });

  it("blocks internal-only and rejected source slugs before product-visible tables", () => {
    for (const sourceSlug of [
      "genesys-pgr",
      "eurisco",
      "vendor-marketplace-paths",
    ]) {
      const decision = checkCatalogSourceProductProjection({
        sourceSlug,
        productSurface: "catalog_item_names",
      });

      expect(decision.allowed).toBe(false);
      expect(decision.message).toContain("Next action:");
      expect(decision.allowedUsage).not.toContain(
        "canonical_product_projection",
      );
    }
  });

  it("fails closed for unknown sources and manifest USE entries missing canonical product usage", () => {
    const unknown = checkCatalogSourceProductProjection({
      sourceSlug: "unreviewed-new-source",
      productSurface: "catalog_items",
    });

    expect(unknown.allowed).toBe(false);
    if (unknown.allowed) {
      throw new Error("Unknown source should be blocked.");
    }
    expect(unknown.verdict).toBe("UNKNOWN");
    expect(unknown.nextAction).toContain("OVE-55 source readiness manifest");

    const manifest: CatalogSourceReadinessManifest = {
      sources: [
        {
          slug: "approved-raw-only",
          verdict: "USE",
          allowedUsage: ["raw_snapshot"],
        },
      ],
    };

    const rawOnly = checkCatalogSourceProductProjection({
      sourceSlug: "approved-raw-only",
      productSurface: "catalog_items",
      manifest,
    });

    expect(rawOnly.allowed).toBe(false);
    if (rawOnly.allowed) {
      throw new Error("Raw-only source should be blocked.");
    }
    expect(rawOnly.verdict).toBe("USE");
    expect(rawOnly.nextAction).toContain("canonical_product_projection");
  });
});

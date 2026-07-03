import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CatalogSourceCandidateReviewItem } from "@/server/catalog-source/candidate-review-repository";
import { CatalogSourceCandidateReviewList } from "./catalog-source-candidate-review-list";

const forbiddenRenderedMarkers = [
  "raw_payload",
  "source_only_fields",
  "accessionIdentifier",
  "accessionRecordUrl",
  "genesysEuriscoBlocker",
  "journalBody",
  "ownerUserId",
  "mediaKey",
  "decimalLatitude",
  "decimalLongitude",
  "GRIN:NPGS:",
];

function sourceCandidate(
  overrides: Partial<CatalogSourceCandidateReviewItem> = {},
): CatalogSourceCandidateReviewItem {
  return {
    sourceRecordId: "00000000-0000-4000-8000-000000066001",
    sourceRecordKey: "GRIN:NPGS:OVE62:RED-CHERRY-TOMATO",
    status: "quarantined",
    projectionStatus: "quarantined",
    sourceSlug: "grin-global",
    sourceName: "USDA GRIN/NPGS long-tail accession proof subset",
    sourceVersion: "2026-07-02-ove88-bulk-proof-subset",
    sourceUrl: "https://npgsweb.ars-grin.gov/gringlobal/search",
    license:
      "USDA GRIN/NPGS public-domain source metadata; germplasm distribution policy is not a product availability claim.",
    licenseUrl: "https://www.usda.gov/policies-and-links",
    attributionRequired: false,
    attributionText: null,
    allowedUsage: [
      "raw_snapshot",
      "review_queue",
      "curator_promotion",
      "canonical_product_projection",
    ],
    parserVersion: "ove-88.genebank-long-tail.bulk-proof.v1",
    fetchedAt: "2026-06-30T00:00:00.000Z",
    verifiedAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    review: {
      displayName: "Red Cherry",
      candidateKind: "accession",
      speciesName: "Solanum lycopersicum L.",
      reviewStatus: "candidate_review",
      legalStatus: "grin_public_domain_ove55_use",
      curatorDecision: "promote_to_canonical_seed",
      sourceRowReference:
        "Curated OVE-62 GRIN/NPGS proof row: accession candidate Red Cherry; species Solanum lycopersicum L.; crop Tomato.",
    },
    promotionPreview: {
      canonicalName: "Red Cherry tomato",
      catalogKind: "plant_variety",
      source: "grin_genebank_candidate",
      sourceId: "GRIN:NPGS:OVE62:RED-CHERRY-TOMATO",
      aliases: [
        { displayName: "Red Cherry", locale: "en", isPrimary: true },
        {
          displayName: "Solanum lycopersicum Red Cherry",
          locale: "la",
          isPrimary: false,
        },
      ],
    },
    projectedCatalog: null,
    actions: {
      canPromote: true,
      canHold: true,
      canReject: true,
      blockedReason: null,
    },
    ...overrides,
  };
}

describe("CatalogSourceCandidateReviewList", () => {
  it("renders safe source/legal/status context and projection actions", () => {
    const html = renderToStaticMarkup(
      <CatalogSourceCandidateReviewList
        candidates={[
          sourceCandidate(),
          sourceCandidate({
            sourceRecordId: "00000000-0000-4000-8000-000000066002",
            sourceRecordKey: "GRIN:NPGS:OVE62:UNREVIEWED-LANDRACE",
            status: "held",
            review: {
              displayName: "Unreviewed NPGS landrace proof row",
              candidateKind: "landrace",
              speciesName: "Phaseolus vulgaris L.",
              reviewStatus: "review_needed",
              legalStatus: "grin_public_domain_ove55_use",
              curatorDecision: "hold_for_review",
              sourceRowReference:
                "Review-only OVE-62 GRIN/NPGS proof row; legal source is approved but candidate identity is not curator-promoted.",
            },
            promotionPreview: null,
            actions: {
              canPromote: false,
              canHold: false,
              canReject: true,
              blockedReason: "Held for curator review.",
            },
          }),
          sourceCandidate({
            sourceRecordId: "00000000-0000-4000-8000-000000066003",
            status: "promoted",
            projectedCatalog: {
              catalogItemId: "00000000-0000-4000-8000-000000066004",
              canonicalName: "Red Cherry tomato",
              publicSlug: "red-cherry-tomato-grin-genebank-candidate",
              status: "seeded",
              catalogKind: "plant_variety",
              typeaheadNameCount: 3,
            },
            actions: {
              canPromote: false,
              canHold: false,
              canReject: false,
              blockedReason: "Already projected to catalog.",
            },
          }),
        ]}
        promoteAction={vi.fn()}
        holdAction={vi.fn()}
        rejectAction={vi.fn()}
      />,
    );

    expect(html).toContain("Source candidate review");
    expect(html).toContain("Quarantined: 1");
    expect(html).toContain("Held: 1");
    expect(html).toContain("Promoted: 1");
    expect(html).toContain("Red Cherry");
    expect(html).toContain("GRIN/NPGS candidate");
    expect(html).toContain("Hidden from typeahead and public catalog");
    expect(html).toContain("Not selectable until review confirms");
    expect(html).toContain("Promoted into the safe catalog projection");
    expect(html).toContain("Solanum lycopersicum L.");
    expect(html).toContain("Promote");
    expect(html).toContain("Hold");
    expect(html).toContain("Reject");
    expect(html).toContain("typeahead names 3");

    for (const marker of forbiddenRenderedMarkers) {
      expect(html).not.toContain(marker);
    }
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CatalogEntityResolutionQaReport } from "@/server/catalog-source/entity-resolution-qa-repository";
import { CatalogEntityResolutionReport } from "./catalog-entity-resolution-report";

const report: CatalogEntityResolutionQaReport = {
  schemaVersion: "ove162.catalogEntityResolutionQa.v2",
  issue: "OVE-162",
  generatedAt: "2026-07-02T00:00:00.000Z",
  evidenceSafety: "linear_safe_redacted",
  summary: {
    clusterCount: 3,
    sourceBackedCatalogRowsReviewed: 12,
    aliasCollisionRowsReviewed: 1,
    sourceCandidateGroupsReviewed: 3,
    fuzzyDuplicatePairCount: 1,
    fuzzyDuplicateRowsReviewed: 1,
    groups: [
      {
        kind: "fuzzy_duplicate",
        label: "Fuzzy duplicate",
        count: 1,
        nextAction: "Merge review or hold",
      },
      {
        kind: "likely_duplicate",
        label: "Likely duplicate",
        count: 1,
        nextAction: "Merge review",
      },
      {
        kind: "manual_review_required",
        label: "Manual review required",
        count: 1,
        nextAction: "Review source candidate lane",
      },
    ],
  },
  clusters: [
    {
      id: "ove162:fuzzy_duplicate:test",
      kind: "fuzzy_duplicate",
      title: "Red Cherry and Red Chery are a 95% near match",
      riskLevel: "review_needed",
      reason: "RapidFuzz found a deterministic near-name match.",
      recommendedAction: "merge_review",
      actionHref: "/garden/catalog/curation",
      fuzzyScore: 95,
      fuzzyScoreBucket: "high",
      reasonCodes: [
        "rapidfuzz_name_similarity",
        "same_catalog_kind",
        "same_locale",
      ],
      localeRelation: "same_locale",
      evidenceStatus: "current",
      members: [
        {
          label: "Red Cherry",
          catalogKind: "plant_variety",
          source: "ua_state_register",
          status: "seeded",
          locale: "uk",
        },
        {
          label: "Red Chery",
          catalogKind: "plant_variety",
          source: "eu_oj_eur_lex_common_catalogue",
          status: "seeded",
          locale: "uk",
        },
      ],
    },
    {
      id: "ove89:likely_duplicate:test",
      kind: "likely_duplicate",
      title: "Bergeron 1 appears as 2 source-backed catalog rows",
      riskLevel: "review_needed",
      reason: "Multiple source-backed catalog rows share an identity.",
      recommendedAction: "merge_review",
      actionHref: "/garden/catalog/curation",
      members: [
        {
          label: "Bergeron 1",
          catalogKind: "plant_variety",
          source: "ua_state_register",
          status: "seeded",
          typeaheadNameCount: 4,
          sourceLinkCount: 1,
        },
      ],
    },
    {
      id: "ove89:manual_review_required:test",
      kind: "manual_review_required",
      title: "grin-global quarantined / review_needed (2)",
      riskLevel: "review_needed",
      reason: "These rows still need operator review.",
      recommendedAction: "hold",
      actionHref: "/garden/catalog/curation?sourceStatus=review_needed",
      members: [
        {
          label: "Kyiv Long cucumber proof row",
          source: "grin-global",
          status: "quarantined / review_needed",
          rowCount: 2,
        },
      ],
    },
  ],
  leakCheck: "passed",
};

describe("CatalogEntityResolutionReport", () => {
  it("renders cluster summaries and routing without raw source fields", () => {
    const html = renderToStaticMarkup(
      <CatalogEntityResolutionReport
        report={report}
        refreshAction={async () => undefined}
      />,
    );

    expect(html).toContain("Entity-resolution QA");
    expect(html).toContain("Clusters: 3");
    expect(html).toContain("Refresh fuzzy QA");
    expect(html).toContain("Fuzzy reviewed: 1 of 1");
    expect(html).toContain("Red Cherry and Red Chery are a 95% near match");
    expect(html).toContain("Score: 95%");
    expect(html).toContain("same_locale");
    expect(html).toContain("rapidfuzz_name_similarity");
    expect(html).toContain("Locale: uk");
    expect(html).toContain(
      "Bergeron 1 appears as 2 source-backed catalog rows",
    );
    expect(html).toContain("Kyiv Long cucumber proof row");
    expect(html).toContain("Review path");
    expect(html).not.toContain("raw_payload");
    expect(html).not.toContain("source_only_fields");
    expect(html).not.toContain("sourceRecordKey");
    expect(html).not.toContain("journalBody");
    expect(html).not.toContain("ownerUserId");
  });
});

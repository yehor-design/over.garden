import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CatalogEntityResolutionQaReport } from "@/server/catalog-source/entity-resolution-qa-repository";
import { CatalogEntityResolutionReport } from "./catalog-entity-resolution-report";

const report: CatalogEntityResolutionQaReport = {
  schemaVersion: "ove89.catalogEntityResolutionQa.v1",
  issue: "OVE-89",
  generatedAt: "2026-07-02T00:00:00.000Z",
  evidenceSafety: "linear_safe_redacted",
  summary: {
    clusterCount: 2,
    sourceBackedCatalogRowsReviewed: 12,
    aliasCollisionRowsReviewed: 1,
    sourceCandidateGroupsReviewed: 3,
    groups: [
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
      <CatalogEntityResolutionReport report={report} />,
    );

    expect(html).toContain("Entity-resolution QA");
    expect(html).toContain("Clusters: 2");
    expect(html).toContain("Bergeron 1 appears as 2 source-backed catalog rows");
    expect(html).toContain("Kyiv Long cucumber proof row");
    expect(html).toContain("Review path");
    expect(html).not.toContain("raw_payload");
    expect(html).not.toContain("source_only_fields");
    expect(html).not.toContain("sourceRecordKey");
    expect(html).not.toContain("journalBody");
    expect(html).not.toContain("ownerUserId");
  });
});

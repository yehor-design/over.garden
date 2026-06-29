import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CatalogSourceProvenanceList } from "./catalog-source-provenance-list";

describe("CatalogSourceProvenanceList", () => {
  it("shows source, license, snapshot, and row provenance without raw payload", () => {
    const html = renderToStaticMarkup(
      <CatalogSourceProvenanceList
        provenanceRows={[
          {
            catalogItemId: "00000000-0000-4000-8000-000000057003",
            catalogCanonicalName: "Ботсадівський",
            catalogPublicSlug: "botsadivskyi-ua-register-83070006",
            catalogStatus: "seeded",
            catalogSource: "ua_state_register",
            sourceSlug: "ua-state-register",
            sourceName: "Ukraine State Register of Plant Varieties",
            sourceVersion: "2025-07-15",
            sourceUrl: "https://data.gov.ua/example.csv",
            license: "Creative Commons Attribution 4.0 International",
            attributionRequired: true,
            allowedUsage: ["raw_snapshot", "canonical_product_projection"],
            sourceRecordKey: "RegisterVarietis:83070006",
            parserVersion: "ove-57.ua-state-register.variety.v1",
            fetchedAt: "2026-06-29T00:00:00.000Z",
            verifiedAt: "2026-06-29T00:00:00.000Z",
            projectionStatus: "projected",
            projectedAliases: [
              {
                displayName: "Ботсадівський",
                locale: "uk",
                isPrimary: true,
              },
              {
                displayName: "Botsadivs`kyi",
                locale: "uk",
                isPrimary: false,
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain("Ботсадівський");
    expect(html).toContain("RegisterVarietis:83070006");
    expect(html).toContain("2025-07-15");
    expect(html).toContain("Creative Commons Attribution 4.0 International");
    expect(html).toContain("attribution required");
    expect(html).toContain("Projected typeahead aliases");
    expect(html).toContain("Ботсадівський");
    expect(html).toContain("Botsadivs`kyi");
    expect(html).not.toContain("raw_payload");
    expect(html).not.toContain("source_only_fields");
    expect(html).not.toContain("varietyDescription");
    expect(html).not.toContain("ownerUserId");
  });
});

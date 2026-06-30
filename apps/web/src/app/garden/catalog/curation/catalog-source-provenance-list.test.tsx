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
            catalogKind: "plant_variety",
            catalogStatus: "seeded",
            catalogSource: "ua_state_register",
            sourceSlug: "ua-state-register",
            sourceName: "Ukraine State Register of Plant Varieties",
            sourceVersion: "2025-07-15",
            sourceUrl: "https://data.gov.ua/example.csv",
            license: "Creative Commons Attribution 4.0 International",
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
            attributionRequired: true,
            attributionText:
              "Ukraine State Register of Plant Varieties, Creative Commons Attribution 4.0 International.",
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
                script: "Cyrillic",
                aliasKind: "vernacular_alias",
                status: "accepted",
                sourceSlug: "ua-state-register",
                sourceMethod: "source_backed",
                sourceRecordKey: "RegisterVarietis:83070006",
                confidence: 1,
                license: "Creative Commons Attribution 4.0 International",
                attributionRequired: true,
                projectedToTypeahead: true,
                isPrimary: true,
                projectionNotes:
                  "Official UA register projection for product typeahead.",
              },
              {
                displayName: "Botsadivs`kyi",
                locale: "uk",
                script: "Latin",
                aliasKind: "generated_variant",
                status: "generated",
                sourceSlug: "overgarden-generated",
                sourceMethod: "generated",
                sourceRecordKey: null,
                confidence: 0.52,
                license: "OverGarden generated candidate",
                attributionRequired: false,
                projectedToTypeahead: false,
                isPrimary: null,
                projectionNotes: "Generated transliteration held for review.",
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain("Ботсадівський");
    expect(html).toContain("RegisterVarietis:83070006");
    expect(html).toContain("2025-07-15");
    expect(html).toContain("https://data.gov.ua/example.csv");
    expect(html).toContain("Creative Commons Attribution 4.0 International");
    expect(html).toContain("https://creativecommons.org/licenses/by/4.0/");
    expect(html).toContain("Ukraine State Register of Plant Varieties");
    expect(html).toContain("attribution required");
    expect(html).toContain("Alias review states");
    expect(html).toContain("Ботсадівський");
    expect(html).toContain("Botsadivs`kyi");
    expect(html).toContain("accepted");
    expect(html).toContain("generated");
    expect(html).toContain("typeahead");
    expect(html).toContain("confidence 1.00");
    expect(html).toContain("confidence 0.52");
    expect(html).not.toContain("raw_payload");
    expect(html).not.toContain("source_only_fields");
    expect(html).not.toContain("varietyDescription");
    expect(html).not.toContain("ownerUserId");
  });
});

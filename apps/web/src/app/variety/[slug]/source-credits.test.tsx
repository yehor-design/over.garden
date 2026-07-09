import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PublicCatalogSourceCredit } from "@/server/public-variety-repository";
import { PublicVarietySourceCredits } from "./source-credits";

describe("PublicVarietySourceCredits", () => {
  it("renders required catalog source credits without raw payload markers", () => {
    const html = renderToStaticMarkup(
      <PublicVarietySourceCredits
        locale="bg"
        credits={[
          {
            sourceSlug: "ua-state-register",
            sourceName: "Ukraine State Register of Plant Varieties",
            sourceVersion: "2025-07-15",
            sourceUrl: "https://data.gov.ua/example-register.csv",
            license: "Creative Commons Attribution 4.0 International",
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
            attributionRequired: true,
            attributionText:
              "Ukraine State Register of Plant Varieties, Creative Commons Attribution 4.0 International.",
            sourceRecordKey: "RegisterVarietis:83070006",
            rawPayload: { varietyDescription: "raw-only" },
            sourceOnlyFields: { occurrenceCoordinates: [50.45, 30.52] },
          } as PublicCatalogSourceCredit & Record<string, unknown>,
        ]}
      />,
    );

    expect(html).toContain("Източници на данни");
    expect(html).toContain("Източници и признание");
    expect(html).toContain("Ukraine State Register of Plant Varieties");
    expect(html).toContain("2025-07-15");
    expect(html).toContain("Creative Commons Attribution 4.0 International");
    expect(html).toContain("creativecommons.org/licenses/by/4.0");
    expect(html).toContain("Посочването на източника е задължително");
    expect(html).not.toContain("RegisterVarietis");
    expect(html).not.toContain("rawPayload");
    expect(html).not.toContain("sourceOnlyFields");
    expect(html).not.toContain("occurrenceCoordinates");
    expect(html).not.toContain("varietyDescription");
    expect(html).not.toContain("50.45");
    expect(html).not.toContain("30.52");
  });
});

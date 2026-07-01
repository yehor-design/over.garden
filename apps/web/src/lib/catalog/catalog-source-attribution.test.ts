import { describe, expect, it } from "vitest";

import { EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE } from "./eu-official-journal-common-catalogue";
import {
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_ATTRIBUTION,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_CAVEAT,
  catalogSourceAttributionCaveat,
  catalogSourceAttributionSummary,
} from "./catalog-source-attribution";

describe("catalog source attribution copy", () => {
  it("renders the approved EU Official Journal / EUR-Lex readback attribution", () => {
    const credit = {
      sourceSlug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
      sourceName: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.name,
      sourceUrl: "https://eur-lex.europa.eu/eli/C/2026/830/oj",
      attributionText:
        EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.attributionText,
    };

    expect(catalogSourceAttributionSummary(credit)).toBe(
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_ATTRIBUTION,
    );
    expect(catalogSourceAttributionCaveat(credit)).toBe(
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_CAVEAT,
    );
  });

  it("keeps generic source-backed catalog attribution concise", () => {
    const credit = {
      sourceSlug: "ua-state-register",
      sourceName: "Ukraine State Register of Plant Varieties",
      sourceUrl: "https://example.test/register.csv",
      attributionText: "Ukraine State Register.",
    };

    expect(catalogSourceAttributionSummary(credit)).toBe(
      "Source: Ukraine State Register of Plant Varieties. Normalized by OverGarden.",
    );
    expect(catalogSourceAttributionCaveat(credit)).toBeNull();
  });
});

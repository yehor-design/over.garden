import { describe, expect, it } from "vitest";

import { catalogSuggestionTrustMetadata } from "./catalog-trust";

describe("catalog trust copy", () => {
  it("describes selectable catalog rows with safe source-backed metadata only", () => {
    expect(
      catalogSuggestionTrustMetadata({
        status: "seeded",
        source: "eu_oj_eur_lex_common_catalogue",
        catalogKind: "plant_variety",
        locale: "bg",
      }),
    ).toEqual({
      trustState: "source_backed",
      trustLabel: "Source-backed",
      sourceLabel: "EU Official Journal",
      sourceCaveat:
        "Official Journal-backed row; portal-only rows stay hidden until cleared.",
      disambiguationLabel: "Plant variety · EU Official Journal · bg",
    });
  });

  it("keeps user-added and quarantined rows out of global-truth language", () => {
    const copy = [
      catalogSuggestionTrustMetadata({
        status: "provisional",
        source: "user_added",
        catalogKind: "plant_variety",
        locale: "und",
      }),
      catalogSuggestionTrustMetadata({
        status: "quarantined",
        source: "grin-global",
        catalogKind: "plant_variety",
      }),
      catalogSuggestionTrustMetadata({
        status: "rejected",
        source: "grin-global",
        catalogKind: "plant_variety",
      }),
    ];

    expect(copy.map((item) => item.trustState)).toEqual([
      "user_added",
      "quarantined",
      "rejected",
    ]);
    expect(copy.map((item) => item.sourceCaveat).join(" ")).toContain(
      "Saved only for your garden",
    );
    expect(copy.map((item) => item.sourceCaveat).join(" ")).toContain(
      "Hidden from typeahead and public catalog",
    );
    expect(copy.map((item) => item.sourceCaveat).join(" ")).toContain(
      "Rejected from product catalog projection",
    );
  });
});

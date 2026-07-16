import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("CatalogAliasSuggestionReview", () => {
  it("shows realistic generated, collision, rejected, and accepted states", async () => {
    const { CatalogAliasSuggestionReview } =
      await import("./catalog-alias-suggestion-review");
    const html = renderToStaticMarkup(
      <CatalogAliasSuggestionReview
        locale="uk"
        searchQuery="rosa"
        targets={[
          {
            id: "00000000-0000-4000-8000-000000000101",
            canonicalName: "Rosa gallica",
            catalogKind: "species",
            locale: "la",
            status: "seeded",
            source: "species_backbone",
            acceptedNameCount: 4,
          },
          {
            id: "00000000-0000-4000-8000-000000000102",
            canonicalName:
              "Very long Bulgarian heritage rose catalog identity that must wrap safely without widening the operator viewport",
            catalogKind: "plant_variety",
            locale: "bg",
            status: "confirmed",
            source: "curated_user",
            acceptedNameCount: 2,
          },
        ]}
        suggestions={[
          {
            id: "00000000-0000-4000-8000-000000000301",
            catalogItemId: "00000000-0000-4000-8000-000000000101",
            catalogCanonicalName: "Rosa gallica",
            catalogPublicSlug: "rosa-gallica",
            catalogKind: "species",
            catalogSource: "species_backbone",
            generatedFromDisplayName: "Розова градина",
            displayName: "Rozova gradina",
            normalizedName: "rozova gradina",
            locale: "bg",
            script: "latin",
            aliasKind: "generated_variant",
            status: "generated",
            confidence: 0.96,
            reasonCodes: ["cyrtranslit_forward"],
            generatorVersion: "ove160-v1",
            generatedAt: "2026-07-15T12:00:00.000Z",
            reviewedAt: null,
            decisionReasonCode: null,
            decisionResult: null,
          },
          {
            id: "00000000-0000-4000-8000-000000000302",
            catalogItemId: "00000000-0000-4000-8000-000000000101",
            catalogCanonicalName: "Rosa gallica",
            catalogPublicSlug: "rosa-gallica",
            catalogKind: "species",
            catalogSource: "species_backbone",
            generatedFromDisplayName: "Розе",
            displayName: "Rose",
            normalizedName: "rose",
            locale: "en",
            script: "latin",
            aliasKind: "generated_variant",
            status: "review_needed",
            confidence: 0.96,
            reasonCodes: ["cyrtranslit_forward", "normalized_collision"],
            generatorVersion: "ove160-v1",
            generatedAt: "2026-07-15T12:00:00.000Z",
            reviewedAt: null,
            decisionReasonCode: null,
            decisionResult: null,
          },
          {
            id: "00000000-0000-4000-8000-000000000303",
            catalogItemId: "00000000-0000-4000-8000-000000000101",
            catalogCanonicalName: "Rosa gallica",
            catalogPublicSlug: "rosa-gallica",
            catalogKind: "species",
            catalogSource: "species_backbone",
            generatedFromDisplayName: "Росса галика",
            displayName: "Rossa galica",
            normalizedName: "rossa galica",
            locale: "la",
            script: "latin",
            aliasKind: "generated_variant",
            status: "rejected",
            confidence: 0.8,
            reasonCodes: ["cyrtranslit_reverse"],
            generatorVersion: "ove160-v1",
            generatedAt: "2026-07-15T12:00:00.000Z",
            reviewedAt: "2026-07-15T12:30:00.000Z",
            decisionReasonCode: "incorrect_variant",
            decisionResult: "alias_rejected",
          },
          {
            id: "00000000-0000-4000-8000-000000000304",
            catalogItemId: "00000000-0000-4000-8000-000000000101",
            catalogCanonicalName: "Rosa gallica",
            catalogPublicSlug: "rosa-gallica",
            catalogKind: "species",
            catalogSource: "species_backbone",
            generatedFromDisplayName: "Роза галика",
            displayName: "Roza gallica",
            normalizedName: "roza gallica",
            locale: "bg",
            script: "latin",
            aliasKind: "generated_variant",
            status: "accepted",
            confidence: 0.96,
            reasonCodes: ["cyrtranslit_forward"],
            generatorVersion: "ove160-v1",
            generatedAt: "2026-07-15T12:00:00.000Z",
            reviewedAt: "2026-07-15T12:45:00.000Z",
            decisionReasonCode: "approved_generated_alias",
            decisionResult: "alias_projected",
          },
        ]}
        generateAction={vi.fn()}
        approveAction={vi.fn()}
        rejectAction={vi.fn()}
      />,
    );

    expect(html).toContain("Підказки назв і локалей");
    expect(html).toContain('name="aliasQuery"');
    expect(html).toContain("Rosa gallica");
    expect(html).toContain("Створити назви");
    expect(html).toContain("Згенерований кандидат");
    expect(html).toContain("Потрібна перевірка конфлікту");
    expect(html).toContain("Назву відхилено");
    expect(html).toContain("Прийнято · пошук під час введення");
    expect(html).toContain("Пряма транслітерація CyrTranslit");
    expect(html).toContain("Species backbone");
    expect(html.match(/Схвалити назву/g)).toHaveLength(1);
    expect(html).not.toContain("00000000-0000-4000-8000-000000000999");
  });

  it("keeps the empty search and queue states explicit", async () => {
    const { CatalogAliasSuggestionReview } =
      await import("./catalog-alias-suggestion-review");
    const html = renderToStaticMarkup(
      <CatalogAliasSuggestionReview
        locale="uk"
        searchQuery=""
        targets={[]}
        suggestions={[]}
        generateAction={vi.fn()}
        approveAction={vi.fn()}
        rejectAction={vi.fn()}
      />,
    );

    expect(html).toContain(
      "Знайдіть ідентичність каталогу, щоб створити варіанти.",
    );
    expect(html).toContain("Згенерованих підказок назв ще немає.");
  });
});

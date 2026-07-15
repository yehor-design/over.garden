import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CatalogCurationCandidateList } from "./catalog-curation-candidate-list";

describe("CatalogCurationCandidateList", () => {
  it("highlights pilot-origin candidates with aggregate-safe context only", () => {
    const html = renderToStaticMarkup(
      <CatalogCurationCandidateList
        candidates={[
          {
            id: "00000000-0000-4000-8000-000000000201",
            displayName: "Бабусин перець",
            normalizedName: "бабусин перець",
            catalogKind: "plant_variety",
            locale: "und",
            status: "provisional",
            source: "user_added",
            createdAt: "2026-06-26T12:00:00.000Z",
            affectedObjectCount: 2,
            pilotOrigin: true,
            invitedPilotUserCount: 1,
            matchSuggestions: [
              {
                id: "00000000-0000-4000-8000-000000000301",
                targetCatalogItemId: "00000000-0000-4000-8000-000000000101",
                targetDisplayName: "Помідор чері",
                targetCanonicalName: "Помідор чері",
                catalogKind: "plant_variety",
                score: 96,
                confidenceBucket: "high",
                matchType: "fuzzy_name",
                reasonCodes: ["rapidfuzz_name_similarity", "same_catalog_kind"],
                normalizedInput: "бабусин перець",
                matchedName: "Помідор чері",
                sourceLocale: "und",
                targetLocale: "uk",
                sourceScript: "cyrillic",
                targetScript: "cyrillic",
                status: "pending",
                generatedAt: "2026-07-14T12:00:00.000Z",
              },
            ],
          },
        ]}
        confirmAction={vi.fn()}
        mergeAction={vi.fn()}
        rejectAction={vi.fn()}
        rescanAction={vi.fn()}
      />,
    );

    expect(html).toContain("Pilot signal");
    expect(html).toContain("Your name");
    expect(html).toContain("Saved only for your garden");
    expect(html).toContain("Invited gardeners: 1");
    expect(html).toContain("Objects: 2");
    expect(html).toContain("Бабусин перець");
    expect(html).toContain("Deterministic match suggestions");
    expect(html).toContain("Помідор чері");
    expect(html).toContain("96/100");
    expect(html).toContain("High confidence");
    expect(html).toContain("Fuzzy name");
    expect(html).toContain("Plant variety");
    expect(html).toContain("Refresh matches");
    expect(html).not.toContain("Refresh queued");
    expect(html).not.toContain("00000000-0000-0000-0000-000000000001");
  });

  it("renders an explicit no-safe-match state without inventing a target", () => {
    const html = renderToStaticMarkup(
      <CatalogCurationCandidateList
        candidates={[
          {
            id: "00000000-0000-4000-8000-000000000202",
            displayName: "Фіолетова загадка",
            normalizedName: "фіолетова загадка",
            catalogKind: "plant_variety",
            locale: "uk",
            status: "provisional",
            source: "user_added",
            createdAt: "2026-07-14T12:00:00.000Z",
            affectedObjectCount: 1,
            pilotOrigin: false,
            invitedPilotUserCount: 0,
            matchSuggestions: [
              {
                id: "00000000-0000-4000-8000-000000000302",
                targetCatalogItemId: null,
                targetDisplayName: null,
                targetCanonicalName: null,
                catalogKind: "plant_variety",
                score: 24,
                confidenceBucket: "none",
                matchType: "no_safe_match",
                reasonCodes: ["below_safe_threshold"],
                normalizedInput: "фіолетова загадка",
                matchedName: null,
                sourceLocale: "uk",
                targetLocale: null,
                sourceScript: "cyrillic",
                targetScript: null,
                status: "pending",
                generatedAt: "2026-07-14T12:00:00.000Z",
              },
            ],
          },
        ]}
        confirmAction={vi.fn()}
        mergeAction={vi.fn()}
        rejectAction={vi.fn()}
        rescanAction={vi.fn()}
      />,
    );

    expect(html).toContain("No safe catalog match");
    expect(html).toContain("24/100");
    expect(html).not.toContain("Suggested target:");
  });

  it("labels medium confidence explicitly and keeps full evidence available", () => {
    const html = renderToStaticMarkup(
      <CatalogCurationCandidateList
        candidates={[
          {
            id: "00000000-0000-4000-8000-000000000203",
            displayName: "Rosova gradina",
            normalizedName: "rosova gradina",
            catalogKind: "species",
            locale: "bg",
            status: "provisional",
            source: "user_added",
            createdAt: "2026-07-14T12:00:00.000Z",
            affectedObjectCount: 3,
            pilotOrigin: false,
            invitedPilotUserCount: 0,
            matchSuggestions: [
              {
                id: "00000000-0000-4000-8000-000000000303",
                targetCatalogItemId: "00000000-0000-4000-8000-000000000103",
                targetDisplayName: "Розова градина",
                targetCanonicalName: "Rosa",
                catalogKind: "species",
                score: 89,
                confidenceBucket: "medium",
                matchType: "fuzzy_name",
                reasonCodes: [
                  "rapidfuzz_name_similarity",
                  "cross_script_similarity",
                  "same_catalog_kind",
                ],
                normalizedInput: "rosova gradina",
                matchedName: "Розова градина",
                sourceLocale: "bg",
                targetLocale: "bg",
                sourceScript: "latin",
                targetScript: "cyrillic",
                status: "pending",
                generatedAt: "2026-07-14T12:00:00.000Z",
              },
            ],
          },
        ]}
        confirmAction={vi.fn()}
        mergeAction={vi.fn()}
        rejectAction={vi.fn()}
        rescanAction={vi.fn()}
      />,
    );

    expect(html).toContain("Medium confidence");
    expect(html).toContain("RapidFuzz name similarity");
    expect(html).toContain("cross-script similarity");
    expect(html).toContain("same catalog kind");
    expect(html).not.toContain('<dd class="truncate"');
  });
});

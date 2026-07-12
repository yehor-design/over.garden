import { describe, expect, it } from "vitest";

import type { PublicObjectPassportPage } from "./public-object-passport-repository";
import { buildPublicObjectPassportPresentation } from "./public-object-passport-presentation";

describe("public object passport presentation", () => {
  it("adapts only safe public fields into the shared passport contract", () => {
    const presentation = buildPublicObjectPassportPresentation(
      publicPassport(),
      "uk",
      { confirmedProvenanceCount: 2 },
    );

    expect(presentation).toMatchObject({
      audience: "public",
      objectKind: "plant",
      displayName: "Балконний томат",
      identity: {
        label: "Сорт або вид",
        value: "Помідор чері",
        state: "Підтверджено каталогом",
      },
      caretaker: {
        displayName: "Yehor",
        mention: "@yehor",
        profilePath: "/@yehor",
      },
      status: { label: "Журнал активний" },
      timeline: { totalCount: 2, loadedCount: 2, hasMore: false },
      provenance: { count: 2 },
    });
    expect(presentation.primaryAction).toEqual({
      href: "/journal/second-update",
      label: "Читати останній запис",
    });
    expect(presentation.timeline.entries[0]).toMatchObject({
      id: "entry-2",
      older: { id: "entry-1", href: "/journal/first-update" },
    });
    expect(presentation.gallery).toHaveLength(1);
    expect(JSON.stringify(presentation)).not.toMatch(
      /ownerUserId|owner_user_id|spaceName|private|quarantine|derivativeKey|coarseRegionCode|locationVisibility/i,
    );
  });

  it("uses animal and bee-colony identity labels instead of plant language", () => {
    const animal = buildPublicObjectPassportPresentation(
      publicPassport({ objectKind: "animal", catalogKind: "breed" }),
      "uk",
      { confirmedProvenanceCount: 0 },
    );
    const bees = buildPublicObjectPassportPresentation(
      publicPassport({ objectKind: "bee_colony", catalogKind: "breed" }),
      "uk",
      { confirmedProvenanceCount: 0 },
    );

    expect(animal.identity.label).toBe("Вид або порода");
    expect(animal.facts.map((fact) => fact.label)).toContain("Умови утримання");
    expect(bees.identity.label).toBe("Порода або вид бджіл");
    expect(bees.facts.map((fact) => fact.label)).toContain("Умови пасіки");
  });
});

function publicPassport(
  overrides: Partial<PublicObjectPassportPage["object"]> = {},
): PublicObjectPassportPage {
  return {
    object: {
      plantObjectId: "00000000-0000-4000-8000-000000000101",
      displayName: "Балконний томат",
      objectKind: "plant",
      varietyText: "Помідор чері",
      varietyState: "selected",
      catalogKind: "plant_variety",
      catalogCanonicalName: "Помідор чері",
      catalogPublicSlug: "visual-pomidor-cheri",
      catalogPath: "/variety/visual-pomidor-cheri",
      safeLocationLabel: "Region: Ukraine - Kyiv City",
      publicEntryCount: 2,
      firstEntryDate: new Date("2026-07-01T12:00:00.000Z"),
      latestEntryDate: new Date("2026-07-12T12:00:00.000Z"),
      ...overrides,
    },
    author: {
      handle: "yehor",
      mention: "@yehor",
      displayName: "Yehor",
      avatarUrl: null,
      profilePath: "/@yehor",
    },
    journalPreview: [
      {
        id: "entry-2",
        title: "Друга хвиля цвітіння",
        bodyPreview: "З'явилися нові китиці.",
        entryDate: new Date("2026-07-12T12:00:00.000Z"),
        publicSlug: "second-update",
        publicPath: "/journal/second-update",
        mediaPublicUrl: "https://media.over.garden/second.webp",
      },
      {
        id: "entry-1",
        title: "Перший запис",
        bodyPreview: "Висаджено у великий горщик.",
        entryDate: new Date("2026-07-01T12:00:00.000Z"),
        publicSlug: "first-update",
        publicPath: "/journal/first-update",
        mediaPublicUrl: null,
      },
    ],
    journalContinuation: [],
    coverMediaPublicUrl: "https://media.over.garden/second.webp",
    galleryMediaPublicUrls: ["https://media.over.garden/second.webp"],
    timelineHasMore: false,
  };
}

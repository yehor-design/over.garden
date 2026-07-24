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

  it("uses animal identity labels instead of plant language", () => {
    const animal = buildPublicObjectPassportPresentation(
      publicPassport({ objectKind: "animal", catalogKind: "breed" }),
      "uk",
      { confirmedProvenanceCount: 0 },
    );

    expect(animal.identity.label).toBe("Вид або порода");
    expect(animal.facts.map((fact) => fact.label)).toContain("Умови утримання");
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
        mediaFocalX: 0.5,
        mediaFocalY: 0.5,
        mediaIntrinsicWidth: 1200,
        mediaIntrinsicHeight: 900,
      },
      {
        id: "entry-1",
        title: "Перший запис",
        bodyPreview: "Висаджено у великий горщик.",
        entryDate: new Date("2026-07-01T12:00:00.000Z"),
        publicSlug: "first-update",
        publicPath: "/journal/first-update",
        mediaPublicUrl: null,
        mediaFocalX: null,
        mediaFocalY: null,
        mediaIntrinsicWidth: null,
        mediaIntrinsicHeight: null,
      },
    ],
    journalContinuation: [],
    coverMediaPublicUrl: "https://media.over.garden/second.webp",
    coverMediaFocalX: 0.5,
    coverMediaFocalY: 0.5,
    coverMediaIntrinsicWidth: 1200,
    coverMediaIntrinsicHeight: 900,
    galleryMedia: [
      {
        publicUrl: "https://media.over.garden/second.webp",
        focalX: 0.5,
        focalY: 0.5,
        intrinsicWidth: 1200,
        intrinsicHeight: 900,
      },
    ],
    galleryMediaPublicUrls: ["https://media.over.garden/second.webp"],
    timelineHasMore: false,
  };
}

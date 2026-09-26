import { describe, expect, it } from "vitest";

import type { PlantObjectPage } from "./journal-repository";
import type { ObjectProvenancePanel } from "./lineage-repository";
import { buildOwnerObjectPassportPresentation } from "./owner-object-passport-presentation";

describe("owner object passport presentation", () => {
  it("keeps an empty owner passport useful without pretending public history exists", () => {
    const presentation = buildOwnerObjectPassportPresentation(
      ownerPage({ objectKind: "animal", entries: [] }),
      emptyProvenance(),
      "uk",
    );

    expect(presentation).toMatchObject({
      audience: "owner",
      objectKind: "animal",
      caretaker: { displayName: "Ви" },
      status: { label: "Новий паспорт" },
      ownerContext: {
        spaceId: "space-1",
        spaceName: "Домашнє господарство",
        locationLabel: "Місце приховано",
      },
      timeline: { totalCount: 0, loadedCount: 0, hasMore: false, entries: [] },
      primaryAction: { href: "#follow-up-composer", label: "Новий запис" },
    });
    expect(presentation.identity.label).toBe("Вид або порода");
  });

  // The owner opens their own entries from the workspace, and the link has to
  // be the one they will copy and send: the handle and the number (ADR-0029
  // D9). Without a handle there is no `/@…` to live under, and the flat legacy
  // address is the one that answers — which the next test covers.
  it("links the owner's public entries at their numbers", () => {
    const presentation = buildOwnerObjectPassportPresentation(
      ownerPage({
        objectKind: "plant",
        entries: [
          ownerEntry("entry-2", "2026-06-01", "public", "active"),
          ownerEntry("entry-1", "2025-12-10", "public", "active"),
        ],
      }),
      emptyProvenance(),
      "uk",
      "yehor",
    );

    expect(presentation.timeline.entries[0]).toMatchObject({
      id: "entry-2",
      older: { id: "entry-1", href: "/@yehor/post/1" },
    });
  });

  it("preserves active owner chronology while keeping newest first", () => {
    const presentation = buildOwnerObjectPassportPresentation(
      ownerPage({
        objectKind: "animal",
        entries: [
          ownerEntry("entry-3", "2026-07-12", "public", "active"),
          ownerEntry("entry-2", "2026-06-01", "public", "active"),
          ownerEntry("entry-1", "2025-12-10", "public", "active"),
        ],
      }),
      {
        sourceObjectOptions: [],
        edges: [
          {
            id: "edge-1",
            sourceKind: "source_reference",
            consentState: "confirmed",
            visibilityPolicy: "owner_only_until_confirmed",
            erasureState: "active",
            sourceObject: null,
            pendingIdentity: null,
            sourceReferenceKind: "other",
            sourceReferenceLabel: "Private source",
            sourcePersonMention: null,
            createdAt: "2026-01-01",
          },
        ],
      },
      "uk",
    );

    expect(presentation.objectKind).toBe("animal");
    expect(presentation.timeline.entries.map((entry) => entry.id)).toEqual([
      "entry-3",
      "entry-2",
      "entry-1",
    ]);
    expect(presentation.timeline.entries[0]).toMatchObject({
      stateLabel: "Публічний запис",
      older: { id: "entry-2", href: "/journal/entry-2-slug" },
    });
    // OVE-353: an owner timeline holds active public entries only. A deleted
    // entry is absent, so there is no archived or private state label left to
    // render for one.
    expect(
      presentation.timeline.entries.map((entry) => entry.stateLabel),
    ).toEqual(["Публічний запис", "Публічний запис", "Публічний запис"]);
    expect(presentation.provenance.count).toBe(1);
  });

  // OVE-491: the header already carries the identity, the latest date and
  // the journal state; the facts say only what it does not.
  it("keeps the owner's facts to what the header does not already say", () => {
    const presentation = buildOwnerObjectPassportPresentation(
      ownerPage({ objectKind: "plant", entries: [] }),
      emptyProvenance(),
      "uk",
    );

    expect(presentation.facts.map((fact) => fact.key)).toEqual([
      "context",
      "first-observation",
      "chronology",
    ]);
    expect(presentation.facts[0]).toMatchObject({
      href: "/garden/spaces/space-1",
    });
  });

  it("names the specimen's public page and the organism's card apart, with no garden button", () => {
    const page = ownerPage({ objectKind: "plant", entries: [] });
    const withoutPublicPage = buildOwnerObjectPassportPresentation(
      page,
      emptyProvenance(),
      "uk",
      "yehor",
    );
    expect(withoutPublicPage.secondaryActions).toEqual([]);

    const withPublicPage = buildOwnerObjectPassportPresentation(
      page,
      emptyProvenance(),
      "bg",
      "yehor",
      "/@yehor/objects/tomato",
    );
    expect(withPublicPage.secondaryActions).toEqual([
      {
        href: "/@yehor/objects/tomato",
        label: "Публичният паспорт на този обект",
      },
    ]);
    expect(withPublicPage.breadcrumbs.map((crumb) => crumb.label)).toEqual([
      "Моята градина",
      "Домашнє господарство",
      page.plantObject.display_name,
    ]);
    expect(withPublicPage.provenance.href).toBe(
      `/garden/objects/${page.plantObject.id}/provenance`,
    );
  });

  it("covers the passport with the object's own photo before any entry photo (OVE-524)", () => {
    const page = ownerPage({ objectKind: "animal", entries: [] });
    page.gallery_media = [
      {
        id: "entry-photo",
        derivativeKey: "derivatives/entry-photo/1.webp",
        publicUrl: "https://media.example/derivatives/entry-photo/1.webp",
        focalX: 0.5,
        focalY: 0.5,
        intrinsicWidth: 1600,
        intrinsicHeight: 1200,
      },
    ];
    const withoutOwn = buildOwnerObjectPassportPresentation(
      page,
      emptyProvenance(),
      "uk",
    );
    expect(withoutOwn.cover?.publicUrl).toContain("entry-photo");

    page.object_photo = {
      media: {
        id: "object-photo",
        derivativeKey: "derivatives/object-photo/1.webp",
        publicUrl: "https://media.example/derivatives/object-photo/1.webp",
        focalX: 0.5,
        focalY: 0.5,
        intrinsicWidth: 1600,
        intrinsicHeight: 900,
      },
      view: {
        src: "https://media.example/derivatives/object-photo/1.webp",
        srcSet: null,
        width: 1600,
        height: 900,
        placeholderDataUri: null,
      },
      variantLongEdges: [1280, 480],
    };
    const withOwn = buildOwnerObjectPassportPresentation(
      page,
      emptyProvenance(),
      "uk",
    );
    expect(withOwn.cover).toMatchObject({
      publicUrl: "https://media.example/derivatives/object-photo/1.webp",
      alt: page.plantObject.display_name,
      variantLongEdges: [1280, 480],
    });
  });

  it("shows the owner their own species and cultivar words, marked as their own (0086)", () => {
    const page = ownerPage({ objectKind: "plant", entries: [] });
    page.plantObject.catalogKind = null;
    page.plantObject.species_text = "Помідор бабусин";
    page.plantObject.variety_state = "own";
    page.plantObject.variety_text = "Рожевий";
    const presentation = buildOwnerObjectPassportPresentation(
      page,
      emptyProvenance(),
      "uk",
    );
    expect(presentation.identity.value).toBe("Помідор бабусин · Рожевий");
    expect(presentation.identity.state).not.toBe(
      buildOwnerObjectPassportPresentation(
        ownerPage({ objectKind: "plant", entries: [] }),
        emptyProvenance(),
        "uk",
      ).identity.state,
    );
  });

  it.each([
    ["uk", "Регіон: Україна — місто Київ"],
    ["bg", "Регион: Украйна — град Киев"],
    ["ru", "Регион: Украина — город Киев"],
  ] as const)(
    "localizes the owner coarse-region label in %s",
    (locale, label) => {
      const page = ownerPage({ objectKind: "plant", entries: [] });
      page.plantObject.location_visibility = "region";
      page.plantObject.coarse_region_code = "UA-30";

      const presentation = buildOwnerObjectPassportPresentation(
        page,
        emptyProvenance(),
        locale,
      );

      expect(presentation.ownerContext.locationLabel).toBe(label);
      expect(presentation.facts).toContainEqual(
        expect.objectContaining({ value: `Домашнє господарство · ${label}` }),
      );
    },
  );
});

function ownerPage({
  objectKind,
  entries,
}: {
  objectKind: "plant" | "animal";
  entries: PlantObjectPage["entries"];
}): PlantObjectPage {
  return {
    space: {
      id: "space-1",
      display_name: "Домашнє господарство",
      location_visibility: "hidden",
      coarse_region_code: null,
    },
    plantObject: {
      id: "object-1",
      display_name: "Тестовий об'єкт",
      public_slug: null,
      object_kind: objectKind,
      catalog_item_id: null,
      catalogKind: objectKind === "plant" ? "species" : "breed",
      catalog_canonical_name: null,
      catalog_public_slug: null,
      catalog_species_slug: null,
      variety_text: null,
      variety_state: "unknown",
      species_text: null,
      location_visibility: "hidden",
      coarse_region_code: null,
      source_credit: null,
    },
    entries,
    gallery_media: [],
    object_photo: null,
  };
}

function ownerEntry(
  id: string,
  entryDate: string,
  visibility: "public",
  lifecycleState: "active" | "deleted_retention",
): PlantObjectPage["entries"][number] {
  return {
    id,
    owner_user_id: "owner-1",
    space_id: "space-1",
    plant_object_id: "object-1",
    title: id,
    body: `${id} body`,
    content_document: null,
    content_schema_version: null,
    journal_revision: "1",
    cover_media_asset_id: null,
    content_class: "real_ugc",
    source_language: null,
    entry_scope: "object",
    entry_date: new Date(`${entryDate}T12:00:00.000Z`),
    visibility,
    lifecycle_state: lifecycleState,
    public_slug: visibility === "public" ? `${id}-slug` : null,
    // `entry-2` is the owner's second publish; the number is what its public
    // address is made of once the owner has a handle.
    author_entry_number: Number(id.replace("entry-", "")) || null,
    published_at:
      visibility === "public" ? new Date(`${entryDate}T12:00:00.000Z`) : null,
    archived_at: null,
    deleted_at:
      lifecycleState === "deleted_retention"
        ? new Date(`${entryDate}T12:00:00.000Z`)
        : null,
    purge_after:
      lifecycleState === "deleted_retention"
        ? new Date(`${entryDate}T12:00:00.000Z`)
        : null,
    public_gone_at:
      lifecycleState === "deleted_retention"
        ? new Date(`${entryDate}T12:00:00.000Z`)
        : null,
    first_publication_disclosure_version: null,
    first_publication_disclosed_at: null,
    client_mutation_id: `mutation-${id}`,
    created_at: new Date(`${entryDate}T12:00:00.000Z`),
    updated_at: new Date(`${entryDate}T12:00:00.000Z`),
    media: null,
    mentionedObjects: [],
    timelineRelation: "direct_object",
  };
}

function emptyProvenance(): ObjectProvenancePanel {
  return { sourceObjectOptions: [], edges: [] };
}

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
      object_kind: objectKind,
      catalog_item_id: null,
      catalog_kind: objectKind === "plant" ? "species" : "breed",
      catalog_canonical_name: null,
      catalog_public_slug: null,
      variety_text: null,
      variety_state: "unknown",
      location_visibility: "hidden",
      coarse_region_code: null,
      source_credit: null,
    },
    entries,
    gallery_media: [],
    hasPriorPublicationDisclosure: entries.some(
      (entry) => entry.first_publication_disclosed_at !== null,
    ),
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

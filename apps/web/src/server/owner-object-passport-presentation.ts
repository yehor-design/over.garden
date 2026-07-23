import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  buildLivingObjectTimeline,
  formatLivingObjectPassportDate,
  formatLivingObjectPassportEntryCount,
  getLivingObjectPassportCopy,
  getLivingObjectPassportDomain,
  livingObjectIdentityStateLabel,
  type OwnerLivingObjectPassportPresentation,
} from "@/lib/living-object-passport";
import {
  publicJournalEntryPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import { getLocalizedCoarseRegionLabel } from "@/lib/garden/regions";

import type { PlantObjectPage } from "./journal-repository";
import type { ObjectProvenancePanel } from "./lineage-repository";

export function buildOwnerObjectPassportPresentation(
  page: PlantObjectPage,
  provenance: ObjectProvenancePanel,
  locale: InterfaceLocale,
): OwnerLivingObjectPassportPresentation {
  const copy = getLivingObjectPassportCopy(locale);
  const object = page.plantObject;
  const domain = getLivingObjectPassportDomain(locale, object.object_kind);
  const identityValue =
    object.catalog_canonical_name ??
    object.variety_text ??
    copy.unknownIdentity;
  const timelineEntries = buildLivingObjectTimeline(
    page.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      entryDate: entry.entry_date,
      href:
        entry.visibility === "public" &&
        entry.lifecycle_state === "active" &&
        entry.public_slug &&
        !entry.public_gone_at
          ? publicJournalEntryPath(entry.public_slug)
          : `#passport-entry-${entry.id}`,
      mediaPublicUrl: entry.media?.publicUrl ?? null,
      mediaFocalX: entry.media?.focalX ?? null,
      mediaFocalY: entry.media?.focalY ?? null,
      mediaIntrinsicWidth: entry.media?.intrinsicWidth ?? null,
      mediaIntrinsicHeight: entry.media?.intrinsicHeight ?? null,
      stateLabel:
        entry.lifecycle_state === "archived"
          ? copy.archivedEntry
          : entry.visibility === "public"
            ? copy.publicEntry
            : copy.privateEntry,
      relationLabel:
        entry.timelineRelation === "mentioned_space"
          ? copy.spaceMention
          : copy.directObjectUpdate,
    })),
  );
  const activeEntryCount = page.entries.filter(
    (entry) => entry.lifecycle_state === "active",
  ).length;
  const statusLabel =
    page.entries.length === 0
      ? copy.newPassport
      : activeEntryCount > 0
        ? copy.journalActive
        : copy.archivedHistory;
  const latestEntry = timelineEntries[0] ?? null;
  const oldestEntry = timelineEntries.at(-1) ?? null;
  const locationLabel = ownerLocationLabel(page, locale);
  const catalogPath = object.catalog_public_slug
    ? publicVarietyPath(object.catalog_public_slug)
    : null;
  const gallery = (
    page.gallery_media.length > 0
      ? page.gallery_media.map((media, index) => ({
          publicUrl: media.publicUrl,
          alt: `${object.display_name}: ${copy.mediaGallery} ${index + 1}`,
          focalX: media.focalX,
          focalY: media.focalY,
          intrinsicWidth: media.intrinsicWidth,
          intrinsicHeight: media.intrinsicHeight,
        }))
      : timelineEntries.flatMap((entry) =>
          entry.mediaPublicUrl
            ? [
                {
                  publicUrl: entry.mediaPublicUrl,
                  alt: `${object.display_name}: ${entry.title}`,
                  focalX: entry.mediaFocalX,
                  focalY: entry.mediaFocalY,
                  intrinsicWidth: entry.mediaIntrinsicWidth,
                  intrinsicHeight: entry.mediaIntrinsicHeight,
                },
              ]
            : [],
        )
  ).filter(
    (item, index, all) =>
      all.findIndex((candidate) => candidate.publicUrl === item.publicUrl) ===
      index,
  );

  return {
    audience: "owner",
    objectId: object.id,
    objectKind: object.object_kind,
    displayName: object.display_name,
    passportLabel: copy.ownerPassport,
    breadcrumbs: [
      { href: "/garden", label: copy.myGarden },
      { href: "/garden", label: page.space.display_name },
      { href: null, label: object.display_name },
    ],
    identity: {
      label: domain.identityLabel,
      value: identityValue,
      state: livingObjectIdentityStateLabel(
        locale,
        object.variety_state,
        Boolean(object.catalog_item_id),
      ),
      catalogKind: object.catalog_kind,
      catalogPath,
    },
    caretaker: {
      displayName: copy.you,
      mention: null,
      avatarUrl: null,
      profilePath: "/garden/profile",
    },
    status: {
      label: statusLabel,
      latestDate: latestEntry?.entryDate ?? null,
    },
    facts: [
      { key: "kind", label: domain.kindLabel, value: identityValue },
      {
        key: "context",
        label: domain.contextLabel,
        value: `${page.space.display_name} · ${locationLabel}`,
      },
      {
        key: "first-observation",
        label: copy.firstObservation,
        value: oldestEntry
          ? formatLivingObjectPassportDate(oldestEntry.entryDate, locale)
          : copy.noObservations,
      },
      {
        key: "latest-observation",
        label: copy.latestObservation,
        value: latestEntry
          ? formatLivingObjectPassportDate(latestEntry.entryDate, locale)
          : copy.noObservations,
      },
      {
        key: "chronology",
        label: copy.chronology,
        value: formatLivingObjectPassportEntryCount(
          locale,
          page.entries.length,
        ),
      },
      {
        key: "state",
        label: copy.currentState,
        value: statusLabel,
      },
    ],
    cover: gallery[0] ?? null,
    gallery,
    timeline: {
      totalCount: page.entries.length,
      loadedCount: timelineEntries.length,
      hasMore: false,
      entries: timelineEntries,
    },
    provenance: {
      count: provenance.edges.length,
      label: copy.provenanceRecords,
    },
    primaryAction: {
      href: "#follow-up-composer",
      label: copy.addUpdate,
    },
    secondaryActions: [
      { href: "/garden", label: copy.backToGarden },
      catalogPath ? { href: catalogPath, label: copy.openCatalog } : null,
    ].filter((action): action is NonNullable<typeof action> => action !== null),
    ownerContext: {
      spaceId: page.space.id,
      spaceName: page.space.display_name,
      locationLabel,
    },
  };
}

function ownerLocationLabel(page: PlantObjectPage, locale: InterfaceLocale) {
  const copy = getLivingObjectPassportCopy(locale);
  if (page.plantObject.location_visibility !== "region") {
    return copy.hiddenLocation;
  }

  const code =
    page.plantObject.coarse_region_code ??
    (page.space.location_visibility === "region"
      ? page.space.coarse_region_code
      : null);
  const label = getLocalizedCoarseRegionLabel(locale, code);
  return label ? `${copy.region}: ${label}` : copy.hiddenLocation;
}

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
  publicCatalogEvidencePath,
  publicJournalEntryAddress,
} from "@/lib/garden/public-paths";
import { getLocalizedCoarseRegionLabel } from "@/lib/garden/regions";

import type { PlantObjectPage } from "./journal-repository";
import type { ObjectProvenancePanel } from "./lineage-repository";

export function buildOwnerObjectPassportPresentation(
  page: PlantObjectPage,
  provenance: ObjectProvenancePanel,
  locale: InterfaceLocale,
  /** The owner's registry handle; every public link hangs from it (ADR-0029 D9). */
  authorHandle: string | null = null,
  /**
   * The specimen's public page, when it has one to show (an active public
   * entry). Offered beside the catalogue link and never as it (`OVE-491`).
   */
  publicPassportPath: string | null = null,
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
          ? publicJournalEntryAddress({
              authorHandle,
              entryNumber: entry.author_entry_number,
              publicSlug: entry.public_slug,
            })
          : `#passport-entry-${entry.id}`,
      mediaPublicUrl: entry.media?.publicUrl ?? null,
      mediaFocalX: entry.media?.focalX ?? null,
      mediaFocalY: entry.media?.focalY ?? null,
      mediaIntrinsicWidth: entry.media?.intrinsicWidth ?? null,
      mediaIntrinsicHeight: entry.media?.intrinsicHeight ?? null,
      stateLabel: copy.publicEntry,
      relationLabel:
        entry.timelineRelation === "mentioned_space"
          ? copy.spaceMention
          : copy.directObjectUpdate,
    })),
  );
  const statusLabel =
    page.entries.length === 0 ? copy.newPassport : copy.journalActive;
  const latestEntry = timelineEntries[0] ?? null;
  const oldestEntry = timelineEntries.at(-1) ?? null;
  const locationLabel = ownerLocationLabel(page, locale);
  const catalogPath =
    object.catalog_public_slug && object.catalogKind
      ? publicCatalogEvidencePath({
          catalogKind: object.catalogKind,
          publicSlug: object.catalog_public_slug,
          speciesSlug: object.catalog_species_slug,
        })
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
      // The object's space has a page of its own (`OVE-490`).
      {
        href: `/garden/spaces/${encodeURIComponent(page.space.id)}`,
        label: page.space.display_name,
      },
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
      catalogKind: object.catalogKind,
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
    // Only what the header does not already say: the identity is its
    // description line, the latest observation and the journal state its
    // badges (`OVE-491` criterion 1).
    facts: [
      {
        key: "context",
        label: domain.contextLabel,
        value: `${page.space.display_name} · ${locationLabel}`,
        // The owner's object leads to its space's own page (`OVE-490`).
        href: `/garden/spaces/${encodeURIComponent(page.space.id)}`,
      },
      {
        key: "first-observation",
        label: copy.firstObservation,
        value: oldestEntry
          ? formatLivingObjectPassportDate(oldestEntry.entryDate, locale)
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
      href: `/garden/objects/${encodeURIComponent(object.id)}/provenance`,
    },
    primaryAction: {
      href: "#follow-up-composer",
      label: copy.addUpdate,
    },
    // The garden is the breadcrumb's first step, so it is not a button too.
    // The specimen's public page and the organism's catalogue card are two
    // named links, never one ambiguous "open" (`OVE-491` criterion 2).
    secondaryActions: [
      publicPassportPath
        ? { href: publicPassportPath, label: copy.openPublicPassport }
        : null,
      catalogPath
        ? {
            href: catalogPath,
            label: copy.openCatalog.replace("{name}", identityValue),
          }
        : null,
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

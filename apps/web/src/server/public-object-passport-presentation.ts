import { CATALOG_BROWSE_PATH } from "@/lib/public-catalog-browse";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  buildLivingObjectTimeline,
  formatLivingObjectPassportDate,
  formatLivingObjectPassportEntryCount,
  getLivingObjectPassportCopy,
  getLivingObjectPassportDomain,
  livingObjectIdentityStateLabel,
  type PublicLivingObjectPassportPresentation,
} from "@/lib/living-object-passport";
import { localizedPath } from "@/lib/public-localization";

import type { PublicObjectPassportPage } from "./public-object-passport-repository";

export function buildPublicObjectPassportPresentation(
  page: PublicObjectPassportPage,
  locale: InterfaceLocale,
  input: { confirmedProvenanceCount: number },
): PublicLivingObjectPassportPresentation {
  const copy = getLivingObjectPassportCopy(locale);
  const domain = getLivingObjectPassportDomain(locale, page.object.objectKind);
  // ADR-0026 D6: a gardener's own name never appears on a public surface.
  const identityValue =
    page.object.catalogCanonicalName ??
    (page.object.varietyState === "selected"
      ? page.object.varietyText
      : null) ??
    copy.unknownIdentity;
  const entries = buildLivingObjectTimeline(
    [...page.journalPreview, ...page.journalContinuation].map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.bodyPreview,
      entryDate: entry.entryDate,
      href: entry.publicPath,
      mediaPublicUrl: entry.mediaPublicUrl,
      mediaFocalX: entry.mediaFocalX,
      mediaFocalY: entry.mediaFocalY,
      mediaIntrinsicWidth: entry.mediaIntrinsicWidth,
      mediaIntrinsicHeight: entry.mediaIntrinsicHeight,
      mediaPlaceholderDataUri: entry.mediaPlaceholderDataUri,
      mediaVariantLongEdges: entry.mediaVariantLongEdges,
      stateLabel: copy.publicEntry,
      relationLabel: copy.directObjectUpdate,
    })),
  );
  const safeContext = localizeSafeLocationLabel(
    page.object.safeLocationLabel,
    locale,
  );
  const firstDate = formatLivingObjectPassportDate(
    page.object.firstEntryDate,
    locale,
  );
  const latestDate = formatLivingObjectPassportDate(
    page.object.latestEntryDate,
    locale,
  );
  // Whose object this is, then which of theirs (`OVE-495`, criterion 3). The
  // crumbs used to run through the catalogue — "Живі об'єкти › Томат
  // звичайний › Томат на балконі" — as though a gardener's tomato were a
  // page of the species. The species stays one press away, named, in the
  // header; the path to this page is the gardener's.
  const breadcrumbs = page.author
    ? [
        { href: page.author.profilePath, label: page.author.displayName },
        {
          href: `${page.author.profilePath}?tab=objects`,
          label: copy.gardenerObjects,
        },
        { href: null, label: page.object.displayName },
      ]
    : [
        {
          href: localizedPath(locale, CATALOG_BROWSE_PATH),
          label: copy.livingObjects,
        },
        { href: null, label: page.object.displayName },
      ];
  const gallery = uniquePublicMedia(
    page.galleryMedia.length > 0
      ? page.galleryMedia.map((media, index) => ({
          publicUrl: media.publicUrl,
          alt: `${page.object.displayName}: ${copy.mediaGallery} ${index + 1}`,
          focalX: media.focalX,
          focalY: media.focalY,
          intrinsicWidth: media.intrinsicWidth,
          intrinsicHeight: media.intrinsicHeight,
          placeholderDataUri: media.placeholderDataUri,
          variantLongEdges: media.variantLongEdges,
        }))
      : entries.flatMap((entry) =>
          entry.mediaPublicUrl
            ? [
                {
                  publicUrl: entry.mediaPublicUrl,
                  alt: `${page.object.displayName}: ${entry.title}`,
                  focalX: entry.mediaFocalX,
                  focalY: entry.mediaFocalY,
                  intrinsicWidth: entry.mediaIntrinsicWidth,
                  intrinsicHeight: entry.mediaIntrinsicHeight,
                  placeholderDataUri: entry.mediaPlaceholderDataUri,
                  variantLongEdges: entry.mediaVariantLongEdges,
                },
              ]
            : [],
        ),
  );

  return {
    audience: "public",
    objectId: page.object.plantObjectId,
    objectKind: page.object.objectKind,
    displayName: page.object.displayName,
    passportLabel: copy.publicPassport,
    breadcrumbs,
    identity: {
      label: domain.identityLabel,
      value: identityValue,
      state: livingObjectIdentityStateLabel(
        locale,
        page.object.varietyState,
        Boolean(page.object.catalogCanonicalName),
        "public",
      ),
      catalogKind: page.object.catalogKind,
      catalogPath: page.object.catalogPath,
    },
    caretaker: page.author
      ? {
          displayName: page.author.displayName,
          mention: page.author.mention,
          avatarUrl: page.author.avatarUrl,
          profilePath: page.author.profilePath,
        }
      : {
          displayName: copy.defaultCaretaker,
          mention: null,
          avatarUrl: null,
          profilePath: null,
        },
    status: {
      label: copy.journalActive,
      latestDate: page.object.latestEntryDate,
    },
    facts: [
      { key: "kind", label: domain.kindLabel, value: identityValue },
      {
        key: "context",
        label: domain.contextLabel,
        value: safeContext ?? copy.hiddenLocation,
      },
      {
        key: "first-observation",
        label: copy.firstObservation,
        value: firstDate,
      },
      {
        key: "latest-observation",
        label: copy.latestObservation,
        value: latestDate,
      },
      {
        key: "chronology",
        label: copy.chronology,
        value: formatLivingObjectPassportEntryCount(
          locale,
          page.object.publicEntryCount,
        ),
      },
      {
        key: "state",
        label: copy.currentState,
        value: copy.journalActive,
      },
    ],
    cover: page.coverMediaPublicUrl
      ? {
          publicUrl: page.coverMediaPublicUrl,
          alt: `${page.object.displayName} ${domain.kindLabel.toLocaleLowerCase(locale)}`,
          focalX: page.coverMediaFocalX,
          focalY: page.coverMediaFocalY,
          intrinsicWidth: page.coverMediaIntrinsicWidth,
          intrinsicHeight: page.coverMediaIntrinsicHeight,
          placeholderDataUri: page.coverMediaPlaceholderDataUri,
          variantLongEdges: page.coverMediaVariantLongEdges,
        }
      : null,
    gallery,
    timeline: {
      totalCount: page.object.publicEntryCount,
      loadedCount: entries.length,
      hasMore: page.timelineHasMore,
      entries,
    },
    provenance: {
      count: input.confirmedProvenanceCount,
      label: copy.confirmedProvenance,
    },
    primaryAction: entries[0]
      ? { href: entries[0].href, label: copy.readLatest }
      : null,
    secondaryActions: [
      page.object.catalogPath
        ? {
            href: page.object.catalogPath,
            label: copy.openCatalog.replace("{name}", identityValue),
          }
        : null,
      page.author?.profilePath
        ? { href: page.author.profilePath, label: copy.openProfile }
        : null,
    ].filter((action): action is NonNullable<typeof action> => action !== null),
  };
}

function localizeSafeLocationLabel(
  label: string | null,
  locale: InterfaceLocale,
) {
  if (!label) return null;
  return label.replace(
    /^Region:/,
    `${getLivingObjectPassportCopy(locale).region}:`,
  );
}

function uniquePublicMedia(
  media: PublicLivingObjectPassportPresentation["gallery"],
) {
  return media.filter(
    (item, index, all) =>
      all.findIndex((candidate) => candidate.publicUrl === item.publicUrl) ===
      index,
  );
}

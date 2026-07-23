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
  const identityValue =
    page.object.catalogCanonicalName ??
    page.object.varietyText ??
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
  const breadcrumbs = [
    {
      href: localizedPath(locale, "/objects"),
      label: copy.livingObjects,
    },
    page.object.catalogPath
      ? { href: page.object.catalogPath, label: identityValue }
      : null,
    { href: null, label: page.object.displayName },
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  const gallery = uniquePublicMedia(
    page.galleryMedia.length > 0
      ? page.galleryMedia.map((media, index) => ({
          publicUrl: media.publicUrl,
          alt: `${page.object.displayName}: ${copy.mediaGallery} ${index + 1}`,
          focalX: media.focalX,
          focalY: media.focalY,
          intrinsicWidth: media.intrinsicWidth,
          intrinsicHeight: media.intrinsicHeight,
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
        ? { href: page.object.catalogPath, label: copy.openCatalog }
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

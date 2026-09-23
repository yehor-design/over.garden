import Link from "next/link";
import { MapPinIcon as MapPin } from "@/components/icons/MapPin";
import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import { SquaresFourIcon as SquaresFour } from "@/components/icons/SquaresFour";

import { buttonVariants } from "@/components/ui/button";
import { EntryCard } from "@/components/ui/entry-card";
import { entryCardDates, getEntryCardCopy } from "@/lib/entry-card-dates";
import { entryCardMedia } from "@/lib/entry-card-media";
import { getLocalizedCoarseRegionLabel } from "@/lib/garden/regions";
import {
  contentLanguageAttribute,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import type {
  PublicFeedCardEntry,
  PublicFeedKind,
} from "@/server/public-feed-repository";

/** The kind's own icon, reused in the feed's filter row and in a card. */
export const PUBLIC_FEED_KIND_ICONS: Record<
  Exclude<PublicFeedKind, "all">,
  React.ReactNode
> = {
  plant: <Sprout aria-hidden="true" className="size-4" />,
  animal: <PawPrint aria-hidden="true" className="size-4" />,
};

/** The labels the card needs from its surface's copy. */
export interface PublicFeedCardLabels {
  discuss: string;
  publishedBy: string;
  safeRegion: string;
  kindLabels: Record<Exclude<PublicFeedKind, "all">, string>;
}

/**
 * One entry, as every listing of entries draws it (`OVE-492`, `OVE-494`).
 *
 * Author and date first, then what it is about, then the gardener's words and
 * photographs. The feed, the followed feed and a gardener's profile all render
 * this component, so a reader who learns the card on one of them can read it
 * on the others.
 */
export function PublicFeedEntryCard({
  locale,
  copy,
  entry,
  priority,
  returnTo,
  headingLevel,
}: {
  locale: PublicLocale;
  copy: PublicFeedCardLabels;
  entry: PublicFeedCardEntry;
  priority: boolean;
  /**
   * The listing this card sits in, carried as `?from=` so the entry page's
   * way back returns to it (`OVE-493`); the entry's canonical address is
   * unchanged. Absent where there is no listing to go back to.
   */
  returnTo?: string;
  /** Below the listing's own heading; the feed's cards are `h2`s. */
  headingLevel?: 2 | 3;
}) {
  const dates = entryCardDates(locale, entry.entryDate, entry.publishedAt);
  // The region's name in the reader's language — "Україна — місто Київ",
  // never the "UA-30" the database keeps (`OVE-494`).
  const regionLabel = getLocalizedCoarseRegionLabel(
    locale,
    entry.object?.safeRegionCode,
  );
  const href = returnTo
    ? `${entry.publicPath}?${new URLSearchParams({ from: returnTo })}`
    : entry.publicPath;

  return (
    <EntryCard
      id={entry.id}
      href={href}
      title={entry.title}
      headingLevel={headingLevel}
      contentLanguage={
        contentLanguageAttribute(entry.sourceLanguage, locale).lang
      }
      subject={
        entry.object
          ? {
              label: entry.object.displayName,
              href: entry.object.publicPath,
              kindLabel: copy.kindLabels[entry.object.kind],
              icon: PUBLIC_FEED_KIND_ICONS[entry.object.kind],
              meta: regionLabel ? (
                <>
                  <MapPin aria-hidden="true" className="size-4" />
                  <span className="sr-only">{copy.safeRegion}: </span>
                  {regionLabel}
                </>
              ) : null,
            }
          : entry.space
            ? {
                label: entry.space.displayName,
                kindLabel: getEntryCardCopy(locale).space,
                icon: <SquaresFour aria-hidden="true" className="size-4" />,
              }
            : undefined
      }
      dateTime={dates.dateTime}
      dateLabel={dates.dateLabel}
      published={dates.published}
      excerpt={entry.excerpt}
      readMoreLabel={
        entry.excerptTruncated ? getEntryCardCopy(locale).readMore : undefined
      }
      media={entryCardMedia(entry.media)}
      author={
        entry.author
          ? {
              displayName: entry.author.displayName,
              href: entry.author.profilePath,
              avatarUrl: entry.author.avatarUrl,
            }
          : null
      }
      authorPrefix={copy.publishedBy}
      topics={entry.topics.map((topic) => ({
        label: topic.label,
        href: buildPublicFeedHref(locale, {
          cursor: null,
          kind: "all",
          topic: topic.slug,
        }),
      }))}
      /* The card's engagement slot. A listing carries no viewer like state,
         so what the card offers is the one engagement affordance that needs no
         read and no bundle: the way into the entry's own discussion, where the
         real controls live. */
      engagement={
        <Link
          href={`${href}#comments`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <MessageCircle aria-hidden="true" />
          {copy.discuss}
        </Link>
      }
      priority={priority}
    />
  );
}

export function buildPublicFeedHref(
  locale: PublicLocale,
  input: {
    cursor: string | null;
    kind: PublicFeedKind;
    topic: string | null;
  },
) {
  const params = new URLSearchParams();
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.kind !== "all") params.set("kind", input.kind);
  if (input.topic) params.set("topic", input.topic);

  const path = localizedPath(locale, "/");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

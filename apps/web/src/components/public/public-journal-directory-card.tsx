import Link from "next/link";
import { MapPinIcon as MapPin } from "@/components/icons/MapPin";
import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import { buttonVariants } from "@/components/ui/button";
import { EntryCard } from "@/components/ui/entry-card";
import { entryCardDates, getEntryCardCopy } from "@/lib/entry-card-dates";
import { entryCardMedia } from "@/lib/entry-card-media";
import { buildPublicJournalDirectoryHref } from "@/lib/public-journal-directory-navigation";
import type { PublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import {
  contentLanguageAttribute,
  type PublicLocale,
} from "@/lib/public-localization";
import { localizeTopicLabel } from "@/lib/system-topic-labels";
import type {
  PublicJournalDirectoryCard,
  PublicJournalDirectoryRequest,
} from "@/server/public-journal-directory-repository";

const KIND_ICONS: Record<"plant" | "animal", React.ReactNode> = {
  plant: <Sprout aria-hidden="true" className="size-4" />,
  animal: <PawPrint aria-hidden="true" className="size-4" />,
};

/**
 * A portion of the directory's results as list items — the page's own and
 * every «Показати ще» portion after it (DESIGN.md §5.26).
 */
export function DirectoryResultItems({
  locale,
  copy,
  request,
  cards,
  priorityIndex = -1,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  request: PublicJournalDirectoryRequest;
  cards: readonly PublicJournalDirectoryCard[];
  priorityIndex?: number;
}) {
  return cards.map((card, index) => (
    <li key={card.publicPath} className="min-w-0">
      <DirectoryResultCard
        locale={locale}
        copy={copy}
        request={request}
        card={card}
        priority={index === priorityIndex}
      />
    </li>
  ));
}

function DirectoryResultCard({
  locale,
  copy,
  request,
  card,
  priority,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  request: PublicJournalDirectoryRequest;
  card: PublicJournalDirectoryCard;
  priority: boolean;
}) {
  const directoryHref = buildPublicJournalDirectoryHref(locale, request);
  const entryHref = addDirectoryReturnTo(card.publicPath, directoryHref);
  // The observation date, with its season; publication only when it fell on
  // another day — the same meaning the feed's cards give a date (OG-UX-016).
  const dates = entryCardDates(locale, card.entryDate, card.publishedAt);

  return (
    <EntryCard
      id={card.publicPath}
      href={entryHref}
      title={card.title}
      headingLevel={3}
      contentLanguage={
        contentLanguageAttribute(card.sourceLanguage, locale).lang
      }
      subject={{
        label: card.object.displayName,
        href: card.object.publicPath,
        // One plant, not the filter's "plants": the kind word every other
        // card of an entry uses.
        kindLabel: getEntryCardCopy(locale).kinds[card.object.kind],
        icon: KIND_ICONS[card.object.kind],
        // `undefined`, not an empty fragment: a fragment is truthy, and the
        // card drew its separator with nothing after it.
        meta: card.safeRegionCode ? (
          <>
            <MapPin aria-hidden="true" className="size-4" />
            {`${copy.safeRegion} ${card.safeRegionCode}`}
          </>
        ) : undefined,
      }}
      dateTime={dates.dateTime}
      dateLabel={`${dates.dateLabel} · ${copy.seasons[card.season]}`}
      published={dates.published}
      excerpt={card.excerpt}
      readMoreLabel={
        card.excerptTruncated ? getEntryCardCopy(locale).readMore : undefined
      }
      media={entryCardMedia(card.media)}
      author={
        card.author
          ? {
              displayName: card.author.displayName,
              href: card.author.profilePath,
              avatarUrl: card.author.avatarUrl,
            }
          : null
      }
      authorPrefix={copy.publishedBy}
      topics={card.topics.map((topic) => ({
        label: localizeTopicLabel(locale, topic.slug, topic.label),
        href: buildPublicJournalDirectoryHref(locale, {
          ...request,
          topic: topic.slug,
          page: 1,
        }),
      }))}
      engagement={
        <>
          {card.object.catalogPath ? (
            <Link
              href={card.object.catalogPath}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {card.object.identityLabel}
            </Link>
          ) : (
            <span className="text-caption text-text-muted">
              {card.object.identityLabel ?? copy.identityPending}
            </span>
          )}
          <Link
            href={`${card.publicPath}#comments`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <MessageCircle aria-hidden="true" />
            {copy.discuss}
          </Link>
        </>
      }
      priority={priority}
    />
  );
}

function addDirectoryReturnTo(publicPath: string, directoryHref: string) {
  const params = new URLSearchParams({ from: directoryHref });
  return `${publicPath}?${params.toString()}`;
}

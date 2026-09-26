import Link from "next/link";

import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import { buttonVariants } from "@/components/ui/button";
import { EntryCard } from "@/components/ui/entry-card";
import { entryCardDates } from "@/lib/entry-card-dates";
import { publicCardMediaAltText } from "@/lib/public-media-alt";
import {
  contentLanguageAttribute,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import type {
  FollowedFeedItem,
  FollowedFeedObjectKind,
  FollowedFeedSource,
} from "@/server/social-return-repository";

const KIND_ICONS: Record<"plant" | "animal", React.ReactNode> = {
  plant: <Sprout aria-hidden="true" className="size-4" />,
  animal: <PawPrint aria-hidden="true" className="size-4" />,
};

/**
 * One entry of the followed feed (`/feed`), with why it is there. Shared by
 * the page and by its «Показати ще» portions, so a later portion's cards are
 * the first portion's (DESIGN.md §5.26).
 */
export function FollowedFeedEntryCard({
  item,
  locale,
  priority,
}: {
  item: FollowedFeedItem;
  locale: PublicLocale;
  priority: boolean;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const homeCopy = getLocalizedHomeContent(locale).feed;
  const reason = item.reasons[0];
  const dates = entryCardDates(locale, item.entryDate, item.publishedAt);

  return (
    <EntryCard
      id={item.key}
      href={item.href}
      title={item.title}
      contentLanguage={
        item.sourceLanguage
          ? contentLanguageAttribute(item.sourceLanguage, locale).lang
          : undefined
      }
      subject={{
        label: item.object.displayName,
        href: item.object.href,
        kindLabel: homeCopy.kindLabels[item.object.kind],
        icon: KIND_ICONS[item.object.kind],
        meta: item.object.varietyText ?? undefined,
      }}
      dateTime={dates.dateTime}
      dateLabel={dates.dateLabel}
      published={dates.published}
      excerpt={item.excerpt}
      cover={
        item.mediaUrl
          ? {
              src: item.mediaUrl,
              alt: publicCardMediaAltText({ caption: item.mediaCaption }),
            }
          : null
      }
      author={{ displayName: item.author.label, href: item.author.href }}
      authorPrefix={homeCopy.publishedBy}
      engagement={
        <>
          {reason ? (
            <span className="text-caption text-text-muted">
              {reason === "people"
                ? copy.feed.fromPerson
                : reason === "topics"
                  ? copy.feed.fromTopic
                  : copy.feed.fromObject}
            </span>
          ) : null}
          <Link
            href={`${item.href}#comments`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <MessageCircle aria-hidden="true" />
            {homeCopy.discuss}
          </Link>
        </>
      }
      priority={priority}
    />
  );
}

/** A portion of the followed feed as list items. */
export function FollowedFeedEntryItems({
  items,
  locale,
  priorityIndex = -1,
}: {
  items: readonly FollowedFeedItem[];
  locale: PublicLocale;
  priorityIndex?: number;
}) {
  return items.map((item, index) => (
    <li key={item.key} className="min-w-0">
      <FollowedFeedEntryCard
        item={item}
        locale={locale}
        priority={index === priorityIndex}
      />
    </li>
  ));
}

export function followedFeedHref(
  locale: PublicLocale,
  source: FollowedFeedSource,
  objectKind: FollowedFeedObjectKind,
  cursor?: string | null,
) {
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (objectKind !== "all") params.set("kind", objectKind);
  if (cursor) params.set("cursor", cursor);
  const path = localizedPath(locale, "/feed");
  return params.size ? `${path}?${params}` : path;
}

import { ArrowSquareOutIcon as ExternalLink } from "@/components/icons/ArrowSquareOut";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import Link from "next/link";

import { removeBookmarkFromShelfAction } from "@/app/(default)/bookmarks/actions";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { ShelfRemoveButton, ShelfRow } from "@/components/social/shelf";
import { Callout } from "@/components/ui/callout";
import { EntryCard } from "@/components/ui/entry-card";
import { HiddenField } from "@/components/ui/hidden-field";
import { iconButtonVariants } from "@/components/ui/icon-button";
import { entryCardDates } from "@/lib/entry-card-dates";
import { publicCardMediaAltText } from "@/lib/public-media-alt";
import {
  contentLanguageAttribute,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { shelfRowAnchor, type ShelfAction } from "@/lib/social/shelf-view";
import {
  fillSocialTemplate,
  getSocialSurfaceCopy,
  type SocialSurfaceCopy,
} from "@/lib/social-surface-copy";
import type {
  EngagementBookmarkShelfItem,
  EngagementTarget,
} from "@/server/engagement-repository";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import type { FollowedFeedItem } from "@/server/social-return-repository";

export type BookmarkFilter = "all" | EngagementTarget["kind"];

export interface ShelfOutcomeNotice {
  outcome: "removed" | "restored" | "failed";
  action: ShelfAction;
  target: EngagementTarget;
  /** The thing's public name, when it still has one. */
  name: string | null;
  /**
   * Whether it is still public, so that putting it back can succeed: saving
   * needs a public target, and an Undo that can only fail is not one.
   */
  restorable: boolean;
}

/**
 * A portion of the bookmark shelf as its list items (`OVE-502`), the same
 * for the page's first portion and every «Показати ще» portion after it
 * (DESIGN.md §5.26).
 */
export function BookmarkShelfItems({
  items,
  cards,
  locale,
  returnTo,
  failedRowKey,
  notice,
}: {
  items: readonly EngagementBookmarkShelfItem[];
  cards: ReadonlyMap<string, FollowedFeedItem>;
  locale: PublicLocale;
  returnTo: string;
  failedRowKey?: string;
  notice?: ShelfOutcomeNotice | null;
}) {
  return items.map((item) => {
    const card =
      item.available && item.target.kind === "journal_entry"
        ? cards.get(item.target.ref)
        : undefined;
    const failed = notice && item.key === failedRowKey ? notice : null;
    return card ? (
      <SavedEntry
        key={item.key}
        item={item}
        card={card}
        locale={locale}
        returnTo={returnTo}
        failed={failed}
      />
    ) : (
      <BookmarkRow
        key={item.key}
        item={item}
        locale={locale}
        returnTo={returnTo}
        failed={failed}
      />
    );
  });
}

const KIND_ICONS: Record<"plant" | "animal", React.ReactNode> = {
  plant: <Sprout aria-hidden="true" className="size-4" />,
  animal: <PawPrint aria-hidden="true" className="size-4" />,
};

/**
 * A saved entry, as the feed draws it (`OVE-502`): the same card, so it reads
 * here as it read where it was saved, and it opens with `?from=` this view so
 * the entry's way back returns to the shelf.
 */
function SavedEntry({
  item,
  card,
  locale,
  returnTo,
  failed,
}: {
  item: EngagementBookmarkShelfItem;
  card: FollowedFeedItem;
  locale: PublicLocale;
  returnTo: string;
  failed: ShelfOutcomeNotice | null;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const homeCopy = getLocalizedHomeContent(locale).feed;
  const dates = entryCardDates(locale, card.entryDate, card.publishedAt);
  const anchor = shelfRowAnchor(`${item.target.kind}:${item.target.ref}`);
  return (
    <li
      id={anchor}
      data-saved-item="journal_entry"
      data-saved-available="true"
      className="grid scroll-mt-24 gap-2"
    >
      <EntryCard
        id={card.key}
        href={`${card.href}?${new URLSearchParams({ from: returnTo })}`}
        title={card.title}
        contentLanguage={
          card.sourceLanguage
            ? contentLanguageAttribute(card.sourceLanguage, locale).lang
            : undefined
        }
        subject={{
          label: card.object.displayName,
          href: card.object.href,
          kindLabel: homeCopy.kindLabels[card.object.kind],
          icon: KIND_ICONS[card.object.kind],
          meta: card.object.varietyText ?? undefined,
        }}
        dateTime={dates.dateTime}
        dateLabel={dates.dateLabel}
        published={dates.published}
        excerpt={card.excerpt}
        cover={
          card.mediaUrl
            ? {
                src: card.mediaUrl,
                alt: publicCardMediaAltText({ caption: card.mediaCaption }),
              }
            : null
        }
        author={{ displayName: card.author.label, href: card.author.href }}
        authorPrefix={homeCopy.publishedBy}
        headingLevel={2}
        engagement={
          <>
            <span className="text-caption text-text-muted">
              {`${copy.common.saved} ${formatDate(item.addedAt, locale)}`}
            </span>
            <BookmarkForm
              action={removeBookmarkFromShelfAction}
              target={item.target}
              locale={locale}
              returnTo={returnTo}
            >
              <ShelfRemoveButton
                label={fillSocialTemplate(copy.bookmarks.removeLabel, {
                  name: card.title,
                })}
              />
            </BookmarkForm>
          </>
        }
      />
      {failed ? <FailedNotice copy={copy} action={failed.action} /> : null}
    </li>
  );
}

/**
 * A saved plant or animal, variety or topic — or anything that is not public
 * any more, which says so and can still be removed.
 */
function BookmarkRow({
  item,
  locale,
  returnTo,
  failed,
}: {
  item: EngagementBookmarkShelfItem;
  locale: PublicLocale;
  returnTo: string;
  failed: ShelfOutcomeNotice | null;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const available = item.available && item.target.href && item.target.label;
  const name = available ? item.target.label! : copy.bookmarks.unavailableTitle;
  return (
    <ShelfRow
      id={shelfRowAnchor(`${item.target.kind}:${item.target.ref}`)}
      data-saved-item={item.target.kind}
      data-saved-available={available ? "true" : "false"}
      kindLabel={targetLabel(item.target.kind, locale)}
      title={name}
      href={available ? item.target.href! : undefined}
      meta={
        <>
          {available ? null : (
            <span className="block">
              {copy.bookmarks.unavailable[item.target.kind]}
            </span>
          )}
          {`${copy.common.saved} ${formatDate(item.addedAt, locale)}`}
        </>
      }
      actions={
        <>
          {available ? (
            <Link
              href={item.target.href!}
              aria-label={`${copy.common.open}: ${name}`}
              className={iconButtonVariants({ variant: "secondary" })}
            >
              <ExternalLink aria-hidden="true" className="size-5" />
            </Link>
          ) : null}
          <BookmarkForm
            action={removeBookmarkFromShelfAction}
            target={item.target}
            locale={locale}
            returnTo={returnTo}
          >
            <ShelfRemoveButton
              label={fillSocialTemplate(copy.bookmarks.removeLabel, {
                // Without a public name, what it was and when it was saved:
                // two withdrawn entries are two different buttons.
                name: available
                  ? name
                  : [
                      name,
                      targetLabel(item.target.kind, locale),
                      `${copy.common.saved} ${formatDate(item.addedAt, locale)}`,
                    ].join(" · "),
              })}
            />
          </BookmarkForm>
          {failed ? (
            <div className="basis-full">
              <FailedNotice copy={copy} action={failed.action} />
            </div>
          ) : null}
        </>
      }
    />
  );
}

export function BookmarkForm({
  action,
  target,
  locale,
  returnTo,
  children,
}: {
  action: typeof removeBookmarkFromShelfAction;
  target: EngagementTarget;
  locale: PublicLocale;
  returnTo: string;
  children: React.ReactNode;
}) {
  return (
    <OwnerScopedProgressiveForm action={action}>
      <HiddenField name="targetKind" value={target.kind} />
      <HiddenField name="targetRef" value={target.ref} />
      <HiddenField name="locale" value={locale} />
      <HiddenField name="returnTo" value={returnTo} />
      {children}
    </OwnerScopedProgressiveForm>
  );
}

function FailedNotice({
  copy,
  action,
}: {
  copy: SocialSurfaceCopy;
  action: ShelfAction;
}) {
  return (
    <Callout
      tone="danger"
      live="assertive"
      data-shelf-outcome="failed"
      className="py-2"
    >
      <p>{copy.bookmarks.failed[action]}</p>
    </Callout>
  );
}

function targetLabel(kind: string, locale: PublicLocale) {
  const copy = getSocialSurfaceCopy(locale).bookmarks;
  if (kind === "journal_entry") return copy.journals;
  if (kind === "lineage_object") return copy.objects;
  if (kind === "variety") return copy.varieties;
  return copy.topics;
}

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Date(value).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The shelf's address: its filter, and the portion to start from. */
export function bookmarkHref(
  locale: PublicLocale,
  filter: BookmarkFilter,
  cursor: string | null,
) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("kind", filter);
  if (cursor) params.set("cursor", cursor);
  const path = localizedPath(locale, "/bookmarks");
  return params.size ? `${path}?${params}` : path;
}

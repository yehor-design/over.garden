import { ArrowSquareOutIcon as ExternalLink } from "@/components/icons/ArrowSquareOut";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  removeBookmarkFromShelfAction,
  restoreBookmarkToShelfAction,
} from "@/app/(default)/bookmarks/actions";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { MySocialLayout } from "@/components/social/my-social-layout";
import {
  ShelfNotice,
  ShelfRemoveButton,
  ShelfRow,
} from "@/components/social/shelf";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard } from "@/components/ui/entry-card";
import { HiddenField } from "@/components/ui/hidden-field";
import { iconButtonVariants } from "@/components/ui/icon-button";
import { Pagination } from "@/components/ui/pagination";
import { entryCardDates } from "@/lib/entry-card-dates";
import { resolveIllustration } from "@/lib/illustrations";
import { publicCardMediaAltText } from "@/lib/public-media-alt";
import {
  buildLanguageAlternates,
  contentLanguageAttribute,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  readShelfOutcome,
  shelfRowAnchor,
  type ShelfAction,
} from "@/lib/social/shelf-view";
import {
  fillSocialTemplate,
  getSocialSurfaceCopy,
  type SocialSurfaceCopy,
} from "@/lib/social-surface-copy";
import {
  findPublicEngagementTarget,
  listEngagementBookmarks,
  normalizeEngagementTarget,
  type EngagementBookmarkShelfItem,
  type EngagementTarget,
} from "@/server/engagement-repository";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import {
  listSavedEntryCards,
  type FollowedFeedItem,
} from "@/server/social-return-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

const PAGE_SIZE = 12;

interface LocalizedBookmarksRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: LocalizedBookmarksRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";
  const copy = getSocialSurfaceCopy(locale);
  return {
    title: `${copy.bookmarks.title} | OverGarden`,
    description: copy.bookmarks.description,
    alternates: isPublicLocale(localeParam)
      ? {
          canonical: localizedPath(locale, "/bookmarks"),
          languages: buildLanguageAlternates("/bookmarks"),
        }
      : undefined,
    robots: { index: false, follow: false },
  };
}

type BookmarkFilter = "all" | EngagementTarget["kind"];

interface ShelfOutcomeNotice {
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
 * Bookmarks: saved reading (`OVE-502`).
 *
 * A saved entry is drawn as the feed draws it — author, date, what it is
 * about, the gardener's words — and opens with the way back to this view. A
 * saved plant or animal, variety or topic is a reference row. Something that
 * is not public any more stays on the shelf and says so, and can still be
 * taken off it; it used to vanish, and with it the only way to remove it.
 *
 * Every removal comes back to the view it was pressed in and names what it
 * removed, with an Undo; a write the database refused is said beside its row,
 * which is still there. The filter chips appear only on a shelf that has
 * something to filter. The one read is settled: a failure is a retry of this
 * view, never an empty shelf, and an unreadable session is not "signed out".
 */
export default async function LocalizedBookmarksRoute({
  params,
  searchParams,
}: LocalizedBookmarksRouteProps) {
  const [{ locale: localeParam }, query] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  if (!isPublicLocale(localeParam)) notFound();
  const locale = localeParam;
  const copy = getSocialSurfaceCopy(locale);
  const filter = parseFilter(firstParam(query.kind));
  const page = parsePage(firstParam(query.page));
  const viewHref = bookmarkHref(locale, filter, page);
  const layout = {
    locale,
    active: "bookmarks" as const,
    title: copy.bookmarks.title,
    description: copy.bookmarks.description,
  };

  const viewer = await resolveWorkspaceViewer();
  if (viewer.status === "unavailable") {
    return (
      <MySocialLayout {...layout}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={viewHref}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </MySocialLayout>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <MySocialLayout {...layout}>
        <SignInPrompt
          locale={locale}
          next={viewHref}
          description={copy.bookmarks.signIn}
        />
      </MySocialLayout>
    );
  }

  const outcome = readBookmarkOutcome(query);
  const settled = await settleSection(
    async () => {
      const items = await listEngagementBookmarks(viewer.scope);
      const [cards, removedTarget] = await Promise.all([
        listSavedEntryCards(
          viewer.scope,
          items
            .filter(
              (item) => item.available && item.target.kind === "journal_entry",
            )
            .map((item) => item.target.ref),
          locale,
        ),
        // A removed thing is off the shelf, so its name is read again — from
        // its public page, never from the address.
        outcome && outcome.outcome !== "restored"
          ? findPublicEngagementTarget(outcome.target, undefined, viewer.scope)
          : Promise.resolve(null),
      ]);
      return { items, cards, removedTarget };
    },
    {
      // The shelf, its targets four at a time, then the entries' cards with
      // their photos.
      deadlineMs: workspaceSectionDeadlineMs(4),
      surface: "bookmarks",
      section: "shelf",
    },
  );
  if (settled.status === "error") {
    return (
      <MySocialLayout {...layout}>
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          retryHref={viewHref}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </MySocialLayout>
    );
  }

  const { items: allItems, cards, removedTarget } = settled.value;
  const filtered = allItems.filter((item) =>
    filter === "all" ? true : item.target.kind === filter,
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const items = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const currentView = bookmarkHref(locale, filter, currentPage);
  const notice: ShelfOutcomeNotice | null = outcome
    ? {
        ...outcome,
        name:
          allItems.find((item) => sameTarget(item.target, outcome.target))
            ?.target.label ??
          removedTarget?.label ??
          null,
        restorable: Boolean(removedTarget),
      }
    : null;
  // Beside its row when the row is on this page; above the list otherwise —
  // a refused Undo, whose row is gone, or a row the shelf moved to another
  // page since the press.
  const failedRowKey =
    notice?.outcome === "failed"
      ? items.find((item) => sameTarget(item.target, notice.target))?.key
      : undefined;

  return (
    <MySocialLayout
      {...layout}
      count={filtered.length}
      // Chips only where there is something to filter (`OVE-502`): an empty
      // shelf used to draw five controls that could only ever show nothing.
      controls={
        allItems.length > 0 ? (
          <BookmarkFilters locale={locale} active={filter} />
        ) : undefined
      }
      notice={
        notice && notice.outcome !== "failed" ? (
          <ShelfNotice
            regionLabel={copy.common.noticeRegion}
            title={noticeTitle(copy, notice)}
            dismissLabel={copy.common.dismissNotice}
            undo={
              notice.outcome === "removed" && notice.restorable ? (
                <BookmarkForm
                  action={restoreBookmarkToShelfAction}
                  target={notice.target}
                  locale={locale}
                  returnTo={currentView}
                >
                  <Button type="submit" variant="secondary" size="sm">
                    {copy.common.undo}
                  </Button>
                </BookmarkForm>
              ) : undefined
            }
          />
        ) : null
      }
    >
      {/* A refused write whose row is not on this page — an Undo, whose row
          is gone — is said above the list, with the same press again. */}
      {notice?.outcome === "failed" && !failedRowKey ? (
        <div id="shelf-outcome" className="scroll-mt-24">
          <Callout
            tone="danger"
            live="assertive"
            data-shelf-outcome="failed"
            actions={
              notice.action === "restore" && notice.restorable ? (
                <BookmarkForm
                  action={restoreBookmarkToShelfAction}
                  target={notice.target}
                  locale={locale}
                  returnTo={currentView}
                >
                  <Button type="submit" variant="secondary" size="sm">
                    {copy.common.retry}
                  </Button>
                </BookmarkForm>
              ) : undefined
            }
          >
            <p>{copy.bookmarks.failed[notice.action]}</p>
          </Callout>
        </div>
      ) : null}
      {allItems.length === 0 ? (
        <EmptyState
          illustration={resolveIllustration("empty-journal")}
          title={copy.bookmarks.emptyTitle}
          description={copy.bookmarks.empty}
          action={
            <Link
              href={localizedPath(locale, "/journals")}
              className={buttonVariants()}
            >
              {copy.bookmarks.emptyAction}
            </Link>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant="no-results"
          title={copy.common.noResultsTitle}
          description={copy.common.noResultsDescription}
          action={
            <Link
              href={localizedPath(locale, "/bookmarks")}
              className={buttonVariants({ variant: "secondary" })}
            >
              {copy.common.clearFilters}
            </Link>
          }
        />
      ) : (
        <ul
          className="grid gap-4"
          aria-label={copy.bookmarks.title}
          data-saved-shelf="bookmarks"
        >
          {items.map((item) => {
            const card =
              item.available && item.target.kind === "journal_entry"
                ? cards.get(item.target.ref)
                : undefined;
            const failed = item.key === failedRowKey ? notice! : null;
            return card ? (
              <SavedEntry
                key={item.key}
                item={item}
                card={card}
                locale={locale}
                returnTo={currentView}
                failed={failed}
              />
            ) : (
              <BookmarkRow
                key={item.key}
                item={item}
                locale={locale}
                returnTo={currentView}
                failed={failed}
              />
            );
          })}
        </ul>
      )}
      {pageCount > 1 ? (
        <Pagination
          label={copy.bookmarks.title}
          previousLabel={copy.common.previous}
          previousHref={
            currentPage > 1
              ? bookmarkHref(locale, filter, currentPage - 1)
              : null
          }
          nextLabel={copy.common.next}
          nextHref={
            currentPage < pageCount
              ? bookmarkHref(locale, filter, currentPage + 1)
              : null
          }
          status={copy.common.pagePlace(currentPage, pageCount)}
        />
      ) : null}
    </MySocialLayout>
  );
}

function BookmarkFilters({
  locale,
  active,
}: {
  locale: PublicLocale;
  active: BookmarkFilter;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const filters: Array<[Exclude<BookmarkFilter, "all">, string]> = [
    ["journal_entry", copy.bookmarks.journals],
    ["lineage_object", copy.bookmarks.objects],
    ["variety", copy.bookmarks.varieties],
    ["topic", copy.bookmarks.topics],
  ];
  return (
    <form
      method="get"
      action={localizedPath(locale, "/bookmarks")}
      data-bookmark-filters="true"
      aria-label={copy.bookmarks.filtersLabel}
      className="flex max-w-full items-center gap-2 overflow-x-auto py-1"
    >
      <ToggleChip label={copy.bookmarks.all} pressed={active === "all"} />
      {filters.map(([value, label]) => {
        const pressed = active === value;
        return (
          <ToggleChip
            key={value}
            {...(pressed ? {} : { name: "kind", value })}
            label={label}
            pressed={pressed}
          />
        );
      })}
    </form>
  );
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

function BookmarkForm({
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

function noticeTitle(copy: SocialSurfaceCopy, notice: ShelfOutcomeNotice) {
  if (notice.outcome === "restored") {
    return notice.name
      ? fillSocialTemplate(copy.bookmarks.restoredNotice, {
          name: notice.name,
        })
      : copy.bookmarks.restoredNoticeUnnamed;
  }
  return notice.name
    ? fillSocialTemplate(copy.bookmarks.removedNotice, { name: notice.name })
    : copy.bookmarks.removedNoticeUnnamed;
}

/** The outcome with its target parsed back into a bookmark target. */
function readBookmarkOutcome(
  query: Record<string, string | string[] | undefined>,
) {
  const outcome = readShelfOutcome(query);
  if (!outcome) return null;
  const separator = outcome.target.indexOf(":");
  if (separator < 0) return null;
  try {
    const target = normalizeEngagementTarget(
      outcome.target.slice(0, separator),
      outcome.target.slice(separator + 1),
    );
    return { outcome: outcome.outcome, action: outcome.action, target };
  } catch {
    return null;
  }
}

function sameTarget(left: EngagementTarget, right: EngagementTarget) {
  return left.kind === right.kind && left.ref === right.ref;
}

function bookmarkHref(
  locale: PublicLocale,
  filter: BookmarkFilter,
  page: number,
) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("kind", filter);
  if (page > 1) params.set("page", String(page));
  const path = localizedPath(locale, "/bookmarks");
  return params.size ? `${path}?${params}` : path;
}

function targetLabel(kind: string, locale: PublicLocale) {
  const copy = getSocialSurfaceCopy(locale).bookmarks;
  if (kind === "journal_entry") return copy.journals;
  if (kind === "lineage_object") return copy.objects;
  if (kind === "variety") return copy.varieties;
  return copy.topics;
}

function parseFilter(value: string | undefined): BookmarkFilter {
  return value === "journal_entry" ||
    value === "lineage_object" ||
    value === "variety" ||
    value === "topic"
    ? value
    : "all";
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 && page <= 50 ? page : 1;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Date(value).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

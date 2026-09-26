import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { restoreBookmarkToShelfAction } from "@/app/(default)/bookmarks/actions";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import {
  BookmarkForm,
  BookmarkShelfItems,
  bookmarkHref,
  type BookmarkFilter,
  type ShelfOutcomeNotice,
} from "@/components/social/bookmark-shelf-items";
import { MySocialLayout } from "@/components/social/my-social-layout";
import { ShelfNotice } from "@/components/social/shelf";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ShowMoreList } from "@/components/ui/show-more-list";
import { resolveIllustration } from "@/lib/illustrations";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getShowMoreCopy } from "@/lib/show-more";
import { readShelfOutcome } from "@/lib/social/shelf-view";
import {
  fillSocialTemplate,
  getSocialSurfaceCopy,
  type SocialSurfaceCopy,
} from "@/lib/social-surface-copy";
import { savedEntryCards } from "@/server/bookmark-shelf";
import {
  countEngagementBookmarks,
  findPublicEngagementTarget,
  listEngagementBookmarks,
  normalizeEngagementTarget,
  type EngagementTarget,
} from "@/server/engagement-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { loadBookmarkPortion } from "./bookmark-portion-actions";

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
  const cursor = parseCursor(firstParam(query.cursor));
  const viewHref = bookmarkHref(locale, filter, cursor);
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
      const [shelf, counts] = await Promise.all([
        listEngagementBookmarks(viewer.scope, undefined, {
          kind: filter === "all" ? null : filter,
          cursor,
        }),
        countEngagementBookmarks(viewer.scope),
      ]);
      const [cards, removedTarget] = await Promise.all([
        savedEntryCards(viewer.scope, shelf.items, locale),
        // A removed thing is off the shelf, so its name is read again — from
        // its public page, never from the address.
        outcome && outcome.outcome !== "restored"
          ? findPublicEngagementTarget(outcome.target, undefined, viewer.scope)
          : Promise.resolve(null),
      ]);
      return { shelf, counts, cards, removedTarget };
    },
    {
      // The shelf's portion, its targets four at a time, then the entries'
      // cards with their photos.
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

  const { shelf, counts, cards, removedTarget } = settled.value;
  const items = shelf.items;
  const filteredCount =
    filter === "all" ? counts.total : (counts.byKind[filter] ?? 0);
  const currentView = bookmarkHref(locale, filter, null);
  const notice: ShelfOutcomeNotice | null = outcome
    ? {
        ...outcome,
        name:
          items.find((item) => sameTarget(item.target, outcome.target))?.target
            .label ??
          removedTarget?.label ??
          null,
        restorable: Boolean(removedTarget),
      }
    : null;
  // Beside its row when the row is in this portion; above the list otherwise
  // — a refused Undo, whose row is gone, or a row further down the shelf.
  const failedRowKey =
    notice?.outcome === "failed"
      ? items.find((item) => sameTarget(item.target, notice.target))?.key
      : undefined;

  return (
    <MySocialLayout
      {...layout}
      count={filteredCount}
      // Chips only where there is something to filter (`OVE-502`): an empty
      // shelf used to draw five controls that could only ever show nothing.
      controls={
        counts.total > 0 ? (
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
      {/* A refused write whose row is not in this portion — an Undo, whose
          row is gone — is said above the list, with the same press again. */}
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
      {counts.total === 0 ? (
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
        <ShowMoreList
          as="ul"
          className="grid gap-4"
          aria-label={copy.bookmarks.title}
          data-saved-shelf="bookmarks"
          copy={getShowMoreCopy(locale)}
          next={
            shelf.nextCursor
              ? {
                  token: shelf.nextCursor,
                  href: bookmarkHref(locale, filter, shelf.nextCursor),
                }
              : null
          }
          load={loadBookmarkPortion.bind(null, { locale, filter })}
        >
          <BookmarkShelfItems
            items={items}
            cards={cards}
            locale={locale}
            returnTo={currentView}
            failedRowKey={failedRowKey}
            notice={notice}
          />
        </ShowMoreList>
      )}
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

function parseFilter(value: string | undefined): BookmarkFilter {
  return value === "journal_entry" ||
    value === "lineage_object" ||
    value === "variety" ||
    value === "topic"
    ? value
    : "all";
}

/** A shelf cursor is opaque base64url; anything else is the first portion. */
function parseCursor(value: string | undefined) {
  return value && /^[A-Za-z0-9_-]{1,256}$/u.test(value) ? value : null;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

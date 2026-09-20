import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { MySocialLayout } from "@/components/social/my-social-layout";
import {
  ShelfNotice,
  ShelfRemoveButton,
  ShelfRow,
} from "@/components/social/shelf";
import { Button, buttonVariants } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { HiddenField } from "@/components/ui/hidden-field";
import { iconButtonVariants } from "@/components/ui/icon-button";
import { Pagination } from "@/components/ui/pagination";
import { resolveIllustration } from "@/lib/illustrations";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import {
  removeBookmarkFromShelfAction,
  restoreBookmarkToShelfAction,
} from "@/app/(default)/bookmarks/actions";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  listEngagementBookmarks,
  type EngagementBookmarkShelfItem,
} from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";

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
  const copy = getSocialSurfaceCopy(localeParam);
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) {
    return (
      <MySocialLayout
        locale={localeParam}
        active="bookmarks"
        title={copy.bookmarks.title}
        description={copy.bookmarks.description}
      >
        <SignInPrompt
          locale={localeParam}
          next={localizedPath(localeParam, "/bookmarks")}
          description={copy.bookmarks.signIn}
        />
      </MySocialLayout>
    );
  }

  const filter = parseFilter(firstParam(query.kind));
  const page = parsePage(firstParam(query.page));
  const undo = parseUndo(firstParam(query.undoKind), firstParam(query.undoRef));
  const allItems = await listEngagementBookmarks(
    scopedToUser(userId, getSessionId(session)),
  );
  const filtered = allItems.filter((item) =>
    filter === "all" ? true : item.target.kind === filter,
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const items = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <MySocialLayout
      locale={localeParam}
      active="bookmarks"
      title={copy.bookmarks.title}
      description={copy.bookmarks.description}
      count={filtered.length}
      controls={<BookmarkFilters locale={localeParam} active={filter} />}
      notice={
        undo ? (
          <ShelfNotice
            regionLabel={copy.common.noticeRegion}
            title={copy.bookmarks.removedNotice}
            dismissLabel={copy.common.dismissNotice}
            undo={
              <OwnerScopedProgressiveForm action={restoreBookmarkToShelfAction}>
                <HiddenField name="targetKind" value={undo.kind} />
                <HiddenField name="targetRef" value={undo.ref} />
                <HiddenField name="locale" value={localeParam} />
                <Button type="submit" variant="secondary" size="sm">
                  {copy.common.undo}
                </Button>
              </OwnerScopedProgressiveForm>
            }
          />
        ) : null
      }
    >
      {items.length === 0 ? (
        filter === "all" ? (
          <EmptyState
            illustration={resolveIllustration("empty-journal")}
            title={copy.bookmarks.emptyTitle}
            description={copy.bookmarks.empty}
            action={
              <Link
                href={localizedPath(localeParam, "/journals")}
                className={buttonVariants()}
              >
                {copy.bookmarks.emptyAction}
              </Link>
            }
          />
        ) : (
          <EmptyState
            variant="no-results"
            title={copy.common.noResultsTitle}
            description={copy.common.noResultsDescription}
            action={
              <Link
                href={localizedPath(localeParam, "/bookmarks")}
                className={buttonVariants({ variant: "secondary" })}
              >
                {copy.common.clearFilters}
              </Link>
            }
          />
        )
      ) : (
        <ul className="grid">
          {items.map((item) => (
            <BookmarkRow key={item.key} item={item} locale={localeParam} />
          ))}
        </ul>
      )}
      {pageCount > 1 ? (
        <Pagination
          label={copy.bookmarks.title}
          previousLabel={copy.common.previous}
          previousHref={
            currentPage > 1
              ? bookmarkHref(localeParam, filter, currentPage - 1)
              : null
          }
          nextLabel={copy.common.next}
          nextHref={
            currentPage < pageCount
              ? bookmarkHref(localeParam, filter, currentPage + 1)
              : null
          }
          status={copy.common.pagePlace(currentPage, pageCount)}
        />
      ) : null}
    </MySocialLayout>
  );
}

type BookmarkFilter = "all" | EngagementBookmarkShelfItem["target"]["kind"];

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

function BookmarkRow({
  item,
  locale,
}: {
  item: EngagementBookmarkShelfItem;
  locale: PublicLocale;
}) {
  const copy = getSocialSurfaceCopy(locale);
  return (
    <ShelfRow
      kindLabel={targetLabel(item.target.kind, locale)}
      title={item.target.label}
      href={item.target.href}
      meta={`${copy.common.saved} ${formatDate(item.addedAt, locale)}`}
      actions={
        <>
          <Link
            href={item.target.href}
            aria-label={`${copy.common.open}: ${item.target.label}`}
            className={iconButtonVariants({ variant: "secondary" })}
          >
            <ExternalLink aria-hidden="true" className="size-5" />
          </Link>
          <OwnerScopedProgressiveForm action={removeBookmarkFromShelfAction}>
            <HiddenField name="targetKind" value={item.target.kind} />
            <HiddenField name="targetRef" value={item.target.ref} />
            <HiddenField name="locale" value={locale} />
            <ShelfRemoveButton
              label={`${copy.common.remove}: ${item.target.label}`}
            />
          </OwnerScopedProgressiveForm>
        </>
      }
    />
  );
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

/**
 * The target a removal left behind, re-checked here rather than trusted: the
 * kind must be one of the four the shelf holds and the reference must look
 * like one, so an address a reader was handed cannot put arbitrary values into
 * the Undo form's hidden fields.
 */
function parseUndo(kind: string | undefined, ref: string | undefined) {
  const target = parseFilter(kind);
  if (target === "all" || !ref) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(ref)) return null;
  return { kind: target, ref };
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
  });
}

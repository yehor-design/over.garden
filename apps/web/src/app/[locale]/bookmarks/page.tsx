import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ExternalLink,
  Trash2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MySocialLayout,
  SocialEmptyState,
} from "@/components/social/my-social-layout";
import { buttonVariants } from "@/components/ui/button";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import { resolveVisualSocialScenario } from "@/lib/visual-fixtures/social-return-scenarios";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  listEngagementBookmarks,
  type EngagementBookmarkShelfItem,
} from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden/garden-auth-panel";

export const dynamic = "force-dynamic";
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
  return {
    title: "Bookmarks | OverGarden",
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
  const visualScenario = resolveVisualSocialScenario(
    query.visualSocial,
    "bookmarks",
    process.env,
  );
  const userId = visualScenario?.actorId ?? session?.user?.id;
  if (!userId) {
    return (
      <MySocialLayout
        locale={localeParam}
        active="bookmarks"
        title={copy.bookmarks.title}
        description={copy.bookmarks.description}
      >
        <GardenAuthPanel initialMessage={copy.bookmarks.signIn} />
      </MySocialLayout>
    );
  }

  const filter = parseFilter(firstParam(query.kind));
  const page = parsePage(firstParam(query.page));
  const allItems = await listEngagementBookmarks(
    scopedToUser(userId, visualScenario ? null : getSessionId(session)),
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
      controls={
        <BookmarkFilters
          locale={localeParam}
          active={filter}
          visualScenarioId={visualScenario?.id ?? null}
        />
      }
    >
      {items.length === 0 ? (
        <SocialEmptyState>{copy.bookmarks.empty}</SocialEmptyState>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {items.map((item) => (
            <BookmarkRow
              key={item.key}
              item={item}
              locale={localeParam}
              visualScenarioId={visualScenario?.id ?? null}
            />
          ))}
        </ol>
      )}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          {currentPage > 1 ? (
            <Link
              href={bookmarkHref(
                localeParam,
                filter,
                currentPage - 1,
                visualScenario?.id,
              )}
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeft className="size-4" />
              {copy.common.previous}
            </Link>
          ) : (
            <span />
          )}
          {currentPage < pageCount ? (
            <Link
              href={bookmarkHref(
                localeParam,
                filter,
                currentPage + 1,
                visualScenario?.id,
              )}
              className={buttonVariants({ variant: "outline" })}
            >
              {copy.common.next}
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </MySocialLayout>
  );
}

type BookmarkFilter = "all" | EngagementBookmarkShelfItem["target"]["kind"];

function BookmarkFilters({
  locale,
  active,
  visualScenarioId,
}: {
  locale: PublicLocale;
  active: BookmarkFilter;
  visualScenarioId: string | null;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const filters: Array<[BookmarkFilter, string]> = [
    ["all", copy.bookmarks.all],
    ["journal_entry", copy.bookmarks.journals],
    ["lineage_object", copy.bookmarks.objects],
    ["variety", copy.bookmarks.varieties],
    ["topic", copy.bookmarks.topics],
  ];
  return (
    <div
      className="flex overflow-x-auto border border-border"
      role="group"
      aria-label={copy.bookmarks.filtersLabel}
    >
      {filters.map(([value, label]) => (
        <Link
          key={value}
          href={bookmarkHref(locale, value, 1, visualScenarioId)}
          aria-current={active === value ? "true" : undefined}
          className={filterClass(active === value)}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function BookmarkRow({
  item,
  locale,
  visualScenarioId,
}: {
  item: EngagementBookmarkShelfItem;
  locale: PublicLocale;
  visualScenarioId: string | null;
}) {
  const copy = getSocialSurfaceCopy(locale);
  return (
    <li className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 gap-1">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
          <Bookmark className="size-4" aria-hidden="true" />
          {targetLabel(item.target.kind, locale)}
        </p>
        <Link
          href={item.target.href}
          className="font-semibold text-foreground hover:underline"
        >
          {item.target.label}
        </Link>
        <time className="text-xs text-muted-foreground">
          {copy.common.saved} {formatDate(item.addedAt, locale)}
        </time>
      </div>
      <div className="flex gap-2">
        <Link
          href={item.target.href}
          title={copy.common.open}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ExternalLink className="size-4" />
          <span className="sr-only">{copy.common.open}</span>
        </Link>
        <form method="post" action="/api/engagement/bookmarks">
          {visualScenarioId ? (
            <input type="hidden" name="visualSocial" value={visualScenarioId} />
          ) : null}
          <input type="hidden" name="targetKind" value={item.target.kind} />
          <input type="hidden" name="targetRef" value={item.target.ref} />
          <input type="hidden" name="bookmarkState" value="removed" />
          <input
            type="hidden"
            name="returnTo"
            value={bookmarkHref(locale, "all", 1, visualScenarioId)}
          />
          <button
            type="submit"
            title={copy.common.remove}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">{copy.common.remove}</span>
          </button>
        </form>
      </div>
    </li>
  );
}

function bookmarkHref(
  locale: PublicLocale,
  filter: BookmarkFilter,
  page: number,
  visualScenarioId?: string | null,
) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("kind", filter);
  if (page > 1) params.set("page", String(page));
  if (visualScenarioId) params.set("visualSocial", visualScenarioId);
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

function filterClass(active: boolean) {
  return `min-h-9 shrink-0 border-r border-border px-3 py-2 text-sm last:border-r-0 ${
    active
      ? "bg-foreground text-background"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
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
  });
}

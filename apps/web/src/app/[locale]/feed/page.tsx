import { SignInIcon as LogIn } from "@/components/icons/SignIn";
import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MySocialLayout } from "@/components/social/my-social-layout";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard } from "@/components/ui/entry-card";
import { FilterBar, type FilterBarFacet } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { PublicFeedEntryCard } from "@/components/public/public-feed-entry-card";
import { entryCardDates } from "@/lib/entry-card-dates";
import { getFilterBarChromeCopy } from "@/lib/filter-bar-copy";
import { resolveIllustration } from "@/lib/illustrations";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { publicCardMediaAltText } from "@/lib/public-media-alt";
import {
  contentLanguageAttribute,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import { readPublicFeedPage } from "@/server/public-cache";
import {
  normalizePublicFeedRequest,
  type PublicFeedEntry,
  type PublicFeedRequest,
} from "@/server/public-feed-repository";
import { scopedToUser } from "@/server/request-scope";
import {
  listFollowedFeedPage,
  type FollowedFeedItem,
  type FollowedFeedObjectKind,
  type FollowedFeedSource,
} from "@/server/social-return-repository";
import { evaluateNonDiscoveryRouteIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedFeedRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const KIND_ICONS: Record<"plant" | "animal", React.ReactNode> = {
  plant: <Sprout aria-hidden="true" className="size-4" />,
  animal: <PawPrint aria-hidden="true" className="size-4" />,
};

export async function generateMetadata({
  params,
}: LocalizedFeedRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";
  const copy = getSocialSurfaceCopy(locale);
  return {
    title: `${copy.feed.title} | OverGarden`,
    description: copy.feed.description,
    robots: evaluateNonDiscoveryRouteIndexability("workspace").robots,
  };
}

export default async function LocalizedFollowedFeedRoute({
  params,
  searchParams,
}: LocalizedFeedRouteProps) {
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
    // Awaited here rather than rendered as an element: the public read is a
    // database round trip, and an async component in a synchronous render tree
    // suspends. The route is already async, so the whole state is resolved
    // before it is returned.
    return renderSignedOutFollowedFeed({
      locale: localeParam,
      query,
      title: copy.feed.title,
      description: copy.feed.description,
    });
  }

  const source = parseSource(firstParam(query.source));
  const objectKind = parseObjectKind(firstParam(query.kind));
  const page = await listFollowedFeedPage(
    scopedToUser(userId, getSessionId(session)),
    {
      source,
      objectKind,
      cursor: firstParam(query.cursor),
      locale: localeParam,
    },
  );

  return (
    <MySocialLayout
      locale={localeParam}
      active="feed"
      title={copy.feed.title}
      description={copy.feed.description}
      count={page.items.length}
      controls={
        <FollowedFeedBar
          locale={localeParam}
          source={source}
          objectKind={objectKind}
          signedIn
        />
      }
    >
      {page.items.length === 0 ? (
        <EmptyState
          illustration={resolveIllustration("empty-journal")}
          title={copy.feed.emptyTitle}
          description={copy.feed.empty}
          action={
            <Link
              href={localizedPath(localeParam, "/journals")}
              className={buttonVariants({})}
            >
              {copy.feed.emptyAction}
            </Link>
          }
        />
      ) : (
        <ol className="grid list-none gap-4">
          {page.items.map((item, index) => (
            <li key={item.key} className="min-w-0">
              <FollowedFeedEntryCard
                item={item}
                locale={localeParam}
                priority={index === 0}
              />
            </li>
          ))}
        </ol>
      )}
      {page.items.length > 0 &&
      (page.nextCursor || firstParam(query.cursor)) ? (
        <Pagination
          label={copy.feed.paginationLabel}
          previousLabel={copy.feed.firstPage}
          previousHref={
            firstParam(query.cursor)
              ? feedHref(localeParam, source, objectKind, null)
              : null
          }
          nextLabel={copy.feed.more}
          nextHref={
            page.nextCursor
              ? feedHref(localeParam, source, objectKind, page.nextCursor)
              : null
          }
        />
      ) : null}
    </MySocialLayout>
  );
}

/**
 * What a signed-out reader gets at `/feed`.
 *
 * The real feed, with one `Callout` above it saying what signing in adds
 * (DESIGN.md §5.4, the `signed-out` state). It used to be a single bordered
 * card in the middle of a page whose whole purpose is a list of entries — a
 * reader who arrived from a shared link saw nothing at all and had no reason
 * to believe the product had anything in it.
 *
 * The public feed is the honest stand-in: a followed feed is a subset of it,
 * and every entry on it is public by definition (ADR-0022 D4).
 */
async function renderSignedOutFollowedFeed({
  locale,
  query,
  title,
  description,
}: {
  locale: PublicLocale;
  query: Record<string, string | string[] | undefined>;
  title: string;
  description: string;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const homeCopy = getLocalizedHomeContent(locale).feed;
  const request: PublicFeedRequest = normalizePublicFeedRequest({
    kind: query.kind,
    topic: query.topic,
    cursor: query.cursor,
  });
  const feed = await readPublicFeedPage(request, locale).catch(() => ({
    entries: [] as PublicFeedEntry[],
    nextCursor: null,
  }));

  return (
    <MySocialLayout
      locale={locale}
      active="feed"
      title={title}
      description={description}
      controls={
        <FollowedFeedBar
          locale={locale}
          source="all"
          objectKind="all"
          signedIn={false}
        />
      }
    >
      <div data-screen-state="signed-out" className="grid gap-4">
        {/* One way in, and no heading of its own: the page header above
            already says what this screen is, and a callout that repeats it
            gives a screen reader the same sentence twice. */}
        <Callout
          tone="info"
          actions={
            <Link
              href={buildSignInHref({
                returnTo: localizedPath(locale, "/feed"),
              })}
              className={buttonVariants({ size: "sm" })}
            >
              <LogIn aria-hidden="true" />
              {getTrustSurfaceCopy(locale).authPanel.signIn}
            </Link>
          }
        >
          <p>
            {copy.feed.signedOutPublic} {copy.feed.signIn}
          </p>
        </Callout>

        {feed.entries.length === 0 ? (
          <EmptyState
            illustration={resolveIllustration("empty-journal")}
            title={homeCopy.emptyTitle}
            description={copy.feed.empty}
            action={
              <Link
                href={localizedPath(locale, "/journals")}
                className={buttonVariants()}
              >
                {copy.feed.emptyAction}
              </Link>
            }
          />
        ) : (
          <ol className="grid list-none gap-4">
            {feed.entries.map((entry, index) => (
              <li key={entry.id} className="min-w-0">
                <PublicFeedEntryCard
                  entry={entry}
                  locale={locale}
                  copy={homeCopy}
                  priority={index === 0}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </MySocialLayout>
  );
}

/**
 * The feed's two modes, Latest (`/`) and Following (here), then this feed's
 * own facets behind one "Filters" button — who the entry came through, and
 * plants or animals (`OVE-492`, DESIGN.md §5.1). A guest gets the modes and no
 * facets: what they read here is the public feed.
 */
function FollowedFeedBar({
  locale,
  source,
  objectKind,
  signedIn,
}: {
  locale: PublicLocale;
  source: FollowedFeedSource;
  objectKind: FollowedFeedObjectKind;
  signedIn: boolean;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const home = getLocalizedHomeContent(locale).feed;
  const chrome = getFilterBarChromeCopy(locale);
  const action = localizedPath(locale, "/feed");
  const facets: FilterBarFacet[] = signedIn
    ? [
        {
          key: "source",
          label: copy.feed.sourceFiltersLabel,
          anyLabel: copy.feed.all,
          value: source === "all" ? [] : [source],
          options: [
            { value: "people", label: copy.feed.people },
            { value: "objects", label: copy.feed.objects },
            { value: "topics", label: copy.feed.topics },
          ],
        },
        {
          key: "kind",
          label: copy.feed.kindFiltersLabel,
          anyLabel: copy.feed.everyKind,
          value: objectKind === "all" ? [] : [objectKind],
          options: [
            { value: "plant", label: copy.feed.plants },
            { value: "animal", label: copy.feed.animals },
          ],
        },
      ]
    : [];
  const sourceLabels: Record<Exclude<FollowedFeedSource, "all">, string> = {
    people: copy.feed.people,
    objects: copy.feed.objects,
    topics: copy.feed.topics,
  };
  const chips = [
    ...(source === "all"
      ? []
      : [
          {
            key: "source",
            label: sourceLabels[source],
            removeHref: feedHref(locale, "all", objectKind, null),
          },
        ]),
    ...(objectKind === "all"
      ? []
      : [
          {
            key: "kind",
            label:
              objectKind === "plant" ? copy.feed.plants : copy.feed.animals,
            removeHref: feedHref(locale, source, "all", null),
          },
        ]),
  ].map((chip) => ({
    ...chip,
    removeLabel: `${home.removeFilter}: ${chip.label}`,
  }));

  return (
    <FilterBar
      action={action}
      facets={facets}
      modes={[
        {
          label: home.recentFilter,
          href: localizedPath(locale, "/"),
          current: false,
        },
        { label: home.followedFilter, href: action, current: true },
      ]}
      chips={chips}
      clearAllHref={chips.length > 1 ? action : undefined}
      clearFiltersHref={action}
      labels={{
        filters: home.filterLabel,
        openFilters: chrome.filtersWithCount(chips.length),
        sheetDescription: chrome.panelDescription,
        apply: chrome.showResults,
        close: chrome.close,
        clear: chrome.clearFilters,
        clearAll: home.emptyPrimary,
        activeFilters: home.activeFiltersLabel,
        sort: home.filterLabel,
        modes: chrome.modes,
        pending: chrome.pending,
      }}
    />
  );
}

function FollowedFeedEntryCard({
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
              alt: publicCardMediaAltText({}),
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

function feedHref(
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

function parseSource(value: string | undefined): FollowedFeedSource {
  return value === "people" || value === "objects" || value === "topics"
    ? value
    : "all";
}

function parseObjectKind(value: string | undefined): FollowedFeedObjectKind {
  return value === "plant" || value === "animal" ? value : "all";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

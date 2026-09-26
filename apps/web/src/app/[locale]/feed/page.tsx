import { SignInIcon as LogIn } from "@/components/icons/SignIn";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MySocialLayout } from "@/components/social/my-social-layout";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, type FilterBarFacet } from "@/components/ui/filter-bar";
import { ShowMoreList } from "@/components/ui/show-more-list";
import { PublicFeedEntryItems } from "@/components/public/public-feed-entry-card";
import {
  FollowedFeedEntryItems,
  followedFeedHref,
} from "@/components/social/followed-feed-entry-card";
import { getFilterBarChromeCopy } from "@/lib/filter-bar-copy";
import { resolveIllustration } from "@/lib/illustrations";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import {
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getShowMoreCopy } from "@/lib/show-more";
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
  type FollowedFeedObjectKind,
  type FollowedFeedSource,
} from "@/server/social-return-repository";
import { evaluateNonDiscoveryRouteIndexability } from "@/server/public-surface-indexing-policy";
import {
  loadFollowedFeedPortion,
  loadPublicFeedPortion,
} from "../feed-portion-actions";

interface LocalizedFeedRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

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
        <ShowMoreList
          className="grid list-none gap-4"
          data-followed-feed-list="true"
          copy={getShowMoreCopy(localeParam)}
          next={
            page.nextCursor
              ? {
                  token: page.nextCursor,
                  href: followedFeedHref(
                    localeParam,
                    source,
                    objectKind,
                    page.nextCursor,
                  ),
                }
              : null
          }
          load={loadFollowedFeedPortion.bind(null, {
            locale: localeParam,
            source,
            objectKind,
          })}
        >
          <FollowedFeedEntryItems
            items={page.items}
            locale={localeParam}
            priorityIndex={0}
          />
        </ShowMoreList>
      )}
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
          <p>{`${copy.feed.signedOutPublic} ${copy.feed.signIn}`}</p>
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
          <ShowMoreList
            className="grid list-none gap-4"
            data-public-feed-list="true"
            copy={getShowMoreCopy(locale)}
            next={
              feed.nextCursor
                ? {
                    token: feed.nextCursor,
                    href: followedFeedHref(
                      locale,
                      "all",
                      "all",
                      feed.nextCursor,
                    ),
                  }
                : null
            }
            load={loadPublicFeedPortion.bind(null, {
              locale,
              kind: request.kind,
              topic: request.topic,
              listing: "feed",
            })}
          >
            <PublicFeedEntryItems
              entries={feed.entries}
              locale={locale}
              copy={homeCopy}
              priorityIndex={0}
            />
          </ShowMoreList>
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
            removeHref: followedFeedHref(locale, "all", objectKind, null),
          },
        ]),
    ...(objectKind === "all"
      ? []
      : [
          {
            key: "kind",
            label:
              objectKind === "plant" ? copy.feed.plants : copy.feed.animals,
            removeHref: followedFeedHref(locale, source, "all", null),
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

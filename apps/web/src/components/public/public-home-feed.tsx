import Link from "next/link";
import { MapPinIcon as MapPin } from "@/components/icons/MapPin";
import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard } from "@/components/ui/entry-card";
import { ErrorState } from "@/components/ui/error-state";
import { FilterBar, type FilterBarFacet } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { entryCardDates, getEntryCardCopy } from "@/lib/entry-card-dates";
import { entryCardMedia } from "@/lib/entry-card-media";
import { getFilterBarChromeCopy } from "@/lib/filter-bar-copy";
import { resolveIllustration } from "@/lib/illustrations";
import { firstPhotographIndex } from "@/lib/media/first-photograph";
import { isKindTopicSlug } from "@/lib/system-topic-labels";
import {
  contentLanguageAttribute,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import type {
  PublicFeedEntry,
  PublicFeedKind,
  PublicFeedPage,
  PublicFeedRequest,
  TrustedPublicFeedTopic,
} from "@/server/public-feed-repository";
import type { WorkspaceFailureDescription } from "@/server/workspace-failure";

export interface PublicHomeFeedCopy {
  heading: string;
  headingDescription: string;
  filterLabel: string;
  recentFilter: string;
  followedFilter: string;
  plantFilter: string;
  animalFilter: string;
  /** The kind facet's name in the filters panel. */
  kindFacetLabel: string;
  allKinds: string;
  allTopics: string;
  removeFilter: string;
  topicFilterLabel: string;
  discuss: string;
  publishedBy: string;
  safeRegion: string;
  loadMore: string;
  firstPage: string;
  paginationLabel: string;
  endOfFeed: string;
  emptyTitle: string;
  emptyBody: string;
  emptyPrimary: string;
  emptySecondary: string;
  noResultsTitle: string;
  activeFiltersLabel: string;
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  errorReference: string;
  retry: string;
  trustedTopicsTitle: string;
  trustedTopicsEmpty: string;
  knowledgeTitle: string;
  guideLabel: string;
  answerLabel: string;
  kindLabels: Record<Exclude<PublicFeedKind, "all">, string>;
}

export type PublicHomeFeedState = "ready" | "empty" | "loading" | "error";

/** The kind's own icon, reused in the filter row and in a card's cover box. */
const KIND_ICONS: Record<Exclude<PublicFeedKind, "all">, React.ReactNode> = {
  plant: <Sprout aria-hidden="true" className="size-4" />,
  animal: <PawPrint aria-hidden="true" className="size-4" />,
};

/**
 * The first screen a stranger sees.
 *
 * One column of `EntryCard`s at 704 px, a chip row above them, and the six
 * designed states beneath (DESIGN.md §5.4). The photograph in a card is the
 * only coloured thing on the page (ADR-0031 D3), which is why the chrome here
 * is neutral to the point of being boring.
 *
 * The filter row is two `<form method="get">`s rather than a row of links, and
 * that is deliberate: `aria-pressed` is what tells a reader whether a filter is
 * on, and it is valid on a button and an ARIA error on a link. A GET form keeps
 * the press working before hydration and puts the result in the URL, so a
 * filtered feed stays linkable (ADR-0031 D6). The crawlable path to a topic is
 * the context rail's plain anchors, which is also what criterion 5 of this task
 * asks the topic row to earn.
 */
export function PublicHomeFeed({
  locale,
  copy,
  feed,
  request,
  topics,
  state,
  failure = null,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  feed: PublicFeedPage;
  request: PublicFeedRequest;
  topics: TrustedPublicFeedTopic[];
  state: PublicHomeFeedState;
  /** The settled failure class behind `state="error"` (ADR-0023). */
  failure?: WorkspaceFailureDescription | null;
}) {
  const contextModules = buildPublicHomeFeedContextModules(
    locale,
    copy,
    topics,
  );
  const filtered = request.kind !== "all" || request.topic !== null;
  const firstPhotograph = firstPhotographIndex(
    feed.entries,
    (entry) => entry.media.length > 0,
  );

  return (
    <main
      lang={locale}
      data-public-home-feed="true"
      data-public-home-feed-state={state}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      <SiteShellContextRailRegistration modules={contextModules} />

      <PageHeader title={copy.heading} description={copy.headingDescription} />

      <FeedFilterBar
        locale={locale}
        copy={copy}
        request={request}
        topics={topics}
      />

      {state === "loading" ? (
        <PublicFeedLoading label={copy.loadingLabel} />
      ) : null}

      {state === "error" ? (
        <ErrorState
          failureClass={failure?.failureClass ?? "unknown"}
          digest={failure?.digest ?? "0000000"}
          title={copy.errorTitle}
          description={copy.errorBody}
          reference={`${copy.errorReference} ${failure?.digest ?? "0000000"}`}
          retryHref={buildPublicFeedHref(locale, { ...request, cursor: null })}
          retryLabel={copy.retry}
        />
      ) : null}

      {state === "empty" ? (
        <PublicFeedEmpty
          locale={locale}
          copy={copy}
          request={request}
          topics={topics}
          filtered={filtered}
        />
      ) : null}

      {state === "ready" ? (
        <>
          <ol className="grid list-none gap-4" data-public-feed-list="true">
            {feed.entries.map((entry, index) => (
              <li key={entry.id} className="min-w-0">
                <PublicFeedEntryCard
                  locale={locale}
                  copy={copy}
                  entry={entry}
                  priority={index === firstPhotograph}
                  returnTo={buildPublicFeedHref(locale, {
                    cursor: null,
                    kind: request.kind,
                    topic: request.topic,
                  })}
                />
              </li>
            ))}
          </ol>
          {/* A feed that fits on one page gets the sentence and no
              navigation: two disabled edges and a status line between them is
              three controls saying the same nothing, and at 375 px they wrap
              into three columns of two words each. */}
          {request.cursor || feed.nextCursor ? (
            <Pagination
              label={copy.paginationLabel}
              previousLabel={copy.firstPage}
              previousHref={
                request.cursor
                  ? buildPublicFeedHref(locale, { ...request, cursor: null })
                  : null
              }
              nextLabel={copy.loadMore}
              nextHref={
                feed.nextCursor
                  ? buildPublicFeedHref(locale, {
                      ...request,
                      cursor: feed.nextCursor,
                    })
                  : null
              }
              status={feed.nextCursor ? undefined : copy.endOfFeed}
            />
          ) : (
            <p className="text-body-sm text-text-muted">{copy.endOfFeed}</p>
          )}
        </>
      ) : null}

      <div className="border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

/**
 * The feed's discovery bar (`OVE-492`, DESIGN.md §5.1).
 *
 * The feed's one primary split is *whose* entries: the latest of everyone's,
 * or the ones a reader follows, which is `/feed` (the IA's Latest / Following
 * modes). Plants or animals and the trusted topics are secondary facets behind
 * one "Filters" button — they used to be two rows of chips above the first
 * card, and plants and animals were offered twice more in the rail
 * (OG-UX-015). Following is offered to everyone: `/feed` shows a guest the
 * public feed and says what signing in adds, and the page never has to ask
 * who is reading to draw the link (ADR-0032 D2).
 *
 * A topic nobody has written about is not offered; the one in the URL stays,
 * so the reader can remove it again.
 */
function FeedFilterBar({
  locale,
  copy,
  request,
  topics,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  request: PublicFeedRequest;
  topics: TrustedPublicFeedTopic[];
}) {
  const chrome = getFilterBarChromeCopy(locale);
  const home = localizedPath(locale, "/");
  const offeredTopics = topics.filter(
    (topic) =>
      topic.slug === request.topic ||
      (topic.entryCount > 0 && !isKindTopicSlug(topic.slug)),
  );
  const facets: FilterBarFacet[] = [
    {
      key: "kind",
      label: copy.kindFacetLabel,
      anyLabel: copy.allKinds,
      value: request.kind === "all" ? [] : [request.kind],
      options: [
        { value: "plant", label: copy.plantFilter },
        { value: "animal", label: copy.animalFilter },
      ],
    },
    ...(offeredTopics.length > 0
      ? [
          {
            key: "topic",
            label: copy.topicFilterLabel,
            anyLabel: copy.allTopics,
            value: request.topic ? [request.topic] : [],
            options: offeredTopics.map((topic) => ({
              value: topic.slug,
              label: topic.label,
              ...(topic.entryCount > 0
                ? {
                    count: topic.entryCount,
                    countLabel: String(topic.entryCount),
                  }
                : {}),
            })),
          },
        ]
      : []),
  ];
  const topicLabel = topics.find(
    (topic) => topic.slug === request.topic,
  )?.label;
  const chips = [
    ...(request.kind === "all"
      ? []
      : [
          {
            key: "kind",
            label: copy.kindLabels[request.kind],
            removeHref: buildPublicFeedHref(locale, {
              ...request,
              cursor: null,
              kind: "all",
            }),
          },
        ]),
    ...(request.topic
      ? [
          {
            key: "topic",
            label: topicLabel ?? request.topic,
            removeHref: buildPublicFeedHref(locale, {
              ...request,
              cursor: null,
              topic: null,
            }),
          },
        ]
      : []),
  ].map((chip) => ({
    ...chip,
    removeLabel: `${copy.removeFilter}: ${chip.label}`,
  }));

  return (
    <FilterBar
      // The filtered feed is a query twin of the static home (ADR-0032), so
      // a change is a document navigation that lets Proxy pick the tree.
      documentNavigation
      action={home}
      facets={facets}
      modes={[
        { label: copy.recentFilter, href: home, current: true },
        {
          label: copy.followedFilter,
          href: localizedPath(locale, "/feed"),
          current: false,
        },
      ]}
      chips={chips}
      clearAllHref={chips.length > 1 ? home : undefined}
      clearFiltersHref={home}
      labels={{
        filters: copy.filterLabel,
        openFilters: chrome.filtersWithCount(chips.length),
        sheetDescription: chrome.panelDescription,
        apply: chrome.showResults,
        close: chrome.close,
        clear: chrome.clearFilters,
        clearAll: copy.emptyPrimary,
        activeFilters: copy.activeFiltersLabel,
        sort: copy.filterLabel,
        modes: chrome.modes,
        pending: chrome.pending,
      }}
    />
  );
}

/** One public entry as the feed draws it; `/feed` draws a guest's the same way. */
export function PublicFeedEntryCard({
  locale,
  copy,
  entry,
  priority,
  returnTo,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  entry: PublicFeedEntry;
  priority: boolean;
  /**
   * The feed view this card sits in, carried as `?from=` so the entry page's
   * way back returns to it (`OVE-493`); the entry's canonical address is
   * unchanged. Absent where there is no feed to go back to.
   */
  returnTo?: string;
}) {
  const dates = entryCardDates(locale, entry.entryDate, entry.publishedAt);
  const href = returnTo
    ? `${entry.publicPath}?${new URLSearchParams({ from: returnTo })}`
    : entry.publicPath;

  return (
    <EntryCard
      id={entry.id}
      href={href}
      title={entry.title}
      contentLanguage={
        contentLanguageAttribute(entry.sourceLanguage, locale).lang
      }
      subject={{
        label: entry.object.displayName,
        href: entry.object.publicPath,
        kindLabel: copy.kindLabels[entry.object.kind],
        icon: KIND_ICONS[entry.object.kind],
        meta: entry.object.safeRegionCode ? (
          <>
            <MapPin aria-hidden="true" className="size-4" />
            {copy.safeRegion} {entry.object.safeRegionCode}
          </>
        ) : null,
      }}
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
      /* The card's engagement slot. A feed read carries no viewer like state
         and this task does not change it, so what the card offers is the one
         engagement affordance that needs no read and no bundle: the way into
         the entry's own discussion, where the real controls live. */
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

function PublicFeedLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid gap-4"
    >
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="grid gap-3 rounded-lg border border-border p-4 sm:p-5"
        >
          {/* The card's own order: who and when, where, what was written. */}
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Nothing to show — and the two ways that happens are different states.
 *
 * With a filter on, something exists and the filter excluded it: no picture,
 * the active filters as chips, and one way to clear them. With no filter on,
 * the feed genuinely has nothing in it yet, and that is the first-run state
 * with its one illustration (DESIGN.md §5.4).
 */
function PublicFeedEmpty({
  locale,
  copy,
  request,
  topics,
  filtered,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  request: PublicFeedRequest;
  topics: TrustedPublicFeedTopic[];
  filtered: boolean;
}) {
  if (!filtered) {
    return (
      <EmptyState
        illustration={resolveIllustration("empty-journal")}
        title={copy.emptyTitle}
        description={copy.emptyBody}
        action={
          <Link
            href={localizedPath(locale, "/guides/start-a-living-plant-record")}
            className={buttonVariants({})}
          >
            {copy.emptySecondary}
          </Link>
        }
      />
    );
  }

  const topicLabel = topics.find(
    (topic) => topic.slug === request.topic,
  )?.label;

  return (
    <EmptyState
      variant="no-results"
      title={copy.noResultsTitle}
      description={copy.activeFiltersLabel}
      filters={
        <>
          {request.kind === "all" ? null : (
            <Chip label={copy.kindLabels[request.kind]} />
          )}
          {request.topic ? <Chip label={topicLabel ?? request.topic} /> : null}
        </>
      }
      action={
        <Link
          href={localizedPath(locale, "/")}
          className={buttonVariants({ variant: "secondary" })}
        >
          {copy.emptyPrimary}
        </Link>
      }
    />
  );
}

export function buildPublicHomeFeedContextModules(
  locale: PublicLocale,
  copy: PublicHomeFeedCopy,
  topics: TrustedPublicFeedTopic[],
): SiteShellContextRailModule[] {
  // The rail is where a topic becomes a real anchor: a crawler follows it, a
  // reader can open it in a new tab, and a topic nobody has written about is
  // not offered at all — which is what the row of zeros used to be.
  const offered = topics.filter(
    (topic) => topic.entryCount > 0 && !isKindTopicSlug(topic.slug),
  );

  return [
    {
      key: "feed-topics",
      title: copy.trustedTopicsTitle,
      emptyLabel: copy.trustedTopicsEmpty,
      items: offered.map((topic) => ({
        href: buildPublicFeedHref(locale, {
          cursor: null,
          kind: "all",
          topic: topic.slug,
        }),
        label: topic.label,
        meta: String(topic.entryCount),
      })),
    },
    {
      key: "feed-knowledge",
      title: copy.knowledgeTitle,
      items: [
        {
          href: localizedPath(locale, "/guides/start-a-living-plant-record"),
          label: copy.guideLabel,
        },
        {
          href: localizedPath(locale, "/answers/why-are-tomato-leaves-yellow"),
          label: copy.answerLabel,
        },
      ],
    },
  ];
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

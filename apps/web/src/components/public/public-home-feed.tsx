import { SignedInOnly } from "@/components/site-shell/signed-in-only";
import Link from "next/link";
import { MapPin, MessageCircle, PawPrint, Sprout } from "lucide-react";

import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
import { Chip, ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard } from "@/components/ui/entry-card";
import { ErrorState } from "@/components/ui/error-state";
import { HiddenField } from "@/components/ui/hidden-field";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveIllustration } from "@/lib/illustrations";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { publicMediaAltText } from "@/lib/public-media-alt";
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

  return (
    <main
      lang={locale}
      data-public-home-feed="true"
      data-public-home-feed-state={state}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      <SiteShellContextRailRegistration modules={contextModules} />

      <PageHeader title={copy.heading} description={copy.headingDescription} />

      <FeedFilterRow
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
                  priority={index === 0}
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
 * The chips, in two groups: the object's kind, then the trusted topics.
 *
 * A topic with no entries is not offered. A count of zero is not information
 * and a filter that can only ever return nothing is not a filter — it is a
 * dead end with a number beside it, which is what this row printed five of.
 * The one exception is the topic currently in the URL, which stays visible so
 * the reader can press it off again.
 */
function FeedFilterRow({
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
  const action = localizedPath(locale, "/");
  const offeredTopics = topics.filter(
    (topic) => topic.entryCount > 0 || topic.slug === request.topic,
  );

  return (
    <div
      role="group"
      aria-label={copy.filterLabel}
      className="grid gap-3 border-b border-border pb-4"
    >
      <form
        method="get"
        action={action}
        data-feed-kind-filters="true"
        className="feed-filter-scroll flex max-w-full items-center gap-2 overflow-x-auto py-1"
      >
        {request.topic ? (
          <HiddenField name="topic" value={request.topic} />
        ) : null}
        <ToggleChip
          label={copy.recentFilter}
          pressed={request.kind === "all"}
        />
        {(["plant", "animal"] as const).map((kind) => {
          const pressed = request.kind === kind;
          return (
            <ToggleChip
              key={kind}
              {...(pressed ? {} : { name: "kind", value: kind })}
              icon={KIND_ICONS[kind]}
              label={kind === "plant" ? copy.plantFilter : copy.animalFilter}
              pressed={pressed}
            />
          );
        })}
        {/* The one thing on this page that differs for a gardener. It is a
            region of its own so the page never asks who is reading, and stays
            a static document (ADR-0032 D2). */}
        <SignedInOnly>
          <Link
            href={localizedPath(locale, "/feed")}
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "shrink-0",
            })}
          >
            {copy.followedFilter}
          </Link>
        </SignedInOnly>
      </form>

      {offeredTopics.length > 0 ? (
        <form
          method="get"
          action={action}
          data-feed-topic-filters="true"
          className="feed-filter-scroll flex max-w-full items-center gap-2 overflow-x-auto py-1"
        >
          {request.kind !== "all" ? (
            <HiddenField name="kind" value={request.kind} />
          ) : null}
          <span className="shrink-0 text-overline text-text-muted uppercase">
            {copy.topicFilterLabel}
          </span>
          {offeredTopics.map((topic) => {
            const pressed = request.topic === topic.slug;
            return (
              <ToggleChip
                key={topic.slug}
                {...(pressed ? {} : { name: "topic", value: topic.slug })}
                label={topic.label}
                count={topic.entryCount > 0 ? topic.entryCount : undefined}
                pressed={pressed}
              />
            );
          })}
        </form>
      ) : null}
    </div>
  );
}

function PublicFeedEntryCard({
  locale,
  copy,
  entry,
  priority,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  entry: PublicFeedEntry;
  priority: boolean;
}) {
  const [cover] = entry.media;
  const sourceSet = cover ? buildPublicMediaSourceSet(cover) : null;

  return (
    <EntryCard
      id={entry.id}
      href={entry.publicPath}
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
            <MapPin aria-hidden="true" className="size-3.5" />
            {copy.safeRegion} {entry.object.safeRegionCode}
          </>
        ) : null,
      }}
      dateTime={toIsoDateTime(entry.publishedAt)}
      dateLabel={formatFeedDate(entry.publishedAt, locale)}
      excerpt={entry.excerpt}
      cover={
        cover && sourceSet
          ? {
              src: sourceSet.src,
              srcSet: sourceSet.srcSet,
              alt: publicMediaAltText({}, entry.title),
              placeholderDataUri: cover.placeholderDataUri,
              focalX: cover.focalX,
              focalY: cover.focalY,
              intrinsicWidth: cover.intrinsicWidth,
              intrinsicHeight: cover.intrinsicHeight,
            }
          : null
      }
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
          href={`${entry.publicPath}#comments`}
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
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-6 w-4/5" />
          {/* The skeleton reserves the same 16:9 box the cover will fill, so
              the arrival of the real card shifts nothing (DESIGN.md §5.4). */}
          <Skeleton className="aspect-card w-full" />
          <Skeleton className="h-4 w-40" />
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
  const offered = topics.filter((topic) => topic.entryCount > 0);

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

function formatFeedDate(value: Date | string, locale: PublicLocale) {
  const localeTag = {
    uk: "uk-UA",
    bg: "bg-BG",
    ru: "ru-RU",
  }[locale];

  return new Intl.DateTimeFormat(localeTag, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function toIsoDateTime(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

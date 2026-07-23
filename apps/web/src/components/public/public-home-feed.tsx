import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Clock3,
  Hexagon,
  MapPin,
  PawPrint,
  Sprout,
  UserRound,
} from "lucide-react";

import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { cn } from "@/lib/utils";
import type {
  PublicFeedEntry,
  PublicFeedKind,
  PublicFeedPage,
  PublicFeedRequest,
  TrustedPublicFeedTopic,
} from "@/server/public-feed-repository";

export interface PublicHomeFeedCopy {
  heading: string;
  filterLabel: string;
  recentFilter: string;
  followedFilter: string;
  plantFilter: string;
  animalFilter: string;
  beeFilter: string;
  topicFilterLabel: string;
  readEntry: string;
  publishedBy: string;
  safeRegion: string;
  loadMore: string;
  endOfFeed: string;
  emptyTitle: string;
  emptyBody: string;
  emptyPrimary: string;
  emptySecondary: string;
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  trustedTopicsTitle: string;
  trustedTopicsEmpty: string;
  knowledgeTitle: string;
  guideLabel: string;
  answerLabel: string;
  kindLabels: Record<Exclude<PublicFeedKind, "all">, string>;
}

export type PublicHomeFeedState = "ready" | "empty" | "loading" | "error";

export function PublicHomeFeed({
  locale,
  copy,
  feed,
  request,
  topics,
  isAuthenticated,
  state,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  feed: PublicFeedPage;
  request: PublicFeedRequest;
  topics: TrustedPublicFeedTopic[];
  isAuthenticated: boolean;
  state: PublicHomeFeedState;
}) {
  const contextModules = buildPublicHomeFeedContextModules(
    locale,
    copy,
    topics,
  );

  return (
    <main
      lang={locale}
      data-public-home-feed="true"
      data-public-home-feed-state={state}
      className="mx-auto flex w-full max-w-3xl flex-col px-4 py-4 sm:px-6 sm:py-5"
    >
      <SiteShellContextRailRegistration modules={contextModules} />

      <header className="flex min-h-12 items-center border-b border-border pb-3">
        <h1 className="text-3xl font-semibold text-foreground">
          {copy.heading}
        </h1>
      </header>

      <FeedFilters
        locale={locale}
        copy={copy}
        request={request}
        topics={topics}
        isAuthenticated={isAuthenticated}
      />

      {state === "loading" ? (
        <PublicFeedLoading label={copy.loadingLabel} />
      ) : null}
      {state === "error" ? (
        <PublicFeedError locale={locale} copy={copy} request={request} />
      ) : null}
      {state === "empty" ? (
        <PublicFeedEmpty locale={locale} copy={copy} />
      ) : null}
      {state === "ready" ? (
        <>
          <ol className="flex flex-col gap-4 py-5" data-public-feed-list="true">
            {feed.entries.map((entry) => (
              <li key={entry.id}>
                <PublicFeedCard locale={locale} copy={copy} entry={entry} />
              </li>
            ))}
          </ol>
          <FeedPagination
            locale={locale}
            copy={copy}
            request={request}
            feed={feed}
          />
        </>
      ) : null}

      <div className="mt-6 border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

function FeedFilters({
  locale,
  copy,
  request,
  topics,
  isAuthenticated,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  request: PublicFeedRequest;
  topics: TrustedPublicFeedTopic[];
  isAuthenticated: boolean;
}) {
  const kinds: Array<{ kind: PublicFeedKind; label: string }> = [
    { kind: "all", label: copy.recentFilter },
    { kind: "plant", label: copy.plantFilter },
    { kind: "animal", label: copy.animalFilter },
    { kind: "bee_colony", label: copy.beeFilter },
  ];

  return (
    <section
      aria-label={copy.filterLabel}
      className="flex flex-col gap-2 border-b border-border py-3"
    >
      <nav
        aria-label={copy.filterLabel}
        className="feed-filter-scroll flex max-w-full overflow-x-auto rounded-lg border border-border bg-muted/40 p-1"
      >
        {kinds.map(({ kind, label }) => {
          const active = request.kind === kind;

          return (
            <Link
              key={kind}
              href={buildPublicFeedHref(locale, {
                cursor: null,
                kind,
                topic: request.topic,
              })}
              aria-current={active ? "page" : undefined}
              className={buttonVariants({
                variant: active ? "default" : "ghost",
                size: "sm",
                className: "shrink-0",
              })}
            >
              {kind === "plant" ? <Sprout aria-hidden="true" /> : null}
              {kind === "animal" ? <PawPrint aria-hidden="true" /> : null}
              {kind === "bee_colony" ? <Hexagon aria-hidden="true" /> : null}
              {label}
            </Link>
          );
        })}
        {isAuthenticated ? (
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
        ) : null}
      </nav>

      <div
        data-feed-topic-filters="true"
        className="feed-filter-scroll flex max-w-full items-center gap-2 overflow-x-auto py-0.5"
      >
        <span className="shrink-0 text-xs font-semibold text-muted-foreground uppercase">
          {copy.topicFilterLabel}
        </span>
        {topics.map((topic) => {
          const active = request.topic === topic.slug;

          return (
            <Link
              key={topic.slug}
              href={buildPublicFeedHref(locale, {
                cursor: null,
                kind: request.kind,
                topic: active ? null : topic.slug,
              })}
              aria-current={active ? "page" : undefined}
              className={buttonVariants({
                variant: active ? "secondary" : "outline",
                size: "sm",
              })}
            >
              {topic.label}
              <span className="text-xs text-secondary-foreground tabular-nums">
                {topic.entryCount}
              </span>
            </Link>
          );
        })}
        {topics.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            {copy.trustedTopicsEmpty}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function PublicFeedCard({
  locale,
  copy,
  entry,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  entry: PublicFeedEntry;
}) {
  return (
    <article
      data-public-feed-card={entry.id}
      className="overflow-hidden rounded-lg border border-border bg-background"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={entry.object.publicPath}
              className="text-sm font-semibold break-words text-foreground hover:text-primary"
            >
              {entry.object.displayName}
            </Link>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{copy.kindLabels[entry.object.kind]}</span>
              {entry.object.safeRegionCode ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden="true" />
                  {copy.safeRegion} {entry.object.safeRegionCode}
                </span>
              ) : null}
            </p>
          </div>
          <time
            dateTime={toIsoDateTime(entry.publishedAt)}
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
          >
            <Clock3 aria-hidden="true" />
            {formatFeedDate(entry.publishedAt, locale)}
          </time>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold break-words text-foreground sm:text-xl">
            <Link href={entry.publicPath} className="hover:text-primary">
              {entry.title}
            </Link>
          </h2>
          <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
            {entry.excerpt}
          </p>
        </div>

        {entry.media.length > 0 ? <FeedMediaGrid entry={entry} /> : null}

        {entry.topics.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {entry.topics.map((topic) => (
              <Link
                key={topic.slug}
                href={buildPublicFeedHref(locale, {
                  cursor: null,
                  kind: "all",
                  topic: topic.slug,
                })}
                className="inline-flex min-h-6 items-center hover:text-primary hover:underline"
              >
                #{topic.label}
              </Link>
            ))}
          </div>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          {entry.author ? (
            <Link
              href={entry.author.profilePath}
              className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground hover:text-primary"
            >
              {entry.author.avatarUrl ? (
                <Image
                  src={entry.author.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                  <UserRound aria-hidden="true" />
                </span>
              )}
              <span className="truncate">
                {copy.publishedBy} {entry.author.displayName}
              </span>
            </Link>
          ) : (
            <span />
          )}
          <Link
            href={entry.publicPath}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {copy.readEntry}
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </article>
  );
}

function FeedMediaGrid({ entry }: { entry: PublicFeedEntry }) {
  const media = entry.media.slice(0, 3);

  return (
    <div
      data-feed-media-count={media.length}
      className={cn(
        "grid overflow-hidden rounded-md border border-border bg-muted",
        media.length === 1 && "aspect-video",
        media.length === 2 && "grid-cols-2",
        media.length === 3 && "aspect-video grid-cols-2 grid-rows-2",
      )}
    >
      {media.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            "relative min-h-32 overflow-hidden",
            media.length === 2 && "aspect-square",
            media.length === 3 && index === 0 && "row-span-2",
            media.length === 3 && index > 0 && "min-h-0",
          )}
        >
          <SubjectAwareMediaImage
            src={item.publicUrl}
            alt={`${entry.object.displayName}: ${entry.title}`}
            fill
            sizes="(max-width: 767px) 100vw, 680px"
            presentationMode="cover"
            focalX={item.focalX}
            focalY={item.focalY}
            intrinsicWidth={item.intrinsicWidth}
            intrinsicHeight={item.intrinsicHeight}
            className="absolute inset-0 h-full w-full"
            unoptimized
          />
        </div>
      ))}
    </div>
  );
}

function PublicFeedLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="flex flex-col gap-4 py-5"
    >
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

function PublicFeedEmpty({
  locale,
  copy,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
}) {
  return (
    <section className="flex flex-col items-start gap-3 py-10">
      <BookOpen aria-hidden="true" />
      <h2 className="text-xl font-semibold text-foreground">
        {copy.emptyTitle}
      </h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        {copy.emptyBody}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={localizedPath(locale, "/")}
          className={buttonVariants({ variant: "outline" })}
        >
          {copy.emptyPrimary}
        </Link>
        <Link
          href={localizedPath(locale, "/guides/start-a-living-plant-record")}
          className={buttonVariants({ variant: "ghost" })}
        >
          {copy.emptySecondary}
        </Link>
      </div>
    </section>
  );
}

function PublicFeedError({
  locale,
  copy,
  request,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  request: PublicFeedRequest;
}) {
  return (
    <section role="alert" className="flex flex-col items-start gap-3 py-10">
      <h2 className="text-xl font-semibold text-foreground">
        {copy.errorTitle}
      </h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        {copy.errorBody}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildPublicFeedHref(locale, { ...request, cursor: null })}
          className={buttonVariants({ variant: "outline" })}
        >
          {copy.retry}
        </Link>
        <Link
          href={localizedPath(locale, "/answers/why-are-tomato-leaves-yellow")}
          className={buttonVariants({ variant: "ghost" })}
        >
          {copy.answerLabel}
        </Link>
      </div>
    </section>
  );
}

function FeedPagination({
  locale,
  copy,
  request,
  feed,
}: {
  locale: PublicLocale;
  copy: PublicHomeFeedCopy;
  request: PublicFeedRequest;
  feed: PublicFeedPage;
}) {
  return (
    <footer className="flex min-h-14 items-center justify-center border-t border-border py-4">
      {feed.nextCursor ? (
        <Link
          href={buildPublicFeedHref(locale, {
            ...request,
            cursor: feed.nextCursor,
          })}
          className={buttonVariants({ variant: "outline" })}
        >
          {copy.loadMore}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.endOfFeed}</p>
      )}
    </footer>
  );
}

export function buildPublicHomeFeedContextModules(
  locale: PublicLocale,
  copy: PublicHomeFeedCopy,
  topics: TrustedPublicFeedTopic[],
): SiteShellContextRailModule[] {
  return [
    {
      key: "feed-topics",
      title: copy.trustedTopicsTitle,
      emptyLabel: copy.trustedTopicsEmpty,
      items: topics.map((topic) => ({
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
  }).format(new Date(value));
}

function toIsoDateTime(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

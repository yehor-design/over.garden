import { ArrowRight, Leaf, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import {
  MySocialLayout,
  SocialEmptyState,
} from "@/components/social/my-social-layout";
import {
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";
import {
  listFollowedFeedPage,
  type FollowedFeedItem,
  type FollowedFeedObjectKind,
  type FollowedFeedSource,
} from "@/server/social-return-repository";
import { evaluateNonDiscoveryRouteIndexability } from "@/server/public-surface-indexing-policy";
import { GardenAuthPanel } from "@/app/(default)/garden/garden-auth-panel";

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
    return (
      <MySocialLayout
        locale={localeParam}
        active="feed"
        title={copy.feed.title}
        description={copy.feed.description}
      >
        <GardenAuthPanel
          initialMessage={copy.feed.signIn}
          locale={localeParam}
        />
      </MySocialLayout>
    );
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
        <FeedFilters
          locale={localeParam}
          source={source}
          objectKind={objectKind}
        />
      }
    >
      {page.items.length === 0 ? (
        <SocialEmptyState>{copy.feed.empty}</SocialEmptyState>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {page.items.map((item, index) => (
            <FollowedFeedCard
              key={item.key}
              item={item}
              locale={localeParam}
              eagerMedia={index < 3}
            />
          ))}
        </ol>
      )}
      {page.nextCursor ? (
        <Link
          href={feedHref(localeParam, source, objectKind, page.nextCursor)}
          className="flex min-h-11 items-center justify-center gap-2 border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          {copy.feed.more}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </MySocialLayout>
  );
}

function FeedFilters({
  locale,
  source,
  objectKind,
}: {
  locale: PublicLocale;
  source: FollowedFeedSource;
  objectKind: FollowedFeedObjectKind;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const sources: Array<[FollowedFeedSource, string]> = [
    ["all", copy.feed.all],
    ["people", copy.feed.people],
    ["objects", copy.feed.objects],
    ["topics", copy.feed.topics],
  ];
  const kinds: Array<[FollowedFeedObjectKind, string]> = [
    ["all", copy.feed.everyKind],
    ["plant", copy.feed.plants],
    ["animal", copy.feed.animals],
  ];

  return (
    <>
      <div
        className="flex overflow-x-auto border border-border"
        role="group"
        aria-label={copy.feed.sourceFiltersLabel}
      >
        {sources.map(([value, label]) => (
          <Link
            key={value}
            href={feedHref(locale, value, objectKind, null)}
            aria-current={source === value ? "true" : undefined}
            className={filterClass(source === value)}
          >
            {label}
          </Link>
        ))}
      </div>
      <div
        className="flex overflow-x-auto border border-border"
        role="group"
        aria-label={copy.feed.kindFiltersLabel}
      >
        {kinds.map(([value, label]) => (
          <Link
            key={value}
            href={feedHref(locale, source, value, null)}
            aria-current={objectKind === value ? "true" : undefined}
            className={filterClass(objectKind === value)}
          >
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}

function FollowedFeedCard({
  item,
  locale,
  eagerMedia,
}: {
  item: FollowedFeedItem;
  locale: PublicLocale;
  eagerMedia: boolean;
}) {
  const copy = getSocialSurfaceCopy(locale);
  return (
    <li>
      <article className="grid gap-4 py-5 sm:flex sm:items-start">
        <div className="grid min-w-0 gap-3 sm:flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Link
              href={item.author.href}
              className="flex items-center gap-1.5 font-medium text-foreground hover:underline"
            >
              <UserRound className="size-4" aria-hidden="true" />
              {item.author.label}
            </Link>
            <time className="text-muted-foreground">
              {formatDate(item.publishedAt, locale)}
            </time>
          </div>
          <div className="grid gap-1">
            <Link href={item.href} className="group grid gap-1">
              <h2 className="text-lg font-semibold text-foreground group-hover:underline">
                {item.title}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {item.excerpt}
              </p>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link
              href={item.object.href}
              className="flex items-center gap-1 border border-border px-2 py-1 hover:text-foreground"
            >
              <Leaf className="size-3.5" aria-hidden="true" />
              {item.object.displayName}
              {item.object.varietyText ? ` · ${item.object.varietyText}` : ""}
            </Link>
            {item.reasons.map((reason) => (
              <span key={reason} className="border border-border px-2 py-1">
                {reason === "people"
                  ? copy.feed.fromPerson
                  : reason === "topics"
                    ? copy.feed.fromTopic
                    : copy.feed.fromObject}
              </span>
            ))}
          </div>
        </div>
        {item.mediaUrl ? (
          <Link
            href={item.href}
            aria-label={item.title}
            className="relative aspect-4/3 overflow-hidden bg-muted sm:w-44 sm:shrink-0"
          >
            <SubjectAwareMediaImage
              src={item.mediaUrl}
              alt=""
              fill
              loading={eagerMedia ? "eager" : "lazy"}
              sizes="(min-width: 640px) 176px, 100vw"
              presentationMode="cover"
            />
          </Link>
        ) : null}
      </article>
    </li>
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

function filterClass(active: boolean) {
  return `min-h-9 shrink-0 border-r border-border px-3 py-2 text-sm last:border-r-0 ${
    active
      ? "bg-foreground text-background"
      : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
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

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Date(value).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

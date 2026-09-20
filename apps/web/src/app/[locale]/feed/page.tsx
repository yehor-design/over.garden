import { LogIn, MessageCircle, PawPrint, Sprout } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MySocialLayout } from "@/components/social/my-social-layout";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard } from "@/components/ui/entry-card";
import { HiddenField } from "@/components/ui/hidden-field";
import { Pagination } from "@/components/ui/pagination";
import { resolveIllustration } from "@/lib/illustrations";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { publicMediaAltText } from "@/lib/public-media-alt";
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
        <FeedFilters
          locale={localeParam}
          source={source}
          objectKind={objectKind}
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

function PublicFeedEntryCard({
  entry,
  locale,
  priority,
}: {
  entry: PublicFeedEntry;
  locale: PublicLocale;
  priority: boolean;
}) {
  const copy = getLocalizedHomeContent(locale).feed;
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
      }}
      dateTime={toIsoDateTime(entry.publishedAt)}
      dateLabel={formatDate(entry.publishedAt, locale)}
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

/**
 * The filters, as chips in two GET forms.
 *
 * Six full-width controls in two bordered strips became two rows of chips that
 * say whether they are on. The same shape as the home feed's, and for the same
 * reason: `aria-pressed` is valid on a button and an ARIA error on a link, and
 * a GET form is what keeps the press working before hydration (DESIGN.md §5.1).
 */
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
  const action = localizedPath(locale, "/feed");
  const sources: Array<[Exclude<FollowedFeedSource, "all">, string]> = [
    ["people", copy.feed.people],
    ["objects", copy.feed.objects],
    ["topics", copy.feed.topics],
  ];
  const kinds: Array<[Exclude<FollowedFeedObjectKind, "all">, string]> = [
    ["plant", copy.feed.plants],
    ["animal", copy.feed.animals],
  ];

  // No wrapping `role="group"`: each form names itself, and a group around two
  // named forms adds a node a screen reader reads and a reader cannot act on —
  // the same shape as the bordered filter box `OVE-456` removed from the other
  // three pages of this family.
  return (
    <div className="grid w-full gap-3">
      <form
        method="get"
        action={action}
        aria-label={copy.feed.sourceFiltersLabel}
        data-followed-feed-source-filters="true"
        className="feed-filter-scroll flex max-w-full items-center gap-2 overflow-x-auto py-1"
      >
        {objectKind === "all" ? null : (
          <HiddenField name="kind" value={objectKind} />
        )}
        <ToggleChip label={copy.feed.all} pressed={source === "all"} />
        {sources.map(([value, label]) => {
          const pressed = source === value;
          return (
            <ToggleChip
              key={value}
              {...(pressed ? {} : { name: "source", value })}
              label={label}
              pressed={pressed}
            />
          );
        })}
      </form>
      <form
        method="get"
        action={action}
        data-followed-feed-kind-filters="true"
        className="feed-filter-scroll flex max-w-full items-center gap-2 overflow-x-auto py-1"
      >
        {source === "all" ? null : <HiddenField name="source" value={source} />}
        <span className="shrink-0 text-overline text-text-muted uppercase">
          {copy.feed.kindFiltersLabel}
        </span>
        <ToggleChip
          label={copy.feed.everyKind}
          pressed={objectKind === "all"}
        />
        {kinds.map(([value, label]) => {
          const pressed = objectKind === value;
          return (
            <ToggleChip
              key={value}
              {...(pressed ? {} : { name: "kind", value })}
              icon={KIND_ICONS[value]}
              label={label}
              pressed={pressed}
            />
          );
        })}
      </form>
    </div>
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

  return (
    <EntryCard
      id={item.key}
      href={item.href}
      title={item.title}
      subject={{
        label: item.object.displayName,
        href: item.object.href,
        kindLabel: homeCopy.kindLabels[item.object.kind],
        icon: KIND_ICONS[item.object.kind],
        meta: item.object.varietyText ?? undefined,
      }}
      dateTime={toIsoDateTime(item.publishedAt)}
      dateLabel={formatDate(item.publishedAt, locale)}
      excerpt={item.excerpt}
      cover={
        item.mediaUrl
          ? {
              src: item.mediaUrl,
              alt: publicMediaAltText({}, item.title),
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

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Date(value).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toIsoDateTime(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

"use server";

import {
  buildPublicFeedHref,
  PublicFeedEntryItems,
} from "@/components/public/public-feed-entry-card";
import {
  FollowedFeedEntryItems,
  followedFeedHref,
} from "@/components/social/followed-feed-entry-card";
import {
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import type { ShowMorePortion } from "@/lib/show-more";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { readPublicFeedPage } from "@/server/public-cache";
import { normalizePublicFeedRequest } from "@/server/public-feed-repository";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import { scopedToUser } from "@/server/request-scope";
import { listFollowedFeedPage } from "@/server/social-return-repository";

/**
 * The next portion of a feed for «Показати ще» (DESIGN.md §5.26), rendered
 * by the same components as the page's first portion. The bound context came
 * back from the browser, so every field is normalized again here exactly as
 * the page normalizes its query; a token that is not a cursor is `null`, and
 * the link then navigates to an address that answers its own 404.
 */
export async function loadPublicFeedPortion(
  context: {
    locale: string;
    kind: string;
    topic: string | null;
    /** The listing the link belongs to: the home page, or `/feed` for a guest. */
    listing: "home" | "feed";
  },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale: PublicLocale = context.locale;
  const request = normalizePublicFeedRequest({
    cursor: token,
    kind: context.kind,
    topic: context.topic ?? undefined,
  });
  if (!request.cursor) return null;
  const feed = await readPublicFeedPage(request, locale);
  if (feed.entries.length === 0) return null;
  const copy = getLocalizedHomeContent(locale).feed;
  const hrefFor = (cursor: string | null) =>
    context.listing === "home"
      ? buildPublicFeedHref(locale, {
          cursor,
          kind: request.kind,
          topic: request.topic,
        })
      : publicFeedPortionHref(locale, cursor);
  return {
    items: (
      <PublicFeedEntryItems
        locale={locale}
        copy={copy}
        entries={feed.entries}
        returnTo={context.listing === "home" ? hrefFor(null) : undefined}
      />
    ),
    next: feed.nextCursor
      ? { token: feed.nextCursor, href: hrefFor(feed.nextCursor) }
      : null,
  };
}

/** The followed feed's next portion, for the signed-in reader it belongs to. */
export async function loadFollowedFeedPortion(
  context: { locale: string; source: string; objectKind: string },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale: PublicLocale = context.locale;
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  const source =
    context.source === "people" ||
    context.source === "objects" ||
    context.source === "topics"
      ? context.source
      : "all";
  const objectKind =
    context.objectKind === "plant" || context.objectKind === "animal"
      ? context.objectKind
      : "all";
  const page = await listFollowedFeedPage(
    scopedToUser(userId, getSessionId(session)),
    { source, objectKind, cursor: token, locale },
  );
  if (page.items.length === 0) return null;
  return {
    items: <FollowedFeedEntryItems items={page.items} locale={locale} />,
    next: page.nextCursor
      ? {
          token: page.nextCursor,
          href: followedFeedHref(locale, source, objectKind, page.nextCursor),
        }
      : null,
  };
}

function publicFeedPortionHref(locale: PublicLocale, cursor: string | null) {
  const path = localizedPath(locale, "/feed");
  return cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path;
}

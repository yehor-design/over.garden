"use server";

import {
  BookmarkShelfItems,
  bookmarkHref,
} from "@/components/social/bookmark-shelf-items";
import { isPublicLocale } from "@/lib/public-localization";
import type { ShowMorePortion } from "@/lib/show-more";
import { savedEntryCards } from "@/server/bookmark-shelf";
import { listEngagementBookmarks } from "@/server/engagement-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";

/**
 * The shelf's next portion for «Показати ще» (DESIGN.md §5.26), for the
 * signed-in reader it belongs to and under the same filter.
 */
export async function loadBookmarkPortion(
  context: { locale: string; filter: string },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale = context.locale;
  const filter =
    context.filter === "journal_entry" ||
    context.filter === "lineage_object" ||
    context.filter === "variety" ||
    context.filter === "topic"
      ? context.filter
      : "all";
  const viewer = await resolveWorkspaceViewer();
  if (viewer.status !== "signed-in") return null;
  const shelf = await listEngagementBookmarks(viewer.scope, undefined, {
    kind: filter === "all" ? null : filter,
    cursor: token,
  });
  if (shelf.items.length === 0) return null;
  const cards = await savedEntryCards(viewer.scope, shelf.items, locale);
  return {
    items: (
      <BookmarkShelfItems
        items={shelf.items}
        cards={cards}
        locale={locale}
        returnTo={bookmarkHref(locale, filter, null)}
      />
    ),
    next: shelf.nextCursor
      ? {
          token: shelf.nextCursor,
          href: bookmarkHref(locale, filter, shelf.nextCursor),
        }
      : null,
  };
}

"use server";

import { PublicFeedEntryItems } from "@/components/public/public-feed-entry-card";
import { ProfileObjectItems } from "@/components/public/profile-object-card";
import { entryCardFeedLabels } from "@/lib/entry-card-dates";
import { publicProfilePath } from "@/lib/garden/public-paths";
import { isPublicLocale } from "@/lib/public-localization";
import { publicProfileListHref } from "@/lib/public-profile-tabs";
import type { ShowMorePortion } from "@/lib/show-more";
import { readPublicProfileEvidencePage } from "@/server/public-cache";

/**
 * The next portion of a profile's entries or objects for «Показати ще»
 * (DESIGN.md §5.26): the tab's page `token`, read through the same cached
 * read and rendered by the same components as the page's own portion. A page
 * that is not a number past one, or has nothing on it, is `null`.
 */
export async function loadProfilePortion(
  context: { locale: string; handle: string; tab: string },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale = context.locale;
  const tab = context.tab === "objects" ? "objects" : "entries";
  if (!/^\d{1,6}$/u.test(token)) return null;
  const page = Number(token);
  if (page < 2) return null;
  const profile = await readPublicProfileEvidencePage(
    context.handle,
    locale,
    tab === "entries" ? page : 1,
    tab === "objects" ? page : 1,
  );
  if (!profile) return null;
  const list = tab === "entries" ? profile.entries : profile.objects;
  if (list.items.length === 0) return null;
  const basePath = publicProfilePath(locale, profile.handle);
  const next = list.page < list.pageCount ? list.page + 1 : null;
  return {
    items:
      tab === "entries" ? (
        <PublicFeedEntryItems
          locale={locale}
          copy={entryCardFeedLabels(locale)}
          entries={profile.entries.items}
          headingLevel={3}
        />
      ) : (
        <ProfileObjectItems
          objects={profile.objects.items}
          locale={locale}
          headingLevel={3}
        />
      ),
    next: next
      ? {
          token: String(next),
          href: publicProfileListHref(basePath, tab, next),
        }
      : null,
  };
}

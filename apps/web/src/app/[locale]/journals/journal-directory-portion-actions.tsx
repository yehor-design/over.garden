"use server";

import { DirectoryResultItems } from "@/components/public/public-journal-directory-card";
import { getPublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import { buildPublicJournalDirectoryHref } from "@/lib/public-journal-directory-navigation";
import { isPublicLocale } from "@/lib/public-localization";
import type { ShowMorePortion } from "@/lib/show-more";
import { readPublicJournalDirectoryPage } from "@/server/public-cache";
import { normalizePublicJournalDirectoryRequest } from "@/server/public-journal-directory-query";

/**
 * The directory's next page for «Показати ще» (DESIGN.md §5.26), under the
 * same filters and sort, normalized again here exactly as the page does it.
 */
export async function loadJournalDirectoryPortion(
  context: {
    locale: string;
    q: string;
    kind: string;
    catalog: string | null;
    topic: string | null;
    season: string;
    region: string | null;
    sort: string;
  },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale = context.locale;
  if (!/^\d{1,6}$/u.test(token) || Number(token) < 2) return null;
  const request = normalizePublicJournalDirectoryRequest({
    q: context.q,
    kind: context.kind,
    catalog: context.catalog ?? undefined,
    topic: context.topic ?? undefined,
    season: context.season,
    region: context.region ?? undefined,
    sort: context.sort,
    page: token,
  });
  const page = await readPublicJournalDirectoryPage(request, locale);
  if (page.cards.length === 0) return null;
  return {
    items: (
      <DirectoryResultItems
        locale={locale}
        copy={getPublicJournalDirectoryCopy(locale)}
        request={page.request}
        cards={page.cards}
      />
    ),
    next: page.hasNextPage
      ? {
          token: String(page.request.page + 1),
          href: buildPublicJournalDirectoryHref(locale, {
            ...page.request,
            page: page.request.page + 1,
          }),
        }
      : null,
  };
}

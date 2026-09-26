"use server";

import { PublicFeedEntryItems } from "@/components/public/public-feed-entry-card";
import { matchPublicCatalogAddressPath } from "@/lib/catalog/addresses";
import { entryCardFeedLabels } from "@/lib/entry-card-dates";
import { isPublicLocale, type PublicLocale } from "@/lib/public-localization";
import { cursorPortionHref, type ShowMorePortion } from "@/lib/show-more";
import { decodePublicFeedCursor } from "@/server/public-feed-repository";
import { readSpeciesEntries } from "@/server/public-cache";

/**
 * The next portion of a species page's «Записи» for «Показати ще»
 * (DESIGN.md §5.26), drawn by the same card as the first. The bound context
 * came back from the browser, so it is checked again: a locale the site has, a
 * catalogue item id, and the page's own address, which is only ever used to
 * write the next portion's link back to this reader. A token that is not a
 * cursor is `null`, and the link then navigates to an address that answers
 * its own 404.
 */
export async function loadSpeciesEntriesPortion(
  context: { locale: string; catalogItemId: string; path: string },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale: PublicLocale = context.locale;
  if (!UUID.test(context.catalogItemId)) return null;
  if (!matchPublicCatalogAddressPath(context.path)) return null;
  if (!decodePublicFeedCursor(token)) return null;
  const portion = await readSpeciesEntries(
    context.catalogItemId,
    token,
    locale,
  );
  if (portion.entries.length === 0) return null;
  return {
    items: (
      <PublicFeedEntryItems
        locale={locale}
        copy={entryCardFeedLabels(locale)}
        entries={portion.entries}
        headingLevel={3}
      />
    ),
    next: portion.nextCursor
      ? {
          token: portion.nextCursor,
          href: cursorPortionHref(context.path, portion.nextCursor),
        }
      : null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

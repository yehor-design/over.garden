import "server-only";

import type { PublicLocale } from "@/lib/public-localization";
import type { EngagementBookmarkShelfItem } from "@/server/engagement-repository";
import type { RequestScope } from "@/server/request-scope";
import { listSavedEntryCards } from "@/server/social-return-repository";

/** The feed's card for every saved entry of a shelf portion that is still public. */
export function savedEntryCards(
  scope: RequestScope,
  items: readonly EngagementBookmarkShelfItem[],
  locale: PublicLocale,
) {
  return listSavedEntryCards(
    scope,
    items
      .filter((item) => item.available && item.target.kind === "journal_entry")
      .map((item) => item.target.ref),
    locale,
  );
}

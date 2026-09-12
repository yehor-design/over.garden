import "server-only";

import { revalidateTag, updateTag } from "next/cache";

import { announcePublicUrlsToIndexNow } from "@/server/indexnow-announcer";

/**
 * How a mutation invalidates the tags it names (ADR-0022, D4).
 *
 * - `stale`: stale-while-revalidate; the next visit serves the cached page and
 *   refreshes it in the background. Edits and engagement use it.
 * - `expire`: the tags expire now; the next visit waits for fresh data. Route
 *   handlers that delete something use it so a 410 is immediate.
 * - `update`: read-your-own-writes from a Server Action (`updateTag`).
 */
export type PublicCacheRevalidationMode = "stale" | "expire" | "update";

export function revalidatePublicCacheTags(
  tags: readonly string[],
  mode: PublicCacheRevalidationMode,
  /**
   * Canonical addresses of indexable pages this mutation changed, announced to
   * IndexNow (ADR-0029 D13 item 6, OVE-434).
   *
   * It rides here because this is already the one call a mutation makes when a
   * public page changed — a second place to remember would be a second place
   * to forget. URLs and not tags, because a tag says *something under this
   * name changed* and only the caller knows whether what changed has an
   * address a crawler should be sent to. A `noindex` page is never passed.
   *
   * Fire-and-forget: nothing is awaited and every failure is swallowed, so an
   * engine being down cannot turn a gardener's publish into an error.
   */
  announce: readonly string[] = [],
) {
  for (const tag of new Set(tags)) {
    if (mode === "update") {
      updateTag(tag);
    } else if (mode === "expire") {
      revalidateTag(tag, { expire: 0 });
    } else {
      revalidateTag(tag, "max");
    }
  }
  if (announce.length > 0) announcePublicUrlsToIndexNow(announce);
}

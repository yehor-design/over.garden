import "server-only";

import { revalidateTag, updateTag } from "next/cache";

/**
 * How a mutation invalidates the tags it names (ADR-0022, D4).
 *
 * This is about caches and nothing else. Telling a search engine that a page
 * changed is a different question with a different rule — nothing `noindex` is
 * submitted — and it lives beside this call in
 * `@/server/indexnow-public-addresses`, which knows which address a mutation
 * changed and whether that address may be announced at all (OVE-434). A
 * parameter here would have been a second place to forget.
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
}

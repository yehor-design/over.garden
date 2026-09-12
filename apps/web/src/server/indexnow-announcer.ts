import "server-only";

import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_RATE_WINDOW_MS,
  buildIndexNowSubmission,
  selectAnnounceableUrls,
} from "@/lib/seo/indexnow";
import { absolutePublicUrl } from "@/lib/garden/public-url";
import { getPublicSiteUrl } from "@/lib/runtime-url";

/**
 * Tells IndexNow that a page changed, and never lets that fail a mutation
 * (ADR-0029 D13 item 6, OVE-434).
 *
 * The announcement rides on the same call that invalidates the cache tags, so
 * there is one place in the product that knows a public page changed. It is
 * fire-and-forget by construction: nothing awaits it, every failure is
 * swallowed, and a gardener's publish cannot be turned into an error by an
 * engine being down.
 *
 * ## What is not announced
 *
 * A `noindex` URL, because asking a crawler to fetch a page that tells it not
 * to index is worse than silence. The caller passes canonical addresses of
 * indexable surfaces only, which is why this takes URLs rather than tags: a
 * tag says *something under this name changed*, and only the caller knows
 * whether what changed has an address a crawler should see.
 *
 * ## The bounds are per process
 *
 * The repeat window and the rate limit live in module state, so they hold
 * within one serverless instance and not across a fleet. That is the honest
 * shape of it: it makes a loop or an editing session cheap, and it does not
 * pretend to be a distributed lock. Durable de-duplication belongs in the job
 * queue the day the volume justifies a queue-contract migration.
 */
const announcedAt = new Map<string, number>();
let windowStartedAt = 0;
let submissionsInWindow = 0;

export function announcePublicUrlsToIndexNow(paths: readonly string[]): void {
  void announceNow(paths).catch(() => undefined);
}

/** The awaited form, for tests and for a script that announces deliberately. */
export async function announceNow(
  paths: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ submitted: number; skipped: number }> {
  const now = Date.now();
  if (now - windowStartedAt >= INDEXNOW_RATE_WINDOW_MS) {
    windowStartedAt = now;
    submissionsInWindow = 0;
  }

  const urls = paths.map((path) =>
    path.startsWith("http") ? path : absolutePublicUrl(path),
  );
  const announceable = selectAnnounceableUrls({
    urls,
    announcedAt,
    submissionsInWindow,
    now,
  });
  if (announceable.length === 0) {
    return { submitted: 0, skipped: urls.length };
  }

  const submission = buildIndexNowSubmission(
    getPublicSiteUrl(process.env),
    announceable,
  );
  if (!submission) return { submitted: 0, skipped: urls.length };

  submissionsInWindow += 1;
  for (const url of submission.urlList) announcedAt.set(url, now);
  // The map is bounded so a long-lived instance cannot grow one entry per URL
  // it has ever seen; the oldest entries are the ones outside the window.
  if (announcedAt.size > 2_000) {
    for (const [url, at] of announcedAt) {
      if (now - at >= INDEXNOW_RATE_WINDOW_MS) announcedAt.delete(url);
    }
  }

  await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(submission),
  });

  return {
    submitted: submission.urlList.length,
    skipped: urls.length - submission.urlList.length,
  };
}

/** Test seam: the module's own bounds are process state by design. */
export function resetIndexNowAnnouncerForTest(): void {
  announcedAt.clear();
  windowStartedAt = 0;
  submissionsInWindow = 0;
}

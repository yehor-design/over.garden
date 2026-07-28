import "server-only";

import {
  searchPublicJournalDirectoryCandidates,
  type PublicJournalDirectorySearchIndex,
} from "@/server/search/public-journal-directory-search";

export const PUBLIC_COMMUNITY_SEARCH_CANDIDATE_LIMIT = 256;
export const PUBLIC_COMMUNITY_SEARCH_ACTIVE_LIMIT = 4;
export const PUBLIC_COMMUNITY_SEARCH_QUEUE_LIMIT = 16;
export const PUBLIC_COMMUNITY_SEARCH_QUEUE_WAIT_MS = 100;
export const PUBLIC_COMMUNITY_SEARCH_RESPONSE_DEADLINE_MS = 1_200;

export type PublicCommunitySearchReason =
  | "timeout"
  | "unavailable"
  | "circuit_open"
  | "bulkhead_rejected"
  | "request_timeout";

export type PublicCommunitySearchCandidates =
  | { source: "hybrid"; ids: string[]; reason: null }
  | {
      source: "bounded_fallback";
      ids: null;
      reason: PublicCommunitySearchReason;
    };

interface Waiter {
  settled: boolean;
  timer: ReturnType<typeof setTimeout>;
  resolve: (release: (() => void) | null) => void;
}

let activePermits = 0;
const waiters: Waiter[] = [];

export async function findPublicCommunitySearchCandidates(
  query: string,
  index?: PublicJournalDirectorySearchIndex,
): Promise<PublicCommunitySearchCandidates> {
  const result = await searchPublicJournalDirectoryCandidates(query, index);
  return result.source === "hybrid"
    ? { source: "hybrid", ids: result.ids, reason: null }
    : { source: "bounded_fallback", ids: null, reason: result.reason };
}

export async function withPublicCommunitySearchPermit<T>(
  task: () => Promise<T>,
  options: { queueWaitMs?: number; responseDeadlineMs?: number } = {},
): Promise<
  | { ok: true; value: T }
  | {
      ok: false;
      reason: "bulkhead_rejected" | "request_timeout" | "unavailable";
    }
> {
  const release = await acquirePermit(
    options.queueWaitMs ?? PUBLIC_COMMUNITY_SEARCH_QUEUE_WAIT_MS,
  );
  if (!release) return { ok: false, reason: "bulkhead_rejected" };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task()
        .then((value) => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, reason: "unavailable" as const })),
      new Promise<{ ok: false; reason: "request_timeout" }>((resolve) => {
        timer = setTimeout(
          () => resolve({ ok: false, reason: "request_timeout" }),
          options.responseDeadlineMs ??
            PUBLIC_COMMUNITY_SEARCH_RESPONSE_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    release();
  }
}

async function acquirePermit(waitMs: number): Promise<(() => void) | null> {
  if (activePermits < PUBLIC_COMMUNITY_SEARCH_ACTIVE_LIMIT) {
    activePermits += 1;
    return releasePermit;
  }
  if (waiters.length >= PUBLIC_COMMUNITY_SEARCH_QUEUE_LIMIT) return null;

  return new Promise((resolve) => {
    const waiter: Waiter = {
      settled: false,
      resolve,
      timer: setTimeout(() => {
        if (waiter.settled) return;
        waiter.settled = true;
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        resolve(null);
      }, waitMs),
    };
    waiters.push(waiter);
  });
}

function releasePermit() {
  while (waiters.length > 0) {
    const waiter = waiters.shift();
    if (!waiter || waiter.settled) continue;
    waiter.settled = true;
    clearTimeout(waiter.timer);
    waiter.resolve(releasePermit);
    return;
  }
  activePermits = Math.max(0, activePermits - 1);
}

export function resetPublicCommunitySearchBulkheadForTests() {
  for (const waiter of waiters.splice(0)) {
    clearTimeout(waiter.timer);
    if (!waiter.settled) waiter.resolve(null);
  }
  activePermits = 0;
}

export function publicCommunitySearchBulkheadStateForTests() {
  return { active: activePermits, queued: waiters.length };
}

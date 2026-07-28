import "server-only";

import { meiliSearchClient } from "@/server/search/client";

export const PUBLIC_JOURNAL_DIRECTORY_SEARCH_CANDIDATE_LIMIT = 256;
export const PUBLIC_JOURNAL_DIRECTORY_SEARCH_DEADLINE_MS = 400;
export const PUBLIC_JOURNAL_DIRECTORY_SEARCH_CIRCUIT_OPEN_MS = 30_000;
const PUBLIC_JOURNAL_DIRECTORY_SEARCH_FAILURE_THRESHOLD = 2;
const MAX_PUBLIC_JOURNAL_DIRECTORY_QUERY_LENGTH = 120;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PublicJournalDirectorySearchIndex {
  search(
    query: string,
    options: {
      attributesToRetrieve: string[];
      filter: string;
      limit: number;
    },
  ): Promise<{ hits?: unknown[] }>;
}

export type PublicJournalDirectorySearchResult =
  | { source: "hybrid"; ids: string[] }
  | {
      source: "bounded_fallback";
      ids: null;
      reason: "timeout" | "unavailable" | "circuit_open";
    };

let consecutiveFailures = 0;
let circuitOpenUntil = 0;
let halfOpenProbeInFlight = false;

export async function searchPublicJournalDirectoryCandidates(
  query: string,
  index?: PublicJournalDirectorySearchIndex,
  options: { now?: () => number; deadlineMs?: number } = {},
): Promise<PublicJournalDirectorySearchResult> {
  const normalized = query.replace(/\s+/g, " ").trim();
  if (!normalized) return { source: "hybrid", ids: [] };
  if (normalized.length > MAX_PUBLIC_JOURNAL_DIRECTORY_QUERY_LENGTH) {
    return { source: "bounded_fallback", ids: null, reason: "unavailable" };
  }

  const now = options.now ?? Date.now;
  const currentTime = now();
  if (currentTime < circuitOpenUntil) {
    return { source: "bounded_fallback", ids: null, reason: "circuit_open" };
  }
  const halfOpen = circuitOpenUntil > 0;
  if (halfOpen && halfOpenProbeInFlight) {
    return { source: "bounded_fallback", ids: null, reason: "circuit_open" };
  }
  if (halfOpen) halfOpenProbeInFlight = true;

  try {
    const searchIndex =
      index ??
      (meiliSearchClient().index(
        "journal_entries",
      ) as unknown as PublicJournalDirectorySearchIndex);
    const result = await withDeadline(
      searchIndex.search(normalized, {
        attributesToRetrieve: ["id"],
        filter: 'kind = "journal_entry"',
        limit: PUBLIC_JOURNAL_DIRECTORY_SEARCH_CANDIDATE_LIMIT,
      }),
      options.deadlineMs ?? PUBLIC_JOURNAL_DIRECTORY_SEARCH_DEADLINE_MS,
    );
    const seen = new Set<string>();

    for (const hit of result.hits ?? []) {
      if (!hit || typeof hit !== "object") continue;
      const id = (hit as Record<string, unknown>).id;
      if (typeof id !== "string" || !UUID_PATTERN.test(id) || seen.has(id)) {
        continue;
      }
      seen.add(id);
      if (seen.size === PUBLIC_JOURNAL_DIRECTORY_SEARCH_CANDIDATE_LIMIT) break;
    }

    consecutiveFailures = 0;
    circuitOpenUntil = 0;
    return { source: "hybrid", ids: [...seen] };
  } catch (error) {
    consecutiveFailures += 1;
    if (
      consecutiveFailures >= PUBLIC_JOURNAL_DIRECTORY_SEARCH_FAILURE_THRESHOLD
    ) {
      circuitOpenUntil =
        now() + PUBLIC_JOURNAL_DIRECTORY_SEARCH_CIRCUIT_OPEN_MS;
    }
    return {
      source: "bounded_fallback",
      ids: null,
      reason: error instanceof SearchDeadlineError ? "timeout" : "unavailable",
    };
  } finally {
    if (halfOpen) halfOpenProbeInFlight = false;
  }
}

class SearchDeadlineError extends Error {}

async function withDeadline<T>(promise: Promise<T>, deadlineMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SearchDeadlineError()), deadlineMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function resetPublicJournalDirectorySearchCircuitForTests() {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
  halfOpenProbeInFlight = false;
}

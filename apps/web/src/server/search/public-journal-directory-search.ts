import "server-only";

import { meiliSearchClient } from "@/server/search/client";

export const PUBLIC_JOURNAL_DIRECTORY_SEARCH_CANDIDATE_LIMIT = 1_000;
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

export async function searchPublicJournalDirectoryCandidates(
  query: string,
  index?: PublicJournalDirectorySearchIndex,
): Promise<string[] | null> {
  const normalized = query.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (normalized.length > MAX_PUBLIC_JOURNAL_DIRECTORY_QUERY_LENGTH) {
    return null;
  }

  try {
    const searchIndex =
      index ??
      (meiliSearchClient().index(
        "journal_entries",
      ) as unknown as PublicJournalDirectorySearchIndex);
    const result = await searchIndex.search(normalized, {
      attributesToRetrieve: ["id"],
      filter: 'kind = "journal_entry"',
      limit: PUBLIC_JOURNAL_DIRECTORY_SEARCH_CANDIDATE_LIMIT,
    });
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

    return [...seen];
  } catch {
    return null;
  }
}

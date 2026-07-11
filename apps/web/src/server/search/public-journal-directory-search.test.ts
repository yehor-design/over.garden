import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_JOURNAL_DIRECTORY_SEARCH_CANDIDATE_LIMIT,
  searchPublicJournalDirectoryCandidates,
  type PublicJournalDirectorySearchIndex,
} from "./public-journal-directory-search";

describe("public journal directory search hints", () => {
  it("retrieves bounded UUID-only hints without rendering search documents", async () => {
    const search = vi.fn().mockResolvedValue({
      hits: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "must not be trusted",
          ownerUserId: "must not escape",
        },
        { id: "not-a-uuid", body: "private-looking text" },
        { id: "00000000-0000-4000-8000-000000000001" },
        { id: "00000000-0000-4000-8000-000000000002" },
      ],
    });
    const index: PublicJournalDirectorySearchIndex = { search };

    await expect(
      searchPublicJournalDirectoryCandidates("  жовте листя  ", index),
    ).resolves.toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
    expect(search).toHaveBeenCalledWith("жовте листя", {
      attributesToRetrieve: ["id"],
      filter: 'kind = "journal_entry"',
      limit: PUBLIC_JOURNAL_DIRECTORY_SEARCH_CANDIDATE_LIMIT,
    });
  });

  it("returns an empty candidate list for a valid search with no hits", async () => {
    const index: PublicJournalDirectorySearchIndex = {
      search: vi.fn().mockResolvedValue({ hits: [] }),
    };

    await expect(
      searchPublicJournalDirectoryCandidates("орхідея", index),
    ).resolves.toEqual([]);
  });

  it("degrades to the canonical DB path when Meilisearch is unavailable", async () => {
    const index: PublicJournalDirectorySearchIndex = {
      search: vi.fn().mockRejectedValue(new Error("search unavailable")),
    };

    await expect(
      searchPublicJournalDirectoryCandidates("орхідея", index),
    ).resolves.toBeNull();
  });

  it("does not call the index for an empty or overlong query", async () => {
    const search = vi.fn();
    const index: PublicJournalDirectorySearchIndex = { search };

    await expect(
      searchPublicJournalDirectoryCandidates("   ", index),
    ).resolves.toEqual([]);
    await expect(
      searchPublicJournalDirectoryCandidates("x".repeat(121), index),
    ).resolves.toBeNull();
    expect(search).not.toHaveBeenCalled();
  });
});

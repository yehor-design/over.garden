import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_JOURNAL_DIRECTORY_SEARCH_CANDIDATE_LIMIT,
  resetPublicJournalDirectorySearchCircuitForTests,
  searchPublicJournalDirectoryCandidates,
  type PublicJournalDirectorySearchIndex,
} from "./public-journal-directory-search";

describe("public journal directory search hints", () => {
  beforeEach(() => resetPublicJournalDirectorySearchCircuitForTests());

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
    ).resolves.toEqual({
      source: "hybrid",
      ids: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
    });
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
    ).resolves.toEqual({ source: "hybrid", ids: [] });
  });

  it("degrades to the canonical DB path when Meilisearch is unavailable", async () => {
    const index: PublicJournalDirectorySearchIndex = {
      search: vi.fn().mockRejectedValue(new Error("search unavailable")),
    };

    await expect(
      searchPublicJournalDirectoryCandidates("орхідея", index),
    ).resolves.toEqual({
      source: "bounded_fallback",
      ids: null,
      reason: "unavailable",
    });
  });

  it("does not call the index for an empty or overlong query", async () => {
    const search = vi.fn();
    const index: PublicJournalDirectorySearchIndex = { search };

    await expect(
      searchPublicJournalDirectoryCandidates("   ", index),
    ).resolves.toEqual({ source: "hybrid", ids: [] });
    await expect(
      searchPublicJournalDirectoryCandidates("x".repeat(121), index),
    ).resolves.toEqual({
      source: "bounded_fallback",
      ids: null,
      reason: "unavailable",
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("fences a late Meilisearch result at the request deadline", async () => {
    const index: PublicJournalDirectorySearchIndex = {
      search: vi.fn(() => new Promise<{ hits?: unknown[] }>(() => undefined)),
    };

    await expect(
      searchPublicJournalDirectoryCandidates("орхідея", index, {
        deadlineMs: 1,
      }),
    ).resolves.toEqual({
      source: "bounded_fallback",
      ids: null,
      reason: "timeout",
    });
  });

  it("opens a bounded circuit after two dependency failures", async () => {
    const search = vi.fn().mockRejectedValue(new Error("down"));
    const index: PublicJournalDirectorySearchIndex = { search };
    await searchPublicJournalDirectoryCandidates("a", index, { now: () => 10 });
    await searchPublicJournalDirectoryCandidates("b", index, { now: () => 10 });

    await expect(
      searchPublicJournalDirectoryCandidates("c", index, { now: () => 11 }),
    ).resolves.toEqual({
      source: "bounded_fallback",
      ids: null,
      reason: "circuit_open",
    });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("allows one half-open recovery probe and closes the circuit after success", async () => {
    const failingIndex: PublicJournalDirectorySearchIndex = {
      search: vi.fn().mockRejectedValue(new Error("down")),
    };
    await searchPublicJournalDirectoryCandidates("a", failingIndex, {
      now: () => 10,
    });
    await searchPublicJournalDirectoryCandidates("b", failingIndex, {
      now: () => 10,
    });

    let resolveProbe!: (value: { hits?: unknown[] }) => void;
    const probe = new Promise<{ hits?: unknown[] }>((resolve) => {
      resolveProbe = resolve;
    });
    const recoverySearch = vi.fn().mockReturnValue(probe);
    const recoveryIndex: PublicJournalDirectorySearchIndex = {
      search: recoverySearch,
    };
    const firstProbe = searchPublicJournalDirectoryCandidates(
      "recovery",
      recoveryIndex,
      { now: () => 30_011 },
    );

    await expect(
      searchPublicJournalDirectoryCandidates("concurrent", recoveryIndex, {
        now: () => 30_011,
      }),
    ).resolves.toEqual({
      source: "bounded_fallback",
      ids: null,
      reason: "circuit_open",
    });
    expect(recoverySearch).toHaveBeenCalledTimes(1);

    resolveProbe({ hits: [] });
    await expect(firstProbe).resolves.toEqual({ source: "hybrid", ids: [] });
    recoverySearch.mockResolvedValue({ hits: [] });
    await expect(
      searchPublicJournalDirectoryCandidates("restored", recoveryIndex, {
        now: () => 30_012,
      }),
    ).resolves.toEqual({ source: "hybrid", ids: [] });
    expect(recoverySearch).toHaveBeenCalledTimes(2);
  });
});

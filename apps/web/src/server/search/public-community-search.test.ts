import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findPublicCommunitySearchCandidates,
  publicCommunitySearchBulkheadStateForTests,
  resetPublicCommunitySearchBulkheadForTests,
  withPublicCommunitySearchPermit,
} from "./public-community-search";
import { resetPublicJournalDirectorySearchCircuitForTests } from "./public-journal-directory-search";

afterEach(() => {
  vi.useRealTimers();
  resetPublicCommunitySearchBulkheadForTests();
  resetPublicJournalDirectorySearchCircuitForTests();
});

describe("OVE-239 public community search boundary", () => {
  it("accepts only unique UUID hints and caps the shared journal index request", async () => {
    const search = vi.fn(async () => ({
      hits: [
        { id: "00000000-0000-4000-8000-000000000001", title: "ignored" },
        { id: "not-a-uuid" },
        { id: "00000000-0000-4000-8000-000000000001" },
        { id: "00000000-0000-4000-8000-000000000002" },
      ],
    }));

    await expect(
      findPublicCommunitySearchCandidates("  tomato care  ", { search }),
    ).resolves.toEqual({
      source: "hybrid",
      ids: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
      reason: null,
    });
    expect(search).toHaveBeenCalledWith("tomato care", {
      attributesToRetrieve: ["id"],
      filter: 'kind = "journal_entry"',
      limit: 256,
    });
  });

  it("admits four active searches, queues sixteen, and rejects excess work", async () => {
    const releases: Array<() => void> = [];
    const hold = () =>
      withPublicCommunitySearchPermit(
        () =>
          new Promise<void>((resolve) => {
            releases.push(resolve);
          }),
        { queueWaitMs: 10_000 },
      );
    const accepted = Array.from({ length: 20 }, hold);
    await Promise.resolve();
    expect(publicCommunitySearchBulkheadStateForTests()).toEqual({
      active: 4,
      queued: 16,
    });
    await expect(hold()).resolves.toEqual({
      ok: false,
      reason: "bulkhead_rejected",
    });

    while (releases.length > 0) releases.shift()?.();
    await Promise.resolve();
    while (releases.length > 0) releases.shift()?.();
    await Promise.all(accepted);
    expect(publicCommunitySearchBulkheadStateForTests()).toEqual({
      active: 0,
      queued: 0,
    });
  });

  it("fences late completion at the total response deadline and releases its permit", async () => {
    vi.useFakeTimers();
    let complete: (() => void) | undefined;
    const pending = withPublicCommunitySearchPermit(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
      { responseDeadlineMs: 25 },
    );
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toEqual({
      ok: false,
      reason: "request_timeout",
    });
    expect(publicCommunitySearchBulkheadStateForTests().active).toBe(0);
    complete?.();
    await Promise.resolve();
    await expect(pending).resolves.toEqual({
      ok: false,
      reason: "request_timeout",
    });
  });
});

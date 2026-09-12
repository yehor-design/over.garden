import { describe, expect, it } from "vitest";

import {
  INDEXNOW_KEY,
  INDEXNOW_KEY_PATH,
  INDEXNOW_MAX_URLS_PER_SUBMISSION,
  INDEXNOW_RATE_LIMIT,
  INDEXNOW_REPEAT_WINDOW_MS,
  buildIndexNowSubmission,
  selectAnnounceableUrls,
} from "@/lib/seo/indexnow";

describe("the IndexNow submission", () => {
  it("names the host, the key and where the key is served", () => {
    const submission = buildIndexNowSubmission("https://over.garden", [
      "https://over.garden/@yehor/polyv",
    ]);

    expect(submission).toEqual({
      host: "over.garden",
      key: INDEXNOW_KEY,
      keyLocation: `https://over.garden${INDEXNOW_KEY_PATH}`,
      urlList: ["https://over.garden/@yehor/polyv"],
    });
  });

  // The protocol rejects a batch that mixes hosts outright, so a URL for
  // another host is dropped here rather than taking the whole submission down.
  it("drops a URL that is not this host's, and anything that is not a URL", () => {
    const submission = buildIndexNowSubmission("https://over.garden", [
      "https://over.garden/species/solanum-lycopersicum",
      "https://example.com/somewhere",
      "/species/relative",
      "javascript:alert(1)",
      "",
    ]);

    expect(submission?.urlList).toEqual([
      "https://over.garden/species/solanum-lycopersicum",
    ]);
  });

  it("says nothing rather than submitting an empty list", () => {
    expect(buildIndexNowSubmission("https://over.garden", [])).toBeNull();
    expect(
      buildIndexNowSubmission("https://over.garden", [
        "https://example.com/x",
      ]),
    ).toBeNull();
    expect(buildIndexNowSubmission("not a url", ["https://over.garden/"])).toBeNull();
  });

  it("deduplicates and bounds one submission", () => {
    const many = Array.from(
      { length: INDEXNOW_MAX_URLS_PER_SUBMISSION + 40 },
      (_, index) => `https://over.garden/species/s-${index}`,
    );
    const submission = buildIndexNowSubmission("https://over.garden", [
      ...many,
      ...many,
    ]);

    expect(submission?.urlList).toHaveLength(INDEXNOW_MAX_URLS_PER_SUBMISSION);
  });
});

describe("what may be announced now", () => {
  const url = "https://over.garden/@yehor/polyv";

  it("announces a URL nobody has announced", () => {
    expect(
      selectAnnounceableUrls({
        urls: [url],
        announcedAt: new Map(),
        submissionsInWindow: 0,
        now: 1_000,
      }),
    ).toEqual([url]);
  });

  // A gardener editing an entry four times in a minute is one change to a
  // crawler, and the protocol asks not to resubmit an unchanged URL.
  it("holds a URL announced inside the window, and lets it through after", () => {
    const announcedAt = new Map([[url, 1_000]]);

    expect(
      selectAnnounceableUrls({
        urls: [url],
        announcedAt,
        submissionsInWindow: 0,
        now: 1_000 + INDEXNOW_REPEAT_WINDOW_MS - 1,
      }),
    ).toEqual([]);
    expect(
      selectAnnounceableUrls({
        urls: [url],
        announcedAt,
        submissionsInWindow: 0,
        now: 1_000 + INDEXNOW_REPEAT_WINDOW_MS,
      }),
    ).toEqual([url]);
  });

  it("stops entirely once the process has made its submissions for the minute", () => {
    expect(
      selectAnnounceableUrls({
        urls: [url],
        announcedAt: new Map(),
        submissionsInWindow: INDEXNOW_RATE_LIMIT,
        now: 1_000,
      }),
    ).toEqual([]);
  });
});

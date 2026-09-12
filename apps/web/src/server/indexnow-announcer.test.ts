import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INDEXNOW_ENDPOINT, INDEXNOW_KEY } from "@/lib/seo/indexnow";
import {
  announceNow,
  announcePublicUrlsToIndexNow,
  resetIndexNowAnnouncerForTest,
} from "@/server/indexnow-announcer";

function submissionOf(call: Parameters<typeof fetch>) {
  return JSON.parse(String((call[1] as RequestInit).body)) as {
    host: string;
    key: string;
    keyLocation: string;
    urlList: string[];
  };
}

describe("announcing a changed page to IndexNow", () => {
  beforeEach(() => {
    resetIndexNowAnnouncerForTest();
    vi.stubEnv("PUBLIC_SITE_URL", "https://over.garden");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("submits a relative address as an absolute URL of this host", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(
      announceNow(["/@yehor/polyv"], fetchImpl as unknown as typeof fetch),
    ).resolves.toEqual({ submitted: 1, skipped: 0 });

    const [url, init] = fetchImpl.mock.calls[0]! as unknown as Parameters<
      typeof fetch
    >;
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect((init as RequestInit).method).toBe("POST");
    expect(submissionOf([url, init])).toMatchObject({
      host: "over.garden",
      key: INDEXNOW_KEY,
      urlList: ["https://over.garden/@yehor/polyv"],
    });
  });

  // The acceptance criterion, and the protocol's own request: an unchanged URL
  // is not resubmitted.
  it("announces the same address once inside the repeat window", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    await announceNow(["/@yehor/polyv"], fetchImpl as unknown as typeof fetch);
    const second = await announceNow(
      ["/@yehor/polyv"],
      fetchImpl as unknown as typeof fetch,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ submitted: 0, skipped: 1 });
  });

  it("says nothing at all when there is nothing on this host to say", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(
      announceNow([], fetchImpl as unknown as typeof fetch),
    ).resolves.toEqual({ submitted: 0, skipped: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  /**
   * The criterion that matters most: a gardener's publish must not become an
   * error because an engine is down. `announcePublicUrlsToIndexNow` awaits
   * nothing and swallows everything.
   *
   * It also runs `after` the response rather than as a dropped promise —
   * outside a request, as here, `after` throws and the work runs directly,
   * which is why this still observes the call.
   */
  it("never lets a failed submission escape into the mutation", async () => {
    const failing = vi.fn(async () => {
      throw new Error("indexnow is down");
    });
    vi.stubGlobal("fetch", failing);

    expect(() => announcePublicUrlsToIndexNow(["/@yehor/polyv"])).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failing).toHaveBeenCalled();
  });
});

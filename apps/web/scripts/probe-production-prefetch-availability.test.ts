import { describe, expect, it, vi } from "vitest";

import {
  PROBE_CONCURRENCY_MAX,
  PROBE_PATHS,
  PROBE_REQUEST_CLASSES,
  PREFETCH_PROBE_BUDGET_MS,
  WAIT_SAFE_CONTROLS,
  assertCompleteSample,
  assertSafeMethod,
  parseProbeArgs,
  runPrefetchAvailabilityProbe,
  summarizeObservations,
  type ProbeObservation,
} from "./probe-production-prefetch-availability";

function stubFetcher(status: number | ((url: string) => number)) {
  const seen: Array<{ url: string; method: string; headers: HeadersInit }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
    });
    return new Response(null, {
      status: typeof status === "number" ? status : status(url),
    });
  }) as unknown as typeof fetch;
  return { fetcher, seen };
}

describe("production prefetch availability probe", () => {
  it("samples both request classes across every locale equally", async () => {
    const { fetcher, seen } = stubFetcher(200);

    const receipt = await runPrefetchAvailabilityProbe({
      mode: "verify",
      fetcher,
      repeats: 1,
    });

    expect(receipt.distributions).toHaveLength(PROBE_REQUEST_CLASSES.length);
    for (const distribution of receipt.distributions) {
      expect(distribution.sampleSize).toBe(PROBE_PATHS.length);
      expect(distribution.statusCounts).toEqual({ "200": PROBE_PATHS.length });
    }
    for (const locale of ["/ru", "/ua", "/bg"]) {
      const forLocale = seen.filter((entry) =>
        new URL(entry.url).pathname.startsWith(locale),
      );
      // Three sections per locale, sampled once per request class.
      expect(forLocale).toHaveLength(3 * PROBE_REQUEST_CLASSES.length);
    }
  });

  it("marks the prefetch class with the router's own speculative headers", async () => {
    const { fetcher, seen } = stubFetcher(200);

    await runPrefetchAvailabilityProbe({ mode: "verify", fetcher, repeats: 1 });

    const prefetches = seen.filter(
      (entry) =>
        (entry.headers as Record<string, string>)["Next-Router-Prefetch"] ===
        "1",
    );
    expect(prefetches).toHaveLength(PROBE_PATHS.length);
    for (const entry of prefetches) {
      expect((entry.headers as Record<string, string>).RSC).toBe("1");
    }
  });

  it("issues only safe methods and refuses an unsafe one outright", async () => {
    const { fetcher, seen } = stubFetcher(200);

    await runPrefetchAvailabilityProbe({ mode: "verify", fetcher, repeats: 1 });

    for (const entry of seen) expect(entry.method).toBe("GET");
    expect(() => assertSafeMethod("POST")).toThrow(
      /probe_unsafe_method_refused/,
    );
    expect(() => assertSafeMethod("DELETE")).toThrow(
      /probe_unsafe_method_refused/,
    );
  });

  it("refuses to summarize an incomplete sample or a missing request class", () => {
    const partial: ProbeObservation[] = [
      { requestClass: "navigation", status: 200, responseMs: 1 },
    ];
    expect(() =>
      assertCompleteSample(summarizeObservations(partial), 2),
    ).toThrow(/probe_sample_incomplete/);

    expect(() =>
      assertCompleteSample(
        [
          {
            requestClass: "navigation",
            sampleSize: 1,
            statusCounts: { "200": 1 },
          },
        ],
        1,
      ),
    ).toThrow(/probe_request_class_missing/);

    // A declared size that disagrees with its own counts must be refused on the
    // size alone. Without this case the size check is redundant with the sum
    // check for anything `summarizeObservations` produces, and a mutation that
    // deletes it would go unnoticed.
    expect(() =>
      assertCompleteSample(
        [
          {
            requestClass: "navigation",
            sampleSize: 1,
            statusCounts: { "200": 2 },
          },
          {
            requestClass: "prefetch",
            sampleSize: 2,
            statusCounts: { "200": 2 },
          },
        ],
        2,
      ),
    ).toThrow(/probe_sample_incomplete/);
  });

  it("counts a non-success status rather than hiding it", async () => {
    const { fetcher } = stubFetcher((url) =>
      url.includes("/knowledge") ? 503 : 200,
    );

    const receipt = await runPrefetchAvailabilityProbe({
      mode: "verify",
      fetcher,
      repeats: 1,
    });

    for (const distribution of receipt.distributions) {
      expect(distribution.statusCounts["503"]).toBe(3);
      expect(distribution.statusCounts["200"]).toBe(PROBE_PATHS.length - 3);
    }
  });

  it("keeps a class-only receipt with no cookie, identifier, or user agent", async () => {
    const { fetcher } = stubFetcher(200);

    const receipt = await runPrefetchAvailabilityProbe({
      mode: "verify",
      fetcher,
      repeats: 1,
    });
    const serialized = JSON.stringify(receipt);

    expect(serialized).not.toMatch(/cookie/i);
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toMatch(/user-agent/i);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
    expect(receipt.limitation).toContain("Unauthenticated public paths only");
  });

  it("stays inside its response budget and keeps both wait-safe controls named", async () => {
    const { fetcher } = stubFetcher(200);

    const receipt = await runPrefetchAvailabilityProbe({
      mode: "verify",
      fetcher,
      repeats: 1,
    });

    expect(receipt.withinBudget).toBe(true);
    expect(receipt.maxResponseMs).toBeLessThanOrEqual(PREFETCH_PROBE_BUDGET_MS);
    expect(receipt.waitSafeControls).toEqual(WAIT_SAFE_CONTROLS);
    expect(WAIT_SAFE_CONTROLS).toEqual([
      "Abort run command",
      "Run status command",
    ]);
  });

  it("records an injected origin response timeout as its own bounded class", async () => {
    const receipt = await runPrefetchAvailabilityProbe({
      mode: "verify",
      repeats: 1,
      injectOriginResponseTimeout: true,
    });

    for (const distribution of receipt.distributions) {
      expect(distribution.statusCounts).toEqual({
        timeout: PROBE_PATHS.length,
      });
    }
  });

  it("plans without issuing a request", async () => {
    const { fetcher, seen } = stubFetcher(200);

    const receipt = await runPrefetchAvailabilityProbe({
      mode: "plan",
      fetcher,
      repeats: 1,
    });

    expect(seen).toHaveLength(0);
    expect(receipt.state).toBe("planned");
    expect(receipt.distributions).toEqual([]);
  });

  it("refuses an invalid mode, repeat count, or concurrency ceiling", () => {
    expect(() => parseProbeArgs(["--mode", "apply"])).toThrow(
      /probe_mode_invalid/,
    );
    expect(() => parseProbeArgs(["--repeats", "0"])).toThrow(
      /probe_repeats_invalid/,
    );
    expect(() =>
      parseProbeArgs(["--concurrency", String(PROBE_CONCURRENCY_MAX + 1)]),
    ).toThrow(/probe_concurrency_invalid/);
    expect(parseProbeArgs([])).toEqual({
      mode: "verify",
      origin: "https://over.garden",
      repeats: 1,
      concurrency: 3,
      injectOriginResponseTimeout: false,
    });
  });
});

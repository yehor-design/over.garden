import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_RETRY_ATTEMPTS,
  authRetryDelayMs,
  postPastRateLimit,
} from "../tests/helpers/auth-rate-limit";

function response(status: number, headers: Record<string, string> = {}) {
  return { status: () => status, headers: () => headers };
}

describe("waiting out Better Auth's limiter (tests/helpers/auth-rate-limit.ts)", () => {
  it("waits as long as a 429 names, and a little more", () => {
    for (let run = 0; run < 20; run += 1) {
      const delay = authRetryDelayMs(
        response(429, { "x-retry-after": "7" }),
        0,
      );
      expect(delay).toBeGreaterThanOrEqual(7_250);
      expect(delay).toBeLessThan(8_250);
    }
  });

  it("falls back to its own schedule when the answer names no wait", () => {
    const first = authRetryDelayMs(response(429), 0);
    expect(first).toBeGreaterThanOrEqual(1_500);
    expect(first).toBeLessThan(2_500);
    // Sign-up is retried on any failure, and a 500 names nothing.
    const later = authRetryDelayMs(response(500, { "x-retry-after": "7" }), 2);
    expect(later).toBeGreaterThanOrEqual(9_000);
    expect(later).toBeLessThan(10_000);
  });

  it("stops once its attempts are spent", () => {
    expect(
      authRetryDelayMs(
        response(429, { "x-retry-after": "1" }),
        AUTH_RETRY_ATTEMPTS - 1,
      ),
    ).toBeNull();
    expect(
      authRetryDelayMs(
        response(429, { "x-retry-after": "1" }),
        AUTH_RETRY_ATTEMPTS - 2,
      ),
    ).not.toBeNull();
  });
});

describe("postPastRateLimit", () => {
  afterEach(() => vi.useRealTimers());

  it("asks again after each 429 until an answer that is not one", async () => {
    vi.useFakeTimers();
    const answers = [429, 429, 200];
    const post = vi.fn(async () =>
      response(answers.shift()!, { "x-retry-after": "3" }),
    );
    const result = postPastRateLimit(post);
    await vi.runAllTimersAsync();
    const { response: last, statuses } = await result;
    expect(last.status()).toBe(200);
    expect(statuses).toEqual([429, 429, 200]);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("hands a real refusal back at once", async () => {
    const post = vi.fn(async () => response(401));
    const { statuses } = await postPastRateLimit(post);
    expect(statuses).toEqual([401]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("gives up with the last 429 once its attempts are spent", async () => {
    vi.useFakeTimers();
    const post = vi.fn(async () => response(429, { "x-retry-after": "1" }));
    const result = postPastRateLimit(post);
    await vi.runAllTimersAsync();
    const { statuses } = await result;
    expect(statuses).toHaveLength(AUTH_RETRY_ATTEMPTS);
    expect(new Set(statuses)).toEqual(new Set([429]));
  });
});

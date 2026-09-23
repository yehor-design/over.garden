import { describe, expect, it } from "vitest";

import {
  AUTH_RETRY_ATTEMPTS,
  authRetryDelayMs,
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

import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForComposerIdle } from "./composer-idle-deadline";

afterEach(() => vi.useRealTimers());

describe("OVE-243 composer idle deadline", () => {
  it("returns control at the finite deadline after a lost terminal event", async () => {
    vi.useFakeTimers();
    const result = waitForComposerIdle({
      isBusy: () => true,
      deadlineMs: 1_500,
      pollMs: 10,
    });
    await vi.advanceTimersByTimeAsync(1_510);
    await expect(result).resolves.toBe("deadline");
  });

  it("supports cancellation", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = waitForComposerIdle({
      isBusy: () => true,
      signal: controller.signal,
    });
    controller.abort(new Error("cancelled"));
    await expect(result).rejects.toThrow("cancelled");
  });
});

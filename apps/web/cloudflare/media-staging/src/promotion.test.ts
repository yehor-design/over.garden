import { describe, expect, it } from "vitest";

import { PROMOTION_CONCURRENCY, promoteWithConcurrency } from "./promotion";

describe("claim promotion concurrency (OVE-372)", () => {
  it("keeps at most four promotions in flight and finishes every item", async () => {
    expect(PROMOTION_CONCURRENCY).toBe(4);
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    await promoteWithConcurrency(
      Array.from({ length: 10 }, (_, index) => index),
      PROMOTION_CONCURRENCY,
      async (item) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        done.push(item);
      },
    );
    expect(peak).toBe(4);
    expect(done.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("surfaces the first failure", async () => {
    await expect(
      promoteWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error("public_object_collision");
      }),
    ).rejects.toThrow("public_object_collision");
  });
});

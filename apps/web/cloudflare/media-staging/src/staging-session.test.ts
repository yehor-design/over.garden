import { describe, expect, it } from "vitest";

import {
  classifyAlarmAction,
  classifyGenerationTransition,
  isControlDeadlineOpen,
  nextReconciliationDelayMs,
  readBoundedResponseText,
} from "./staging-session-policy";

describe("media staging session state policy", () => {
  it("makes upload replay stable and fences stale or mismatched generations", () => {
    expect(
      classifyGenerationTransition(
        { generation: 2, sha256: "digest-a", state: "staged" },
        { generation: 2, sha256: "digest-a" },
      ),
    ).toBe("replay");
    expect(
      classifyGenerationTransition(
        { generation: 2, sha256: "digest-a", state: "staged" },
        { generation: 2, sha256: "digest-b" },
      ),
    ).toBe("receipt_mismatch");
    expect(
      classifyGenerationTransition(
        { generation: 3, sha256: "digest-a", state: "staged" },
        { generation: 2, sha256: "digest-a" },
      ),
    ).toBe("stale_generation");
    expect(
      classifyGenerationTransition(
        { generation: 2, sha256: "digest-a", state: "deleting" },
        { generation: 2, sha256: "digest-a" },
      ),
    ).toBe("generation_expired");
  });

  it("retains claimed state on indeterminate status and deletes only known absence", () => {
    expect(classifyAlarmAction("claimed", "indeterminate")).toBe("reschedule");
    expect(classifyAlarmAction("claimed", "committed")).toBe("finalize");
    expect(classifyAlarmAction("claimed", "absent")).toBe("delete_all");
    expect(classifyAlarmAction("staged", null)).toBe("delete_staging");
  });

  it("keeps reconciliation finite and bounded after provider retries", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(nextReconciliationDelayMs)).toEqual([
      60_000, 120_000, 240_000, 480_000, 900_000, 900_000, 900_000,
    ]);
  });

  it("rejects a queued control mutation after its caller deadline", () => {
    expect(isControlDeadlineOpen(1_100, 1_000)).toBe(true);
    expect(isControlDeadlineOpen(999, 1_000)).toBe(false);
    expect(isControlDeadlineOpen(Number.NaN, 1_000)).toBe(false);
  });

  it("cancels a commit-status response as soon as its byte limit is crossed", async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(200));
          controller.enqueue(new Uint8Array(100));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-type": "application/json" } },
    );

    await expect(readBoundedResponseText(response, 256)).resolves.toBeNull();
    expect(cancelled).toBe(true);
  });
});

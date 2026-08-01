import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drainLearningAttributionOutbox: vi.fn() }));

vi.mock("@/server/mvp-learning/attribution-outbox", () => ({
  drainLearningAttributionOutbox: mocks.drainLearningAttributionOutbox,
}));

describe("learning attribution Cron route (OVE-219)", () => {
  let previousCronSecret: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    previousCronSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
  });

  it("refuses an unauthenticated invocation without draining", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://local.test/api/cron/learning-attribution"),
    );

    expect(response.status).toBe(401);
    expect(mocks.drainLearningAttributionOutbox).not.toHaveBeenCalled();
  });

  it("returns class-only lifecycle evidence for an authenticated drain", async () => {
    mocks.drainLearningAttributionOutbox.mockResolvedValue({
      claimed: 1,
      attributed: 1,
      failed: 0,
      dead: 0,
      cancelled: 0,
      reclaimed: 0,
      remaining: 0,
      deadlineReached: false,
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://local.test/api/cron/learning-attribution", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      issue: "OVE-219",
      outbox: {
        claimedClass: "present",
        attributedClass: "present",
        failedClass: "empty",
        deadClass: "empty",
        cancelledClass: "empty",
        reclaimedClass: "empty",
        remainingClass: "empty",
        deadlineClass: "within_budget",
      },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const drainMediaLifecycleQueue = vi.fn();
const runRetentionWorkflow = vi.fn();
const executionOrder: string[] = [];

vi.mock("@/server/media/media-lifecycle-consumer", () => ({
  drainMediaLifecycleQueue,
}));
vi.mock("@/server/media/retention-executor", () => ({ runRetentionWorkflow }));

describe("media lifecycle cron readiness", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    drainMediaLifecycleQueue.mockReset();
    runRetentionWorkflow.mockReset();
    executionOrder.length = 0;
    runRetentionWorkflow.mockImplementation(async () => {
      executionOrder.push("retention");
      return {
        policyVersion: "ove349.retention.v2",
        failureClass: "none",
        danglingCoverPointerClass: "empty",
        pendingRevokeJobsClass: "empty",
      };
    });
    drainMediaLifecycleQueue.mockImplementation(async () => {
      executionOrder.push("drain");
      return {
        claimed: 1,
        completed: 1,
        failed: 0,
        dead: 0,
        reclaimed: 0,
        superseded: 0,
        remaining: 0,
        deadlineReached: false,
        durationMs: 25,
      };
    });
  });

  it("rejects an unauthenticated invocation without draining", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cron/media-lifecycle"),
    );
    expect(response.status).toBe(401);
    expect(drainMediaLifecycleQueue).not.toHaveBeenCalled();
  });

  it("drains on GET, which is the method Vercel Cron actually sends", async () => {
    // This route exported POST only. The daily schedule answered 405 and the
    // workflow never ran once in production: the retention-run table was empty,
    // nine queue rows sat at `attempts = 0`, and five derivatives of deleted
    // journal entries were still served with HTTP 200.
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/media-lifecycle", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(executionOrder).toEqual(["retention", "drain"]);
  });

  it("reports ready only after zero unfinished or degraded work", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cron/media-lifecycle", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      issue: "OVE-216",
      drained: { remainingClass: "empty", deadlineClass: "within_budget" },
    });
    expect(executionOrder).toEqual(["retention", "drain"]);
  });

  it.each([
    { failed: 1 },
    { dead: 1 },
    { remaining: 1 },
    { deadlineReached: true },
  ])("fails readiness closed for $s", async (override) => {
    drainMediaLifecycleQueue.mockResolvedValueOnce({
      claimed: 1,
      completed: 0,
      failed: 0,
      dead: 0,
      reclaimed: 0,
      superseded: 0,
      remaining: 0,
      deadlineReached: false,
      durationMs: 44_000,
      ...override,
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cron/media-lifecycle", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    expect((await response.json()).ok).toBe(false);
  });

  it("fails readiness closed for partial retention", async () => {
    runRetentionWorkflow.mockResolvedValueOnce({
      policyVersion: "ove349.retention.v2",
      failureClass: "partial",
      danglingCoverPointerClass: "present",
      pendingRevokeJobsClass: "present",
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cron/media-lifecycle", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    expect((await response.json()).ok).toBe(false);
  });
});

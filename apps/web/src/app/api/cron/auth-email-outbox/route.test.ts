import { beforeEach, describe, expect, it, vi } from "vitest";

const drainAuthEmailOutbox = vi.fn();

vi.mock("@/server/auth/auth-email-outbox-consumer", () => ({
  drainAuthEmailOutbox,
}));

describe("auth email outbox cron", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    drainAuthEmailOutbox.mockReset();
    drainAuthEmailOutbox.mockResolvedValue({
      claimed: 1,
      sent: 1,
      failed: 0,
      dead: 0,
      cancelled: 0,
      reclaimed: 0,
      remaining: 0,
      deadlineReached: false,
      durationMs: 5,
    });
  });

  it("rejects unauthenticated calls without exposing queue state", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cron/auth-email-outbox", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(drainAuthEmailOutbox).not.toHaveBeenCalled();
  });

  it("returns class-only state after an authenticated drain", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/auth-email-outbox", {
        method: "GET",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      issue: "OVE-241",
      outbox: {
        claimedClass: "present",
        sentClass: "present",
        failedClass: "empty",
        deadClass: "empty",
        cancelledClass: "empty",
        reclaimedClass: "empty",
        remainingClass: "empty",
        deadlineClass: "within_budget",
      },
    });
  });

  it("contains drain failures to a class-only recovery receipt", async () => {
    const { GET } = await import("./route");
    drainAuthEmailOutbox.mockRejectedValueOnce(
      new Error("provider detail must not escape"),
    );

    const response = await GET(
      new Request("http://localhost/api/cron/auth-email-outbox", {
        method: "GET",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      issue: "OVE-241",
      outbox: { lifecycleClass: "unavailable" },
    });
  });
});

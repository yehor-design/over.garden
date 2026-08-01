import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock("@/server/analytics-events", () => ({
  recordAnalyticsEventSafely: mocks.recordAnalyticsEventSafely,
}));

import { scheduleGardenWorkspaceActivationAnalytics } from "./garden-workspace-after-response";

describe("garden workspace after-response analytics", () => {
  it("schedules the existing event after the route response without awaiting it", async () => {
    let callback: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((next: () => Promise<void>) => {
      callback = next;
    });
    mocks.recordAnalyticsEventSafely.mockResolvedValue(undefined);

    const result = scheduleGardenWorkspaceActivationAnalytics(
      { userId: "00000000-0000-4000-8000-0000000000a1", sessionId: "session" },
      {
        eventName: "activation_started",
        properties: { actor_class: "real_self_serve" },
      },
    );

    expect(result).toBeUndefined();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.recordAnalyticsEventSafely).not.toHaveBeenCalled();
    await callback?.();
    expect(mocks.recordAnalyticsEventSafely).toHaveBeenCalledTimes(1);
  });

  it("contains an after-response analytics failure", async () => {
    let callback: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((next: () => Promise<void>) => {
      callback = next;
    });
    mocks.recordAnalyticsEventSafely.mockRejectedValue(
      new Error("unavailable"),
    );

    scheduleGardenWorkspaceActivationAnalytics(
      { userId: "00000000-0000-4000-8000-0000000000a1", sessionId: "session" },
      { eventName: "activation_started", properties: {} },
    );

    await expect(callback?.()).resolves.toBeUndefined();
  });
});

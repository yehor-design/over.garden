import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  markNotificationEventsRead: vi.fn(),
  setNotificationReceipt: vi.fn(),
  revalidatePath: vi.fn(),
  resolveVisualSocialMutationActor: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));
vi.mock("@/server/social-return-repository", () => ({
  markNotificationEventsRead: mocks.markNotificationEventsRead,
  setNotificationReceipt: mocks.setNotificationReceipt,
}));
vi.mock("@/server/visual-fixtures/social-actor", () => ({
  resolveVisualSocialMutationActor: mocks.resolveVisualSocialMutationActor,
}));

const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};

describe("notification receipt return paths", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: scope.userId },
      session: { id: scope.sessionId },
    });
    mocks.getSessionId.mockReturnValue(scope.sessionId);
    mocks.resolveVisualSocialMutationActor.mockReturnValue(null);
  });

  it.each([
    "https://attacker.example/notifications",
    "/\\attacker.example/notifications",
    "/%5cattacker.example/notifications",
    "/%252f%255cattacker.example/notifications",
  ])(
    "keeps an authenticated receipt redirect local for %s",
    async (returnTo) => {
      const { POST } = await import("./route");
      const response = await POST(
        formRequest({
          eventKey: "a".repeat(32),
          receiptState: "read",
          returnTo,
        }),
      );

      expect(mocks.setNotificationReceipt).toHaveBeenCalledWith(scope, {
        eventKey: "a".repeat(32),
        state: "read",
      });
      expect(response.headers.get("location")).toBe(
        "https://over.garden/notifications?engagement=notification-updated",
      );
    },
  );

  it("keeps a signed-out receipt redirect local without mutating", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      formRequest({
        eventKey: "a".repeat(32),
        receiptState: "read",
        returnTo: "/%5cattacker.example/notifications",
      }),
    );

    expect(mocks.setNotificationReceipt).not.toHaveBeenCalled();
    expect(mocks.markNotificationEventsRead).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://over.garden/notifications",
    );
  });
});

function formRequest(fields: Record<string, string>) {
  return new Request("https://over.garden/api/notifications/receipts", {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

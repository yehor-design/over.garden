import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  markNotificationEventsRead: vi.fn(),
  setNotificationReceipt: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  revalidatePath: vi.fn(),
  resolveVisualSocialMutationActor: vi.fn(),
  admitDocumentMutation: vi.fn(),
  documentMutationAdmissionResponse: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationAdmissionResponse: mocks.documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest: vi.fn((request: Request) =>
    request.headers.get("x-overgarden-document-generation"),
  ),
}));
vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId: sessionId ?? null,
  })),
}));
vi.mock("@/server/social-return-repository", () => ({
  markNotificationEventsRead: mocks.markNotificationEventsRead,
  setNotificationReceipt: mocks.setNotificationReceipt,
  updateNotificationPreferences: mocks.updateNotificationPreferences,
}));
vi.mock("@/server/visual-fixtures/social-actor", () => ({
  resolveVisualSocialMutationActor: mocks.resolveVisualSocialMutationActor,
}));

const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};

describe("notification mutation routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockReset();
    mocks.getSessionId.mockReturnValue(scope.sessionId);
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: scope.userId },
      session: { id: scope.sessionId },
    });
    mocks.resolveVisualSocialMutationActor.mockReturnValue(null);
    mocks.admitDocumentMutation.mockImplementation(async () => {
      const session = await mocks.getCurrentSession();
      if (!session?.user?.id) {
        return {
          status: "rejected",
          transportResult: "AUTHENTICATION_REQUIRED",
          statusCode: 401,
        };
      }
      return { status: "admitted", scope };
    });
    mocks.documentMutationAdmissionResponse.mockImplementation((admission) =>
      Response.json(
        { code: admission.transportResult },
        { status: admission.statusCode },
      ),
    );
  });

  it("updates every explicit preference and keeps locale return bounded", async () => {
    const { POST } = await import("./preferences/route");
    const response = await POST(
      formRequest("/api/notifications/preferences", {
        locale: "bg",
        comments: "on",
        follows: "on",
        system: "on",
      }),
    );

    expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith(scope, {
      comments: true,
      replies: false,
      follows: true,
      mentions: false,
      claims: false,
      system: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bg/notifications");
    expect(response.headers.get("location")).toBe(
      "https://over.garden/bg/notifications?engagement=preferences-saved",
    );
  });

  it("marks every opaque key in a grouped notification as read", async () => {
    const { POST } = await import("./receipts/route");
    const keys = ["a".repeat(32), "b".repeat(32)];
    const response = await POST(
      multiValueFormRequest("/api/notifications/receipts", [
        ["eventKey", keys[0]],
        ["eventKey", keys[1]],
        ["receiptState", "read"],
        ["returnTo", "/ru/notifications?filter=comments&view=grouped"],
      ]),
    );

    expect(mocks.markNotificationEventsRead).toHaveBeenCalledWith(scope, keys);
    expect(mocks.setNotificationReceipt).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain(
      "/ru/notifications?filter=comments&view=grouped&engagement=notification-updated",
    );
  });

  it.each([
    "https://attacker.example/notifications",
    "/\\attacker.example/notifications",
    "/%5cattacker.example/notifications",
    "/%252f%255cattacker.example/notifications",
  ])(
    "dismisses grouped keys individually and rejects unsafe return path %s",
    async (returnTo) => {
      const { POST } = await import("./receipts/route");
      const keys = ["c".repeat(32), "d".repeat(32)];
      const response = await POST(
        multiValueFormRequest("/api/notifications/receipts", [
          ["eventKey", keys[0]],
          ["eventKey", "not-an-event-key"],
          ["eventKey", keys[1]],
          ["receiptState", "dismissed"],
          ["returnTo", returnTo],
        ]),
      );

      expect(mocks.setNotificationReceipt.mock.calls).toEqual([
        [scope, { eventKey: keys[0], state: "dismissed" }],
        [scope, { eventKey: keys[1], state: "dismissed" }],
      ]);
      expect(response.headers.get("location")).toBe(
        "https://over.garden/notifications?engagement=notification-updated",
      );
    },
  );

  it("does not mutate notification state while signed out", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { POST } = await import("./receipts/route");
    const response = await POST(
      formRequest("/api/notifications/receipts", {
        eventKey: "a".repeat(32),
        receiptState: "read",
        returnTo: "/notifications",
      }),
    );

    expect(mocks.markNotificationEventsRead).not.toHaveBeenCalled();
    expect(mocks.setNotificationReceipt).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://over.garden/notifications",
    );
  });

  it("updates an isolated fixture receipt without an account session", async () => {
    const actorId = "18700001-0000-4000-8000-000000000001";
    mocks.resolveVisualSocialMutationActor.mockReturnValueOnce({
      actorId,
      scenario: { id: "notifications-dense" },
    });
    const { POST } = await import("./receipts/route");
    const eventKey = "e".repeat(32);

    const response = await POST(
      formRequest("/api/notifications/receipts", {
        eventKey,
        receiptState: "read",
        visualSocial: "notifications-dense",
        returnTo: "/notifications?visualSocial=notifications-dense",
      }),
    );

    expect(mocks.setNotificationReceipt).toHaveBeenCalledWith(
      { userId: actorId, sessionId: null },
      { eventKey, state: "read" },
    );
    expect(response.headers.get("location")).toContain(
      "visualSocial=notifications-dense",
    );
  });
});

function formRequest(path: string, fields: Record<string, string>) {
  return new Request(`https://over.garden${path}`, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

function multiValueFormRequest(path: string, fields: Array<[string, string]>) {
  return new Request(`https://over.garden${path}`, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  updateNotificationReceipts: vi.fn(),
  revalidatePath: vi.fn(),
  resolveMutationScope: vi.fn(),
  mutationScopeResponse: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  mutationScopeResponse: mocks.mutationScopeResponse,
  ownerUserIdFromRequest: vi.fn(() => null),
}));
vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));
vi.mock("@/server/social-return-repository", () => ({
  updateNotificationReceipts: mocks.updateNotificationReceipts,
}));
const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const KEY = "a".repeat(32);
const OTHER_KEY = "b".repeat(32);

describe("notification receipt return paths", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: scope.userId },
      session: { id: scope.sessionId },
    });
    mocks.getSessionId.mockReturnValue(scope.sessionId);
    mocks.resolveMutationScope.mockImplementation(async () => {
      const session = await mocks.getCurrentSession();
      if (!session?.user?.id) {
        return {
          status: "rejected",
          code: "session_required",
          statusCode: 401,
        };
      }
      return { status: "admitted", scope };
    });
    mocks.mutationScopeResponse.mockImplementation((admission) =>
      Response.json({ code: admission.code }, { status: admission.statusCode }),
    );
    mocks.updateNotificationReceipts.mockResolvedValue(1);
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
          eventKey: KEY,
          receiptState: "read",
          returnTo,
        }),
      );

      expect(mocks.updateNotificationReceipts).toHaveBeenCalledWith(scope, {
        eventKeys: [KEY],
        state: "read",
      });
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `/notifications?receipt=read&event=${KEY}#notification-${KEY}`,
      );
    },
  );

  it("keeps a signed-out receipt redirect local without mutating", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      formRequest({
        eventKey: KEY,
        receiptState: "read",
        returnTo: "/%5cattacker.example/notifications",
      }),
    );

    expect(mocks.updateNotificationReceipts).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/notifications");
  });

  // `OVE-504`: `request.url` names the host the server believes it has. An
  // absolute answer built from it sent the reader to that host, away from the
  // session cookie, and the page they came back to asked them to sign in.
  it("answers with a path, never with the host the request arrived on", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      formRequest(
        { eventKey: KEY, receiptState: "read", returnTo: "/bg/notifications" },
        "https://overgarden-git-preview.vercel.app",
      ),
    );

    expect(response.headers.get("location")).toBe(
      `/bg/notifications?receipt=read&event=${KEY}#notification-${KEY}`,
    );
  });

  it("comes back to the same view and the row it marked, with what was written", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      multiValueFormRequest([
        ["eventKey", KEY],
        ["eventKey", OTHER_KEY],
        ["receiptState", "unread"],
        [
          "returnTo",
          // A view carries its filters and its page; nothing else survives,
          // and an old outcome is never carried into the new one.
          "/ru/notifications?filter=reminders&unread=1&view=individual&cursor=eyJrIjoxfQ&token=secret&receipt=failed&event=cccccccccccccccccccccccccccccccc",
        ],
      ]),
    );

    // One write for the whole row.
    expect(mocks.updateNotificationReceipts).toHaveBeenCalledTimes(1);
    expect(mocks.updateNotificationReceipts).toHaveBeenCalledWith(scope, {
      eventKeys: [KEY, OTHER_KEY],
      state: "unread",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ru/notifications");
    expect(response.headers.get("location")).toBe(
      `/ru/notifications?filter=reminders&unread=1&view=individual&cursor=eyJrIjoxfQ&receipt=unread&event=${KEY}#notification-${KEY}`,
    );
  });

  it("sends a row read in the unread view to the notice above the list, since it has left that view", async () => {
    const { POST } = await import("./route");
    const read = await POST(
      formRequest({
        eventKey: KEY,
        receiptState: "read",
        returnTo: "/notifications?unread=1",
      }),
    );
    const unread = await POST(
      formRequest({
        eventKey: KEY,
        receiptState: "unread",
        returnTo: "/notifications?unread=1",
      }),
    );

    expect(read.headers.get("location")).toBe(
      `/notifications?unread=1&receipt=read&event=${KEY}#notification-outcome`,
    );
    // Marked unread, it is still in the unread view: back to the row.
    expect(unread.headers.get("location")).toBe(
      `/notifications?unread=1&receipt=unread&event=${KEY}#notification-${KEY}`,
    );
  });

  it("sends a dismissal to the notice above the list, since its row has left", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      formRequest({
        eventKey: KEY,
        receiptState: "dismissed",
        returnTo: "/notifications?filter=comments",
      }),
    );

    expect(mocks.updateNotificationReceipts).toHaveBeenCalledWith(scope, {
      eventKeys: [KEY],
      state: "dismissed",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/notifications");
    expect(response.headers.get("location")).toBe(
      `/notifications?filter=comments&receipt=dismissed&event=${KEY}#notification-outcome`,
    );
  });

  it.each(["read", "dismissed"] as const)(
    "says a failed %s beside its row, and refreshes nothing",
    async (state) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.updateNotificationReceipts.mockRejectedValue(
        Object.assign(
          new Error("canceling statement due to statement timeout"),
          {
            code: "57014",
          },
        ),
      );
      const { POST } = await import("./route");
      const response = await POST(
        multiValueFormRequest([
          ["eventKey", KEY],
          ["eventKey", OTHER_KEY],
          ["receiptState", state],
          ["returnTo", "/bg/notifications?unread=1"],
        ]),
      );

      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(response.status).toBe(303);
      // The row is still there — a failed dismissal did not remove it — so
      // the answer goes back to the row, whose buttons are the retry.
      expect(response.headers.get("location")).toBe(
        `/bg/notifications?unread=1&receipt=failed&event=${KEY}#notification-${KEY}`,
      );
      expect(log).toHaveBeenCalledWith("[notifications] receipt write failed", {
        state,
        count: 2,
        error: "canceling statement due to statement timeout",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(KEY);
      log.mockRestore();
    },
  );

  it("writes nothing when no key is an event key, and says what was asked", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      multiValueFormRequest([
        ["eventKey", "not-an-event-key"],
        ["eventKey", "A".repeat(32)],
        ["receiptState", "read"],
        ["returnTo", "/notifications"],
      ]),
    );

    expect(mocks.updateNotificationReceipts).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "/notifications?receipt=read#notification-outcome",
    );
  });

  it("marks read when the state is not one it knows, and bounds a row at sixty events", async () => {
    const keys = Array.from({ length: 61 }, (_, index) =>
      index.toString(16).padStart(32, "0"),
    );
    const { POST } = await import("./route");
    await POST(
      multiValueFormRequest([
        ...keys.map((key) => ["eventKey", key] as [string, string]),
        ["receiptState", "archived"],
        ["returnTo", "/notifications"],
      ]),
    );

    expect(mocks.updateNotificationReceipts).toHaveBeenCalledWith(scope, {
      eventKeys: keys.slice(0, 60),
      state: "read",
    });
  });
});

function formRequest(
  fields: Record<string, string>,
  origin = "https://over.garden",
) {
  return new Request(`${origin}/api/notifications/receipts`, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

function multiValueFormRequest(fields: Array<[string, string]>) {
  return new Request("https://over.garden/api/notifications/receipts", {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

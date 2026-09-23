import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  updateNotificationReceipts: vi.fn(),
  updateNotificationPreferences: vi.fn(),
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
  ownerUserIdFromRequest: vi.fn((request: Request) =>
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
  updateNotificationReceipts: mocks.updateNotificationReceipts,
  updateNotificationPreferences: mocks.updateNotificationPreferences,
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
    mocks.updateNotificationReceipts.mockResolvedValue(2);
    mocks.updateNotificationPreferences.mockImplementation(
      async (_scope, preferences) => preferences,
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
    // The settings page, and the list that reads the same preferences.
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/bg/notifications/settings"],
      ["/bg/notifications"],
    ]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/bg/notifications/settings?saved=1#notification-settings-outcome",
    );
  });

  it.each([
    ["ru", "/ru/notifications/settings"],
    ["uk", "/notifications/settings"],
    // A language the site does not speak is the default one, never a path.
    ["../../account", "/notifications/settings"],
  ])(
    "returns preferences saved in %s to that language's settings page",
    async (locale, settingsPath) => {
      const { POST } = await import("./preferences/route");
      const response = await POST(
        formRequest("/api/notifications/preferences", { locale }),
      );

      expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith(scope, {
        comments: false,
        replies: false,
        follows: false,
        mentions: false,
        claims: false,
        system: false,
      });
      expect(mocks.revalidatePath.mock.calls).toEqual([
        [settingsPath],
        [settingsPath.replace(/\/settings$/u, "")],
      ]);
      expect(response.headers.get("location")).toBe(
        `${settingsPath}?saved=1#notification-settings-outcome`,
      );
    },
  );

  it("says a failed save on the settings page, and refreshes nothing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateNotificationPreferences.mockRejectedValue(
      Object.assign(new Error("connection terminated"), { code: "08006" }),
    );
    const { POST } = await import("./preferences/route");
    const response = await POST(
      formRequest("/api/notifications/preferences", {
        locale: "ru",
        comments: "on",
      }),
    );

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/ru/notifications/settings?saved=failed#notification-settings-outcome",
    );
    expect(log).toHaveBeenCalledWith(
      "[notifications] preference write failed",
      { error: "connection terminated" },
    );
    log.mockRestore();
  });

  it("sends a signed-out save back to the settings page without writing", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { POST } = await import("./preferences/route");
    const response = await POST(
      formRequest("/api/notifications/preferences", {
        locale: "bg",
        comments: "on",
      }),
    );

    expect(mocks.updateNotificationPreferences).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/bg/notifications/settings");
  });

  it("marks every opaque key in a grouped notification as read in one write", async () => {
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

    expect(mocks.updateNotificationReceipts).toHaveBeenCalledTimes(1);
    expect(mocks.updateNotificationReceipts).toHaveBeenCalledWith(scope, {
      eventKeys: keys,
      state: "read",
    });
    expect(response.headers.get("location")).toBe(
      `/ru/notifications?filter=comments&view=grouped&receipt=read&event=${keys[0]}#notification-${keys[0]}`,
    );
  });

  it.each([
    "https://attacker.example/notifications",
    "/\\attacker.example/notifications",
    "/%5cattacker.example/notifications",
    "/%252f%255cattacker.example/notifications",
  ])(
    "dismisses a grouped row in one write and rejects unsafe return path %s",
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

      expect(mocks.updateNotificationReceipts.mock.calls).toEqual([
        [scope, { eventKeys: keys, state: "dismissed" }],
      ]);
      expect(response.headers.get("location")).toBe(
        `/notifications?receipt=dismissed&event=${keys[0]}#notification-outcome`,
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
        returnTo: "/bg/notifications?filter=reminders",
      }),
    );

    expect(mocks.updateNotificationReceipts).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "/bg/notifications?filter=reminders",
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

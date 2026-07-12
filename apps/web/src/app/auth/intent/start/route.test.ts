import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthIntentToken: vi.fn(),
  getCurrentSession: vi.fn(),
}));

vi.mock("@/server/auth-intent-token", () => ({
  createAuthIntentToken: mocks.createAuthIntentToken,
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

describe("POST /auth/intent/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.createAuthIntentToken.mockReturnValue("opaque-intent-token");
  });

  it("issues one opaque guest intent and ignores submitted draft text", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      formRequest({
        action: "comment",
        returnTo: "/journal/balcony-tomato-check#comments",
        targetKind: "journal",
        targetRef: "balcony-tomato-check",
        control: "reply-a7d8f9c012345678",
        body: "this private draft must not cross auth",
        email: "person@example.com",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://over.garden/auth/intent?intent=opaque-intent-token",
    );
    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith({
      action: "comment",
      returnTo: "/journal/balcony-tomato-check#comments",
      target: { kind: "journal", ref: "balcony-tomato-check" },
      control: "reply-a7d8f9c012345678",
    });
    expect(JSON.stringify(mocks.createAuthIntentToken.mock.calls)).not.toMatch(
      /private draft|person@example/i,
    );
  });

  it("returns an already-authenticated user to the exact control without mutating", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    });
    const { POST } = await import("./route");
    const response = await POST(
      formRequest({
        action: "create_entry",
        returnTo: "/garden",
        control: "composer-first-entry",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://over.garden/garden?authIntent=create_entry&authControl=composer-first-entry#first-entry-composer-composer-first-entry",
    );
    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
  });

  it.each(["follow", "report", "block"])(
    "accepts a %s intent for a profile handle containing an underscore",
    async (action) => {
      const { POST } = await import("./route");
      const response = await POST(
        formRequest({
          action,
          returnTo: "/bg/@demo_olena",
          targetKind: "profile",
          targetRef: "demo_olena",
        }),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "https://over.garden/auth/intent?intent=opaque-intent-token",
      );
      expect(mocks.createAuthIntentToken).toHaveBeenCalledWith({
        action,
        returnTo: "/bg/@demo_olena",
        target: { kind: "profile", ref: "demo_olena" },
      });
    },
  );

  it.each([
    { action: "comment", returnTo: "https://attacker.example" },
    { action: "delete", returnTo: "/garden" },
    { action: "follow", returnTo: "/lineage/objects/not-a-uuid" },
  ])("fails closed without echoing malformed input", async (fields) => {
    const { POST } = await import("./route");
    const response = await POST(formRequest(fields));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://over.garden/auth/intent?state=invalid",
    );
    expect(response.headers.get("location")).not.toMatch(
      /attacker|delete|uuid/i,
    );
    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
  });

  it("does not misclassify an operational session failure as an invalid intent", async () => {
    mocks.getCurrentSession.mockRejectedValueOnce(
      new Error("session storage unavailable"),
    );
    const { POST } = await import("./route");

    await expect(
      POST(
        formRequest({
          action: "create_object",
          returnTo: "/garden",
        }),
      ),
    ).rejects.toThrow("session storage unavailable");

    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
  });
});

function formRequest(fields: Record<string, string>) {
  return new Request("https://over.garden/auth/intent/start", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

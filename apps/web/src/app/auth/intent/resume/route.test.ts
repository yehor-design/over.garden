import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  verifyAuthIntentToken: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock("@/server/auth-intent-token", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/auth-intent-token")
  >("@/server/auth-intent-token");
  return {
    ...actual,
    verifyAuthIntentToken: mocks.verifyAuthIntentToken,
  };
});

describe("GET /auth/intent/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    });
    mocks.verifyAuthIntentToken.mockReturnValue({
      version: 1,
      action: "bookmark",
      returnTo: "/journal/balcony-tomato-check?tab=history",
      target: { kind: "journal", ref: "balcony-tomato-check" },
      control: "bookmark-main-control",
      issuedAt: 1,
      expiresAt: 2,
    });
  });

  it("returns an authenticated user to the precise control without a GET mutation", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/auth/intent/resume?intent=opaque-intent-token",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://over.garden/journal/balcony-tomato-check?tab=history&authIntent=bookmark&authControl=bookmark-main-control#engagement-bookmark-bookmark-main-control",
    );
    expect(mocks.verifyAuthIntentToken).toHaveBeenCalledWith(
      "opaque-intent-token",
    );
  });

  it("returns a signed-out callback to the same opaque auth surface without looping", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/auth/intent/resume?intent=opaque-intent-token",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://over.garden/auth/intent?intent=opaque-intent-token&state=auth-required",
    );
  });

  it("keeps only a bounded OAuth recovery code on a signed-out callback", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://over.garden/auth/intent/resume?intent=opaque-intent-token&error=account-not-linked&error_description=private%20provider%20payload",
      ),
    );
    const location = response.headers.get("location") ?? "";

    expect(response.status).toBe(303);
    expect(location).toBe(
      "https://over.garden/auth/intent?intent=opaque-intent-token&state=auth-required&error=account_not_linked",
    );
    expect(location).not.toMatch(
      /error_description|private|provider%20payload/i,
    );
  });

  it("does not misclassify an operational session failure as an invalid token", async () => {
    mocks.getCurrentSession.mockRejectedValueOnce(
      new Error("session storage unavailable"),
    );
    const { GET } = await import("./route");

    await expect(
      GET(
        new Request(
          "https://over.garden/auth/intent/resume?intent=opaque-intent-token",
        ),
      ),
    ).rejects.toThrow("session storage unavailable");
  });

  it.each([
    { code: "invalid", expectedState: "invalid", keepToken: false },
    { code: "expired", expectedState: "expired", keepToken: true },
  ])(
    "fails safely for a $code token",
    async ({ code, expectedState, keepToken }) => {
      mocks.verifyAuthIntentToken.mockImplementation(() => {
        const error = new Error("safe") as Error & { code: string };
        error.code = code;
        throw error;
      });
      const { GET } = await import("./route");
      const response = await GET(
        new Request(
          "https://over.garden/auth/intent/resume?intent=opaque-intent-token",
        ),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        keepToken
          ? `https://over.garden/auth/intent?intent=opaque-intent-token&state=${expectedState}`
          : `https://over.garden/auth/intent?state=${expectedState}`,
      );
    },
  );
});

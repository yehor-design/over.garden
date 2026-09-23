import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  redirect: vi.fn(),
  verifyAuthIntentToken: vi.fn(),
}));

// The real `redirect()` throws to stop the render. A mock that returns would
// let execution fall through to a later branch and make the assertion lie.
class RedirectSignal extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirect(path);
    throw new RedirectSignal(path);
  },
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));
vi.mock("@/server/auth-intent-token", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/auth-intent-token")
  >("@/server/auth-intent-token");
  return { ...actual, verifyAuthIntentToken: mocks.verifyAuthIntentToken };
});

/**
 * `/auth/intent` used to render a second sign-in screen of its own design.
 * Since OVE-378 it only forwards to the single one, carrying the two things the
 * signed token holds: where to return, and what the reader was trying to do.
 */
describe("/auth/intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.verifyAuthIntentToken.mockReturnValue({
      action: "comment",
      returnTo: "/journal/first-public-harvest",
    });
  });

  it("sends a guest to the one sign-in screen, carrying the resume path", async () => {
    const { default: AuthIntentRoute } = await import("./page");
    await expect(
      AuthIntentRoute({
        searchParams: Promise.resolve({ intent: "opaque-token" }),
      }),
    ).rejects.toBeInstanceOf(RedirectSignal);

    const target = String(mocks.redirect.mock.calls.at(-1)?.[0]);
    expect(target.startsWith("/auth/sign-in?")).toBe(true);
    const query = new URL(target, "https://over.garden").searchParams;
    expect(query.get("next")).toBe("/auth/intent/resume?intent=opaque-token");
    // The action selects the heading and nothing else.
    expect(query.get("intent")).toBe("comment");
  });

  it("resumes immediately when the reader already has a session", async () => {
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "u1" } });
    const { default: AuthIntentRoute } = await import("./page");
    await expect(
      AuthIntentRoute({
        searchParams: Promise.resolve({ intent: "opaque-token" }),
      }),
    ).rejects.toBeInstanceOf(RedirectSignal);

    // Straight to the control, without a second hop through the resume route.
    expect(mocks.redirect).toHaveBeenLastCalledWith(
      "/journal/first-public-harvest?authIntent=comment#comments",
    );
  });

  it("falls back to the plain sign-in screen without a token", async () => {
    const { default: AuthIntentRoute } = await import("./page");
    await expect(
      AuthIntentRoute({ searchParams: Promise.resolve({}) }),
    ).rejects.toBeInstanceOf(RedirectSignal);

    expect(mocks.redirect).toHaveBeenLastCalledWith("/auth/sign-in");
  });

  it("says an action could not be verified, instead of silently dropping it", async () => {
    mocks.verifyAuthIntentToken.mockImplementation(() => {
      throw new Error("nope");
    });
    const { default: AuthIntentRoute } = await import("./page");
    for (const searchParams of [
      { intent: "forged-token" },
      { state: "invalid" },
    ]) {
      await expect(
        AuthIntentRoute({ searchParams: Promise.resolve(searchParams) }),
      ).rejects.toBeInstanceOf(RedirectSignal);
      expect(mocks.redirect).toHaveBeenLastCalledWith(
        "/auth/sign-in?notice=intent-invalid",
      );
    }
  });

  describe("an expired action (OVE-504)", () => {
    const expiredIntent = {
      action: "bookmark",
      returnTo: "/journal/first-public-harvest",
    } as const;

    beforeEach(async () => {
      const { AuthIntentTokenError } = await vi.importActual<
        typeof import("@/server/auth-intent-token")
      >("@/server/auth-intent-token");
      mocks.verifyAuthIntentToken.mockImplementation(() => {
        throw new AuthIntentTokenError("expired", expiredIntent);
      });
    });

    it("returns a signed-in reader to the page, not into a resume loop", async () => {
      // It used to forward to the resume route, which refused the token and
      // sent the reader back here: a redirect loop for everybody who took more
      // than fifteen minutes to sign in.
      mocks.getCurrentSession.mockResolvedValue({ user: { id: "u1" } });
      const { default: AuthIntentRoute } = await import("./page");
      await expect(
        AuthIntentRoute({
          searchParams: Promise.resolve({
            intent: "old-token",
            state: "expired",
          }),
        }),
      ).rejects.toBeInstanceOf(RedirectSignal);

      expect(mocks.redirect).toHaveBeenLastCalledWith(
        "/journal/first-public-harvest",
      );
      expect(String(mocks.redirect.mock.calls.at(-1)?.[0])).not.toContain(
        "/auth/intent",
      );
    });

    it("sends a guest to sign in for the page, saying the action will not resume", async () => {
      const { default: AuthIntentRoute } = await import("./page");
      await expect(
        AuthIntentRoute({
          searchParams: Promise.resolve({ intent: "old-token" }),
        }),
      ).rejects.toBeInstanceOf(RedirectSignal);

      const target = String(mocks.redirect.mock.calls.at(-1)?.[0]);
      const query = new URL(target, "https://over.garden").searchParams;
      expect(target.startsWith("/auth/sign-in?")).toBe(true);
      expect(query.get("next")).toBe("/journal/first-public-harvest");
      expect(query.get("notice")).toBe("intent-expired");
      // No action heading: it would promise the action continues.
      expect(query.get("intent")).toBeNull();
    });
  });

  it("renders no second sign-in surface of its own", async () => {
    const page = await import("./page");
    expect("generateMetadata" in page).toBe(false);
  });
});

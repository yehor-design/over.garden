import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the sign-in actions hand back, and where they send somebody.
 *
 * The honest limit of this file: it cannot walk a *successful* sign-in, because
 * doing that needs a real credential typed into a real field, which this author
 * may not do. So the round trip is asserted at the boundary the action controls
 * — the state it returns and the path it resolves — and the last step, watching
 * a browser land back on `next` after a real password, stays an owner check.
 * `docs/PROJECT_STATE.md` records that gap rather than implying it is covered.
 */

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signInSocial: vi.fn(),
  isGoogleSignInEnabled: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signInEmail: mocks.signInEmail,
      signUpEmail: mocks.signUpEmail,
      signInSocial: mocks.signInSocial,
    },
  },
}));

vi.mock("@/lib/auth/google-oauth", () => ({
  isGoogleSignInEnabled: mocks.isGoogleSignInEnabled,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

const idle = { status: "idle" as const, message: null };

describe("sign-in and sign-up actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.isGoogleSignInEnabled.mockReturnValue(true);
    mocks.signInEmail.mockResolvedValue({});
    mocks.signUpEmail.mockResolvedValue({});
    mocks.signInSocial.mockResolvedValue({ url: "https://accounts.google/x" });
  });

  it("returns the reader to the page they came from", async () => {
    const { signInAction } = await import("./auth-actions");
    const state = await signInAction(
      idle,
      form({ email: "a@example.test", password: "hunter2!!", next: "/bookmarks" }),
    );

    expect(state.status).toBe("signed-in");
    expect(state.redirectTo).toBe("/bookmarks");
  });

  it("never follows an off-origin return path", async () => {
    const { signInAction } = await import("./auth-actions");

    for (const hostile of [
      "https://attacker.example/steal",
      "//attacker.example/steal",
      "/\\attacker.example/steal",
      "/%5cattacker.example/steal",
    ]) {
      const state = await signInAction(
        idle,
        form({ email: "a@example.test", password: "hunter2!!", next: hostile }),
      );
      expect(state.redirectTo).toBe("/garden");
    }
  });

  it("trims the address but never the password", async () => {
    const { signInAction } = await import("./auth-actions");
    await signInAction(
      idle,
      form({ email: "  a@example.test  ", password: "  spaces  ", next: "/garden" }),
    );

    expect(mocks.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { email: "a@example.test", password: "  spaces  " },
      }),
    );
  });

  it("answers a refused credential with a message and no redirect", async () => {
    const { APIError } = await import("better-auth/api");
    mocks.signInEmail.mockRejectedValue(
      new APIError("UNAUTHORIZED", { message: "Invalid email or password" }),
    );

    const { signInAction } = await import("./auth-actions");
    const state = await signInAction(
      idle,
      form({ email: "a@example.test", password: "wrong", next: "/bookmarks" }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toBeTruthy();
    expect(state.redirectTo).toBeUndefined();
  });

  it("says the same thing whether or not the address already has an account", async () => {
    const { APIError } = await import("better-auth/api");
    const { signUpAction } = await import("./auth-actions");

    const fresh = await signUpAction(
      idle,
      form({ email: "new@example.test", password: "hunter2!!", next: "/garden" }),
    );

    mocks.signUpEmail.mockRejectedValue(
      new APIError("UNPROCESSABLE_ENTITY", {
        message: "User already exists",
      }),
    );
    const existing = await signUpAction(
      idle,
      form({ email: "old@example.test", password: "hunter2!!", next: "/garden" }),
    );

    // Enumeration resistance: the wording may not tell the two apart.
    expect(existing.message).toBe(fresh.message);
    expect(existing.status).toBe("accepted");
  });

  it("hands back the provider URL rather than redirecting from the action", async () => {
    const { startSocialSignInAction } = await import("./auth-actions");
    const state = await startSocialSignInAction(
      idle,
      form({ provider: "google", next: "/feed" }),
    );

    expect(state).toMatchObject({
      status: "redirect",
      redirectTo: "https://accounts.google/x",
    });
    // Redirecting inside the action would drop the cookie the handshake sets.
    expect(mocks.signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          callbackURL: "/feed",
          disableRedirect: true,
        }),
      }),
    );
  });

  it("refuses a provider the deployment has not configured", async () => {
    mocks.isGoogleSignInEnabled.mockReturnValue(false);
    const { startSocialSignInAction } = await import("./auth-actions");

    const state = await startSocialSignInAction(
      idle,
      form({ provider: "google", next: "/garden" }),
    );
    expect(state.status).toBe("error");

    mocks.isGoogleSignInEnabled.mockReturnValue(true);
    const unknown = await startSocialSignInAction(
      idle,
      form({ provider: "facebook", next: "/garden" }),
    );
    expect(unknown.status).toBe("error");
    expect(mocks.signInSocial).not.toHaveBeenCalled();
  });

  it("keeps an unreachable store indistinguishable from a wrong password", async () => {
    mocks.signInEmail.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    );

    const { signInAction } = await import("./auth-actions");
    const state = await signInAction(
      idle,
      form({ email: "a@example.test", password: "hunter2!!", next: "/garden" }),
    );

    expect(state.status).toBe("error");
    expect(state.message).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

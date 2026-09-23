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
  resetPassword: vi.fn(),
  isGoogleSignInEnabled: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  handlePasswordResetRequest: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-forwarded-for": "203.0.113.7",
      "user-agent": "proof-agent",
      cookie: "overgarden.session_token=must-not-travel",
    }),
}));

// The real `redirect()` throws to stop the action. A mock that returned would
// let execution fall through and make an assertion lie.
class RedirectSignal extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirect(path);
    throw new RedirectSignal(path);
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signInEmail: mocks.signInEmail,
      signUpEmail: mocks.signUpEmail,
      signInSocial: mocks.signInSocial,
      resetPassword: mocks.resetPassword,
    },
  },
}));

vi.mock("@/server/auth/password-reset-request", () => ({
  handlePasswordResetRequest: mocks.handlePasswordResetRequest,
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
    mocks.resetPassword.mockResolvedValue({ status: true });
    mocks.handlePasswordResetRequest.mockResolvedValue(
      new Response(JSON.stringify({ status: true }), { status: 200 }),
    );
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
        body: expect.objectContaining({
          email: "a@example.test",
          password: "  spaces  ",
        }),
      }),
    );
  });

  it("names who signed in, so another tab of the same account is left alone", async () => {
    // ADR-0022 D6 reloads a tab only for *another* account. The signal used to
    // carry `null`, which read as "another account" to every signed-in tab —
    // including the composer whose session ended and whose words were waiting
    // for this sign-in (`OVE-504`, criterion 4).
    mocks.signInEmail.mockResolvedValue({ user: { id: "user-1" } });
    const { signInAction } = await import("./auth-actions");
    const state = await signInAction(
      idle,
      form({ email: "a@example.test", password: "hunter2!!", next: "/garden" }),
    );

    expect(state).toMatchObject({ status: "signed-in", ownerUserId: "user-1" });
  });

  it("sends a verification link back through the sign-in screen, with the destination", async () => {
    const { signInAction, signUpAction } = await import("./auth-actions");
    const next = "/auth/intent/resume?intent=token";
    await signInAction(
      idle,
      form({ email: "a@example.test", password: "hunter2!!", next }),
    );
    await signUpAction(
      idle,
      form({ email: "b@example.test", password: "hunter2!!", next }),
    );

    const callbackURL = `/auth/sign-in?next=${encodeURIComponent(next)}&verified=1`;
    for (const call of [mocks.signInEmail, mocks.signUpEmail]) {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ callbackURL }),
        }),
      );
    }
  });

  it("says an unverified address needs verifying, only after the password was right", async () => {
    const { APIError } = await import("better-auth/api");
    // Better Auth checks the password first and verification second, so this
    // error reaches only somebody who knew the password.
    mocks.signInEmail.mockRejectedValue(
      new APIError("FORBIDDEN", {
        code: "EMAIL_NOT_VERIFIED",
        message: "Email not verified",
      }),
    );
    const { signInAction } = await import("./auth-actions");
    const state = await signInAction(
      idle,
      form({ email: "a@example.test", password: "hunter2!!", next: "/garden" }),
    );

    expect(state.status).toBe("unverified");
    expect(state.message).toContain("підтвердьте адресу");
    expect(state.redirectTo).toBeUndefined();
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
          // A refusal at the provider comes back to the screen that can say
          // so, still carrying the destination (`OVE-504`).
          errorCallbackURL: "/auth/sign-in?next=%2Ffeed",
          disableRedirect: true,
        }),
      }),
    );
  });

  it("names the provider in its refusal instead of printing a placeholder", async () => {
    mocks.signInSocial.mockRejectedValue(new Error("provider unreachable"));
    const { startSocialSignInAction } = await import("./auth-actions");
    const state = await startSocialSignInAction(
      idle,
      form({ provider: "google", next: "/garden" }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toContain("Google");
    expect(state.message).not.toContain("{provider}");
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

describe("the reset link and the new password (OVE-504)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resetPassword.mockResolvedValue({ status: true });
    mocks.handlePasswordResetRequest.mockResolvedValue(
      new Response(JSON.stringify({ status: true }), { status: 200 }),
    );
  });

  it("answers every address with the same sentence, through the rate-limited route", async () => {
    const { requestPasswordResetAction } = await import("./auth-actions");
    const known = await requestPasswordResetAction(
      idle,
      form({ email: " gardener@example.test " }),
    );
    const unknown = await requestPasswordResetAction(
      idle,
      form({ email: "nobody@example.test" }),
    );

    expect(known).toEqual(unknown);
    expect(known.status).toBe("accepted");

    const request = mocks.handlePasswordResetRequest.mock
      .calls[0]![0] as Request;
    expect(new URL(request.url).pathname).toBe(
      "/api/auth/request-password-reset",
    );
    expect(await request.clone().json()).toMatchObject({
      email: "gardener@example.test",
    });
    // The limit keys on the reader's address, not the server's; the reader's
    // session cookie is not forwarded to a request that needs none.
    expect(request.headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(request.headers.get("cookie")).toBeNull();
  });

  it("says too many requests when the route is rate limited", async () => {
    mocks.handlePasswordResetRequest.mockResolvedValue(
      new Response("{}", { status: 429 }),
    );
    const { requestPasswordResetAction } = await import("./auth-actions");
    const state = await requestPasswordResetAction(
      idle,
      form({ email: "gardener@example.test" }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toContain("Забагато запитів");
  });

  it("asks for the address before asking anybody else", async () => {
    const { requestPasswordResetAction } = await import("./auth-actions");
    const state = await requestPasswordResetAction(idle, form({ email: "  " }));

    expect(state.status).toBe("error");
    expect(mocks.handlePasswordResetRequest).not.toHaveBeenCalled();
  });

  it("sends a completed reset to sign in, saying the password changed", async () => {
    const { resetPasswordAction } = await import("./auth-actions");
    await expect(
      resetPasswordAction(
        idle,
        form({
          token: "t",
          password: "a-new-password-1",
          confirmPassword: "a-new-password-1",
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectSignal);

    expect(mocks.redirect).toHaveBeenLastCalledWith(
      "/auth/sign-in?notice=password-reset",
    );
  });

  it("tells a refused link from a mistyped pair of passwords", async () => {
    const { APIError } = await import("better-auth/api");
    const { resetPasswordAction } = await import("./auth-actions");

    const mismatch = await resetPasswordAction(
      idle,
      form({
        token: "t",
        password: "one-password-1",
        confirmPassword: "other-1",
      }),
    );
    expect(mismatch.status).toBe("error");
    expect(mocks.resetPassword).not.toHaveBeenCalled();

    mocks.resetPassword.mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "Invalid token" }),
    );
    const refused = await resetPasswordAction(
      idle,
      form({
        token: "t",
        password: "a-new-password-1",
        confirmPassword: "a-new-password-1",
      }),
    );
    expect(refused.status).toBe("expired");
    expect(refused.message).not.toMatch(/token/i);

    mocks.resetPassword.mockRejectedValue(
      new APIError("BAD_REQUEST", {
        code: "PASSWORD_TOO_LONG",
        message: "Password too long",
      }),
    );
    const tooLong = await resetPasswordAction(
      idle,
      form({
        token: "t",
        password: "x".repeat(200),
        confirmPassword: "x".repeat(200),
      }),
    );
    expect(tooLong.status).toBe("error");
    expect(tooLong.message).toContain("128");
  });
});

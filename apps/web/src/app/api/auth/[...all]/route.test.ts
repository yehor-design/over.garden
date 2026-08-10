import { beforeEach, describe, expect, it, vi } from "vitest";

const equalizePasswordResetAdmission = vi.fn();
const isTrustedPasswordResetOrigin = vi.fn();
const parsePasswordResetRequest = vi.fn();
const handlerPost = vi.fn();
const authSignOut = vi.fn();
const after = vi.hoisted(() => vi.fn());
const drainAuthEmailOutbox = vi.hoisted(() => vi.fn());
const bridgeLegacyEmailVerificationRequest = vi.hoisted(() => vi.fn());

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after };
});

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    GET: vi.fn(),
    POST: handlerPost,
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: authSignOut } } }));
vi.mock("@/server/auth/auth-email-outbox", () => ({
  equalizePasswordResetAdmission,
  isTrustedPasswordResetOrigin,
  parsePasswordResetRequest,
  PASSWORD_RESET_RESPONSE: {
    status: true,
    message:
      "If this email exists in our system, check your email for the reset link",
  },
  PASSWORD_RESET_RESPONSE_HEADERS: { "Cache-Control": "private, no-store" },
}));
vi.mock("@/server/auth/auth-email-outbox-consumer", () => ({
  drainAuthEmailOutbox,
}));
vi.mock("@/server/auth/legacy-email-verification-bridge", () => ({
  bridgeLegacyEmailVerificationRequest,
}));

describe("password-reset API boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    equalizePasswordResetAdmission.mockReset();
    isTrustedPasswordResetOrigin.mockReset();
    parsePasswordResetRequest.mockReset();
    handlerPost.mockReset();
    authSignOut.mockReset();
    after.mockReset();
    drainAuthEmailOutbox.mockReset();
    bridgeLegacyEmailVerificationRequest.mockReset();
    isTrustedPasswordResetOrigin.mockReturnValue(true);
    parsePasswordResetRequest.mockReturnValue({
      email: "gardener@example.test",
    });
    handlerPost.mockResolvedValue(
      new Response(JSON.stringify({ status: true })),
    );
    bridgeLegacyEmailVerificationRequest.mockImplementation(
      async (request: Request) => request,
    );
  });

  it("returns the same generic public response after bounded durable admission", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://over.garden/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email: "gardener@example.test" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      status: true,
      message:
        "If this email exists in our system, check your email for the reset link",
    });
    expect(equalizePasswordResetAdmission).toHaveBeenCalledWith(
      "gardener@example.test",
    );
    expect(handlerPost).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();

    const callback = after.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    expect(callback).toBeTypeOf("function");
    drainAuthEmailOutbox.mockResolvedValue({});
    await callback?.();
    expect(drainAuthEmailOutbox).toHaveBeenCalledOnce();
  });

  it("schedules delivery after rather than awaiting a slow provider drain", async () => {
    const { POST, maxDuration } = await import("./route");
    let resolveDrain: (() => void) | undefined;
    drainAuthEmailOutbox.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDrain = resolve;
        }),
    );

    const startedAt = performance.now();
    const response = await POST(
      new Request("https://over.garden/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email: "gardener@example.test" }),
      }),
    );

    expect(performance.now() - startedAt).toBeLessThan(350);
    expect(response.status).toBe(200);
    expect(drainAuthEmailOutbox).not.toHaveBeenCalled();
    expect(maxDuration).toBe(60);

    const callback = after.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    const pendingDrain = callback?.();
    expect(drainAuthEmailOutbox).toHaveBeenCalledOnce();
    resolveDrain?.();
    await pendingDrain;
  });

  it("keeps origin failures and non-reset endpoints outside the outbox admission", async () => {
    const { POST } = await import("./route");
    isTrustedPasswordResetOrigin.mockReturnValue(false);
    const denied = await POST(
      new Request("https://over.garden/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email: "gardener@example.test" }),
      }),
    );
    expect(denied.status).toBe(403);
    expect(equalizePasswordResetAdmission).not.toHaveBeenCalled();

    handlerPost.mockResolvedValue(new Response("ok"));
    const delegated = await POST(
      new Request("https://over.garden/api/auth/sign-in/email", {
        method: "POST",
      }),
    );
    expect(await delegated.text()).toBe("ok");
    expect(handlerPost).toHaveBeenCalledOnce();
  });

  it("uses the canonical library expiry even when exact-session deletion fails", async () => {
    const { SIGN_OUT_ADAPTER_FAILURE_CODE } =
      await import("@/lib/auth/sign-out-hardening");
    authSignOut.mockResolvedValueOnce(
      Response.json(
        { success: true },
        {
          headers: {
            "set-cookie":
              "overgarden.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
          },
        },
      ),
    );
    handlerPost.mockResolvedValue(
      Response.json({ code: SIGN_OUT_ADAPTER_FAILURE_CODE }, { status: 500 }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://over.garden/api/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: "overgarden.session_token=signed-a",
          "x-overgarden-current-session-binding": "A".repeat(43),
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(handlerPost).toHaveBeenCalledOnce();
    expect(authSignOut).toHaveBeenCalledOnce();
  });

  it("keeps stale account-A canonical sign-out from mutating account B's cookie", async () => {
    const { SIGN_OUT_BINDING_FAILURE_CODE } =
      await import("@/lib/auth/sign-out-hardening");
    handlerPost.mockResolvedValue(
      Response.json({ code: SIGN_OUT_BINDING_FAILURE_CODE }, { status: 409 }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://over.garden/api/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: "overgarden.session_token=signed-b",
          "x-overgarden-current-session-binding": "A".repeat(43),
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(handlerPost).toHaveBeenCalledOnce();
    expect(authSignOut).not.toHaveBeenCalled();
  });
});

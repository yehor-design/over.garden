import { beforeEach, describe, expect, it, vi } from "vitest";

const equalizePasswordResetAdmission = vi.fn();
const isTrustedPasswordResetOrigin = vi.fn();
const parsePasswordResetRequest = vi.fn();
const handlerPost = vi.fn();
const authSignOut = vi.fn();
const after = vi.hoisted(() => vi.fn());
const drainAuthEmailOutbox = vi.hoisted(() => vi.fn());
const bridgeLegacyEmailVerificationRequest = vi.hoisted(() => vi.fn());
const admitDocumentMutation = vi.hoisted(() => vi.fn());
const documentMutationAdmissionResponse = vi.hoisted(() => vi.fn());
const documentMutationGenerationFromRequest = vi.hoisted(() => vi.fn());

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
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
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
    admitDocumentMutation.mockReset();
    documentMutationAdmissionResponse.mockReset();
    documentMutationGenerationFromRequest.mockReset();
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
    admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: { userId: "user-a", sessionId: "session-a" },
    });
    documentMutationAdmissionResponse.mockImplementation((admission) =>
      Response.json(
        { code: admission.transportResult },
        { status: admission.statusCode },
      ),
    );
    documentMutationGenerationFromRequest.mockImplementation(
      (request: Request) =>
        request.headers.get("x-overgarden-document-generation"),
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
    expect(admitDocumentMutation).not.toHaveBeenCalled();
  });

  it("owns only the exact Better Auth account/session mutation allowlist", async () => {
    const { isAuthenticatedAccountMutationRequest } = await import("./route");
    const guarded = [
      "change-email",
      "change-password",
      "delete-user",
      "link-social",
      "revoke-other-sessions",
      "revoke-session",
      "revoke-sessions",
      "set-password",
      "unlink-account",
      "update-session",
      "update-user",
    ];
    for (const path of guarded) {
      expect(
        isAuthenticatedAccountMutationRequest(
          new Request(`https://over.garden/api/auth/${path}`, {
            method: "POST",
          }),
        ),
        path,
      ).toBe(true);
    }

    for (const path of [
      "sign-in/email",
      "sign-up/email",
      "sign-out",
      "request-password-reset",
      "callback/google",
      "unlink-account/extra",
    ]) {
      expect(
        isAuthenticatedAccountMutationRequest(
          new Request(`https://over.garden/api/auth/${path}`, {
            method: "POST",
          }),
        ),
        path,
      ).toBe(false);
    }
  });

  it("rejects an account mutation before Better Auth observes the request", async () => {
    admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      transportResult: "DOCUMENT_OWNER_CHANGED",
      statusCode: 409,
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://over.garden/api/auth/unlink-account", {
        method: "POST",
        headers: {
          "x-overgarden-document-generation": "opaque-generation-a",
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "DOCUMENT_OWNER_CHANGED" });
    expect(documentMutationGenerationFromRequest).toHaveBeenCalledOnce();
    expect(admitDocumentMutation).toHaveBeenCalledWith({
      transport: "opaque-generation-a",
    });
    expect(handlerPost).not.toHaveBeenCalled();
  });

  it("fences native link-social before Better Auth can create provider state", async () => {
    admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      transportResult: "DOCUMENT_OWNER_CHANGED",
      statusCode: 409,
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://over.garden/api/auth/link-social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-overgarden-document-generation": "opaque-generation-a",
        },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/garden/profile",
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "DOCUMENT_OWNER_CHANGED" });
    expect(handlerPost).not.toHaveBeenCalled();
  });

  it("delegates an admitted account mutation exactly once", async () => {
    handlerPost.mockResolvedValueOnce(new Response("updated"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://over.garden/api/auth/update-user", {
        method: "POST",
        headers: {
          "x-overgarden-document-generation": "opaque-generation-a",
        },
      }),
    );

    expect(await response.text()).toBe("updated");
    expect(admitDocumentMutation).toHaveBeenCalledOnce();
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

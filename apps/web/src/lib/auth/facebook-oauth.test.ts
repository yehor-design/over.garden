import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  bridgeLegacyEmailVerificationRequest: vi.fn(),
  handlerGet: vi.fn(),
  handlerPost: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: mocks.after };
});
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    GET: mocks.handlerGet,
    POST: mocks.handlerPost,
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/server/auth/auth-email-outbox", () => ({
  equalizePasswordResetAdmission: vi.fn(),
  isTrustedPasswordResetOrigin: vi.fn(),
  parsePasswordResetRequest: vi.fn(),
  PASSWORD_RESET_RESPONSE: { status: true },
  PASSWORD_RESET_RESPONSE_HEADERS: { "Cache-Control": "private, no-store" },
}));
vi.mock("@/server/auth/auth-email-outbox-consumer", () => ({
  drainAuthEmailOutbox: vi.fn(),
}));
vi.mock("@/server/auth/legacy-email-verification-bridge", () => ({
  bridgeLegacyEmailVerificationRequest:
    mocks.bridgeLegacyEmailVerificationRequest,
}));

describe("retired Facebook Login boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.bridgeLegacyEmailVerificationRequest.mockImplementation(
      async (request: Request) => request,
    );
    mocks.handlerGet.mockImplementation(
      async () => new Response("delegated-get"),
    );
    mocks.handlerPost.mockImplementation(
      async () => new Response("delegated-post"),
    );
  });

  it("denies the retired callback before Better Auth or the legacy bridge can run", async () => {
    const { GET } = await import("@/app/api/auth/[...all]/route");
    const response = await GET(
      new Request("https://over.garden/api/auth/callback/facebook?code=stale"),
    );

    await expectRetirementDenial(response);
    expect(mocks.bridgeLegacyEmailVerificationRequest).not.toHaveBeenCalled();
    expect(mocks.handlerGet).not.toHaveBeenCalled();
  });

  it.each(["sign-in/social", "link-social"])(
    "denies retired provider initiation at %s without auth effects",
    async (path) => {
      const { POST } = await import("@/app/api/auth/[...all]/route");
      const response = await POST(
        new Request(`https://over.garden/api/auth/${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: "overgarden.session_token=stale-session",
            origin: "https://over.garden",
          },
          body: JSON.stringify({
            provider: "facebook",
            callbackURL: "/garden",
            idToken: { token: "stale-provider-token" },
          }),
        }),
      );

      await expectRetirementDenial(response);
      expect(mocks.handlerPost).not.toHaveBeenCalled();
      expect(mocks.after).not.toHaveBeenCalled();
    },
  );

  it("preserves credential and Google handler delegation", async () => {
    const { GET, POST } = await import("@/app/api/auth/[...all]/route");
    const googleRequest = new Request(
      "https://over.garden/api/auth/sign-in/social",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/garden" }),
      },
    );
    const credentialRequest = new Request(
      "https://over.garden/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "gardener@example.test" }),
      },
    );
    const googleCallback = new Request(
      "https://over.garden/api/auth/callback/google?code=opaque",
    );

    expect(await (await POST(googleRequest)).text()).toBe("delegated-post");
    expect(await (await POST(credentialRequest)).text()).toBe("delegated-post");
    expect(await (await GET(googleCallback)).text()).toBe("delegated-get");
    expect(mocks.handlerPost).toHaveBeenCalledTimes(2);
    expect(mocks.handlerGet).toHaveBeenCalledOnce();
    expect(mocks.bridgeLegacyEmailVerificationRequest).toHaveBeenCalledOnce();
  });

  it("settles a concurrent stale-request burst without reaching auth effects", async () => {
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const responses = await Promise.all(
      Array.from({ length: 32 }, (_, index) =>
        POST(
          new Request("https://over.garden/api/auth/sign-in/social", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: `overgarden.session_token=stale-${index}`,
              origin: "https://over.garden",
            },
            body: JSON.stringify({
              provider: "facebook",
              callbackURL: "/garden",
            }),
          }),
        ),
      ),
    );

    expect(responses).toHaveLength(32);
    await Promise.all(responses.map(expectRetirementDenial));
    expect(mocks.handlerPost).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

async function expectRetirementDenial(response: Response) {
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.text()).toBe("");
}

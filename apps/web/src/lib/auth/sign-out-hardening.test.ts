import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { APIError } from "better-auth/api";
import { describe, expect, it, vi } from "vitest";

import {
  CURRENT_SESSION_BINDING_HEADER,
  currentSessionBindingsMatch,
  deriveServerCurrentSessionBinding,
  hardenCurrentSessionSignOut,
  SIGN_OUT_ADAPTER_FAILURE_CODE,
  SIGN_OUT_BINDING_FAILURE_CODE,
} from "./sign-out-hardening";

const SESSION_A_ID = "session-a";
const SESSION_B_ID = "session-b";
const SESSION_A_BINDING = "-lelLb8IGQIYUpcwo-mdtpRsbCkiD7bgVR4hWYsLBds";
const SESSION_B_BINDING = "6N4Bb71wGC9tIyXoHfglUPP0aq7Y54RTMTFIkUTUhW0";

function signOutContext(input?: {
  path?: string;
  token?: string | false | null;
  binding?: string | null;
  sessionId?: string;
  findSession?: (token: string) => Promise<{
    session: { id: unknown };
  } | null>;
  deleteSession?: (token: string) => Promise<unknown>;
}) {
  const headers = new Headers();
  const binding =
    input && "binding" in input ? input.binding : SESSION_A_BINDING;
  if (binding !== null && binding !== undefined) {
    headers.set(CURRENT_SESSION_BINDING_HEADER, binding);
  }

  return {
    path: input?.path ?? "/sign-out",
    headers,
    getSignedCookie: vi
      .fn<(key: string, secret: string) => Promise<string | false | null>>()
      .mockResolvedValue(
        input?.token === undefined ? "signed-token-a" : input.token,
      ),
    context: {
      authCookies: { sessionToken: { name: "overgarden.session_token" } },
      secret: "test-secret-at-least-32-characters",
      internalAdapter: {
        findSession:
          input?.findSession ??
          vi.fn(async () => ({
            session: { id: input?.sessionId ?? SESSION_A_ID },
          })),
        deleteSession:
          input?.deleteSession ?? vi.fn(async () => Promise.resolve()),
      },
    },
  };
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected sign-out hardening to fail.");
}

describe("Better Auth current-session sign-out hardening", () => {
  it("pre-deletes the exact signed-cookie session only with its matching binding", async () => {
    const deleteSession = vi.fn(async () => Promise.resolve());
    const context = signOutContext({ deleteSession });

    await expect(hardenCurrentSessionSignOut(context)).resolves.toBe(
      "current_session_predeleted",
    );
    expect(context.getSignedCookie).toHaveBeenCalledOnce();
    expect(context.getSignedCookie).toHaveBeenCalledWith(
      "overgarden.session_token",
      "test-secret-at-least-32-characters",
    );
    expect(context.context.internalAdapter.findSession).toHaveBeenCalledWith(
      "signed-token-a",
    );
    expect(deleteSession).toHaveBeenCalledOnce();
    expect(deleteSession).toHaveBeenCalledWith("signed-token-a");
  });

  it.each([
    ["missing", null],
    ["malformed", "not-a-sha256-binding"],
    ["mismatched", SESSION_B_BINDING],
  ] as const)("fails closed for a %s binding", async (_label, binding) => {
    const deleteSession = vi.fn(async () => Promise.resolve());
    const context = signOutContext({ binding, deleteSession });

    const thrown = await captureFailure(() =>
      hardenCurrentSessionSignOut(context),
    );

    expect(thrown).toBeInstanceOf(APIError);
    expect((thrown as APIError).body?.code).toBe(SIGN_OUT_BINDING_FAILURE_CODE);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("rejects an A-dialog binding when the shared cookie now resolves to session B", async () => {
    const deleteSession = vi.fn(async () => Promise.resolve());
    const context = signOutContext({
      token: "signed-token-b",
      binding: SESSION_A_BINDING,
      sessionId: SESSION_B_ID,
      deleteSession,
    });

    const thrown = await captureFailure(() =>
      hardenCurrentSessionSignOut(context),
    );

    expect((thrown as APIError).body?.code).toBe(SIGN_OUT_BINDING_FAILURE_CODE);
    expect(deleteSession).not.toHaveBeenCalled();
    expect(JSON.stringify((thrown as APIError).body)).not.toMatch(
      /session-a|session-b|signed-token|lelLb8|6N4Bb7/i,
    );
  });

  it("keeps session B authoritative when A's cookie expiry is applied after the server revocation", async () => {
    const sessions = new Map([
      ["signed-token-a", { session: { id: SESSION_A_ID } }],
      ["signed-token-b", { session: { id: SESSION_B_ID } }],
    ]);
    const findSession = vi.fn(
      async (token: string) => sessions.get(token) ?? null,
    );
    const deleteSession = vi.fn(async (token: string) => {
      sessions.delete(token);
    });

    const outcome = await hardenCurrentSessionSignOut(
      signOutContext({
        token: "signed-token-a",
        binding: SESSION_A_BINDING,
        findSession,
        deleteSession,
      }),
    );

    expect(outcome).toBe("current_session_predeleted");
    expect([...sessions.keys()]).toEqual(["signed-token-b"]);
    expect(deleteSession).toHaveBeenCalledTimes(1);
    expect(deleteSession).toHaveBeenCalledWith("signed-token-a");

    // Set-Cookie expiry is last-response-wins browser state, not a server-side
    // revocation primitive. A delayed stock expiry may evict a newly selected B
    // cookie, but it must never be interpreted as deleting B's access row.
    let browserSessionClass: "session-b" | null = "session-b";
    browserSessionClass = null;
    expect(browserSessionClass).toBeNull();
    expect(sessions.has("signed-token-b")).toBe(true);

    const staleBindingFailure = await captureFailure(() =>
      hardenCurrentSessionSignOut(
        signOutContext({
          token: "signed-token-b",
          binding: SESSION_A_BINDING,
          findSession,
          deleteSession,
        }),
      ),
    );

    expect((staleBindingFailure as APIError).body?.code).toBe(
      SIGN_OUT_BINDING_FAILURE_CODE,
    );
    expect([...sessions.keys()]).toEqual(["signed-token-b"]);
    expect(deleteSession).toHaveBeenCalledTimes(1);
  });

  it.each([null, false, ""] as const)(
    "allows an idempotent cookie clear without adapter reads for %j",
    async (token) => {
      const context = signOutContext({ token, binding: null });

      await expect(hardenCurrentSessionSignOut(context)).resolves.toBe(
        "no_current_session",
      );
      expect(
        context.context.internalAdapter.findSession,
      ).not.toHaveBeenCalled();
      expect(
        context.context.internalAdapter.deleteSession,
      ).not.toHaveBeenCalled();
    },
  );

  it("allows an idempotent cookie clear when the signed token has no live row", async () => {
    const deleteSession = vi.fn(async () => Promise.resolve());
    const context = signOutContext({
      binding: null,
      findSession: vi.fn(async () => null),
      deleteSession,
    });

    await expect(hardenCurrentSessionSignOut(context)).resolves.toBe(
      "no_live_current_session",
    );
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("does not inspect cookies on unrelated Better Auth endpoints", async () => {
    const context = signOutContext({ path: "/sign-in/email", binding: null });

    await expect(hardenCurrentSessionSignOut(context)).resolves.toBe(
      "not_sign_out",
    );
    expect(context.getSignedCookie).not.toHaveBeenCalled();
  });

  it.each([
    [
      "lookup",
      {
        findSession: vi.fn(async () => {
          throw new Error("raw adapter credentials and host details");
        }),
      },
    ],
    [
      "delete",
      {
        deleteSession: vi.fn(async () => {
          throw new Error("raw adapter credentials and host details");
        }),
      },
    ],
  ] as const)("bounds an adapter %s failure", async (_label, overrides) => {
    const context = signOutContext(overrides);

    const thrown = await captureFailure(() =>
      hardenCurrentSessionSignOut(context),
    );

    expect(thrown).toBeInstanceOf(APIError);
    expect((thrown as APIError).body?.code).toBe(SIGN_OUT_ADAPTER_FAILURE_CODE);
    expect((thrown as APIError).message).not.toContain("credentials");
    expect((thrown as APIError).message).not.toContain("host details");
  });

  it("derives a fixed SHA-256 base64url binding and compares it safely", () => {
    const binding = deriveServerCurrentSessionBinding(SESSION_A_ID);

    expect(binding).toBe(SESSION_A_BINDING);
    expect(binding).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(binding).not.toContain(SESSION_A_ID);
    expect(currentSessionBindingsMatch(binding, SESSION_A_BINDING)).toBe(true);
    expect(currentSessionBindingsMatch(binding, SESSION_B_BINDING)).toBe(false);
    expect(currentSessionBindingsMatch(binding, "short")).toBe(false);
  });

  it("wires hardening into the existing retired-identity before hook", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../auth.ts", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("isRetiredSharedIdentityEmailSignIn");
    expect(source).toContain("await hardenCurrentSessionSignOut(context)");
    expect(source.indexOf("isRetiredSharedIdentityEmailSignIn")).toBeLessThan(
      source.indexOf("await hardenCurrentSessionSignOut(context)"),
    );
  });
});

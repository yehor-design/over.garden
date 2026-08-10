import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: authMocks,
}));

import {
  AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
  classifySessionConfirmation,
  confirmPreparedCurrentSession,
  CURRENT_SESSION_BINDING_HEADER,
  deriveCurrentSessionBinding,
  LOCAL_EXIT_RECONCILIATION_PATH,
  localizedPublicRoot,
  prepareCurrentSessionSignOut,
  reconcileLocalExitSession,
  signOutCurrentSessionOnce,
  type CurrentSessionConfirmationClient,
  type CurrentSessionSignOutClient,
  type CurrentSessionSignOutRequestOptions,
  type PreparedCurrentSessionSignOut,
} from "./sign-out-contract";
import {
  clearSessionInvalidationMarkerIfCurrent,
  commitLocalExitInvalidationMarker,
  readSessionInvalidationMarker,
} from "./session-invalidation-marker";

const SESSION_A_ID = "session-a";
const SESSION_A_BINDING = "-lelLb8IGQIYUpcwo-mdtpRsbCkiD7bgVR4hWYsLBds";

function activeSessionResult(sessionId = SESSION_A_ID) {
  return {
    data: {
      session: { id: sessionId },
      user: { id: `synthetic-user-for-${sessionId}` },
    },
    error: null,
  };
}

async function prepareSessionA() {
  const prepared = await prepareCurrentSessionSignOut(activeSessionResult());
  if (!prepared) throw new Error("Expected a prepared session fixture.");
  return prepared;
}

describe("current-session sign-out contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["uk", "/"],
    ["bg", "/bg"],
    ["ru", "/ru"],
  ] as const)("uses the localized public root for %s", (locale, path) => {
    expect(localizedPublicRoot(locale)).toBe(path);
  });

  it("runs one bodyless keepalive reconciliation and compare-clears on any response", async () => {
    installMarkerBrowser();
    const marker = commitLocalExitInvalidationMarker().marker;
    const fetcher = vi.fn<typeof fetch>(async () =>
      Promise.resolve(new Response(null, { status: 503 })),
    );

    await expect(
      reconcileLocalExitSession(SESSION_A_BINDING, marker, fetcher),
    ).resolves.toBe("response_observed");

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(LOCAL_EXIT_RECONCILIATION_PATH, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
      headers: {
        [CURRENT_SESSION_BINDING_HEADER]: SESSION_A_BINDING,
      },
    });
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("body");
    expect(readSessionInvalidationMarker().status).toBe("absent");
  });

  it("retains the exact local-exit generation after transport failure", async () => {
    installMarkerBrowser();
    const marker = commitLocalExitInvalidationMarker().marker;
    const fetcher = vi.fn(async () => {
      throw new Error("transport unavailable");
    });

    await expect(
      reconcileLocalExitSession(SESSION_A_BINDING, marker, fetcher),
    ).resolves.toBe("transport_unavailable");
    expect(readSessionInvalidationMarker().kind).toBe("local_exit");
  });

  it("never lets a delayed generation-A response clear generation B", async () => {
    installMarkerBrowser();
    const markerA = commitLocalExitInvalidationMarker().marker;
    const response = deferred<Response>();
    const reconciliation = reconcileLocalExitSession(
      SESSION_A_BINDING,
      markerA,
      () => response.promise,
    );
    await Promise.resolve();

    expect(clearSessionInvalidationMarkerIfCurrent(markerA)).toBe("cleared");
    const markerB = commitLocalExitInvalidationMarker().marker;
    response.resolve(new Response(null, { status: 204 }));

    await expect(reconciliation).resolves.toBe("response_observed");
    expect(markerB.kind).toBe("local_exit");
    expect(readSessionInvalidationMarker().kind).toBe("local_exit");
  });

  it("does not dispatch reconciliation for a missing or forged binding", async () => {
    installMarkerBrowser();
    const marker = commitLocalExitInvalidationMarker().marker;
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(
      reconcileLocalExitSession("forged", marker, fetcher),
    ).resolves.toBe("not_applicable");
    expect(fetcher).not.toHaveBeenCalled();
    expect(readSessionInvalidationMarker().kind).toBe("local_exit");
  });

  it("prepares only an opaque SHA-256 base64url binding from the fresh session", async () => {
    const prepared = await prepareSessionA();

    expect(prepared).toEqual({ version: 1, binding: SESSION_A_BINDING });
    expect(prepared.binding).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(prepared)).not.toMatch(
      /session-a|synthetic-user|user.?id|session.?id|email|token/i,
    );
    await expect(deriveCurrentSessionBinding(SESSION_A_ID)).resolves.toBe(
      SESSION_A_BINDING,
    );
  });

  it.each([
    null,
    { data: null, error: null },
    { data: { session: null, user: null }, error: null },
  ])(
    "does not prepare a binding for a confirmed signed-out shape %#",
    async (result) => {
      await expect(prepareCurrentSessionSignOut(result)).resolves.toBeNull();
    },
  );

  it.each([
    { data: undefined, error: null },
    { data: null, error: { message: "raw transport detail" } },
    { data: { session: { id: "" }, user: {} }, error: null },
    { unexpected: true },
  ])("bounds an unavailable fresh-session shape %#", async (result) => {
    let thrown: unknown;
    try {
      await prepareCurrentSessionSignOut(result);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "The current session could not be prepared for sign out.",
    );
    expect((thrown as Error).message).not.toMatch(/transport|session-a/i);
  });

  it("authoritatively confirms the same prepared session binding", async () => {
    const prepared = await prepareSessionA();
    const client: CurrentSessionConfirmationClient = {
      getSession: vi.fn(async () => activeSessionResult()),
    };

    await expect(
      confirmPreparedCurrentSession(prepared, client),
    ).resolves.toEqual({ status: "matches" });
    expect(client.getSession).toHaveBeenCalledOnce();
    expect(client.getSession).toHaveBeenCalledWith(
      AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
    );
  });

  it("reports a changed session without exposing either session id", async () => {
    const prepared = await prepareSessionA();
    const client: CurrentSessionConfirmationClient = {
      getSession: vi.fn(async () => activeSessionResult("session-b")),
    };

    const result = await confirmPreparedCurrentSession(prepared, client);

    expect(result).toEqual({ status: "changed" });
    expect(JSON.stringify(result)).not.toMatch(/session-a|session-b|binding/i);
  });

  it.each([
    null,
    { data: null, error: null },
    { data: { session: null, user: null }, error: null },
  ])(
    "reports an already signed-out session for null shape %#",
    async (result) => {
      const prepared = await prepareSessionA();
      const client: CurrentSessionConfirmationClient = {
        getSession: vi.fn(async () => result),
      };

      await expect(
        confirmPreparedCurrentSession(prepared, client),
      ).resolves.toEqual({ status: "signed_out" });
    },
  );

  it.each([
    { data: undefined, error: null },
    { data: null, error: { message: "private transport detail" } },
    { unexpected: true },
  ])("bounds an unknown authoritative confirmation %#", async (result) => {
    const prepared = await prepareSessionA();
    const client: CurrentSessionConfirmationClient = {
      getSession: vi.fn(async () => result),
    };

    const confirmation = await confirmPreparedCurrentSession(prepared, client);

    expect(confirmation).toEqual({ status: "unavailable" });
    expect(JSON.stringify(confirmation)).not.toMatch(/private|transport/i);
  });

  it("bounds a thrown authoritative confirmation", async () => {
    const prepared = await prepareSessionA();
    const client: CurrentSessionConfirmationClient = {
      getSession: vi.fn(async () => {
        throw new Error("private database detail");
      }),
    };

    await expect(
      confirmPreparedCurrentSession(prepared, client),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("calls canonical Better Auth sign-out exactly once with the bound header", async () => {
    const prepared = await prepareSessionA();
    authMocks.signOut.mockResolvedValue({
      data: { success: true },
      error: null,
    });
    authMocks.getSession
      .mockResolvedValueOnce(activeSessionResult())
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(signOutCurrentSessionOnce(prepared)).resolves.toEqual({
      status: "committed",
      reconciliation: "canonical_response",
    });
    expect(authMocks.signOut).toHaveBeenCalledOnce();
    expect(authMocks.signOut).toHaveBeenCalledWith({
      fetchOptions: {
        headers: {
          [CURRENT_SESSION_BINDING_HEADER]: SESSION_A_BINDING,
        },
      },
    });
    expect(authMocks.getSession).toHaveBeenCalledTimes(2);
    expect(authMocks.getSession).toHaveBeenNthCalledWith(
      1,
      AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
    );
    expect(authMocks.getSession).toHaveBeenNthCalledWith(
      2,
      AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
    );
  });

  it("uses the canonical POST to clear stale cookies when already signed out", async () => {
    const prepared = await prepareSessionA();
    const client: CurrentSessionSignOutClient = {
      signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
      getSession: vi.fn(async () => ({ data: null, error: null })),
    };

    await expect(signOutCurrentSessionOnce(prepared, client)).resolves.toEqual({
      status: "committed",
      reconciliation: "canonical_response",
    });
    expect(client.signOut).toHaveBeenCalledOnce();
    expect(client.getSession).toHaveBeenCalledTimes(2);
  });

  it("does not POST when the immediate authoritative preflight sees session B", async () => {
    const prepared = await prepareSessionA();
    const client: CurrentSessionSignOutClient = {
      signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
      getSession: vi.fn(async () => activeSessionResult("session-b")),
    };

    await expect(signOutCurrentSessionOnce(prepared, client)).resolves.toEqual({
      status: "failed",
      reason: "session_changed",
    });
    expect(client.signOut).not.toHaveBeenCalled();
    expect(client.getSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["thrown transport", () => Promise.reject(new Error("network detail"))],
    [
      "returned transport error",
      () =>
        Promise.resolve({ data: null, error: { message: "adapter detail" } }),
    ],
  ])(
    "treats a null confirmation as committed after %s",
    async (_label, signOut) => {
      const prepared = await prepareSessionA();
      const signOutMock = vi.fn(signOut);
      const client: CurrentSessionSignOutClient = {
        signOut: signOutMock,
        getSession: vi
          .fn()
          .mockResolvedValueOnce(activeSessionResult())
          .mockResolvedValueOnce({ data: null, error: null }),
      };

      await expect(
        signOutCurrentSessionOnce(prepared, client),
      ).resolves.toEqual({
        status: "committed",
        reconciliation: "confirmed_after_transport_error",
      });
      expect(signOutMock).toHaveBeenCalledOnce();
      expect(signOutMock).toHaveBeenCalledWith({
        fetchOptions: {
          headers: {
            [CURRENT_SESSION_BINDING_HEADER]: SESSION_A_BINDING,
          },
        },
      });
      expect(client.getSession).toHaveBeenCalledTimes(2);
      expect(client.getSession).toHaveBeenNthCalledWith(
        1,
        AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
      );
      expect(client.getSession).toHaveBeenNthCalledWith(
        2,
        AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
      );
    },
  );

  it("does not claim success while the session remains authenticated", async () => {
    const prepared = await prepareSessionA();
    const client: CurrentSessionSignOutClient = {
      signOut: vi.fn(async () => ({ data: null, error: { code: "conflict" } })),
      getSession: vi
        .fn()
        .mockResolvedValueOnce(activeSessionResult())
        .mockResolvedValueOnce(activeSessionResult("session-b")),
    };

    await expect(signOutCurrentSessionOnce(prepared, client)).resolves.toEqual({
      status: "failed",
      reason: "session_changed",
    });
    expect(client.signOut).toHaveBeenCalledOnce();
    expect(client.getSession).toHaveBeenCalledTimes(2);
  });

  it("reuses the originally prepared A binding across bounded retries", async () => {
    const prepared = await prepareSessionA();
    const signOut = vi.fn(
      async (request: CurrentSessionSignOutRequestOptions) => {
        void request;
        return {
          data: null,
          error: { code: "CURRENT_SESSION_BINDING_INVALID" },
        };
      },
    );
    const client: CurrentSessionSignOutClient = {
      signOut,
      getSession: vi
        .fn()
        .mockResolvedValueOnce(activeSessionResult())
        .mockResolvedValueOnce(activeSessionResult("session-b"))
        .mockResolvedValueOnce(activeSessionResult())
        .mockResolvedValueOnce(activeSessionResult("session-b")),
    };

    await signOutCurrentSessionOnce(prepared, client);
    await signOutCurrentSessionOnce(prepared, client);

    expect(signOut).toHaveBeenCalledTimes(2);
    for (const [request] of signOut.mock.calls) {
      expect(request.fetchOptions.headers).toEqual({
        [CURRENT_SESSION_BINDING_HEADER]: SESSION_A_BINDING,
      });
    }
  });

  it.each([
    [{ data: undefined, error: null }],
    [{ data: null, error: { message: "network detail" } }],
    [{ unexpected: true }],
  ])(
    "returns only a bounded failure for unknown confirmation %#",
    async (session) => {
      const prepared = await prepareSessionA();
      const client: CurrentSessionSignOutClient = {
        signOut: vi.fn(async () => ({ error: { message: "raw auth detail" } })),
        getSession: vi
          .fn()
          .mockResolvedValueOnce(activeSessionResult())
          .mockResolvedValueOnce(session),
      };

      const result = await signOutCurrentSessionOnce(prepared, client);

      expect(result).toEqual({
        status: "failed",
        reason: "session_confirmation_unavailable",
      });
      expect(JSON.stringify(result)).not.toMatch(/network|adapter|raw auth/i);
    },
  );

  it("bounds a thrown confirmation failure without retrying sign-out", async () => {
    const prepared = await prepareSessionA();
    const client: CurrentSessionSignOutClient = {
      signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
      getSession: vi
        .fn()
        .mockResolvedValueOnce(activeSessionResult())
        .mockRejectedValueOnce(new Error("private database failure")),
    };

    await expect(signOutCurrentSessionOnce(prepared, client)).resolves.toEqual({
      status: "failed",
      reason: "session_confirmation_unavailable",
    });
    expect(client.signOut).toHaveBeenCalledOnce();
  });

  it("does not send a request for an invalid or forged prepared binding", async () => {
    const client: CurrentSessionSignOutClient = {
      signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
      getSession: vi.fn(async () => ({ data: null, error: null })),
    };

    await expect(
      signOutCurrentSessionOnce(
        { version: 1, binding: "forged" } as PreparedCurrentSessionSignOut,
        client,
      ),
    ).resolves.toEqual({
      status: "failed",
      reason: "session_confirmation_unavailable",
    });
    expect(client.signOut).not.toHaveBeenCalled();
    expect(client.getSession).not.toHaveBeenCalled();
  });

  it("recognizes Better Auth's explicit null session shape", () => {
    expect(
      classifySessionConfirmation({
        data: { session: null, user: null },
        error: null,
      }),
    ).toBe("signed_out");
  });
});

function installMarkerBrowser() {
  vi.stubGlobal("window", { localStorage: new TestStorage() });
  vi.stubGlobal("navigator", {});
}

class TestStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

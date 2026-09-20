import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
  settleSessionStoreLiveness: vi.fn(),
}));

vi.mock("@/server/session-store-liveness", () => ({
  settleSessionStoreLiveness: mocks.settleSessionStoreLiveness,
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: (session: { session?: { id?: unknown } } | null) =>
    typeof session?.session?.id === "string" ? session.session.id : null,
}));

vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
}));

describe("site shell session state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "denied",
    });
    mocks.settleSessionStoreLiveness.mockResolvedValue({
      status: "ready",
      value: true,
    });
  });

  it("renders the owner id and operator access from one cookie-cached read", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "private-user-id", email: "private@example.com" },
      session: { id: "private-session-id" },
    });
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: true,
      ownerUserId: "private-user-id",
      hasOperatorAccess: true,
      sessionStore: "reachable",
    });
    expect(mocks.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAdminCapabilityAccessBounded).toHaveBeenCalledWith(
      { userId: "private-user-id", sessionId: "private-session-id" },
      "operator:mutate",
      undefined,
      { timeoutMs: 750 },
    );
  });

  it("returns the guest shape without a session", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: false,
      ownerUserId: null,
      hasOperatorAccess: false,
      sessionStore: "reachable",
    });
    expect(mocks.resolveAdminCapabilityAccessBounded).not.toHaveBeenCalled();
  });

  // `OVE-457` criterion 8. A failed read is not a guest: answering "guest"
  // here is what let the header offer "Sign in" over a workspace page that had
  // already said the session store could not be reached.
  it("says the store is unreachable when the session read fails", async () => {
    mocks.getCurrentSession.mockRejectedValue(new Error("auth unavailable"));
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: false,
      ownerUserId: null,
      hasOperatorAccess: false,
      sessionStore: "unreachable",
    });
  });

  it("says the store is unreachable when a null session carries a cookie", async () => {
    // Better Auth swallows a failed read and answers `null`. A reader holding
    // a session cookie who resolves to nobody is the one case worth asking
    // about, and the liveness probe is what asks.
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.settleSessionStoreLiveness.mockResolvedValue({
      status: "error",
      failureClass: "connection_unavailable",
      digest: "0000000",
      relation: null,
    });
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: false,
      ownerUserId: null,
      hasOperatorAccess: false,
      sessionStore: "unreachable",
    });
  });

  it("keeps the owner signed in when operator access cannot be resolved", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "private-user-id" },
      session: { id: "private-session-id" },
    });
    mocks.resolveAdminCapabilityAccessBounded.mockRejectedValue(
      new Error("admin access unavailable"),
    );
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: true,
      ownerUserId: "private-user-id",
      hasOperatorAccess: false,
      sessionStore: "reachable",
    });
  });
});

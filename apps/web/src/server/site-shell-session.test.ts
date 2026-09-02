import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
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
    });
    expect(mocks.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAdminCapabilityAccessBounded).toHaveBeenCalledWith(
      { userId: "private-user-id", sessionId: "private-session-id" },
      "operator:mutate",
    );
  });

  it("returns the guest shape without a session", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: false,
      ownerUserId: null,
      hasOperatorAccess: false,
    });
    expect(mocks.resolveAdminCapabilityAccessBounded).not.toHaveBeenCalled();
  });

  it("degrades to the guest shape when the session read fails", async () => {
    mocks.getCurrentSession.mockRejectedValue(new Error("auth unavailable"));
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: false,
      ownerUserId: null,
      hasOperatorAccess: false,
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
    });
  });
});

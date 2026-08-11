import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deriveCurrentSessionBinding: vi.fn(),
  getCurrentAccountMethodProjection: vi.fn(),
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  hasCurrentSessionBinding: vi.fn(),
}));

vi.mock("@/lib/auth/current-session-binding", () => ({
  deriveCurrentSessionBinding: mocks.deriveCurrentSessionBinding,
  hasCurrentSessionBinding: mocks.hasCurrentSessionBinding,
}));
vi.mock("@/server/auth/account-methods", () => ({
  getCurrentAccountMethodProjection: mocks.getCurrentAccountMethodProjection,
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

import { getBlockedSessionAccountMethods } from "./blocked-session-account-method-actions";

describe("blocked session account-method action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasCurrentSessionBinding.mockReturnValue(true);
    mocks.getCurrentSession.mockResolvedValue({ session: { id: "session-a" } });
    mocks.getSessionId.mockReturnValue("session-a");
    mocks.deriveCurrentSessionBinding.mockResolvedValue("binding-for-a");
    mocks.getCurrentAccountMethodProjection.mockResolvedValue({
      readbackState: "ready",
      hasCredential: false,
      hasGoogle: true,
      canSetPassword: true,
      canLinkGoogle: false,
    });
  });

  it("returns only the bound current session's boolean capability projection", async () => {
    await expect(
      getBlockedSessionAccountMethods("binding-for-a"),
    ).resolves.toEqual({
      status: "ready",
      methods: {
        readbackState: "ready",
        hasCredential: false,
        hasGoogle: true,
        canSetPassword: true,
        canLinkGoogle: false,
      },
    });

    expect(mocks.getCurrentAccountMethodProjection).toHaveBeenCalledOnce();
  });

  it("does not read account methods when the supplied binding is malformed", async () => {
    mocks.hasCurrentSessionBinding.mockReturnValue(false);

    await expect(getBlockedSessionAccountMethods("malformed")).resolves.toEqual(
      { status: "unavailable" },
    );

    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.getCurrentAccountMethodProjection).not.toHaveBeenCalled();
  });

  it("fails closed when the action-time server session no longer matches", async () => {
    mocks.deriveCurrentSessionBinding.mockResolvedValue("binding-for-b");

    await expect(
      getBlockedSessionAccountMethods("binding-for-a"),
    ).resolves.toEqual({ status: "unavailable" });

    expect(mocks.getCurrentAccountMethodProjection).not.toHaveBeenCalled();
  });

  it("hides a server read failure behind the generic unavailable result", async () => {
    mocks.getCurrentAccountMethodProjection.mockRejectedValue(
      new Error("account projection unavailable"),
    );

    await expect(
      getBlockedSessionAccountMethods("binding-for-a"),
    ).resolves.toEqual({ status: "unavailable" });
  });
});

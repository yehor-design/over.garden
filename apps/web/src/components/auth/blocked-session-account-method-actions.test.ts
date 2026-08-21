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
import {
  getUnresolvedAuthorizationServeCounts,
  resetUnresolvedAuthorizationServeCountsForTests,
} from "@/lib/auth/unresolved-authorization";

describe("blocked session account-method action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetUnresolvedAuthorizationServeCountsForTests();
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

  it("serves a retry projection with ownership_unresolved when the server read fails", async () => {
    mocks.getCurrentAccountMethodProjection.mockRejectedValue(
      new Error("account projection unavailable"),
    );

    await expect(
      getBlockedSessionAccountMethods("binding-for-a"),
    ).resolves.toEqual({
      status: "served_unresolved",
      methods: {
        readbackState: "retry",
        hasCredential: false,
        hasGoogle: false,
        canSetPassword: false,
        canLinkGoogle: false,
      },
      receipt: {
        version: "ove332.unresolvedClass.v1",
        status: "served_unresolved",
        owner: "account_methods",
        unresolvedClass: "ownership_unresolved",
      },
    });
    expect(getUnresolvedAuthorizationServeCounts()).toEqual([
      {
        owner: "account_methods",
        unresolvedClass: "ownership_unresolved",
        count: 1,
      },
    ]);
  });

  it("serves the already-current projection when binding derivation is unresolved", async () => {
    mocks.deriveCurrentSessionBinding.mockRejectedValueOnce(
      new Error("crypto dependency unavailable"),
    );

    await expect(
      getBlockedSessionAccountMethods("binding-for-a"),
    ).resolves.toMatchObject({
      status: "served_unresolved",
      methods: {
        readbackState: "ready",
        hasCredential: false,
        hasGoogle: true,
        canSetPassword: true,
        canLinkGoogle: false,
      },
      receipt: {
        owner: "account_methods",
        unresolvedClass: "ownership_unresolved",
      },
    });
    expect(mocks.getCurrentAccountMethodProjection).toHaveBeenCalledOnce();
  });
});

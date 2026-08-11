import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  headers: vi.fn(),
  isExplicitGoogleLinkingEnabled: vi.fn(),
  listUserAccounts: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      listUserAccounts: mocks.listUserAccounts,
    },
  },
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));
vi.mock("@/lib/auth/explicit-google-linking", () => ({
  isExplicitGoogleLinkingEnabled: mocks.isExplicitGoogleLinkingEnabled,
}));

import {
  ACCOUNT_METHOD_READBACK_DEADLINE_MS,
  getCurrentAccountMethodProjection,
} from "./account-methods";

describe("current account-method projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getCurrentSession.mockResolvedValue({
      user: { emailVerified: true },
    });
    mocks.isExplicitGoogleLinkingEnabled.mockReturnValue(true);
  });

  it("projects only current-user method booleans", async () => {
    mocks.listUserAccounts.mockResolvedValue([
      { providerId: "google", accountId: "never-rendered" },
      { providerId: "credential", accountId: "never-rendered" },
      { providerId: "unknown", accountId: "never-rendered" },
    ]);

    await expect(getCurrentAccountMethodProjection()).resolves.toEqual({
      readbackState: "ready",
      hasCredential: true,
      hasGoogle: true,
      canSetPassword: false,
      canLinkGoogle: false,
    });
    expect(mocks.listUserAccounts).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
  });

  it("ignores a retired provider row while preserving the credential bridge", async () => {
    mocks.listUserAccounts.mockResolvedValue([{ providerId: "facebook" }]);

    await expect(getCurrentAccountMethodProjection()).resolves.toMatchObject({
      hasCredential: false,
      hasGoogle: false,
      canSetPassword: true,
      canLinkGoogle: true,
      readbackState: "ready",
    });

    mocks.getCurrentSession.mockResolvedValueOnce({
      user: { emailVerified: false },
    });
    await expect(getCurrentAccountMethodProjection()).resolves.toMatchObject({
      canSetPassword: false,
      canLinkGoogle: false,
    });
  });

  it("keeps the feature gate server-authoritative", async () => {
    mocks.listUserAccounts.mockResolvedValue([{ providerId: "credential" }]);
    mocks.isExplicitGoogleLinkingEnabled.mockReturnValue(false);

    await expect(getCurrentAccountMethodProjection()).resolves.toMatchObject({
      readbackState: "ready",
      hasCredential: true,
      hasGoogle: false,
      canLinkGoogle: false,
    });
  });

  it("settles a slow read-back to retry at the exact deadline and fences its late result", async () => {
    vi.useFakeTimers();
    let resolveAccounts!: (accounts: Array<{ providerId: string }>) => void;
    mocks.listUserAccounts.mockReturnValue(
      new Promise((resolve) => {
        resolveAccounts = resolve;
      }),
    );

    try {
      const projection = getCurrentAccountMethodProjection();
      await vi.advanceTimersByTimeAsync(ACCOUNT_METHOD_READBACK_DEADLINE_MS);

      await expect(projection).resolves.toEqual({
        readbackState: "retry",
        hasCredential: false,
        hasGoogle: false,
        canSetPassword: false,
        canLinkGoogle: false,
      });

      resolveAccounts([{ providerId: "credential" }]);
      await Promise.resolve();
      await expect(projection).resolves.toMatchObject({
        readbackState: "retry",
        hasCredential: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds adapter failure to the same retry projection", async () => {
    mocks.listUserAccounts.mockRejectedValue(
      new Error("raw database host and identity"),
    );

    await expect(getCurrentAccountMethodProjection()).resolves.toEqual({
      readbackState: "retry",
      hasCredential: false,
      hasGoogle: false,
      canSetPassword: false,
      canLinkGoogle: false,
    });
  });

  it("does not return a projection without an authenticated current session", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);

    await expect(getCurrentAccountMethodProjection()).rejects.toThrow(
      "Authentication is required",
    );
    expect(mocks.listUserAccounts).not.toHaveBeenCalled();
  });
});

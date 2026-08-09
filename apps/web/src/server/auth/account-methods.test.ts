import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  headers: vi.fn(),
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

import { getCurrentAccountMethodProjection } from "./account-methods";

describe("current account-method projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getCurrentSession.mockResolvedValue({
      user: { emailVerified: true },
    });
  });

  it("projects only current-user method booleans", async () => {
    mocks.listUserAccounts.mockResolvedValue([
      { providerId: "google", accountId: "never-rendered" },
      { providerId: "credential", accountId: "never-rendered" },
      { providerId: "unknown", accountId: "never-rendered" },
    ]);

    await expect(getCurrentAccountMethodProjection()).resolves.toEqual({
      hasCredential: true,
      hasGoogle: true,
      canSetPassword: false,
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
    });

    mocks.getCurrentSession.mockResolvedValueOnce({
      user: { emailVerified: false },
    });
    await expect(getCurrentAccountMethodProjection()).resolves.toMatchObject({
      canSetPassword: false,
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

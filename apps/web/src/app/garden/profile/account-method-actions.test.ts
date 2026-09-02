import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  headers: vi.fn(),
  revalidatePath: vi.fn(),
  setPassword: vi.fn(),
  resolveMutationScope: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      setPassword: mocks.setPassword,
    },
  },
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
}));

import { setCurrentAccountPassword } from "./account-method-actions";

describe("setCurrentAccountPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: "00000000-0000-4000-8000-000000000777",
        sessionId: "session-1",
      },
    });
    mocks.getCurrentSession.mockResolvedValue({
      user: {
        id: "00000000-0000-4000-8000-000000000777",
        emailVerified: true,
      },
    });
  });

  it("uses the server-only Better Auth API for a verified current session", async () => {
    mocks.setPassword.mockResolvedValue({ status: true });

    await expect(
      setCurrentAccountPassword("correct-horse-battery-staple", "generation"),
    ).resolves.toEqual({ status: "success" });
    expect(mocks.setPassword).toHaveBeenCalledWith({
      body: { newPassword: "correct-horse-battery-staple" },
      headers: expect.any(Headers),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden/profile");
  });

  it("rejects unverified, invalid, and failed requests without exposing an auth error", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce({
      user: {
        id: "00000000-0000-4000-8000-000000000777",
        emailVerified: false,
      },
    });
    await expect(
      setCurrentAccountPassword("valid-password", "generation"),
    ).resolves.toEqual({ status: "error" });
    expect(mocks.setPassword).not.toHaveBeenCalled();

    await expect(
      setCurrentAccountPassword("short", "generation"),
    ).resolves.toEqual({
      status: "error",
    });

    mocks.setPassword.mockRejectedValueOnce(new Error("PASSWORD_ALREADY_SET"));
    await expect(
      setCurrentAccountPassword("valid-password", "generation"),
    ).resolves.toEqual({ status: "error" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the admission transport result without touching Better Auth", async () => {
    mocks.resolveMutationScope.mockResolvedValueOnce({
      status: "rejected",
      code: "session_account_changed",
    });

    await expect(
      setCurrentAccountPassword("valid-password", "stale-generation"),
    ).resolves.toEqual({
      mutationScope: "session_account_changed",
    });
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.setPassword).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  headers: vi.fn(),
  revalidatePath: vi.fn(),
  setPassword: vi.fn(),
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

import { setCurrentAccountPassword } from "./account-method-actions";

describe("setCurrentAccountPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getCurrentSession.mockResolvedValue({
      user: { emailVerified: true },
    });
  });

  it("uses the server-only Better Auth API for a verified current session", async () => {
    mocks.setPassword.mockResolvedValue({ status: true });

    await expect(
      setCurrentAccountPassword("correct-horse-battery-staple"),
    ).resolves.toEqual({ status: "success" });
    expect(mocks.setPassword).toHaveBeenCalledWith({
      body: { newPassword: "correct-horse-battery-staple" },
      headers: expect.any(Headers),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden/profile");
  });

  it("rejects unverified, invalid, and failed requests without exposing an auth error", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce({
      user: { emailVerified: false },
    });
    await expect(setCurrentAccountPassword("valid-password")).resolves.toEqual({
      status: "error",
    });
    expect(mocks.setPassword).not.toHaveBeenCalled();

    await expect(setCurrentAccountPassword("short")).resolves.toEqual({
      status: "error",
    });

    mocks.setPassword.mockRejectedValueOnce(new Error("PASSWORD_ALREADY_SET"));
    await expect(setCurrentAccountPassword("valid-password")).resolves.toEqual({
      status: "error",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock("@/lib/auth/retired-shared-identity", () => ({
  isRetiredSharedIdentityEmail: (email: string) =>
    email.trim().toLowerCase() === "retired-fixture@identity.invalid",
}));

import {
  AuthenticationRequiredError,
  getCurrentSession,
  requireCurrentUserId,
} from "@/server/auth-session";

describe("request auth session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
  });

  it("returns an unrelated authenticated session", async () => {
    const session = {
      session: { id: "session-1" },
      user: { email: "member@example.test", id: "user-1" },
    };
    mocks.getSession.mockResolvedValue(session);

    await expect(getCurrentSession()).resolves.toBe(session);
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
  });

  it("treats a policy-classified retired session as signed out", async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: "retired-session" },
      user: {
        email: "retired-fixture@identity.invalid",
        id: "retired-user",
      },
    });

    await expect(getCurrentSession()).resolves.toBeNull();
    await expect(requireCurrentUserId()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });
});

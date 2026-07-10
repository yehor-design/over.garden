import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

describe("site shell session boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes only an authentication boolean", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: {
        id: "private-user-id",
        email: "private@example.com",
        name: "Private gardener",
      },
      session: {
        id: "private-session-id",
      },
    });
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: true,
    });
  });

  it("returns the same bounded shape for a guest", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: false,
    });
  });

  it("degrades to guest navigation when session resolution is unavailable", async () => {
    mocks.getCurrentSession.mockRejectedValue(new Error("auth unavailable"));
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: false,
    });
  });

  it("cannot import owner-scoped product loaders", () => {
    const sourcePath = fileURLToPath(
      new URL("./site-shell-session.ts", import.meta.url),
    );
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toMatch(
      /journal-repository|public-profile-repository|request-scope|media|lineage|notification|analytics/i,
    );
  });
});

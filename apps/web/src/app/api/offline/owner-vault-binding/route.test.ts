import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

const OWNER_A = "00000000-0000-4000-8000-0000000000a1";

describe("GET /api/offline/owner-vault-binding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: OWNER_A },
      session: { id: "better-auth-session-token-a" },
    });
  });

  it("returns a payload-free authenticated receipt and forbids caching", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(body).toEqual({
      protocol: "ove288.owner-vault-binding.v1",
      binding: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      sessionGeneration: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(JSON.stringify(body)).not.toContain(OWNER_A);
    expect(JSON.stringify(body)).not.toContain("better-auth-session-token-a");
  });

  it.each([
    null,
    { user: {}, session: { id: "session" } },
    { user: { id: OWNER_A }, session: {} },
  ])(
    "fails closed for an incomplete authenticated session",
    async (session) => {
      mocks.getCurrentSession.mockResolvedValueOnce(session);
      const { GET } = await import("./route");
      const response = await GET();

      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
      await expect(response.json()).resolves.toEqual({
        error: "authentication_required",
      });
    },
  );
});

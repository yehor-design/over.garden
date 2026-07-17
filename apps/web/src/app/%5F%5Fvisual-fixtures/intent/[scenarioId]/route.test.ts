import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthIntentToken: vi.fn(),
  signLineageInviteToken: vi.fn(),
  tryResolveVisualFixtureEnvironment: vi.fn(),
}));

vi.mock("@/server/auth-intent-token", () => ({
  createAuthIntentToken: mocks.createAuthIntentToken,
}));
vi.mock("@/server/lineage-invite-token", () => ({
  signLineageInviteToken: mocks.signLineageInviteToken,
}));
vi.mock("@/lib/visual-fixtures/environment", () => ({
  tryResolveVisualFixtureEnvironment: mocks.tryResolveVisualFixtureEnvironment,
}));

describe("visual fixture auth intent route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tryResolveVisualFixtureEnvironment.mockReturnValue({
      target: "local",
    });
    mocks.createAuthIntentToken.mockReturnValue("v1.iv.opaque.valid-tag");
    mocks.signLineageInviteToken.mockReturnValue(
      "v1.opaque-lineage.valid-signature",
    );
  });

  it("issues a real opaque comment intent from only the scenario id", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost:3000/__visual-fixtures/intent/ove174-i001"),
      { params: Promise.resolve({ scenarioId: "ove174-i001" }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/auth/intent?intent=v1.iv.opaque.valid-tag",
    );
    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith(
      expect.objectContaining({ action: "comment" }),
      expect.anything(),
    );
    expect(JSON.stringify(mocks.createAuthIntentToken.mock.calls)).not.toMatch(
      /journal body|email|latitude|longitude|media key/i,
    );
  });

  it("creates a genuinely expired token for the expiry scenario", async () => {
    const { GET } = await import("./route");
    const before = Date.now();
    await GET(
      new Request("http://localhost:3000/__visual-fixtures/intent/ove174-i011"),
      { params: Promise.resolve({ scenarioId: "ove174-i011" }) },
    );

    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith(
      expect.objectContaining({ action: "comment" }),
      expect.objectContaining({ now: expect.any(Number) }),
    );
    const options = mocks.createAuthIntentToken.mock.calls[0]?.[1] as {
      now: number;
    };
    expect(options.now).toBeLessThan(before - 15 * 60_000);
  });

  it("starts claim through the real fragment handoff without an auth payload", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost:3000/__visual-fixtures/intent/ove174-i004"),
      { params: Promise.resolve({ scenarioId: "ove174-i004" }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/garden/lineage/invitations/claim#token=v1.opaque-lineage.valid-signature",
    );
    expect(mocks.signLineageInviteToken).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingIdentityId: "18700007-0000-4000-8000-000000000001",
        edgeId: "18700008-0000-4000-8000-000000000001",
        ttlSeconds: 900,
      }),
    );
    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
  });

  it("modifies a valid token only inside the invalid scenario", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost:3000/__visual-fixtures/intent/ove174-i012"),
      { params: Promise.resolve({ scenarioId: "ove174-i012" }) },
    );

    expect(response.headers.get("location")).toMatch(
      /^\/auth\/intent\?intent=/,
    );
    expect(response.headers.get("location")).not.toContain(
      "intent=v1.iv.opaque.valid-tag",
    );
  });

  it.each([null, "missing-scenario"])(
    "returns a hard 404 when the gate or scenario is unavailable",
    async (scenarioId) => {
      if (scenarioId === null) {
        mocks.tryResolveVisualFixtureEnvironment.mockReturnValue(null);
      }
      const { GET } = await import("./route");
      const response = await GET(
        new Request(
          `http://localhost:3000/__visual-fixtures/intent/${scenarioId ?? "ove174-i001"}`,
        ),
        {
          params: Promise.resolve({
            scenarioId: scenarioId ?? "ove174-i001",
          }),
        },
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
    },
  );
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePilotHealthOperatorAccess: vi.fn(),
  getPilotSmokeReadinessSafely: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000000999" },
  })),
  getSessionId: vi.fn(() => "operator-session"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/pilot-health-access", () => ({
  resolvePilotHealthOperatorAccess: mocks.resolvePilotHealthOperatorAccess,
}));

vi.mock("@/server/pilot-smoke-readiness", () => ({
  getPilotSmokeReadinessSafely: mocks.getPilotSmokeReadinessSafely,
}));

describe("/garden/pilot-smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
      status: "allowed",
      mode: "database_role",
      role: "viewer",
      capabilities: ["admin:read", "operator:read"],
    });
    mocks.getPilotSmokeReadinessSafely.mockResolvedValue({
      generatedAt: new Date("2026-06-28T00:00:00.000Z"),
      overall: "ready",
      sections: [],
      redactionRules: [],
      smokeSteps: [],
      references: [],
    });
  });

  it("does not read smoke readiness for a signed-in non-operator", async () => {
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { default: PilotSmokePage } = await import("./page");
    const html = renderToStaticMarkup(await PilotSmokePage());

    expect(html).toContain("Access denied.");
    expect(mocks.getPilotSmokeReadinessSafely).not.toHaveBeenCalled();
  });

  it("renders the smoke readout for a read-only admin role", async () => {
    const { default: PilotSmokePage } = await import("./page");
    const html = renderToStaticMarkup(await PilotSmokePage());

    expect(html).toContain("Readiness status: ready");
    expect(html).toContain("Gate: database_role");
    expect(html).toContain("Role: viewer");
    expect(mocks.getPilotSmokeReadinessSafely).toHaveBeenCalledOnce();
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePilotHealthOperatorAccess: vi.fn(),
  getPilotHealthReadoutSafely: vi.fn(),
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

vi.mock("@/server/pilot-health-repository", () => ({
  getPilotHealthReadoutSafely: mocks.getPilotHealthReadoutSafely,
}));

describe("/garden/pilot-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
      status: "allowed",
      mode: "allowlist",
    });
    mocks.getPilotHealthReadoutSafely.mockResolvedValue(null);
  });

  it("does not read aggregate health data for a signed-in non-operator", async () => {
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { default: PilotHealthPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotHealthPage());

    expect(html).toContain("Access denied.");
    expect(mocks.getPilotHealthReadoutSafely).not.toHaveBeenCalled();
  });

  it("renders the operator readout boundary for an allowlisted operator", async () => {
    const { default: PilotHealthPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotHealthPage());

    expect(html).toContain("Gate: allowlist");
    expect(mocks.getPilotHealthReadoutSafely).toHaveBeenCalledOnce();
  });
});

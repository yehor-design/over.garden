import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePilotHealthOperatorAccess: vi.fn(),
  getPilotCohortDecisionReadoutSafely: vi.fn(),
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

vi.mock("@/server/pilot-cohort-decision-repository", () => ({
  getPilotCohortDecisionReadoutSafely:
    mocks.getPilotCohortDecisionReadoutSafely,
}));

describe("/garden/pilot-learning/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
      status: "allowed",
      mode: "allowlist",
    });
    mocks.getPilotCohortDecisionReadoutSafely.mockResolvedValue(null);
  });

  it("does not read aggregate decision data for a signed-in non-operator", async () => {
    mocks.resolvePilotHealthOperatorAccess.mockReturnValue({
      status: "denied",
    });

    const { default: PilotCohortDecisionPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotCohortDecisionPage());

    expect(html).toContain("Access denied.");
    expect(mocks.getPilotCohortDecisionReadoutSafely).not.toHaveBeenCalled();
  });

  it("renders the operator decision boundary for an allowlisted operator", async () => {
    const { default: PilotCohortDecisionPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotCohortDecisionPage());

    expect(html).toContain("Gate: allowlist");
    expect(html).toContain("Pilot cohort decision");
    expect(mocks.getPilotCohortDecisionReadoutSafely).toHaveBeenCalledOnce();
  });
});

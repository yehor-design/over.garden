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
      mode: "database_role",
      role: "viewer",
      capabilities: ["admin:read", "operator:read"],
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

  it("renders the operator readout boundary for a read-only admin role", async () => {
    const { default: PilotHealthPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotHealthPage());

    expect(html).toContain("Gate: database_role");
    expect(html).toContain("Role: viewer");
    expect(mocks.getPilotHealthReadoutSafely).toHaveBeenCalledOnce();
  });

  it("shows founder rehearsal grants separately from closed-pilot writers", async () => {
    mocks.getPilotHealthReadoutSafely.mockResolvedValue({
      generatedAt: new Date("2026-06-29T12:00:00.000Z"),
      windows: [],
      publicVarietyIndexability: {
        promotedIndexableCount: 0,
        thinNoindexCount: 0,
        demotedByArchiveOrGoneCount: 0,
        currentPublicVarietyCount: 0,
        threshold: {
          minPublicEntryCount: 3,
          minAggregateBodyLength: 600,
        },
      },
      writeAccess: {
        writeEligibleGardeners: 2,
        founderRehearsalGardeners: 1,
      },
      notes: [],
      references: [],
    });

    const { default: PilotHealthPage } = await import("./page");
    const html = renderToStaticMarkup(await PilotHealthPage());

    expect(html).toContain("Closed-pilot writers");
    expect(html).toContain("Founder rehearsal");
    expect(html).toContain("excluded from OVE-53");
  });
});

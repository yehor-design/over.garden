import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  requireCurrentRequestScope: vi.fn(),
  resolveDurableActorClass: vi.fn(),
  getPilotInviteGrant: vi.fn(),
  grantPilotWriteAccess: vi.fn(),
  hasPilotWriteAccess: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));
vi.mock("@/server/learning-actor-attribution", () => ({
  resolveDurableActorClass: mocks.resolveDurableActorClass,
}));
vi.mock("@/server/pilot-invite-repository", () => ({
  getPilotInviteGrant: mocks.getPilotInviteGrant,
  grantPilotWriteAccess: mocks.grantPilotWriteAccess,
  hasPilotWriteAccess: mocks.hasPilotWriteAccess,
}));

describe("write request scope attribution boundary (OVE-219)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000219",
      sessionId: "session-219",
    });
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => undefined) });
  });

  it("authenticates a self-serve write without waiting for durable attribution", async () => {
    const { requireWriteEligibleRequestScope } =
      await import("./pilot-write-access");

    await expect(requireWriteEligibleRequestScope()).resolves.toEqual({
      userId: "00000000-0000-4000-8000-000000000219",
      sessionId: "session-219",
      learningAttributionHint: null,
    });
    expect(mocks.resolveDurableActorClass).not.toHaveBeenCalled();
    expect(mocks.getPilotInviteGrant).not.toHaveBeenCalled();
    expect(mocks.grantPilotWriteAccess).not.toHaveBeenCalled();
    expect(mocks.hasPilotWriteAccess).not.toHaveBeenCalled();
  });
});

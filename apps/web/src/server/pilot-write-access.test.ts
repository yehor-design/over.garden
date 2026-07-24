import { describe, expect, it, vi } from "vitest";

import { actorClassFromPilotCohort } from "@/lib/garden/actor-class";

import {
  claimOrCheckPilotWriteAccess,
  claimPilotCohortAttribution,
  ensurePilotWriteEligible,
  resolvePilotWriteAccess,
  type PilotWriteAccessDeps,
} from "./pilot-write-access";
import type { RequestScope } from "./request-scope";

const scope: RequestScope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};

function withDeterministicActorClass(
  deps: Omit<PilotWriteAccessDeps, "resolveActorClass">,
): PilotWriteAccessDeps {
  return {
    ...deps,
    resolveActorClass: async ({ grant }) =>
      actorClassFromPilotCohort(grant?.cohort ?? null),
  };
}

describe("self-serve write access (OVE-193/OVE-200)", () => {
  it("allows a gardener with no invite grant or cookie to write", async () => {
    const grantAccess = vi.fn(async () => {});
    const deps = withDeterministicActorClass({
      hasAccess: vi.fn(async () => false),
      readCookieInvite: vi.fn(async () => null),
      grantAccess,
      getGrant: vi.fn(async () => null),
    });

    expect(await claimOrCheckPilotWriteAccess(scope, deps)).toBe(true);
    expect(grantAccess).not.toHaveBeenCalled();
    await expect(
      ensurePilotWriteEligible(scope, deps),
    ).resolves.toBeUndefined();
    expect(await resolvePilotWriteAccess(scope, deps)).toEqual({
      canWrite: true,
      invited: false,
      actorClass: "real_self_serve",
    });
  });

  it("claims a durable cohort grant from a valid invite cookie without gating writes", async () => {
    const grantAccess = vi.fn(async () => {});
    const deps = withDeterministicActorClass({
      hasAccess: vi.fn(async () => false),
      readCookieInvite: vi.fn(async () => ({
        cohort: "closed_pilot" as const,
        segment: "casual_practical_beginner" as const,
        expiresAt: 1,
      })),
      grantAccess,
      getGrant: vi.fn(async () => null),
    });

    expect(await claimPilotCohortAttribution(scope, deps)).toEqual({
      attributed: true,
      actorClass: "real_closed_pilot",
    });
    expect(grantAccess).toHaveBeenCalledWith(
      scope.userId,
      "closed_pilot",
      "casual_practical_beginner",
    );
  });

  it("reports real_closed_pilot actor class for existing grants without re-claiming", async () => {
    const grantAccess = vi.fn(async () => {});
    const deps = withDeterministicActorClass({
      hasAccess: vi.fn(async () => true),
      readCookieInvite: vi.fn(async () => null),
      grantAccess,
      getGrant: vi.fn(async () => ({
        cohort: "closed_pilot" as const,
        segment: "casual_practical_beginner" as const,
      })),
    });

    expect(await resolvePilotWriteAccess(scope, deps)).toEqual({
      canWrite: true,
      invited: true,
      actorClass: "real_closed_pilot",
    });
    expect(grantAccess).not.toHaveBeenCalled();
  });

  it("keeps founder rehearsal attribution distinct from real_closed_pilot", async () => {
    const grantAccess = vi.fn(async () => {});
    const deps = withDeterministicActorClass({
      hasAccess: vi.fn(async () => false),
      readCookieInvite: vi.fn(async () => ({
        cohort: "founder_rehearsal" as const,
        segment: "unknown_segment" as const,
        expiresAt: 1,
      })),
      grantAccess,
      getGrant: vi.fn(async () => null),
    });

    expect(await claimPilotCohortAttribution(scope, deps)).toEqual({
      attributed: true,
      actorClass: "founder_rehearsal",
    });
    expect(grantAccess).toHaveBeenCalledWith(
      scope.userId,
      "founder_rehearsal",
      "unknown_segment",
    );
  });

  it("resolvePilotWriteAccess fails closed for attribution when a dependency throws", async () => {
    const deps = withDeterministicActorClass({
      hasAccess: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
      readCookieInvite: vi.fn(async () => null),
      grantAccess: vi.fn(async () => {}),
      getGrant: vi.fn(async () => null),
    });

    expect(await resolvePilotWriteAccess(scope, deps)).toEqual({
      canWrite: true,
      invited: false,
      actorClass: "real_self_serve",
    });
  });
});

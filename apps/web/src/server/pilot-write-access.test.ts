import { describe, expect, it, vi } from "vitest";

import {
  PilotWriteAccessError,
  claimOrCheckPilotWriteAccess,
  ensurePilotWriteEligible,
  resolvePilotWriteAccess,
  type PilotWriteAccessDeps,
} from "./pilot-write-access";
import type { RequestScope } from "./request-scope";

const scope: RequestScope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};

describe("closed-pilot write gate", () => {
  it("allows an already-granted gardener to write without re-claiming", async () => {
    const grantAccess = vi.fn(async () => {});
    const readCookieInvite = vi.fn(async () => null);
    const deps: PilotWriteAccessDeps = {
      hasAccess: vi.fn(async () => true),
      readCookieInvite,
      grantAccess,
    };

    expect(await claimOrCheckPilotWriteAccess(scope, deps)).toBe(true);
    expect(readCookieInvite).not.toHaveBeenCalled();
    expect(grantAccess).not.toHaveBeenCalled();
  });

  it("claims a durable grant with bounded segment from a valid eligibility cookie on first authenticated visit", async () => {
    const grantAccess = vi.fn(async () => {});
    const deps: PilotWriteAccessDeps = {
      hasAccess: vi.fn(async () => false),
      readCookieInvite: vi.fn(async () => ({
        cohort: "closed_pilot" as const,
        segment: "casual_practical_beginner" as const,
        expiresAt: 1,
      })),
      grantAccess,
    };

    expect(await claimOrCheckPilotWriteAccess(scope, deps)).toBe(true);
    expect(grantAccess).toHaveBeenCalledWith(
      scope.userId,
      "closed_pilot",
      "casual_practical_beginner",
    );
  });

  it("denies a non-invited gardener with no grant and no cookie", async () => {
    const grantAccess = vi.fn(async () => {});
    const deps: PilotWriteAccessDeps = {
      hasAccess: vi.fn(async () => false),
      readCookieInvite: vi.fn(async () => null),
      grantAccess,
    };

    expect(await claimOrCheckPilotWriteAccess(scope, deps)).toBe(false);
    expect(grantAccess).not.toHaveBeenCalled();
  });

  it("ensurePilotWriteEligible throws PilotWriteAccessError for non-invited users", async () => {
    const deps: PilotWriteAccessDeps = {
      hasAccess: vi.fn(async () => false),
      readCookieInvite: vi.fn(async () => null),
      grantAccess: vi.fn(async () => {}),
    };

    await expect(ensurePilotWriteEligible(scope, deps)).rejects.toBeInstanceOf(
      PilotWriteAccessError,
    );
  });

  it("ensurePilotWriteEligible resolves for invited users", async () => {
    const deps: PilotWriteAccessDeps = {
      hasAccess: vi.fn(async () => true),
      readCookieInvite: vi.fn(async () => null),
      grantAccess: vi.fn(async () => {}),
    };

    await expect(
      ensurePilotWriteEligible(scope, deps),
    ).resolves.toBeUndefined();
  });

  it("resolvePilotWriteAccess fails closed (invited=false) when a dependency throws", async () => {
    const deps: PilotWriteAccessDeps = {
      hasAccess: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
      readCookieInvite: vi.fn(async () => null),
      grantAccess: vi.fn(async () => {}),
    };

    expect(await resolvePilotWriteAccess(scope, deps)).toEqual({
      invited: false,
    });
  });

  it("resolvePilotWriteAccess reports invited=true for granted gardeners", async () => {
    const deps: PilotWriteAccessDeps = {
      hasAccess: vi.fn(async () => true),
    };

    expect(await resolvePilotWriteAccess(scope, deps)).toEqual({
      invited: true,
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  assertMeasuredRto,
  deriveRpoMs,
  PREDECLARED_RPO_MAX_MS,
  PREDECLARED_RTO_MAX_MS,
} from "./contract";
import {
  evaluateTerminalReadiness,
  type TerminalReadinessSignals,
} from "./checks";

const PASSING_SIGNALS: TerminalReadinessSignals = {
  schemaOk: true,
  integrityOk: true,
  identityReady: true,
  queueReady: true,
  projectionReady: true,
  rpoPass: true,
  rtoPass: true,
  productReadbackPassed: true,
  mediaOriginalAbsent: true,
  exactParityZeroGap: true,
  sameTargetAndSha: true,
};

describe("OVE-230 terminal readiness", () => {
  it("requires every terminal signal", () => {
    expect(evaluateTerminalReadiness(PASSING_SIGNALS)).toBe(true);
    for (const key of Object.keys(PASSING_SIGNALS) as Array<
      keyof TerminalReadinessSignals
    >) {
      expect(
        evaluateTerminalReadiness({ ...PASSING_SIGNALS, [key]: false }),
        key,
      ).toBe(false);
    }
  });

  it("derives RPO from ordered provider timestamps", () => {
    expect(
      deriveRpoMs({
        restorePointUtc: "2026-07-28T09:55:00.000Z",
        forkAcceptedUtc: "2026-07-28T10:00:00.000Z",
      }),
    ).toBe(300_000);
    expect(() =>
      deriveRpoMs({
        restorePointUtc: "2026-07-28T10:01:00.000Z",
        forkAcceptedUtc: "2026-07-28T10:00:00.000Z",
      }),
    ).toThrow("precedes restore point");
    expect(PREDECLARED_RPO_MAX_MS).toBe(3_600_000);
  });

  it("binds monotonic RTO to ordered UTC corroboration", () => {
    expect(
      assertMeasuredRto({
        monotonicMs: 662_000,
        startedUtc: "2026-07-28T10:00:00.000Z",
        completedUtc: "2026-07-28T10:11:02.000Z",
      }),
    ).toBe(662_000);
    expect(() =>
      assertMeasuredRto({
        monotonicMs: 1_000,
        startedUtc: "2026-07-28T10:00:00.000Z",
        completedUtc: "2026-07-28T10:02:00.000Z",
      }),
    ).toThrow("disagree");
    expect(PREDECLARED_RTO_MAX_MS).toBe(14_400_000);
  });
});

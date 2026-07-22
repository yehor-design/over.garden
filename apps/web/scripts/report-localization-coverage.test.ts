import { describe, expect, it } from "vitest";

import { buildLocalizationCoverage } from "../src/lib/localization/localization-coverage";
import {
  deriveLocalizationCompletionState,
  resolveCleanEvidenceCommitSha,
} from "./report-localization-coverage";

describe("OVE-205 localization completion evidence", () => {
  it("binds evidence only to a clean exact HEAD", () => {
    const sha = "a".repeat(40);
    const cleanGit = (args: readonly string[]) =>
      args[0] === "status" ? "" : `${sha}\n`;

    expect(
      resolveCleanEvidenceCommitSha({ ciSha: sha, readGit: cleanGit }),
    ).toBe(sha);
    expect(() =>
      resolveCleanEvidenceCommitSha({
        ciSha: sha,
        readGit: (args) =>
          args[0] === "status" ? " M src/private-state.ts\n" : `${sha}\n`,
      }),
    ).toThrow("requires a clean checkout");
    expect(() =>
      resolveCleanEvidenceCommitSha({
        ciSha: "b".repeat(40),
        readGit: cleanGit,
      }),
    ).toThrow("CI SHA does not match");
  });

  it("keeps regression coverage green without misreporting completion", () => {
    const report = buildLocalizationCoverage();
    const completion = deriveLocalizationCompletionState(report);

    expect(completion.regressionGreen).toBe(true);
    expect(completion.zeroGap).toBe(false);
    expect(completion.completionBlocked).toBe(true);
    expect(completion.completionBlockReasons).toEqual([
      expect.objectContaining({
        id: "mandatory-localization-browser-run",
        proofLevel: "browser-run-required",
      }),
    ]);
    expect(report.downstreamOwnedUiGates).toHaveLength(3);
    expect(
      report.downstreamOwnedUiGates.every(
        ({ blocksCurrentIssue }) => blocksCurrentIssue === false,
      ),
    ).toBe(true);
  });
});

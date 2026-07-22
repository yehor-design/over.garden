import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertLocalizationCoverage,
  buildLocalizationCoverage,
} from "../src/lib/localization/localization-coverage";
import { LOCALIZATION_OWNER_BROWSER_PROBES } from "../src/lib/localization/localization-browser-matrix";

export interface LocalizationCompletionBlockReason {
  id: string;
  proofLevel:
    | "static-regression"
    | "browser-run-required"
    | "unit-only"
    | "adapter-only";
  detail: string;
}

export function deriveLocalizationCompletionState(
  report: ReturnType<typeof buildLocalizationCoverage>,
) {
  const regressionGreen = Object.values(report.missing).every(
    (values) => values.length === 0,
  );
  const completionBlockReasons: LocalizationCompletionBlockReason[] = [];

  if (!regressionGreen) {
    completionBlockReasons.push({
      id: "static-localization-regression",
      proofLevel: "static-regression",
      detail: "The fail-closed localization coverage registry has open gaps.",
    });
  }
  if (
    LOCALIZATION_OWNER_BROWSER_PROBES.some(
      ({ evidenceStatus }) => evidenceStatus === "browser-run-required",
    )
  ) {
    completionBlockReasons.push({
      id: "mandatory-localization-browser-run",
      proofLevel: "browser-run-required",
      detail: `${LOCALIZATION_OWNER_BROWSER_PROBES.length} owner probes plus the interaction suite require fresh browser evidence from the candidate checkout.`,
    });
  }
  const zeroGap = regressionGreen && completionBlockReasons.length === 0;
  return {
    regressionGreen,
    zeroGap,
    completionBlocked: !zeroGap,
    completionBlockReasons,
  };
}

type ReadGit = (args: readonly string[]) => string;

export function resolveCleanEvidenceCommitSha(
  options: {
    ciSha?: string;
    readGit?: ReadGit;
  } = {},
) {
  const readGit =
    options.readGit ??
    ((args: readonly string[]) =>
      execFileSync("git", [...args], {
        cwd: process.cwd(),
        encoding: "utf8",
      }));
  const worktreeStatus = readGit([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]).trim();
  if (worktreeStatus) {
    throw new Error(
      "Localization evidence requires a clean checkout so commitSha identifies the exact tested tree.",
    );
  }

  const headSha = readGit(["rev-parse", "HEAD"]).trim();
  if (!/^[a-f0-9]{40}$/.test(headSha)) {
    throw new Error(
      "Localization evidence could not resolve an exact commit SHA.",
    );
  }
  const ciSha = options.ciSha?.trim() ?? process.env.GITHUB_SHA?.trim();
  if (ciSha && ciSha !== headSha) {
    throw new Error(
      "Localization evidence CI SHA does not match the checked-out HEAD.",
    );
  }

  return headSha;
}

function main() {
  const commitSha = resolveCleanEvidenceCommitSha();
  const report = buildLocalizationCoverage();
  assertLocalizationCoverage(report);
  const completion = deriveLocalizationCompletionState(report);

  const evidence = {
    commitSha,
    ...report,
    ...completion,
  };

  if (process.argv.includes("--summary")) {
    process.stdout.write(
      `${JSON.stringify({
        commitSha: evidence.commitSha,
        schemaVersion: evidence.schemaVersion,
        issue: evidence.issue,
        baseline: evidence.baseline,
        marketContract: evidence.marketContract,
        summary: evidence.summary,
        rawLifecycleContract: evidence.rawLifecycleContract,
        routePolicyCount: evidence.routePolicies.length,
        downstreamOwnedUiGates: evidence.downstreamOwnedUiGates,
        exclusions: evidence.exclusions.length,
        regressionGreen: evidence.regressionGreen,
        zeroGap: evidence.zeroGap,
        completionBlocked: evidence.completionBlocked,
        completionBlockReasons: evidence.completionBlockReasons,
      })}\n`,
    );
    return;
  }

  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}

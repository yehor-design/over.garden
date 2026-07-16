import { execFileSync } from "node:child_process";

import {
  assertLocalizationCoverage,
  buildLocalizationCoverage,
} from "../src/lib/localization/localization-coverage";

function resolveCommitSha() {
  const ciSha = process.env.GITHUB_SHA?.trim();
  if (ciSha) return ciSha;

  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function main() {
  const report = buildLocalizationCoverage();
  assertLocalizationCoverage(report);

  const evidence = {
    commitSha: resolveCommitSha(),
    ...report,
    zeroGap: true,
  };

  if (process.argv.includes("--summary")) {
    process.stdout.write(
      `${JSON.stringify({
        commitSha: evidence.commitSha,
        issue: evidence.issue,
        baseline: evidence.baseline,
        summary: evidence.summary,
        exclusions: evidence.exclusions.length,
        zeroGap: evidence.zeroGap,
      })}\n`,
    );
    return;
  }

  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main();

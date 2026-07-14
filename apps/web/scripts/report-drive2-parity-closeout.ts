import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertDrive2ParityCloseoutCoverage,
  buildDrive2ParityCloseoutCoverage,
} from "../src/lib/closeout/drive2-parity-closeout";

interface Options {
  environmentClass: "local-fixture" | "designated-preview";
  output?: string;
  summary: boolean;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const coverage = buildDrive2ParityCloseoutCoverage();
  assertDrive2ParityCloseoutCoverage(coverage);
  const evidence = {
    schemaVersion: 1,
    issue: "OVE-186",
    environmentClass: options.environmentClass,
    commitSha: resolveCommitSha(),
    coverage,
  } as const;
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
  }

  if (options.summary) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        issue: evidence.issue,
        environmentClass: evidence.environmentClass,
        commitSha: evidence.commitSha,
        fixtureVersion: coverage.fixture.version,
        fixtureManifestHash: coverage.fixture.manifestHash,
        scenarioCount: coverage.summary.scenarioCount,
        routeViewportCheckCount: coverage.summary.routeViewportCheckCount,
        missingCount: Object.values(coverage.missing).flat().length,
        outputWritten: Boolean(options.output),
      })}\n`,
    );
    return;
  }

  process.stdout.write(serialized);
}

function parseOptions(argv: string[]): Options {
  argv = argv.filter((value) => value !== "--");
  let environmentClass: Options["environmentClass"] = "local-fixture";
  let output: string | undefined;
  let summary = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--environment-class") {
      const candidate = argv[index + 1];
      if (candidate !== "local-fixture" && candidate !== "designated-preview") {
        throw new Error("Invalid OVE-186 evidence environment class.");
      }
      environmentClass = candidate;
      index += 1;
    } else if (value === "--output") {
      output = argv[index + 1];
      if (!output) throw new Error("--output requires a path.");
      index += 1;
    } else if (value === "--summary") {
      summary = true;
    } else {
      throw new Error(`Unknown OVE-186 report option: ${value}`);
    }
  }

  return { environmentClass, output, summary };
}

function resolveCommitSha() {
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error("OVE-186 requires an exact git commit SHA.");
  }
  return commitSha;
}

void main();

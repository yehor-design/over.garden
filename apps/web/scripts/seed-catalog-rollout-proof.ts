import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";

import { config as loadEnv } from "dotenv";

import {
  buildCatalogSeedRolloutEvidence,
  buildSafeSeedCommandSummary,
  CATALOG_SEED_ROLLOUT_COMMANDS,
  extractJsonObjectFromCommandOutput,
  parseCatalogSeedRolloutArgs,
  type CatalogSeedRolloutAppSmoke,
  validateCatalogSeedRolloutOptions,
} from "../src/lib/catalog/seed-rollout-proof";

loadEnv({ path: ".env.local", override: false, quiet: true });

async function main() {
  const options = validateCatalogSeedRolloutOptions(
    parseCatalogSeedRolloutArgs(process.argv.slice(2)),
  );
  const codeState = readCodeState();
  const seedResults = [];

  for (const command of CATALOG_SEED_ROLLOUT_COMMANDS) {
    const output = runPackageScript(command.packageScript);
    seedResults.push(
      buildSafeSeedCommandSummary(
        command,
        extractJsonObjectFromCommandOutput(output),
      ),
    );
  }

  const appSmoke = extractJsonObjectFromCommandOutput(
    runPackageScript("smoke:garden-catalog-ux", [
      "--",
      "--base-url",
      options.baseUrl,
    ]),
  ) as CatalogSeedRolloutAppSmoke;

  const evidence = buildCatalogSeedRolloutEvidence({
    options,
    codeState,
    seedResults,
    appSmoke,
    generatedAt: new Date().toISOString(),
  });

  console.log(JSON.stringify(evidence, null, 2));
}

function runPackageScript(script: string, args: string[] = []) {
  const result = spawnSync("pnpm", [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(
      `${script} failed with exit ${result.status ?? "unknown"}. Output is withheld to keep rollout evidence redacted; run the package script directly in a private terminal for debugging.`,
    );
  }

  return result.stdout;
}

function readCodeState() {
  const commitSha =
    readNonEmptyEnvValue(process.env.VERCEL_GIT_COMMIT_SHA) ??
    readGitValue(["rev-parse", "HEAD"], "unknown") ??
    "unknown";
  const branch =
    readNonEmptyEnvValue(process.env.VERCEL_GIT_COMMIT_REF) ??
    readGitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown") ??
    "unknown";
  const status = readGitValue(["status", "--porcelain"], null);

  return {
    commitSha,
    branch,
    workingTree:
      status === null ? "unknown" : status.length === 0 ? "clean" : "dirty",
  } as const;
}

function readNonEmptyEnvValue(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function readGitValue(args: string[], fallback: string | null) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

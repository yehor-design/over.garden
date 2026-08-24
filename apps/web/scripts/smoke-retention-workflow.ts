import process from "node:process";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

function requireEnvironment(argv: string[]) {
  const environment = readFlag(argv, "--environment");
  const confirm = readFlag(argv, "--confirm-environment");
  if (!environment || environment !== confirm) {
    throw new Error(
      "Refuse to run without matching --environment and --confirm-environment.",
    );
  }
  if (environment !== "local" && environment !== "production") {
    throw new Error("Environment must be local or production.");
  }
  return environment;
}

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

async function main() {
  const argv = process.argv.slice(2);
  const environment = requireEnvironment(argv);
  if (environment === "production") {
    throw new Error(
      "Retention execute smoke is local-only; use retention:report for production dry-run.",
    );
  }

  const { runRetentionWorkflow } = await import(
    "../src/server/media/retention-executor"
  );
  const dryRun = await runRetentionWorkflow("dry_run");
  const execute = await runRetentionWorkflow("execute");

  if (dryRun.policyVersion !== execute.policyVersion) {
    throw new Error("Dry-run and execute policy versions drifted.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        environment,
        issue: "OVE-195",
        evidenceClass: "retention-workflow",
        dryRun,
        execute: {
          policyVersion: execute.policyVersion,
          mode: execute.mode,
          failureClass: execute.failureClass,
          danglingCoverPointerClass: execute.danglingCoverPointerClass,
          orphanCoverOnlyClass: execute.orphanCoverOnlyClass,
          pendingRevokeJobsClass: execute.pendingRevokeJobsClass,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "retention workflow smoke failed",
  );
  process.exitCode = 1;
});

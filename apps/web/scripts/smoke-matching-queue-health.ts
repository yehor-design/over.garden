import process from "node:process";

import { config as loadEnv } from "dotenv";

// `.env.local` names the loopback database, so a production run that only
// loaded it read the developer's own heartbeat and reported the handler set of
// a worker nobody deployed. The runbook tells an operator to run this command
// as the verification step of a production deploy, so it has to be able to
// reach production: `--env-file` names the pulled environment and wins, as it
// does in every other production script here.
const envFileIndex = process.argv.indexOf("--env-file");
const envFile = envFileIndex < 0 ? undefined : process.argv[envFileIndex + 1];
loadEnv({ path: ".env.local" });
if (envFile) loadEnv({ path: envFile, override: true });

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

/** Flags this script consumes itself and must not pass on. */
export const CONSUMED_FLAGS = new Set([
  "--environment",
  "--confirm-environment",
  "--env-file",
]);

/**
 * What is left for the capability parser once this script has taken its own
 * flags — the flag *and* the value after it. A value left behind is read as
 * the next flag's, which is how `--env-file` would have made
 * `--expected-commit` see a path.
 */
export function capabilityArgv(argv: readonly string[]): string[] {
  return argv.filter(
    (arg, index, all) =>
      !CONSUMED_FLAGS.has(arg) && !CONSUMED_FLAGS.has(all[index - 1] ?? ""),
  );
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
    const {
      parseMatchingRuntimeCapabilityArgs,
      runMatchingRuntimeCapabilitySmokeFromHeartbeat,
      validateMatchingRuntimeCapabilityOptions,
    } = await import("../src/lib/matching-runtime-proof");
    const { readMatchingRuntimeHeartbeat } =
      await import("./matching-runtime-heartbeat-reader");
    const parsed = parseMatchingRuntimeCapabilityArgs(capabilityArgv(argv));
    const options = validateMatchingRuntimeCapabilityOptions({
      expectedCommitSha:
        parsed.expectedCommitSha ??
        process.env.MATCHING_RUNTIME_EXPECTED_COMMIT_SHA,
      expectedImageDigest:
        parsed.expectedImageDigest ??
        process.env.MATCHING_RUNTIME_EXPECTED_IMAGE_DIGEST,
    });
    const evidence = await runMatchingRuntimeCapabilitySmokeFromHeartbeat(
      options,
      () => readMatchingRuntimeHeartbeat("available"),
    );
    if (evidence.readiness.unsupportedRetryingClass !== "none") {
      throw new Error(
        "Production matching queue still has unsupported retries.",
      );
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          environment,
          issue: "OVE-194",
          evidenceClass: "matching-queue-health",
          readiness: evidence.readiness,
          leakCheck: evidence.leakCheck,
        },
        null,
        2,
      ),
    );
    return;
  }

  const { loadMatchingQueueRecoveryReport } =
    await import("../src/server/job-queue-recovery");
  const report = await loadMatchingQueueRecoveryReport();
  if (report.unsupportedRetryingClass !== "none") {
    throw new Error("Local matching queue still has unsupported retries.");
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        environment,
        issue: "OVE-194",
        evidenceClass: "matching-queue-health",
        report,
      },
      null,
      2,
    ),
  );
}

const isEntrypoint =
  process.argv[1]?.endsWith("smoke-matching-queue-health.ts") === true;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "matching queue health smoke failed",
    );
    process.exitCode = 1;
  });
}

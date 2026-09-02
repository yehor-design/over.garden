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
    const {
      parseMatchingRuntimeCapabilityArgs,
      runMatchingRuntimeCapabilitySmokeFromHeartbeat,
      validateMatchingRuntimeCapabilityOptions,
    } = await import("../src/lib/matching-runtime-proof");
    const { readMatchingRuntimeHeartbeat } =
      await import("./matching-runtime-heartbeat-reader");
    const capabilityArgv = argv.filter(
      (arg, index, all) =>
        arg !== "--environment" &&
        arg !== "--confirm-environment" &&
        all[index - 1] !== "--environment" &&
        all[index - 1] !== "--confirm-environment",
    );
    const parsed = parseMatchingRuntimeCapabilityArgs(capabilityArgv);
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

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "matching queue health smoke failed",
  );
  process.exitCode = 1;
});

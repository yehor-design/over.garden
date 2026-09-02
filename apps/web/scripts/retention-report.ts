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
  const mode = readFlag(argv, "--mode") === "execute" ? "execute" : "dry_run";

  if (environment === "production" && mode === "execute") {
    throw new Error(
      "Production retention execute is refused by this CLI; use dry_run only.",
    );
  }

  const { runRetentionWorkflow } =
    await import("../src/server/media/retention-executor");
  const report = await runRetentionWorkflow(mode);
  console.log(
    JSON.stringify(
      {
        ok: true,
        environment,
        issue: "OVE-195",
        evidenceClass: "retention-report",
        report,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "retention report failed",
  );
  process.exitCode = 1;
});

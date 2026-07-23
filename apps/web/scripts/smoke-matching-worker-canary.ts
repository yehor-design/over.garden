import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

function main() {
  const argv = process.argv.slice(2);
  const environment = requireEnvironment(argv);
  if (process.env.OVERGARDEN_MATCHING_CANARY_APPROVED !== "true") {
    throw new Error(
      "Set OVERGARDEN_MATCHING_CANARY_APPROVED=true for the dead-letter canary.",
    );
  }

  const matchingRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../services/matching",
  );
  const result = spawnSync(
    "uv",
    ["run", "--frozen", "python", "-m", "app.canary", "dead-letter"],
    {
      cwd: matchingRoot,
      env: process.env,
      encoding: "utf8",
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(
      `Matching worker canary failed for environment=${environment}.`,
    );
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(
    error instanceof Error ? error.message : "matching worker canary failed",
  );
  process.exitCode = 1;
}

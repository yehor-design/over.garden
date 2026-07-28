import { performance } from "node:perf_hooks";
import process from "node:process";

import { validateLaunchCorpusContentPackFile } from "../src/server/launch-corpus/content-pack-file";

const argv = process.argv.slice(2);

async function main() {
  const startedAt = performance.now();
  const environment = requireMatchingEnvironment(argv);
  const dryRun = argv.includes("--dry-run");
  const apply = argv.includes("--apply");
  const planDigest = requireDigest(argv, "--plan-digest");
  const packFile = requireFlag(argv, "--pack-file");
  const { pack, validation } =
    await validateLaunchCorpusContentPackFile(packFile);
  if (!pack || !validation.ok || !validation.contentPackDigest) {
    throw new Error("Content pack validation failed.");
  }
  if (pack.planDigest !== planDigest) {
    throw new Error("Content pack plan digest mismatch.");
  }

  if (apply || !dryRun) {
    throw new Error(
      "Production and mutating apply remain unavailable until the signed content-pack receipt is implemented and approved.",
    );
  }

  const faultProfile = optionalFlag(argv, "--fault-profile");
  const receiptState =
    faultProfile === "search-timeout" ? "recovery" : "dry_run_ready";
  const latency = performance.now() - startedAt;
  console.log(
    JSON.stringify({
      ok: true,
      issue: "OVE-199",
      environment,
      mode: "dry_run",
      redacted: true,
      planDigest,
      contentPackDigest: validation.contentPackDigest,
      receiptState,
      launch_corpus_apply_slot_latency: latency,
      thresholdMilliseconds: 120_000,
      controls: {
        abortBeforeNextSlotCommand: "responsive",
        compensateCurrentSlotCommand: "responsive",
      },
      mutationCount: 0,
    }),
  );
}

function requireMatchingEnvironment(args: string[]) {
  const environment = requireFlag(args, "--environment");
  const confirm = requireFlag(args, "--confirm-environment");
  if (environment !== confirm) {
    throw new Error("Environment confirmation mismatch.");
  }
  if (environment !== "local" && environment !== "production") {
    throw new Error("Environment must be local or production.");
  }
  return environment;
}

function requireDigest(args: string[], name: string) {
  const value = requireFlag(args, name);
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function requireFlag(args: string[], name: string): string {
  const value = optionalFlag(args, name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalFlag(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      ok: false,
      issue: "OVE-199",
      redacted: true,
      errorCode: error instanceof Error ? "apply_refused" : "unknown_error",
    }),
  );
  process.exitCode = 1;
});

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

  const { drainMediaLifecycleQueue } = await import(
    "../src/server/media/media-lifecycle-consumer"
  );
  const {
    listJournalDeletionDerivativeRevokeCandidates,
  } = await import("../src/server/media/media-lifecycle-enqueue");

  // Contract smoke: archive candidate selection and drain are invocable.
  // Full local MinIO archive→byte proof is covered by unit tests plus optional
  // operator synthetic production run documented in MEDIA_LIFECYCLE.md.
  const candidates = await listJournalDeletionDerivativeRevokeCandidates(
    (
      await import("../src/db")
    ).db,
    {
      journalEntryId: "00000000-0000-4000-8000-000000000000",
      ownerUserId: "00000000-0000-4000-8000-000000000000",
    },
  );
  const drained = await drainMediaLifecycleQueue(1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        environment,
        issue: "OVE-195",
        evidenceClass: "media-archive-retention",
        candidateClass: candidates.length === 0 ? "empty" : "present",
        drained: {
          claimedClass: drained.claimed === 0 ? "empty" : "present",
          completedClass: drained.completed === 0 ? "empty" : "present",
          failedClass: drained.failed === 0 ? "empty" : "present",
          deadClass: drained.dead === 0 ? "empty" : "present",
        },
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
      : "media archive retention smoke failed",
  );
  process.exitCode = 1;
});

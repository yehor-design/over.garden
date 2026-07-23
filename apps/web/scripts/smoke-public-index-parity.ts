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
  // Resolve SSL before any db import — production managed Postgres rejects
  // non-TLS connections (pg_hba "no encryption").
  const earlyEnvironment = readFlag(argv, "--environment");
  if (earlyEnvironment === "production" && !process.env.DATABASE_SSL) {
    process.env.DATABASE_SSL = "true";
  }
  const environment = requireEnvironment(argv);
  const mode = readFlag(argv, "--mode") ?? "classify";
  if (mode !== "classify" && mode !== "plan" && mode !== "apply") {
    throw new Error("Mode must be classify, plan, or apply.");
  }

  const {
    applyPublicJournalIndexRepair,
    classifyPublicJournalIndexParity,
    planPublicJournalIndexRepair,
    redactParityReportForEvidence,
  } = await import("../src/server/search/public-journal-parity");

  if (mode === "classify") {
    const report = redactParityReportForEvidence(
      await classifyPublicJournalIndexParity(),
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          environment,
          mode,
          issue: "OVE-196",
          evidenceClass: "public_index_parity",
          report,
        },
        null,
        2,
      ),
    );
    if (!report.zeroGap && environment === "production" && !argv.includes("--allow-gap")) {
      process.exitCode = 2;
    }
    return;
  }

  if (mode === "plan") {
    const before = redactParityReportForEvidence(
      await classifyPublicJournalIndexParity(),
    );
    const plan = await planPublicJournalIndexRepair();
    console.log(
      JSON.stringify(
        {
          ok: true,
          environment,
          mode,
          issue: "OVE-196",
          evidenceClass: "public_index_parity_plan",
          before,
          plan,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (environment === "production" && !argv.includes("--allow-non-local-mutation")) {
    throw new Error(
      "Production apply requires --allow-non-local-mutation after reviewing the plan.",
    );
  }

  const before = redactParityReportForEvidence(
    await classifyPublicJournalIndexParity(),
  );
  const applied = await applyPublicJournalIndexRepair();
  console.log(
    JSON.stringify(
      {
        ok: true,
        environment,
        mode,
        issue: "OVE-196",
        evidenceClass: "public_index_parity_apply",
        before,
        plan: applied.plan,
        applied: applied.applied,
        after: redactParityReportForEvidence(applied.after),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "public index parity smoke failed",
  );
  process.exitCode = 1;
});

import process from "node:process";

import { config as loadEnv } from "dotenv";

import {
  resolveDatabaseConnection,
  resolvePgConnectionString,
} from "../src/db/connection";
import {
  assertProviderBinding,
  DigitalOceanDatabaseProvider,
  hostnameFromDatabaseUrl,
  hostnameLooksLikeProduction,
} from "../src/server/restore-readiness";

loadEnv({ path: ".env.local" });

function requireEnvironment(argv: string[]) {
  const environment = readFlag(argv, "--environment");
  const confirm = readFlag(argv, "--confirm-environment");
  if (!environment || environment !== confirm) {
    throw new Error(
      "Refuse to run without matching --environment and --confirm-environment.",
    );
  }
  if (
    environment !== "local" &&
    environment !== "production" &&
    environment !== "recovery-drill"
  ) {
    throw new Error(
      "Environment must be local, production, or recovery-drill.",
    );
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
  // Resolve SSL before any db import — managed Postgres rejects
  // non-TLS connections (pg_hba "no encryption").
  const earlyEnvironment = readFlag(argv, "--environment");
  if (
    (earlyEnvironment === "production" ||
      earlyEnvironment === "recovery-drill") &&
    !process.env.DATABASE_SSL
  ) {
    process.env.DATABASE_SSL = "true";
  }
  const environment = requireEnvironment(argv);
  const mode = readFlag(argv, "--mode") ?? "classify";
  if (mode !== "classify" && mode !== "plan" && mode !== "apply") {
    throw new Error("Mode must be classify, plan, or apply.");
  }

  if (environment === "recovery-drill") {
    const confirmClusterId = readFlag(argv, "--confirm-cluster-id");
    const productionClusterId = readFlag(argv, "--production-cluster-id");
    const disposableClusterName = readFlag(argv, "--disposable-cluster-name");
    const expectedEngine = readFlag(argv, "--expected-engine");
    const expectedRegion = readFlag(argv, "--expected-region");
    if (
      !confirmClusterId ||
      !productionClusterId ||
      !disposableClusterName ||
      !expectedEngine ||
      !expectedRegion
    ) {
      throw new Error(
        "recovery-drill requires provider id, name, engine, and region binding flags.",
      );
    }
    if (confirmClusterId === productionClusterId) {
      throw new Error(
        "Refuse: recovery-drill confirm-cluster-id equals production-cluster-id.",
      );
    }
    const resolution = resolveDatabaseConnection(process.env);
    const connectionString = resolvePgConnectionString(process.env, resolution);
    if (!connectionString) {
      throw new Error("recovery-drill requires DATABASE_URL.");
    }
    const hostname = hostnameFromDatabaseUrl(connectionString);
    if (hostnameLooksLikeProduction(hostname)) {
      throw new Error(
        "Refuse: recovery-drill DATABASE_URL hostname matches production host class.",
      );
    }
    const meiliHost = process.env.MEILISEARCH_HOST ?? "";
    const isLoopbackMeili =
      meiliHost.startsWith("http://127.0.0.1:") ||
      meiliHost.startsWith("http://localhost:") ||
      meiliHost.startsWith("http://[::1]:");
    if (!isLoopbackMeili) {
      throw new Error(
        "Refuse: recovery-drill Meilisearch must be ephemeral loopback (never production Meili).",
      );
    }
    const provider = new DigitalOceanDatabaseProvider();
    const cluster = await provider.getCluster(confirmClusterId);
    const providerHost = await provider.getHost(confirmClusterId);
    assertProviderBinding({
      provider: cluster,
      expectedId: confirmClusterId,
      expectedName: disposableClusterName,
      expectedEngine,
      expectedRegion,
      providerHost,
      databaseUrl: connectionString,
      productionId: productionClusterId,
      ca: process.env.DATABASE_SSL_CA ?? "",
    });
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
          issue: "OVE-227",
          evidenceClass: "public_index_parity",
          report,
        },
        null,
        2,
      ),
    );
    if (
      !report.zeroGap &&
      environment === "production" &&
      !argv.includes("--allow-gap")
    ) {
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
          issue: "OVE-227",
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

  if (
    (environment === "production" || environment === "recovery-drill") &&
    !argv.includes("--allow-non-local-mutation")
  ) {
    throw new Error(
      "Non-local apply requires --allow-non-local-mutation after reviewing the plan.",
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
        issue: "OVE-227",
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

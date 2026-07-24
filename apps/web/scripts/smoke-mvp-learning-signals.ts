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
  return environment as "local" | "production";
}

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

async function main() {
  const argv = process.argv.slice(2);
  const environment = requireEnvironment(argv);
  const confirmReclassify = argv.includes("--confirm-reclassify");

  if (environment === "production" && !process.env.DATABASE_SSL) {
    process.env.DATABASE_SSL = "true";
  }

  const { getMvpLearningReport } = await import(
    "../src/server/mvp-learning/report"
  );
  const { buildMvpLearningReconcileReport } = await import(
    "../src/server/mvp-learning/reconcile"
  );
  const { applyMvpLearningReclassify } = await import(
    "../src/server/mvp-learning/plan"
  );
  const { FORBIDDEN_ANALYTICS_PROPERTY_FRAGMENTS } = await import(
    "../src/server/mvp-learning/forbidden-fields"
  );

  if (confirmReclassify) {
    if (environment === "production" && !argv.includes("--confirm-production-reclassify")) {
      throw new Error(
        "Production reclassify refused without --confirm-production-reclassify after reviewing the SELECT-only plan.",
      );
    }
    const result = await applyMvpLearningReclassify({ confirm: true });
    console.log(
      JSON.stringify(
        {
          ok: true,
          environment,
          issue: "OVE-200",
          evidenceClass: "mvp-learning-reclassify",
          result,
        },
        null,
        2,
      ),
    );
    return;
  }

  const report = await getMvpLearningReport();
  const reconcile = await buildMvpLearningReconcileReport({
    environment,
    report,
    samplePropertyKeys: [
      "actor_class",
      "photo_count_bucket",
      "cover_source",
      ...FORBIDDEN_ANALYTICS_PROPERTY_FRAGMENTS.slice(0, 0),
    ],
  });

  console.log(
    JSON.stringify(
      {
        ok: reconcile.ok,
        environment,
        issue: "OVE-200",
        evidenceClass: "mvp-learning-signals",
        report: {
          policyVersion: report.policyVersion,
          policyDate: report.policyDate,
          retentionPolicyVersion: report.retentionPolicyVersion,
          generatedAt: report.generatedAt.toISOString(),
          decisionGate: report.decisionGate,
          cohorts: report.cohorts,
          exclusions: report.exclusions,
          unclassifiedEventCount: report.unclassifiedEventCount,
          editorialPublicTrafficProxy: report.editorialPublicTrafficProxy,
        },
        reconcile,
      },
      null,
      2,
    ),
  );

  if (!reconcile.ok) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "mvp-learning signals smoke failed",
  );
  process.exitCode = 1;
});

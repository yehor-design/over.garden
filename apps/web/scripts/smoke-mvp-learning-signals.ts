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

function readExpectedNonGreenDecisionGate(argv: string[]) {
  const expected = readFlag(argv, "--expect-decision-gate");
  if (!expected) return null;
  if (
    expected !== "unclassified" &&
    expected !== "stale" &&
    expected !== "insufficient"
  ) {
    throw new Error(
      "--expect-decision-gate must be unclassified, stale, or insufficient.",
    );
  }
  return expected;
}

async function main() {
  const argv = process.argv.slice(2);
  const environment = requireEnvironment(argv);
  const confirmReclassify = argv.includes("--confirm-reclassify");
  const expectedDecisionGate = readExpectedNonGreenDecisionGate(argv);

  if (environment === "production" && !process.env.DATABASE_SSL) {
    process.env.DATABASE_SSL = "true";
  }

  const { getMvpLearningReport } =
    await import("../src/server/mvp-learning/report");
  const { buildMvpLearningReconcileReport } =
    await import("../src/server/mvp-learning/reconcile");
  const { applyMvpLearningReclassify } =
    await import("../src/server/mvp-learning/plan");
  if (confirmReclassify) {
    if (
      environment === "production" &&
      !argv.includes("--confirm-production-reclassify")
    ) {
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
  });
  const expectationMatched =
    expectedDecisionGate === null ||
    report.decisionGate === expectedDecisionGate;
  const assertionPassed =
    expectedDecisionGate === null ? reconcile.ok : expectationMatched;

  console.log(
    JSON.stringify(
      {
        ok: assertionPassed,
        environment,
        expectedDecisionGate,
        expectationMatched,
        reconciliationOk: reconcile.ok,
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
          organicAcquisition: report.organicAcquisition,
          editorialPublicTrafficProxy: report.editorialPublicTrafficProxy,
        },
        reconcile,
      },
      null,
      2,
    ),
  );

  if (!assertionPassed) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "mvp-learning signals smoke failed",
  );
  process.exitCode = 1;
});

import "server-only";

import {
  getMvpLearningReport,
  type MvpLearningReport,
} from "@/server/mvp-learning/report";
import { MVP_LEARNING_POLICY_VERSION } from "@/lib/mvp-learning/policy";
import { FORBIDDEN_ANALYTICS_PROPERTY_FRAGMENTS } from "@/server/mvp-learning/forbidden-fields";

export interface MvpLearningReconcileReport {
  ok: boolean;
  policyVersion: typeof MVP_LEARNING_POLICY_VERSION;
  environment: "local" | "production";
  agreement: {
    selfServeActivated: number;
    closedPilotActivated: number;
    unclassifiedEvents: number;
    exclusionsTotal: number;
  };
  forbiddenFieldHits: number;
  decisionGate: MvpLearningReport["decisionGate"];
  notes: string[];
}

export async function buildMvpLearningReconcileReport(input: {
  environment: "local" | "production";
  report?: MvpLearningReport;
  samplePropertyKeys?: string[];
}): Promise<MvpLearningReconcileReport> {
  const report = input.report ?? (await getMvpLearningReport());
  const exclusionsTotal = Object.values(report.exclusions).reduce(
    (sum, value) => sum + value,
    0,
  );

  const sampleKeys = input.samplePropertyKeys ?? [];
  const forbiddenFieldHits = sampleKeys.filter((key) =>
    FORBIDDEN_ANALYTICS_PROPERTY_FRAGMENTS.some((fragment) =>
      key.toLowerCase().includes(fragment),
    ),
  ).length;

  const ok =
    report.unclassifiedEventCount === 0 &&
    forbiddenFieldHits === 0 &&
    report.policyVersion === MVP_LEARNING_POLICY_VERSION;

  return {
    ok,
    policyVersion: report.policyVersion,
    environment: input.environment,
    agreement: {
      selfServeActivated: report.cohorts.real_self_serve.activatedGardeners,
      closedPilotActivated: report.cohorts.real_closed_pilot.activatedGardeners,
      unclassifiedEvents: report.unclassifiedEventCount,
      exclusionsTotal,
    },
    forbiddenFieldHits,
    decisionGate: report.decisionGate,
    notes: [
      "Reconcile compares privacy-safe aggregates only; no row IDs or journal content.",
      "Headline continue/iterate/stop must refuse when decisionGate is unclassified, stale, or insufficient.",
      ...report.notes,
    ],
  };
}

import { createHash } from "node:crypto";

import {
  PUBLIC_SURFACE_BUDGET,
  PUBLIC_SURFACE_CWV_PROFILE,
  PUBLIC_SURFACE_NON_CANDIDATE_CONSUMERS,
  PUBLIC_SURFACE_PERFORMANCE_CLASSES,
  PUBLIC_SURFACE_PERFORMANCE_CONSUMER_CLASS,
  type PublicSurfacePerformanceClass,
} from "../src/lib/performance/public-surface-budget";

export const CORE_WEB_VITALS_RECEIPT_VERSION =
  "ove337.publicSurfaceCoreWebVitalsReceipt.v1" as const;

export type CoreWebVitalsStatus = "pass" | "over_budget" | "not_measured";
export type CoreWebVitalsReasonClass =
  | "run_count_mismatch"
  | "lcp_missing"
  | "interaction_missing"
  | "cls_missing"
  | "metric_invalid"
  | "lcp_over_budget"
  | "inp_over_budget"
  | "cls_over_budget"
  | "measurement_timeout"
  | "measurement_cancelled"
  | "measurement_unavailable";

export interface CoreWebVitalsRun {
  run: number;
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  interactionClass: "observed" | "below_observer_floor" | "missing";
}

export interface CoreWebVitalsClassReceipt {
  surfaceClass: PublicSurfacePerformanceClass;
  status: CoreWebVitalsStatus;
  reasonClasses: CoreWebVitalsReasonClass[];
  runCount: number;
  p75: { lcpMs: number | null; inpMs: number | null; cls: number | null };
  interactionClasses: Array<CoreWebVitalsRun["interactionClass"]>;
  budget: { lcpMs: number; inpMs: number; cls: number };
  controls: {
    retryMeasurementCommand: "usable";
    budgetReportCommand: "usable";
  };
  semanticDigest: string;
}

export interface CoreWebVitalsAggregateReceipt {
  schemaVersion: typeof CORE_WEB_VITALS_RECEIPT_VERSION;
  issue: "OVE-337";
  status: CoreWebVitalsStatus;
  environment: "local" | "production";
  buildSha: string;
  classCount: number;
  candidateConsumerCount: number;
  nonCandidateConsumerCount: number;
  mappingCoverageClass: "complete" | "incomplete";
  preciseLocationAbsent: true;
  controls: CoreWebVitalsClassReceipt["controls"];
  profile: typeof PUBLIC_SURFACE_CWV_PROFILE;
  classReceipts: CoreWebVitalsClassReceipt[];
  semanticDigest: string;
}

const CONTROLS = {
  retryMeasurementCommand: "usable",
  budgetReportCommand: "usable",
} as const;

const SAFE_PRODUCTION_STATIC_CONTROL_PATHS = new Set([
  "/bg",
  "/bg/objects",
  "/bg/journals",
  "/bg/knowledge",
]);

export function isSafeProductionStaticControlPath(pathname: string) {
  return SAFE_PRODUCTION_STATIC_CONTROL_PATHS.has(pathname);
}

export function productionStaticControlPaths() {
  return [...SAFE_PRODUCTION_STATIC_CONTROL_PATHS];
}

export function percentile(values: number[], requestedPercentile: number) {
  if (values.length === 0) throw new Error("percentile_input_empty");
  if (
    !Number.isFinite(requestedPercentile) ||
    requestedPercentile <= 0 ||
    requestedPercentile > 1
  ) {
    throw new Error("percentile_invalid");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(requestedPercentile * sorted.length) - 1]!;
}

export function evaluateCoreWebVitalsClass(input: {
  surfaceClass: PublicSurfacePerformanceClass;
  runs: CoreWebVitalsRun[];
}): CoreWebVitalsClassReceipt {
  const budget = PUBLIC_SURFACE_BUDGET[input.surfaceClass];
  const reasons = new Set<CoreWebVitalsReasonClass>();
  if (input.runs.length !== PUBLIC_SURFACE_CWV_PROFILE.runsPerClass) {
    reasons.add("run_count_mismatch");
  }

  const lcpValues = validMetricValues(input.runs, "lcpMs", reasons, "lcp_missing");
  const inpValues = validMetricValues(
    input.runs,
    "inpMs",
    reasons,
    "interaction_missing",
  );
  const clsValues = validMetricValues(input.runs, "cls", reasons, "cls_missing");
  if (input.runs.some(({ interactionClass }) => interactionClass === "missing")) {
    reasons.add("interaction_missing");
  }

  const p75 = {
    lcpMs: metricPercentile(lcpValues, input.runs.length),
    inpMs: metricPercentile(inpValues, input.runs.length),
    cls: metricPercentile(clsValues, input.runs.length),
  };

  if (reasons.size === 0) {
    if (p75.lcpMs! > budget.lcpMs) reasons.add("lcp_over_budget");
    if (p75.inpMs! > budget.inpMs) reasons.add("inp_over_budget");
    if (p75.cls! > budget.cls) reasons.add("cls_over_budget");
  }

  const reasonClasses = orderedReasons(reasons);
  const status: CoreWebVitalsStatus = reasonClasses.some((reason) =>
    reason.endsWith("_over_budget"),
  )
    ? "over_budget"
    : reasonClasses.length > 0
      ? "not_measured"
      : "pass";
  const body = {
    surfaceClass: input.surfaceClass,
    status,
    reasonClasses,
    runCount: input.runs.length,
    p75: {
      lcpMs: roundMetric(p75.lcpMs, 1),
      inpMs: roundMetric(p75.inpMs, 1),
      cls: roundMetric(p75.cls, 4),
    },
    interactionClasses: input.runs.map(({ interactionClass }) => interactionClass),
    budget: { lcpMs: budget.lcpMs, inpMs: budget.inpMs, cls: budget.cls },
    controls: CONTROLS,
  };

  return { ...body, semanticDigest: digest(body) };
}

function validMetricValues(
  runs: CoreWebVitalsRun[],
  key: "lcpMs" | "inpMs" | "cls",
  reasons: Set<CoreWebVitalsReasonClass>,
  missingReason: CoreWebVitalsReasonClass,
) {
  const values: number[] = [];
  for (const run of runs) {
    const value = run[key];
    if (value === null) {
      reasons.add(missingReason);
      continue;
    }
    if (!Number.isFinite(value) || value < 0) {
      reasons.add("metric_invalid");
      continue;
    }
    values.push(value);
  }
  return values;
}

function metricPercentile(values: number[], expectedCount: number) {
  return values.length === expectedCount && values.length > 0
    ? percentile(values, PUBLIC_SURFACE_CWV_PROFILE.percentile)
    : null;
}

function roundMetric(value: number | null, decimals: number) {
  if (value === null) return null;
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function orderedReasons(reasons: Set<CoreWebVitalsReasonClass>) {
  const order: CoreWebVitalsReasonClass[] = [
    "run_count_mismatch",
    "lcp_missing",
    "interaction_missing",
    "cls_missing",
    "metric_invalid",
    "lcp_over_budget",
    "inp_over_budget",
    "cls_over_budget",
    "measurement_timeout",
    "measurement_cancelled",
    "measurement_unavailable",
  ];
  return order.filter((reason) => reasons.has(reason));
}

export function buildCoreWebVitalsAggregateReceipt(input: {
  buildSha: string;
  environment: "local" | "production";
  classReceipts: CoreWebVitalsClassReceipt[];
}): CoreWebVitalsAggregateReceipt {
  if (!/^[a-f0-9]{40}$/u.test(input.buildSha)) {
    throw new Error("core_web_vitals_build_sha_invalid");
  }
  const receiptByClass = new Map(
    input.classReceipts.map((receipt) => [receipt.surfaceClass, receipt]),
  );
  const complete =
    receiptByClass.size === PUBLIC_SURFACE_PERFORMANCE_CLASSES.length &&
    input.classReceipts.length === PUBLIC_SURFACE_PERFORMANCE_CLASSES.length &&
    PUBLIC_SURFACE_PERFORMANCE_CLASSES.every((surfaceClass) =>
      receiptByClass.has(surfaceClass),
    );
  const classReceipts = PUBLIC_SURFACE_PERFORMANCE_CLASSES.flatMap(
    (surfaceClass) => {
      const receipt = receiptByClass.get(surfaceClass);
      return receipt ? [receipt] : [];
    },
  );
  const status: CoreWebVitalsStatus = !complete ||
    classReceipts.some(({ status }) => status === "not_measured")
    ? "not_measured"
    : classReceipts.some(({ status }) => status === "over_budget")
      ? "over_budget"
      : "pass";
  const body = {
    schemaVersion: CORE_WEB_VITALS_RECEIPT_VERSION,
    issue: "OVE-337" as const,
    status,
    environment: input.environment,
    buildSha: input.buildSha,
    classCount: input.classReceipts.length,
    candidateConsumerCount: Object.keys(
      PUBLIC_SURFACE_PERFORMANCE_CONSUMER_CLASS,
    ).length,
    nonCandidateConsumerCount: PUBLIC_SURFACE_NON_CANDIDATE_CONSUMERS.length,
    mappingCoverageClass: complete ? ("complete" as const) : ("incomplete" as const),
    preciseLocationAbsent: true as const,
    controls: CONTROLS,
    profile: PUBLIC_SURFACE_CWV_PROFILE,
    classReceipts,
  };
  return { ...body, semanticDigest: digest(body) };
}

export async function measureCoreWebVitalsClassWithDeadline(input: {
  surfaceClass: PublicSurfacePerformanceClass;
  deadlineMs: number;
  measure: () => Promise<CoreWebVitalsRun[]>;
  signal?: AbortSignal;
}): Promise<CoreWebVitalsClassReceipt> {
  if (input.signal?.aborted) {
    return terminalFailure(input.surfaceClass, "measurement_cancelled");
  }
  if (!Number.isFinite(input.deadlineMs) || input.deadlineMs <= 0) {
    return terminalFailure(input.surfaceClass, "measurement_timeout");
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (receipt: CoreWebVitalsClassReceipt) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
      resolve(receipt);
    };
    const cancel = () =>
      finish(terminalFailure(input.surfaceClass, "measurement_cancelled"));
    const timer = setTimeout(
      () => finish(terminalFailure(input.surfaceClass, "measurement_timeout")),
      input.deadlineMs,
    );
    input.signal?.addEventListener("abort", cancel, { once: true });
    Promise.resolve()
      .then(input.measure)
      .then((runs) =>
        finish(
          evaluateCoreWebVitalsClass({ surfaceClass: input.surfaceClass, runs }),
        ),
      )
      .catch(() =>
        finish(terminalFailure(input.surfaceClass, "measurement_unavailable")),
      );
  });
}

function terminalFailure(
  surfaceClass: PublicSurfacePerformanceClass,
  reason: Extract<
    CoreWebVitalsReasonClass,
    "measurement_timeout" | "measurement_cancelled" | "measurement_unavailable"
  >,
) {
  const budget = PUBLIC_SURFACE_BUDGET[surfaceClass];
  const body = {
    surfaceClass,
    status: "not_measured" as const,
    reasonClasses: [reason],
    runCount: 0,
    p75: { lcpMs: null, inpMs: null, cls: null },
    interactionClasses: [],
    budget: { lcpMs: budget.lcpMs, inpMs: budget.inpMs, cls: budget.cls },
    controls: CONTROLS,
  };
  return { ...body, semanticDigest: digest(body) };
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

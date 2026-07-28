/**
 * OVE-230 managed recovery drill contract.
 * Thresholds are immutable for a given drill; never rewrite after measuring results.
 */

export const RESTORE_READINESS_POLICY = "ove230.restore-readiness.v2" as const;

export const PREDECLARED_RPO_MAX_MS = 60 * 60 * 1000; // 1h via PITR
export const PREDECLARED_RTO_MAX_MS = 4 * 60 * 60 * 1000; // 4h wall-clock

export const PRODUCTION_CLUSTER_NAME_CLASS =
  "overgarden-postgres-prod-fra1" as const;

/** Hostname class marker for the production managed cluster (no credentials). */
export const PRODUCTION_HOST_CLASS_MARKER =
  "overgarden-postgres-prod-fra1" as const;

export const DISPOSABLE_CLUSTER_NAME_PREFIX = "overgarden-pitr-drill-" as const;

export const RECOVERY_DRILL_ENVIRONMENT = "recovery-drill" as const;

export type RestoreReadinessEnvironment =
  | typeof RECOVERY_DRILL_ENVIRONMENT
  | "local";

export function isDisposableClusterName(name: string): boolean {
  return (
    name.startsWith(DISPOSABLE_CLUSTER_NAME_PREFIX) &&
    /^overgarden-pitr-drill-\d{8}$/.test(name)
  );
}

export function isProductionClusterName(name: string): boolean {
  return name === PRODUCTION_CLUSTER_NAME_CLASS;
}

export function hostnameLooksLikeProduction(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.includes(PRODUCTION_HOST_CLASS_MARKER);
}

export function evaluateRpoPass(actualRpoMs: number): boolean {
  return actualRpoMs >= 0 && actualRpoMs <= PREDECLARED_RPO_MAX_MS;
}

export function evaluateRtoPass(actualRtoMs: number): boolean {
  return actualRtoMs >= 0 && actualRtoMs <= PREDECLARED_RTO_MAX_MS;
}

export function deriveRpoMs(input: {
  restorePointUtc: string;
  forkAcceptedUtc: string;
}): number {
  const restorePoint = new Date(input.restorePointUtc).getTime();
  const accepted = new Date(input.forkAcceptedUtc).getTime();
  if (!Number.isFinite(restorePoint) || !Number.isFinite(accepted)) {
    throw new Error("RPO timestamps must be valid UTC instants.");
  }
  const duration = accepted - restorePoint;
  if (duration < 0) throw new Error("fork acceptance precedes restore point.");
  return duration;
}

export function assertMeasuredRto(input: {
  monotonicMs: number;
  startedUtc: string;
  completedUtc: string;
  maximumClockSkewMs?: number;
}): number {
  const started = new Date(input.startedUtc).getTime();
  const completed = new Date(input.completedUtc).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(completed)) {
    throw new Error("RTO corroboration timestamps must be valid UTC instants.");
  }
  if (!Number.isFinite(input.monotonicMs) || input.monotonicMs < 0) {
    throw new Error("RTO monotonic duration must be non-negative.");
  }
  const wallMs = completed - started;
  if (wallMs < 0) throw new Error("RTO completion precedes its start.");
  const skew = input.maximumClockSkewMs ?? 30_000;
  if (Math.abs(wallMs - input.monotonicMs) > skew) {
    throw new Error("RTO monotonic and UTC measurements disagree.");
  }
  return Math.trunc(input.monotonicMs);
}

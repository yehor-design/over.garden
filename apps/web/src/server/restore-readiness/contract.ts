/**
 * OVE-201 managed recovery drill contract.
 * Thresholds are immutable for a given drill; never rewrite after measuring results.
 */

export const RESTORE_READINESS_POLICY = "ove201.restore-readiness.v1" as const;

export const PREDECLARED_RPO_MAX_MS = 60 * 60 * 1000; // 1h via PITR
export const PREDECLARED_RTO_MAX_MS = 4 * 60 * 60 * 1000; // 4h wall-clock

export const PRODUCTION_CLUSTER_NAME_CLASS =
  "overgarden-postgres-prod-fra1" as const;

/** Hostname class marker for the production managed cluster (no credentials). */
export const PRODUCTION_HOST_CLASS_MARKER =
  "overgarden-postgres-prod-fra1" as const;

export const DISPOSABLE_CLUSTER_NAME_PREFIX =
  "overgarden-pitr-drill-" as const;

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

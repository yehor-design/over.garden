import {
  DISPOSABLE_CLUSTER_NAME_PREFIX,
  hostnameLooksLikeProduction,
  isDisposableClusterName,
  isProductionClusterName,
  PRODUCTION_CLUSTER_NAME_CLASS,
  RECOVERY_DRILL_ENVIRONMENT,
  type RestoreReadinessEnvironment,
} from "./contract";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RestoreTargetGateInput {
  environment: string;
  confirmEnvironment: string;
  confirmClusterId: string;
  productionClusterId: string;
  disposableClusterName: string;
  databaseUrlHostname: string;
  requireSslCa: boolean;
  hasSslCa: boolean;
}

export interface RestoreTargetGateResult {
  ok: true;
  environment: RestoreReadinessEnvironment;
  confirmClusterId: string;
  disposableClusterName: string;
}

export interface TeardownGateInput {
  confirmDeleteClusterId: string;
  disposableClusterId: string;
  productionClusterId: string;
  disposableClusterName: string;
}

export function assertUuid(value: string, label: string): string {
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return trimmed.toLowerCase();
}

export function assertRestoreTargetGate(
  input: RestoreTargetGateInput,
): RestoreTargetGateResult {
  if (input.environment !== input.confirmEnvironment) {
    throw new Error(
      "Refuse to run without matching --environment and --confirm-environment.",
    );
  }
  if (
    input.environment !== RECOVERY_DRILL_ENVIRONMENT &&
    input.environment !== "local"
  ) {
    throw new Error(
      "Environment must be recovery-drill (or local for gate unit tests).",
    );
  }

  const confirmClusterId = assertUuid(
    input.confirmClusterId,
    "--confirm-cluster-id",
  );
  const productionClusterId = assertUuid(
    input.productionClusterId,
    "--production-cluster-id",
  );

  if (confirmClusterId === productionClusterId) {
    throw new Error(
      "Refuse: --confirm-cluster-id resolves to the production cluster.",
    );
  }

  if (isProductionClusterName(input.disposableClusterName)) {
    throw new Error(
      `Refuse: cluster name is the production class ${PRODUCTION_CLUSTER_NAME_CLASS}.`,
    );
  }

  if (!isDisposableClusterName(input.disposableClusterName)) {
    throw new Error(
      `Refuse: disposable name must match ${DISPOSABLE_CLUSTER_NAME_PREFIX}YYYYMMDD.`,
    );
  }

  if (hostnameLooksLikeProduction(input.databaseUrlHostname)) {
    throw new Error(
      "Refuse: DATABASE_URL hostname matches the production cluster host class.",
    );
  }

  if (input.requireSslCa && !input.hasSslCa) {
    throw new Error(
      "Refuse: managed recovery-drill requires DATABASE_SSL_CA (never log the CA body).",
    );
  }

  return {
    ok: true,
    environment: input.environment as RestoreReadinessEnvironment,
    confirmClusterId,
    disposableClusterName: input.disposableClusterName,
  };
}

export function assertTeardownGate(input: TeardownGateInput): {
  ok: true;
  deleteClusterId: string;
} {
  const deleteClusterId = assertUuid(
    input.confirmDeleteClusterId,
    "--confirm-delete-cluster-id",
  );
  const disposableClusterId = assertUuid(
    input.disposableClusterId,
    "disposable cluster id",
  );
  const productionClusterId = assertUuid(
    input.productionClusterId,
    "production cluster id",
  );

  if (deleteClusterId === productionClusterId) {
    throw new Error(
      "Refuse: teardown target resolves to the production cluster.",
    );
  }
  if (deleteClusterId !== disposableClusterId) {
    throw new Error(
      "Refuse: --confirm-delete-cluster-id must exactly match the disposable cluster id.",
    );
  }
  if (!isDisposableClusterName(input.disposableClusterName)) {
    throw new Error(
      "Refuse: teardown name is not a disposable overgarden-pitr-drill-YYYYMMDD cluster.",
    );
  }
  if (isProductionClusterName(input.disposableClusterName)) {
    throw new Error("Refuse: teardown name is production.");
  }

  return { ok: true, deleteClusterId };
}

export function hostnameFromDatabaseUrl(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return url.hostname;
  } catch {
    throw new Error("DATABASE_URL is not a parseable connection string.");
  }
}

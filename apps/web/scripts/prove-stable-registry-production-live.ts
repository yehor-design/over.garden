import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/schema";
import type {
  BackupClass,
  CapacityClass,
  StableRegistryProductionPhase,
} from "../src/lib/catalog/stable-registry-production-plan";
import {
  databaseHostClass,
  environmentIdentityMatches,
  PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
} from "../src/lib/catalog/stable-registry-production-plan";
import {
  classifyStableRegistryProduction,
  toPlanInputs,
  verifyStableRegistryProduction,
} from "../src/server/stable-registry/production-rollout-repository";

import {
  isMutatingPhase,
  PRODUCTION_ROLLOUT_SCHEMA_VERSION,
  runProductionPhase,
  type ProductionRolloutReceipt,
} from "./prove-stable-registry-production";

/**
 * The only module in OVE-259 that opens a real connection.
 *
 * It reads. Applying a phase that would change production state is refused here
 * as well as in the pure admission check, so a future edit to one layer cannot
 * silently unlock a write on its own.
 */
export async function runLiveProductionPhase(input: {
  phase: StableRegistryProductionPhase;
  environment: string;
  confirmEnvironment: string;
  approvedPlanDigest: string | null;
}): Promise<ProductionRolloutReceipt> {
  // A developer's local env file has no business in a production command. It is
  // loaded only for a non-production run; for production the operator supplies
  // the credentials, and the identity guard below refuses whatever disagrees
  // with the declared environment.
  if (input.environment !== "production") {
    loadEnv({ path: ".env.local", quiet: true });
  }

  // Reuse the app's own connection resolution so a managed production
  // instance's TLS/CA contract is honoured rather than re-derived here.
  const resolution = resolveDatabaseConnection(process.env);

  // The declared environment must match the database actually reached, and this
  // is checked before a connection is opened rather than after: a receipt whose
  // `environmentClass` disagrees with the rows behind it is worse than no
  // receipt, because it reads as proof. `.env.local` outranks an injected
  // production value in env resolution, so a `--environment production` command
  // run from a developer checkout otherwise reads localhost and says
  // "production".
  const hostClass = databaseHostClass(resolution.connectionString);
  const identity = environmentIdentityMatches({
    environment: input.environment,
    hostClass,
  });
  if (!identity.matches) {
    return {
      schemaVersion: PRODUCTION_ROLLOUT_SCHEMA_VERSION,
      phase: input.phase,
      status: "blocked",
      terminalClass: "blocked",
      environmentClass:
        input.environment === "production" ? "production" : "fixture",
      databaseHostClass: hostClass,
      approvalStatus: "pending",
      approvalReason: "no_approval_recorded",
      blockedReasons: [identity.reason ?? "environment_identity_mismatch"],
      activationToPickerBudgetMs: PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
      controls: {
        abortBeforeApplyEnabled: true,
        productionStatusCommandEnabled: true,
      },
    };
  }

  const pool = new Pool({
    connectionString: resolvePgConnectionString(process.env, resolution),
    ssl: resolveDatabaseSslConfig(process.env, resolution),
    max: 1,
  });
  const database = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  try {
    const classification = await classifyStableRegistryProduction(database);
    const planInputs = toPlanInputs({
      classification,
      deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
      releasePolicyVersion: "ove255.foundation.v1",
      storageHeadroomClass: readCapacityClass(),
      backupFreshnessClass: readBackupClass(),
    });

    // Every live receipt names the database it actually read, so a reader never
    // has to trust the declared environment alone.
    const receipt = {
      ...runProductionPhase({
        phase: input.phase,
        environment: input.environment,
        confirmEnvironment: input.confirmEnvironment,
        planInputs,
        approvedPlanDigest: input.approvedPlanDigest,
      }),
      databaseHostClass: hostClass,
    };

    if (isMutatingPhase(input.phase) && receipt.status === "pass") {
      // Belt and braces. The pure admission check already refuses an
      // unapproved mutating phase; this harness additionally has no apply
      // implementation, so an approved digest alone still cannot write.
      return {
        ...receipt,
        status: "blocked",
        terminalClass: "blocked",
        blockedReasons: ["apply_execution_not_implemented_in_this_harness"],
      };
    }

    if (input.phase === "verify") {
      const verification = await verifyStableRegistryProduction(database);
      return {
        ...receipt,
        parityGap: verification.projectionParityGap,
        orphanedObjectCount: verification.orphanedObjectCount,
        userRowsMutated: verification.userRowsMutated,
      };
    }

    return receipt;
  } finally {
    await database.destroy();
  }
}

function readCapacityClass(): CapacityClass {
  const value = process.env.STABLE_REGISTRY_STORAGE_HEADROOM_CLASS;
  return value === "sufficient" || value === "marginal"
    ? value
    : // Unknown headroom is treated as insufficient: a plan must never be
      // approved against a capacity nobody measured.
      "insufficient";
}

function readBackupClass(): BackupClass {
  const value = process.env.STABLE_REGISTRY_BACKUP_FRESHNESS_CLASS;
  return value === "fresh" || value === "stale" ? value : "unknown";
}

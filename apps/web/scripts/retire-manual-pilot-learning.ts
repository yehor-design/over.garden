import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

loadEnv({ path: ".env.local", override: false });

export const RETIRED_RELATION = "public.pilot_interview_learnings" as const;
export const APPROVED_AUTHORIZATION_RECEIPT_DIGEST =
  "522a4ddb33603840b76160351e75d24db5a0220bef268c6ee82a8f251a53dec0" as const;
export const APPROVED_ENVIRONMENT_BINDING_DIGEST =
  "f8605495309948c9729e73c96c9dcf1d542b2c1983cf691a98fb90436be6fe3b" as const;
export const APPROVED_SCHEMA_SHAPE_DIGEST =
  "43d409207c85e573f4462e7d2ecd3441b73d2860021c544c4fd4d9eceab0fda5" as const;
export const ABSENT_SCHEMA_SHAPE_DIGEST = createHash("sha256")
  .update(`absent\0${RETIRED_RELATION}`)
  .digest("hex");

const MIGRATION_FILE = "0020_ove299_remove_manual_pilot_learning.sql";
const EXACT_MIGRATION_SQL =
  "drop table if exists public.pilot_interview_learnings;";
const APPROVED_PRODUCTION_DATABASE_HOST =
  "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com";
const APPROVED_PRODUCTION_DATABASE_PORT = "25060";
const APPROVED_PRODUCTION_DATABASE_NAME = "defaultdb";
const ADVISORY_LOCK_KEY = 299_020;
const PROCESS_DEADLINE_MS = 30_000;
const READ_STATEMENT_TIMEOUT_MS = 5_000;
const APPLY_STATEMENT_TIMEOUT_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const SHA_40 = /^[0-9a-f]{40}$/;
const SHA_256 = /^[0-9a-f]{64}$/;

const EXPECTED_COLUMNS = [
  ["id", "uuid", true, "uuid"],
  ["recorded_by_user_id", "uuid", true, "none"],
  ["subject_user_id", "uuid", false, "none"],
  ["pilot_cohort", "text", false, "none"],
  ["segment", "text", true, "none"],
  ["activation_result", "text", true, "none"],
  ["return_reason", "text", true, "none"],
  ["main_objection", "text", true, "none"],
  ["observed_value", "text", true, "none"],
  ["next_action", "text", true, "none"],
  ["redacted_note", "text", false, "none"],
  ["recorded_at", "timestamp with time zone", true, "now"],
  ["created_at", "timestamp with time zone", true, "now"],
  ["updated_at", "timestamp with time zone", true, "now"],
] as const;

export type RetirementEnvironment = "local" | "production";
export type RouteAbsenceClass = "unproved" | "exact_404";
export type RetirementState =
  | "unstarted"
  | "classified"
  | "authorized"
  | "code_deployed"
  | "applying"
  | "completed"
  | "already_completed"
  | "failed";

export interface RetirementSnapshot {
  tableExists: boolean;
  rowCount: number;
  columnCount: number;
  constraintCount: number;
  incomingForeignKeyCount: number;
  viewDependencyCount: number;
  schemaShapeDigest: string;
}

export interface ManualPilotLearningRetirementPlanV1 extends RetirementSnapshot {
  version: 1;
  environment: RetirementEnvironment;
  implementationSha: string;
  migrationDigest: string;
  authorizationReceiptDigest: string;
  environmentBindingDigest: string;
  routeAbsenceClass: RouteAbsenceClass;
  state: RetirementState;
  evidenceDigest: string;
}

interface BuildRetirementPlanInput {
  environment: RetirementEnvironment;
  implementationSha: string;
  migrationDigest: string;
  authorizationReceiptDigest: string;
  environmentBindingDigest: string;
  routeAbsenceClass: RouteAbsenceClass;
  snapshot: RetirementSnapshot;
}

interface CliOptions {
  mode: "plan" | "apply";
  environment: RetirementEnvironment;
  implementationSha: string;
  routeAbsenceClass: RouteAbsenceClass;
  expectedPlanDigest?: string;
}

interface ColumnShapeRow {
  column_name: string;
  formatted_type: string;
  not_null: boolean;
  default_expression: string | null;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function isApprovedProductionDatabaseTarget(
  connectionString: string,
): boolean {
  try {
    const url = new URL(connectionString);
    return (
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      url.hostname === APPROVED_PRODUCTION_DATABASE_HOST &&
      url.port === APPROVED_PRODUCTION_DATABASE_PORT &&
      decodeURIComponent(url.pathname) ===
        `/${APPROVED_PRODUCTION_DATABASE_NAME}`
    );
  } catch {
    return false;
  }
}

function canonicalPlanPayload(
  plan: Omit<ManualPilotLearningRetirementPlanV1, "evidenceDigest">,
) {
  return JSON.stringify(plan);
}

function withEvidenceDigest(
  plan: Omit<ManualPilotLearningRetirementPlanV1, "evidenceDigest">,
): ManualPilotLearningRetirementPlanV1 {
  return {
    ...plan,
    evidenceDigest: sha256(
      `overgarden.ove299.manual-pilot-learning-retirement.v1\0${canonicalPlanPayload(plan)}`,
    ),
  };
}

function snapshotMatchesApproval(snapshot: RetirementSnapshot) {
  return (
    snapshot.tableExists &&
    snapshot.rowCount === 0 &&
    snapshot.columnCount === EXPECTED_COLUMNS.length &&
    snapshot.constraintCount === 20 &&
    snapshot.incomingForeignKeyCount === 0 &&
    snapshot.viewDependencyCount === 0 &&
    snapshot.schemaShapeDigest === APPROVED_SCHEMA_SHAPE_DIGEST
  );
}

function inputMatchesApproval(input: BuildRetirementPlanInput) {
  return (
    input.environment === "production" &&
    SHA_40.test(input.implementationSha) &&
    SHA_256.test(input.migrationDigest) &&
    input.authorizationReceiptDigest ===
      APPROVED_AUTHORIZATION_RECEIPT_DIGEST &&
    input.environmentBindingDigest === APPROVED_ENVIRONMENT_BINDING_DIGEST &&
    input.routeAbsenceClass === "exact_404"
  );
}

export function buildRetirementPlan(
  input: BuildRetirementPlanInput,
): ManualPilotLearningRetirementPlanV1 {
  const approvedInput = inputMatchesApproval(input);
  const state: RetirementState = !approvedInput
    ? "failed"
    : !input.snapshot.tableExists
      ? input.snapshot.schemaShapeDigest === ABSENT_SCHEMA_SHAPE_DIGEST
        ? "already_completed"
        : "failed"
      : snapshotMatchesApproval(input.snapshot)
        ? "code_deployed"
        : "failed";

  return withEvidenceDigest({
    version: 1,
    environment: input.environment,
    implementationSha: input.implementationSha,
    migrationDigest: input.migrationDigest,
    authorizationReceiptDigest: input.authorizationReceiptDigest,
    environmentBindingDigest: input.environmentBindingDigest,
    tableExists: input.snapshot.tableExists,
    rowCount: input.snapshot.rowCount,
    columnCount: input.snapshot.columnCount,
    constraintCount: input.snapshot.constraintCount,
    incomingForeignKeyCount: input.snapshot.incomingForeignKeyCount,
    viewDependencyCount: input.snapshot.viewDependencyCount,
    schemaShapeDigest: input.snapshot.schemaShapeDigest,
    routeAbsenceClass: input.routeAbsenceClass,
    state,
  });
}

function withState(
  plan: ManualPilotLearningRetirementPlanV1,
  state: RetirementState,
) {
  const { evidenceDigest: _discarded, ...payload } = plan;
  void _discarded;
  return withEvidenceDigest({ ...payload, state });
}

function defaultKind(expression: string | null) {
  if (!expression) return "none";
  if (/^gen_random_uuid\(\)$/.test(expression)) return "uuid";
  if (/^now\(\)$/.test(expression)) return "now";
  return "other";
}

function columnsMatchApproval(columns: ColumnShapeRow[]) {
  if (columns.length !== EXPECTED_COLUMNS.length) return false;
  return columns.every((column, index) => {
    const expected = EXPECTED_COLUMNS[index];
    return (
      expected !== undefined &&
      column.column_name === expected[0] &&
      column.formatted_type === expected[1] &&
      column.not_null === expected[2] &&
      defaultKind(column.default_expression) === expected[3]
    );
  });
}

function observedShapeDigest(
  columns: ColumnShapeRow[],
  constraintCount: number,
) {
  if (columnsMatchApproval(columns) && constraintCount === 20) {
    return APPROVED_SCHEMA_SHAPE_DIGEST;
  }
  return sha256(
    JSON.stringify({
      relation: RETIRED_RELATION,
      columns: columns.map((column) => ({
        name: column.column_name,
        type: column.formatted_type,
        notNull: column.not_null,
        defaultKind: defaultKind(column.default_expression),
      })),
      constraintCount,
    }),
  );
}

async function readSnapshot(client: PoolClient): Promise<RetirementSnapshot> {
  const relation = await client.query<{ table_exists: boolean }>({
    text: "select to_regclass('public.pilot_interview_learnings') is not null as table_exists",
  });
  const tableExists = relation.rows[0]?.table_exists === true;
  if (!tableExists) {
    return {
      tableExists: false,
      rowCount: 0,
      columnCount: 0,
      constraintCount: 0,
      incomingForeignKeyCount: 0,
      viewDependencyCount: 0,
      schemaShapeDigest: ABSENT_SCHEMA_SHAPE_DIGEST,
    };
  }

  const [rows, columns, constraints, incomingForeignKeys, viewDependencies] =
    await Promise.all([
      client.query<{ row_count: string }>({
        text: "select count(*)::text as row_count from public.pilot_interview_learnings",
      }),
      client.query<ColumnShapeRow>({
        text: `
          select
            attribute.attname as column_name,
            format_type(attribute.atttypid, attribute.atttypmod) as formatted_type,
            attribute.attnotnull as not_null,
            pg_get_expr(default_value.adbin, default_value.adrelid) as default_expression
          from pg_attribute attribute
          left join pg_attrdef default_value
            on default_value.adrelid = attribute.attrelid
           and default_value.adnum = attribute.attnum
          where attribute.attrelid = 'public.pilot_interview_learnings'::regclass
            and attribute.attnum > 0
            and not attribute.attisdropped
          order by attribute.attnum
        `,
      }),
      client.query<{ constraint_count: string }>({
        text: `
          select count(*)::text as constraint_count
          from pg_constraint
          where conrelid = 'public.pilot_interview_learnings'::regclass
        `,
      }),
      client.query<{ incoming_foreign_key_count: string }>({
        text: `
          select count(*)::text as incoming_foreign_key_count
          from pg_constraint
          where contype = 'f'
            and confrelid = 'public.pilot_interview_learnings'::regclass
        `,
      }),
      client.query<{ view_dependency_count: string }>({
        text: `
          select count(distinct dependent_class.oid)::text as view_dependency_count
          from pg_depend dependency
          join pg_rewrite rewrite on rewrite.oid = dependency.objid
          join pg_class dependent_class on dependent_class.oid = rewrite.ev_class
          where dependency.refobjid = 'public.pilot_interview_learnings'::regclass
            and dependent_class.relkind in ('v', 'm')
        `,
      }),
    ]);

  const constraintCount = Number(constraints.rows[0]?.constraint_count ?? -1);
  return {
    tableExists: true,
    rowCount: Number(rows.rows[0]?.row_count ?? -1),
    columnCount: columns.rows.length,
    constraintCount,
    incomingForeignKeyCount: Number(
      incomingForeignKeys.rows[0]?.incoming_foreign_key_count ?? -1,
    ),
    viewDependencyCount: Number(
      viewDependencies.rows[0]?.view_dependency_count ?? -1,
    ),
    schemaShapeDigest: observedShapeDigest(columns.rows, constraintCount),
  };
}

function parseOptions(args: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("invalid_input");
    values.set(key.slice(2), value);
  }

  const mode = values.get("mode");
  const environment = values.get("environment");
  const implementationSha = values.get("implementation-sha") ?? "";
  const routeAbsenceClass = values.get("route-absence-class");
  const expectedPlanDigest = values.get("expected-plan-digest");

  if (
    (mode !== "plan" && mode !== "apply") ||
    (environment !== "local" && environment !== "production") ||
    !SHA_40.test(implementationSha) ||
    (routeAbsenceClass !== "unproved" && routeAbsenceClass !== "exact_404") ||
    (mode === "apply" && !SHA_256.test(expectedPlanDigest ?? ""))
  ) {
    throw new Error("invalid_input");
  }

  return {
    mode,
    environment,
    implementationSha,
    routeAbsenceClass,
    expectedPlanDigest,
  };
}

async function loadMigration() {
  const migrationPath = path.resolve("sql", MIGRATION_FILE);
  const sql = await readFile(migrationPath, "utf8");
  if (sql.trim() !== EXACT_MIGRATION_SQL) throw new Error("migration_drift");
  return { sql, digest: sha256(sql) };
}

async function runPlan(
  client: PoolClient,
  options: CliOptions,
  migrationDigest: string,
) {
  await client.query("begin isolation level repeatable read read only");
  try {
    await client.query(
      `set local statement_timeout = '${READ_STATEMENT_TIMEOUT_MS}ms'`,
    );
    const snapshot = await readSnapshot(client);
    await client.query("commit");
    return buildRetirementPlan({
      environment: options.environment,
      implementationSha: options.implementationSha,
      migrationDigest,
      authorizationReceiptDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
      environmentBindingDigest: APPROVED_ENVIRONMENT_BINDING_DIGEST,
      routeAbsenceClass: options.routeAbsenceClass,
      snapshot,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function runApply(
  client: PoolClient,
  options: CliOptions,
  migration: { sql: string; digest: string },
) {
  if (options.environment !== "production") throw new Error("invalid_input");
  await client.query("begin isolation level repeatable read");
  try {
    await client.query(`set local lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
    await client.query(
      `set local statement_timeout = '${APPLY_STATEMENT_TIMEOUT_MS}ms'`,
    );
    await client.query({
      text: "select pg_advisory_xact_lock($1)",
      values: [ADVISORY_LOCK_KEY],
    });
    const relation = await client.query<{ table_exists: boolean }>({
      text: "select to_regclass('public.pilot_interview_learnings') is not null as table_exists",
    });
    if (relation.rows[0]?.table_exists === true) {
      await client.query(
        "lock table public.pilot_interview_learnings in access exclusive mode",
      );
    }

    const snapshot = await readSnapshot(client);
    const plan = buildRetirementPlan({
      environment: options.environment,
      implementationSha: options.implementationSha,
      migrationDigest: migration.digest,
      authorizationReceiptDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
      environmentBindingDigest: APPROVED_ENVIRONMENT_BINDING_DIGEST,
      routeAbsenceClass: options.routeAbsenceClass,
      snapshot,
    });

    if (plan.state === "already_completed") {
      await client.query("commit");
      return plan;
    }
    if (
      plan.state !== "code_deployed" ||
      plan.evidenceDigest !== options.expectedPlanDigest
    ) {
      throw new Error("plan_drift");
    }

    await client.query({
      text: migration.sql,
    });
    const postApply = await readSnapshot(client);
    if (postApply.tableExists) throw new Error("verification_failed");
    await client.query("commit");
    return withState(
      buildRetirementPlan({
        environment: options.environment,
        implementationSha: options.implementationSha,
        migrationDigest: migration.digest,
        authorizationReceiptDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
        environmentBindingDigest: APPROVED_ENVIRONMENT_BINDING_DIGEST,
        routeAbsenceClass: options.routeAbsenceClass,
        snapshot: postApply,
      }),
      "completed",
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function main() {
  let destroyConnection = false;
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  try {
    const options = parseOptions(process.argv.slice(2));
    const resolution = resolveDatabaseConnection();
    const connectionString = resolvePgConnectionString(process.env, resolution);
    if (!connectionString) throw new Error("database_unavailable");
    if (
      options.environment === "production" &&
      !isApprovedProductionDatabaseTarget(connectionString)
    ) {
      throw new Error("environment_drift");
    }
    const migration = await loadMigration();

    pool = new Pool({
      connectionString,
      ssl: resolveDatabaseSslConfig(process.env, resolution),
      max: 1,
      connectionTimeoutMillis: READ_STATEMENT_TIMEOUT_MS,
      query_timeout: APPLY_STATEMENT_TIMEOUT_MS,
    });
    client = await pool.connect();

    const deadline = new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        destroyConnection = true;
        reject(new Error("deadline_exceeded"));
      }, PROCESS_DEADLINE_MS).unref();
    });
    const operation =
      options.mode === "plan"
        ? runPlan(client, options, migration.digest)
        : runApply(client, options, migration);
    const receipt = await Promise.race([operation, deadline]);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    if (receipt.state === "failed") process.exitCode = 1;
  } catch {
    destroyConnection = true;
    process.stdout.write('{"version":1,"state":"failed"}\n');
    process.exitCode = 1;
  } finally {
    client?.release(destroyConnection);
    await pool?.end().catch(() => undefined);
  }
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) void main();

import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
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

loadEnv({ path: ".env.local", override: false, quiet: true });

export const APPROVED_AUTHORIZATION_RECEIPT_DIGEST =
  "fc250128d02809526becee2d3b83c3c8406b2321f2c04c4b6b0f8a2d4498fe55" as const;

const MIGRATION_FILE = "0021_ove314_retire_obsolete_control_plane.sql";
const RETIRED_GRANT_RELATION = "public.pilot_invite_grants";
const APPROVED_PRODUCTION_DATABASE_HOST =
  "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com";
const APPROVED_PRODUCTION_DATABASE_PORT = "25060";
const APPROVED_PRODUCTION_DATABASE_NAME = "defaultdb";
const RETIRED_VERCEL_ENV_NAME = "PILOT_INVITE_SIGNING_SECRET";
const RETIRED_VERCEL_ENVIRONMENTS = [
  "production",
  "preview",
  "development",
] as const;
const APPROVED_INVITE_GRANT_COUNT = 43;
const APPROVED_CLOSED_PILOT_GRANT_COUNT = 6;
const APPROVED_FOUNDER_REHEARSAL_GRANT_COUNT = 37;
const APPROVED_OUTBOX_COUNT = 0;
const APPROVED_HINTED_OUTBOX_COUNT = 0;
const APPROVED_UNFINISHED_HINTED_OUTBOX_COUNT = 0;
const APPROVED_GRANT_CONSTRAINT_COUNT = 9;
const ADVISORY_LOCK_KEY = 314_021;
const PROCESS_DEADLINE_MS = 30_000;
export const RETIREMENT_LOCK_TIMEOUT_MS = 5_000;
const READ_STATEMENT_TIMEOUT_MS = 5_000;
const APPLY_STATEMENT_TIMEOUT_MS = 30_000;
const SHA_40 = /^[0-9a-f]{40}$/;
const SHA_256 = /^[0-9a-f]{64}$/;

const EXPECTED_GRANT_COLUMNS = [
  ["user_id", "uuid", true, "none"],
  ["cohort", "text", true, "closed_pilot"],
  ["segment", "text", true, "unknown_segment"],
  ["granted_at", "timestamp with time zone", true, "now"],
  ["created_at", "timestamp with time zone", true, "now"],
  ["updated_at", "timestamp with time zone", true, "now"],
] as const;

const APPROVED_SCHEMA_SHAPE_PAYLOAD = JSON.stringify({
  relation: RETIRED_GRANT_RELATION,
  columns: EXPECTED_GRANT_COLUMNS,
  constraintCount: APPROVED_GRANT_CONSTRAINT_COUNT,
  outboxHintColumns: [
    ["cohort", "text", false],
    ["segment", "text", false],
  ],
});

export const APPROVED_SCHEMA_SHAPE_DIGEST = sha256(
  APPROVED_SCHEMA_SHAPE_PAYLOAD,
);
export const ABSENT_SCHEMA_SHAPE_DIGEST = sha256(
  JSON.stringify({
    relation: RETIRED_GRANT_RELATION,
    state: "absent",
    outboxHintColumns: "absent",
    constraints: "narrowed",
  }),
);
export const APPROVED_ENVIRONMENT_BINDING_DIGEST = sha256(
  JSON.stringify({
    environment: "production",
    database: {
      host: APPROVED_PRODUCTION_DATABASE_HOST,
      port: APPROVED_PRODUCTION_DATABASE_PORT,
      name: APPROVED_PRODUCTION_DATABASE_NAME,
    },
    vercel: {
      name: RETIRED_VERCEL_ENV_NAME,
      environments: RETIRED_VERCEL_ENVIRONMENTS,
    },
  }),
);

export type RetirementEnvironment = "production";
export type RouteAbsenceClass = "unproved" | "exact_404";
export type MenuContractClass = "unproved" | "sealed_owner_exact_four";
export type VercelEnvTargetClass =
  | "unproved"
  | "present_all"
  | "absent_all"
  | "mixed";
export type RetirementState =
  | "unstarted"
  | "classified"
  | "authorized"
  | "code_deployed"
  | "applying_database"
  | "database_completed"
  | "applying_provider"
  | "completed"
  | "already_completed"
  | "failed";

export interface ObsoleteControlPlaneRetirementPlanV1 {
  version: 1;
  environment: RetirementEnvironment;
  implementationSha: string;
  migrationDigest: string;
  authorizationReceiptDigest: string;
  environmentBindingDigest: string;
  inviteGrantCount: number;
  closedPilotGrantCount: number;
  founderRehearsalGrantCount: number;
  outboxCount: number;
  hintedOutboxCount: number;
  unfinishedHintedOutboxCount: number;
  incomingForeignKeyCount: number;
  viewDependencyCount: number;
  schemaShapeDigest: string;
  routeAbsenceClass: RouteAbsenceClass;
  menuContractClass: MenuContractClass;
  vercelEnvTargetClass: VercelEnvTargetClass;
  state: RetirementState;
  evidenceDigest: string;
}

interface ProtectedCounts {
  authUsers: number;
  journalEntries: number;
  plantObjects: number;
  mediaAssets: number;
}

export interface RetirementSnapshot {
  grantTableExists: boolean;
  outboxHintColumnsExist: boolean;
  inviteGrantCount: number;
  closedPilotGrantCount: number;
  founderRehearsalGrantCount: number;
  outboxCount: number;
  hintedOutboxCount: number;
  unfinishedHintedOutboxCount: number;
  incomingForeignKeyCount: number;
  viewDependencyCount: number;
  schemaShapeDigest: string;
  retiredAttributionCount: number;
  orphanGrantCount: number;
  protectedCounts: ProtectedCounts;
}

interface BuildPlanInput {
  environment: RetirementEnvironment;
  implementationSha: string;
  migrationDigest: string;
  authorizationReceiptDigest: string;
  environmentBindingDigest: string;
  routeAbsenceClass: RouteAbsenceClass;
  menuContractClass: MenuContractClass;
  vercelEnvTargetClass: VercelEnvTargetClass;
  implementationContained: boolean;
  vercelReadySha: string;
  snapshot: RetirementSnapshot;
}

export interface CliOptions {
  mode: "plan" | "apply";
  environment: RetirementEnvironment;
  implementationSha: string;
  approvalDigest?: string;
}

interface ColumnShapeRow {
  column_name: string;
  formatted_type: string;
  not_null: boolean;
  default_expression: string | null;
}

interface NamedConstraintRow {
  constraint_name: string;
  constraint_definition: string;
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
  plan: Omit<ObsoleteControlPlaneRetirementPlanV1, "evidenceDigest">,
) {
  return JSON.stringify(plan);
}

function withEvidenceDigest(
  plan: Omit<ObsoleteControlPlaneRetirementPlanV1, "evidenceDigest">,
): ObsoleteControlPlaneRetirementPlanV1 {
  return {
    ...plan,
    evidenceDigest: sha256(
      `overgarden.ove314.obsolete-control-plane-retirement.v1\0${canonicalPlanPayload(plan)}`,
    ),
  };
}

function withState(
  plan: ObsoleteControlPlaneRetirementPlanV1,
  state: RetirementState,
) {
  const { evidenceDigest: _discarded, ...payload } = plan;
  void _discarded;
  return withEvidenceDigest({ ...payload, state });
}

function proofMatchesApproval(input: BuildPlanInput) {
  return (
    input.environment === "production" &&
    SHA_40.test(input.implementationSha) &&
    SHA_256.test(input.migrationDigest) &&
    input.authorizationReceiptDigest ===
      APPROVED_AUTHORIZATION_RECEIPT_DIGEST &&
    input.environmentBindingDigest === APPROVED_ENVIRONMENT_BINDING_DIGEST &&
    input.routeAbsenceClass === "exact_404" &&
    input.menuContractClass === "sealed_owner_exact_four" &&
    input.implementationContained &&
    input.vercelReadySha === input.implementationSha
  );
}

function snapshotMatchesApprovedApply(snapshot: RetirementSnapshot) {
  return (
    snapshot.grantTableExists &&
    snapshot.outboxHintColumnsExist &&
    snapshot.inviteGrantCount === APPROVED_INVITE_GRANT_COUNT &&
    snapshot.closedPilotGrantCount === APPROVED_CLOSED_PILOT_GRANT_COUNT &&
    snapshot.founderRehearsalGrantCount ===
      APPROVED_FOUNDER_REHEARSAL_GRANT_COUNT &&
    snapshot.outboxCount === APPROVED_OUTBOX_COUNT &&
    snapshot.hintedOutboxCount === APPROVED_HINTED_OUTBOX_COUNT &&
    snapshot.unfinishedHintedOutboxCount ===
      APPROVED_UNFINISHED_HINTED_OUTBOX_COUNT &&
    snapshot.incomingForeignKeyCount === 0 &&
    snapshot.viewDependencyCount === 0 &&
    snapshot.schemaShapeDigest === APPROVED_SCHEMA_SHAPE_DIGEST &&
    snapshot.orphanGrantCount === 0
  );
}

function snapshotMatchesCompletedDatabase(snapshot: RetirementSnapshot) {
  return (
    !snapshot.grantTableExists &&
    !snapshot.outboxHintColumnsExist &&
    snapshot.inviteGrantCount === 0 &&
    snapshot.closedPilotGrantCount === 0 &&
    snapshot.founderRehearsalGrantCount === 0 &&
    snapshot.hintedOutboxCount === 0 &&
    snapshot.unfinishedHintedOutboxCount === 0 &&
    snapshot.incomingForeignKeyCount === 0 &&
    snapshot.viewDependencyCount === 0 &&
    snapshot.schemaShapeDigest === ABSENT_SCHEMA_SHAPE_DIGEST &&
    snapshot.retiredAttributionCount === 0 &&
    snapshot.orphanGrantCount === 0
  );
}

export function buildRetirementPlan(
  input: BuildPlanInput,
): ObsoleteControlPlaneRetirementPlanV1 {
  const proofApproved = proofMatchesApproval(input);
  const state: RetirementState = !proofApproved
    ? "failed"
    : snapshotMatchesApprovedApply(input.snapshot) &&
        input.vercelEnvTargetClass === "present_all"
      ? "code_deployed"
      : snapshotMatchesCompletedDatabase(input.snapshot) &&
          input.vercelEnvTargetClass === "absent_all"
        ? "already_completed"
        : snapshotMatchesCompletedDatabase(input.snapshot) &&
            input.vercelEnvTargetClass === "present_all"
          ? "database_completed"
          : "failed";

  return withEvidenceDigest({
    version: 1,
    environment: input.environment,
    implementationSha: input.implementationSha,
    migrationDigest: input.migrationDigest,
    authorizationReceiptDigest: input.authorizationReceiptDigest,
    environmentBindingDigest: input.environmentBindingDigest,
    inviteGrantCount: input.snapshot.inviteGrantCount,
    closedPilotGrantCount: input.snapshot.closedPilotGrantCount,
    founderRehearsalGrantCount: input.snapshot.founderRehearsalGrantCount,
    outboxCount: input.snapshot.outboxCount,
    hintedOutboxCount: input.snapshot.hintedOutboxCount,
    unfinishedHintedOutboxCount: input.snapshot.unfinishedHintedOutboxCount,
    incomingForeignKeyCount: input.snapshot.incomingForeignKeyCount,
    viewDependencyCount: input.snapshot.viewDependencyCount,
    schemaShapeDigest: input.snapshot.schemaShapeDigest,
    routeAbsenceClass: input.routeAbsenceClass,
    menuContractClass: input.menuContractClass,
    vercelEnvTargetClass: input.vercelEnvTargetClass,
    state,
  });
}

function defaultKind(expression: string | null) {
  if (!expression) return "none";
  if (/^now\(\)$/.test(expression)) return "now";
  if (/^'closed_pilot'::text$/.test(expression)) return "closed_pilot";
  if (/^'unknown_segment'::text$/.test(expression)) return "unknown_segment";
  return "other";
}

function observedActiveShapeDigest(
  grantColumns: ColumnShapeRow[],
  constraintCount: number,
  hintColumns: ColumnShapeRow[],
) {
  const grantColumnsMatch =
    grantColumns.length === EXPECTED_GRANT_COLUMNS.length &&
    grantColumns.every((column, index) => {
      const expected = EXPECTED_GRANT_COLUMNS[index];
      return (
        expected !== undefined &&
        column.column_name === expected[0] &&
        column.formatted_type === expected[1] &&
        column.not_null === expected[2] &&
        defaultKind(column.default_expression) === expected[3]
      );
    });
  const hintColumnsMatch =
    hintColumns.length === 2 &&
    hintColumns[0]?.column_name === "cohort" &&
    hintColumns[0]?.formatted_type === "text" &&
    hintColumns[0]?.not_null === false &&
    hintColumns[1]?.column_name === "segment" &&
    hintColumns[1]?.formatted_type === "text" &&
    hintColumns[1]?.not_null === false;

  if (
    grantColumnsMatch &&
    hintColumnsMatch &&
    constraintCount === APPROVED_GRANT_CONSTRAINT_COUNT
  ) {
    return APPROVED_SCHEMA_SHAPE_DIGEST;
  }

  return sha256(
    JSON.stringify({
      relation: RETIRED_GRANT_RELATION,
      columns: grantColumns.map((column) => [
        column.column_name,
        column.formatted_type,
        column.not_null,
        defaultKind(column.default_expression),
      ]),
      constraintCount,
      outboxHintColumns: hintColumns.map((column) => [
        column.column_name,
        column.formatted_type,
        column.not_null,
      ]),
    }),
  );
}

function narrowedConstraintsMatch(rows: NamedConstraintRow[]) {
  const definitions = new Map(
    rows.map((row) => [
      row.constraint_name,
      row.constraint_definition.toLowerCase(),
    ]),
  );
  const actor =
    definitions.get("learning_actor_attributions_actor_class_check") ?? "";
  const source =
    definitions.get("learning_actor_attributions_source_check") ?? "";
  const outbox =
    definitions.get("learning_attribution_outbox_error_class_check") ?? "";
  const admin = definitions.get("admin_role_audit_log_reason_check") ?? "";

  return (
    [
      "real_self_serve",
      "production_smoke",
      "visual_fixture",
      "editorial_seed",
      "automated_bot",
    ].every((value) => actor.includes(value)) &&
    !/real_closed_pilot|founder_rehearsal/.test(actor) &&
    ["producer", "operator_plan", "self_serve_default"].every((value) =>
      source.includes(value),
    ) &&
    !source.includes("pilot_grant") &&
    ["transient", "missing_user", "max_attempts"].every((value) =>
      outbox.includes(value),
    ) &&
    !outbox.includes("invalid_hint") &&
    admin.includes("operator_delegation") &&
    !admin.includes("pilot_operator_delegation")
  );
}

async function readProtectedCounts(
  client: PoolClient,
): Promise<ProtectedCounts> {
  const result = await client.query<{
    auth_users: string;
    journal_entries: string;
    plant_objects: string;
    media_assets: string;
  }>({
    text: `
      select
        (select count(*)::text from "user") as auth_users,
        (select count(*)::text from journal_entries) as journal_entries,
        (select count(*)::text from plant_objects) as plant_objects,
        (select count(*)::text from media_assets) as media_assets
    `,
  });
  const row = result.rows[0];
  return {
    authUsers: Number(row?.auth_users ?? -1),
    journalEntries: Number(row?.journal_entries ?? -1),
    plantObjects: Number(row?.plant_objects ?? -1),
    mediaAssets: Number(row?.media_assets ?? -1),
  };
}

export async function readSnapshot(
  client: PoolClient,
): Promise<RetirementSnapshot> {
  const relations = await client.query<{
    grant_table_exists: boolean;
    cohort_column_exists: boolean;
    segment_column_exists: boolean;
  }>({
    text: `
      select
        to_regclass('public.pilot_invite_grants') is not null as grant_table_exists,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'learning_attribution_outbox'
            and column_name = 'cohort'
        ) as cohort_column_exists,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'learning_attribution_outbox'
            and column_name = 'segment'
        ) as segment_column_exists
    `,
  });
  const relation = relations.rows[0];
  const grantTableExists = relation?.grant_table_exists === true;
  const outboxHintColumnsExist =
    relation?.cohort_column_exists === true &&
    relation?.segment_column_exists === true;

  let inviteGrantCount = 0;
  let closedPilotGrantCount = 0;
  let founderRehearsalGrantCount = 0;
  let incomingForeignKeyCount = 0;
  let viewDependencyCount = 0;
  let orphanGrantCount = 0;
  let grantConstraintCount = 0;
  let grantColumns: ColumnShapeRow[] = [];

  if (grantTableExists) {
    const counts = await client.query<{
      invite_grant_count: string;
      closed_pilot_grant_count: string;
      founder_rehearsal_grant_count: string;
      orphan_grant_count: string;
    }>({
      text: `
        select
          count(*)::text as invite_grant_count,
          count(*) filter (where grants.cohort = 'closed_pilot')::text
            as closed_pilot_grant_count,
          count(*) filter (where grants.cohort = 'founder_rehearsal')::text
            as founder_rehearsal_grant_count,
          count(*) filter (where auth_user.id is null)::text as orphan_grant_count
        from public.pilot_invite_grants grants
        left join "user" auth_user on auth_user.id = grants.user_id
      `,
    });
    const countRow = counts.rows[0];
    inviteGrantCount = Number(countRow?.invite_grant_count ?? -1);
    closedPilotGrantCount = Number(countRow?.closed_pilot_grant_count ?? -1);
    founderRehearsalGrantCount = Number(
      countRow?.founder_rehearsal_grant_count ?? -1,
    );
    orphanGrantCount = Number(countRow?.orphan_grant_count ?? -1);

    const columns = await client.query<ColumnShapeRow>({
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
        where attribute.attrelid = 'public.pilot_invite_grants'::regclass
          and attribute.attnum > 0
          and not attribute.attisdropped
        order by attribute.attnum
      `,
    });
    grantColumns = columns.rows;

    const dependencies = await client.query<{
      constraint_count: string;
      incoming_foreign_key_count: string;
      view_dependency_count: string;
    }>({
      text: `
        select
          (select count(*)::text from pg_constraint
            where conrelid = 'public.pilot_invite_grants'::regclass)
            as constraint_count,
          (select count(*)::text from pg_constraint
            where contype = 'f'
              and confrelid = 'public.pilot_invite_grants'::regclass)
            as incoming_foreign_key_count,
          (select count(distinct dependent_class.oid)::text
            from pg_depend dependency
            join pg_rewrite rewrite on rewrite.oid = dependency.objid
            join pg_class dependent_class on dependent_class.oid = rewrite.ev_class
            where dependency.refobjid = 'public.pilot_invite_grants'::regclass
              and dependent_class.relkind in ('v', 'm'))
            as view_dependency_count
      `,
    });
    const dependencyRow = dependencies.rows[0];
    grantConstraintCount = Number(dependencyRow?.constraint_count ?? -1);
    incomingForeignKeyCount = Number(
      dependencyRow?.incoming_foreign_key_count ?? -1,
    );
    viewDependencyCount = Number(dependencyRow?.view_dependency_count ?? -1);
  }

  let outboxCount = 0;
  let hintedOutboxCount = 0;
  let unfinishedHintedOutboxCount = 0;
  let hintColumns: ColumnShapeRow[] = [];
  if (outboxHintColumnsExist) {
    const counts = await client.query<{
      outbox_count: string;
      hinted_outbox_count: string;
      unfinished_hinted_outbox_count: string;
    }>({
      text: `
        select
          count(*)::text as outbox_count,
          count(*) filter (
            where cohort is not null or segment is not null
          )::text as hinted_outbox_count,
          count(*) filter (
            where (cohort is not null or segment is not null)
              and state not in ('attributed', 'dead', 'cancelled')
          )::text as unfinished_hinted_outbox_count
        from learning_attribution_outbox
      `,
    });
    const countRow = counts.rows[0];
    outboxCount = Number(countRow?.outbox_count ?? -1);
    hintedOutboxCount = Number(countRow?.hinted_outbox_count ?? -1);
    unfinishedHintedOutboxCount = Number(
      countRow?.unfinished_hinted_outbox_count ?? -1,
    );
    const columns = await client.query<ColumnShapeRow>({
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
        where attribute.attrelid = 'public.learning_attribution_outbox'::regclass
          and attribute.attname in ('cohort', 'segment')
          and attribute.attnum > 0
          and not attribute.attisdropped
        order by attribute.attnum
      `,
    });
    hintColumns = columns.rows;
  } else {
    const counts = await client.query<{ outbox_count: string }>({
      text: "select count(*)::text as outbox_count from learning_attribution_outbox",
    });
    outboxCount = Number(counts.rows[0]?.outbox_count ?? -1);
  }

  const retiredAttribution = await client.query<{
    retired_attribution_count: string;
  }>({
    text: `
      select (
        (select count(*) from learning_actor_attributions
          where actor_class in ('real_closed_pilot', 'founder_rehearsal')
             or source = 'pilot_grant')
        +
        (select count(*) from analytics_events
          where properties ->> 'actor_class' in (
            'self_serve', 'closed_pilot', 'real_closed_pilot',
            'founder_rehearsal', 'editorial'
          )
             or properties ->> 'activation_source' = 'invited_cohort'
             or properties ->> 'source_surface_kind' = 'invite')
      )::text as retired_attribution_count
    `,
  });
  const retiredAttributionCount = Number(
    retiredAttribution.rows[0]?.retired_attribution_count ?? -1,
  );

  const constraints = await client.query<NamedConstraintRow>({
    text: `
      select
        constraint_name,
        pg_get_constraintdef(pg_constraint.oid) as constraint_definition
      from information_schema.table_constraints
      join pg_constraint on pg_constraint.conname = constraint_name
      where constraint_schema = 'public'
        and constraint_name in (
          'learning_actor_attributions_actor_class_check',
          'learning_actor_attributions_source_check',
          'learning_attribution_outbox_error_class_check',
          'admin_role_audit_log_reason_check'
        )
      order by constraint_name
    `,
  });
  const erasureDefault = await client.query<{
    default_expression: string | null;
  }>({
    text: `
      select pg_get_expr(default_value.adbin, default_value.adrelid)
        as default_expression
      from pg_attribute attribute
      left join pg_attrdef default_value
        on default_value.adrelid = attribute.attrelid
       and default_value.adnum = attribute.attnum
      where attribute.attrelid = 'public.erasure_requests'::regclass
        and attribute.attname = 'intake_disclosure_version'
    `,
  });

  const schemaShapeDigest = grantTableExists
    ? observedActiveShapeDigest(grantColumns, grantConstraintCount, hintColumns)
    : !outboxHintColumnsExist &&
        narrowedConstraintsMatch(constraints.rows) &&
        erasureDefault.rows[0]?.default_expression?.includes(
          "erasure-request-mvp-v1",
        )
      ? ABSENT_SCHEMA_SHAPE_DIGEST
      : sha256(
          JSON.stringify({
            relation: RETIRED_GRANT_RELATION,
            state: grantTableExists ? "present" : "absent",
            outboxHintColumnsExist,
            constraintNames: constraints.rows.map((row) => row.constraint_name),
            erasureDefaultClass:
              erasureDefault.rows[0]?.default_expression?.includes(
                "erasure-request-mvp-v1",
              ) === true
                ? "current"
                : "drifted",
          }),
        );

  return {
    grantTableExists,
    outboxHintColumnsExist,
    inviteGrantCount,
    closedPilotGrantCount,
    founderRehearsalGrantCount,
    outboxCount,
    hintedOutboxCount,
    unfinishedHintedOutboxCount,
    incomingForeignKeyCount,
    viewDependencyCount,
    schemaShapeDigest,
    retiredAttributionCount,
    orphanGrantCount,
    protectedCounts: await readProtectedCounts(client),
  };
}

export function parseOptions(args: string[]): CliOptions {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const values = new Map<string, string>();
  let mode: CliOptions["mode"] | undefined;

  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index];
    if (argument === "--plan" || argument === "--apply") {
      if (mode) throw new Error("invalid_input");
      mode = argument === "--plan" ? "plan" : "apply";
      continue;
    }
    if (
      argument !== "--environment" &&
      argument !== "--confirm-environment" &&
      argument !== "--implementation-sha" &&
      argument !== "--approval-digest"
    ) {
      throw new Error("invalid_input");
    }
    if (values.has(argument)) throw new Error("invalid_input");
    const value = normalized[index + 1];
    if (!value || value.startsWith("--")) throw new Error("invalid_input");
    values.set(argument, value);
    index += 1;
  }

  const environment = values.get("--environment");
  const confirmedEnvironment = values.get("--confirm-environment");
  const implementationSha = values.get("--implementation-sha") ?? "";
  const approvalDigest = values.get("--approval-digest");
  if (
    !mode ||
    environment !== "production" ||
    confirmedEnvironment !== environment ||
    !SHA_40.test(implementationSha) ||
    (mode === "plan" && approvalDigest !== undefined) ||
    (mode === "apply" &&
      approvalDigest !== APPROVED_AUTHORIZATION_RECEIPT_DIGEST)
  ) {
    throw new Error("invalid_input");
  }

  return {
    mode,
    environment,
    implementationSha,
    approvalDigest,
  };
}

function readProofEnvironment(
  options: CliOptions,
): Omit<
  BuildPlanInput,
  | "environment"
  | "implementationSha"
  | "migrationDigest"
  | "authorizationReceiptDigest"
  | "environmentBindingDigest"
  | "snapshot"
> {
  const routeAbsenceClass = process.env.OVE314_ROUTE_ABSENCE_CLASS;
  const menuContractClass = process.env.OVE314_MENU_CONTRACT_CLASS;
  const vercelEnvTargetClass = process.env.OVE314_VERCEL_ENV_TARGET_CLASS;
  const containedSha = process.env.OVE314_CONTAINED_IMPLEMENTATION_SHA;
  const vercelReadySha = process.env.OVE314_VERCEL_READY_SHA ?? "";

  return {
    routeAbsenceClass:
      routeAbsenceClass === "exact_404" ? "exact_404" : "unproved",
    menuContractClass:
      menuContractClass === "sealed_owner_exact_four"
        ? "sealed_owner_exact_four"
        : "unproved",
    vercelEnvTargetClass:
      vercelEnvTargetClass === "present_all" ||
      vercelEnvTargetClass === "absent_all" ||
      vercelEnvTargetClass === "mixed"
        ? vercelEnvTargetClass
        : "unproved",
    implementationContained: containedSha === options.implementationSha,
    vercelReadySha,
  };
}

async function loadMigration() {
  const migrationPath = path.resolve("sql", MIGRATION_FILE);
  const sql = await readFile(migrationPath, "utf8");
  for (const marker of [
    "drop table if exists public.pilot_invite_grants",
    "drop column if exists cohort",
    "drop column if exists segment",
    "real_self_serve",
    "production_smoke",
    "self_serve_default",
  ]) {
    if (!sql.includes(marker)) throw new Error("migration_drift");
  }
  return { sql, digest: sha256(sql) };
}

function buildInput(
  options: CliOptions,
  migrationDigest: string,
  snapshot: RetirementSnapshot,
): BuildPlanInput {
  return {
    environment: options.environment,
    implementationSha: options.implementationSha,
    migrationDigest,
    authorizationReceiptDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
    environmentBindingDigest: APPROVED_ENVIRONMENT_BINDING_DIGEST,
    ...readProofEnvironment(options),
    snapshot,
  };
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
    return buildRetirementPlan(buildInput(options, migrationDigest, snapshot));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

function protectedCountsMatch(before: ProtectedCounts, after: ProtectedCounts) {
  return (
    before.authUsers === after.authUsers &&
    before.journalEntries === after.journalEntries &&
    before.plantObjects === after.plantObjects &&
    before.mediaAssets === after.mediaAssets
  );
}

async function runApply(
  client: PoolClient,
  options: CliOptions,
  migration: { sql: string; digest: string },
) {
  await client.query("begin isolation level repeatable read");
  try {
    await client.query(
      `set local lock_timeout = '${RETIREMENT_LOCK_TIMEOUT_MS}ms'`,
    );
    await client.query(
      `set local statement_timeout = '${APPLY_STATEMENT_TIMEOUT_MS}ms'`,
    );
    await client.query({
      text: "select pg_advisory_xact_lock($1)",
      values: [ADVISORY_LOCK_KEY],
    });
    const relation = await client.query<{ table_exists: boolean }>({
      text: "select to_regclass('public.pilot_invite_grants') is not null as table_exists",
    });
    if (relation.rows[0]?.table_exists === true) {
      await client.query(
        "lock table public.pilot_invite_grants in access exclusive mode",
      );
    }
    await client.query(`
      lock table
        learning_actor_attributions,
        learning_attribution_outbox,
        analytics_events,
        admin_role_audit_log,
        erasure_requests
      in share row exclusive mode
    `);

    const before = await readSnapshot(client);
    const plan = buildRetirementPlan(
      buildInput(options, migration.digest, before),
    );
    if (
      plan.state === "database_completed" ||
      plan.state === "already_completed"
    ) {
      await client.query("commit");
      return withState(plan, "already_completed");
    }
    if (plan.state !== "code_deployed") throw new Error("plan_drift");

    const applying = withState(plan, "applying_database");
    if (applying.state !== "applying_database") {
      throw new Error("state_transition_failed");
    }
    await client.query({ text: migration.sql });
    const after = await readSnapshot(client);
    if (
      !snapshotMatchesCompletedDatabase(after) ||
      !protectedCountsMatch(before.protectedCounts, after.protectedCounts)
    ) {
      throw new Error("verification_failed");
    }
    await client.query("commit");
    return withState(
      buildRetirementPlan(buildInput(options, migration.digest, after)),
      "database_completed",
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

export async function runWithinDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
): Promise<T> {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new Error("invalid_deadline");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("deadline_exceeded"));
        }, deadlineMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function measureBoundedLockWait(
  operation: (signal: AbortSignal) => Promise<void>,
  timeoutMs = RETIREMENT_LOCK_TIMEOUT_MS,
) {
  const boundedTimeoutMs = Math.min(timeoutMs, RETIREMENT_LOCK_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    await runWithinDeadline(operation, boundedTimeoutMs);
    return {
      state: "completed" as const,
      durationMs: performance.now() - startedAt,
    };
  } catch {
    return {
      state: "failed" as const,
      durationMs: performance.now() - startedAt,
    };
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
    if (!isApprovedProductionDatabaseTarget(connectionString)) {
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
    const operation =
      options.mode === "plan"
        ? runPlan(client, options, migration.digest)
        : runApply(client, options, migration);
    const receipt = await runWithinDeadline(async (signal) => {
      signal.addEventListener(
        "abort",
        () => {
          destroyConnection = true;
        },
        { once: true },
      );
      return operation;
    }, PROCESS_DEADLINE_MS);
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

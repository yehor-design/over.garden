/**
 * Enqueue one `catalog_reconcile` run for the deployed worker.
 *
 * The ladder (ADR-0026 D4) runs in the worker against the production
 * database, and nothing in the web app enqueues it: the sources page enqueues
 * refreshes, the digest cron enqueues nothing, and a reconciliation happened
 * only when an operator inserted the row by hand — which is how the four
 * public objects on production stayed free-text labels beside their own cards
 * until OVE-435. This is the plain command the runbook names
 * (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 4.4), inserting the `job_queue`
 * row through the same builder the repository exposes, with the idempotency
 * key that makes one run per scope and source at a time.
 *
 * From `apps/web`:
 *
 *   pnpm exec tsx scripts/enqueue-catalog-reconcile.ts --scope labels
 *   pnpm exec tsx scripts/enqueue-catalog-reconcile.ts --scope source_records \
 *     --source eppo-codes --since 2026-09-01T00:00:00Z
 *   pnpm exec tsx scripts/enqueue-catalog-reconcile.ts --scope labels \
 *     --env-file /abs/path/prod.env --environment production \
 *     --confirm-environment production --allow-non-local-mutation
 *
 * It prints the job's id and status, and the queue depth beside it. Never a
 * connection string: the receipt names the host class and the database.
 */
// The repository this reaches through is `server-only`, and a script is not a
// server component (see `enqueue-catalog-source-refresh.ts`).
import "./neutralise-server-only";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import {
  buildEnqueueCatalogReconcileJobQuery,
  type CatalogReconcileScope,
} from "../src/server/catalog-curation-repository";
import { assertEnqueueEnvironment } from "./enqueue-catalog-source-refresh";

export interface EnqueueReconcileArgs {
  scope: CatalogReconcileScope;
  sourceSlug: string | null;
  since: Date | null;
  envFile: string | undefined;
  environment: "local" | "production";
  confirmEnvironment: string | undefined;
  allowNonLocalMutation: boolean;
}

/** The closed set the job-queue payload constraint and the worker both hold. */
const RECONCILE_SCOPES: readonly CatalogReconcileScope[] = [
  "labels",
  "source_records",
  "duplicates",
];
/** The slug shape the job-queue payload constraint accepts. */
const SOURCE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function parseEnqueueReconcileArgs(
  argv: readonly string[],
): EnqueueReconcileArgs {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const scope = valueFor("--scope");
  if (!scope || !RECONCILE_SCOPES.includes(scope as CatalogReconcileScope)) {
    throw new Error("enqueue_scope_invalid");
  }
  const sourceSlug = valueFor("--source") ?? null;
  if (sourceSlug !== null && !SOURCE_SLUG_PATTERN.test(sourceSlug)) {
    throw new Error("enqueue_source_slug_invalid");
  }
  // A source narrows the source-records scope; the other two read everything.
  if (sourceSlug !== null && scope !== "source_records") {
    throw new Error("enqueue_source_slug_needs_source_records_scope");
  }
  const sinceText = valueFor("--since");
  const since = sinceText === undefined ? null : new Date(sinceText);
  if (since !== null && Number.isNaN(since.getTime())) {
    throw new Error("enqueue_since_invalid");
  }
  if (since !== null && scope !== "source_records") {
    throw new Error("enqueue_since_needs_source_records_scope");
  }
  const environment = valueFor("--environment") ?? "local";
  if (environment !== "local" && environment !== "production") {
    throw new Error("enqueue_environment_invalid");
  }
  return {
    scope: scope as CatalogReconcileScope,
    sourceSlug,
    since,
    envFile: valueFor("--env-file"),
    environment,
    confirmEnvironment: valueFor("--confirm-environment"),
    allowNonLocalMutation: argv.includes("--allow-non-local-mutation"),
  };
}

async function main() {
  const args = parseEnqueueReconcileArgs(process.argv.slice(2));
  if (args.envFile) loadEnv({ path: args.envFile, override: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("enqueue_database_url_missing");
  const { databaseHostClass } = assertEnqueueEnvironment(
    args,
    connectionString,
  );
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    const enqueued = await buildEnqueueCatalogReconcileJobQuery(db, {
      scope: args.scope,
      sourceSlug: args.sourceSlug,
      since: args.since,
    }).executeTakeFirstOrThrow();
    const state = await sql<{
      database: string;
      pending: number;
      processing: number;
    }>`
      select current_database() as database,
             count(*) filter (where status = 'pending')::int as pending,
             count(*) filter (where status = 'processing')::int as processing
      from job_queue
      where queue_name = 'matching'
    `.execute(db);
    process.stdout.write(
      `${JSON.stringify(
        {
          class: "catalog_reconcile_enqueued",
          environment: args.environment,
          databaseHostClass,
          database: state.rows[0]?.database,
          scope: args.scope,
          sourceSlug: args.sourceSlug,
          since: args.since?.toISOString() ?? null,
          jobId: enqueued.id,
          jobStatus: enqueued.status,
          pending: state.rows[0]?.pending ?? 0,
          processing: state.rows[0]?.processing ?? 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await db.destroy();
  }
}

const isEntrypoint =
  process.argv[1]?.endsWith("enqueue-catalog-reconcile.ts") === true;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "catalog_reconcile_enqueue_error",
        errorClass:
          error instanceof Error && /^[a-z0-9_]+$/u.test(error.message)
            ? error.message
            : "unknown_error",
      })}\n`,
    );
    process.exitCode = 1;
  });
}

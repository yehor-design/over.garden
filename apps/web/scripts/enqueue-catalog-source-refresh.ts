/**
 * Enqueue one `catalog_source_refresh` job for the deployed worker.
 *
 * Source ingests and reconciliations run through the worker against the
 * production database, and this is the other half the runbook names: a plain
 * command that inserts the `job_queue` row with its idempotency key
 * (`docs/ORGANISM_GRAPH_EXECUTION.md`, section 4.4). The owner's sources page
 * enqueues the same row through the same builder; neither writes anything the
 * other cannot.
 *
 * From `apps/web`:
 *
 *   pnpm exec tsx scripts/enqueue-catalog-source-refresh.ts --source eppo-codes
 *   pnpm exec tsx scripts/enqueue-catalog-source-refresh.ts --source eppo-codes \
 *     --env-file /abs/path/prod.env --environment production \
 *     --confirm-environment production --allow-non-local-mutation
 *
 * It prints the job's id and status, and the queue depth beside it. Never a
 * connection string: the receipt names the host class and the database.
 */
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import { buildEnqueueCatalogSourceRefreshJobQuery } from "../src/server/catalog-curation-repository";
import { classifyDatabaseHost } from "./apply-reviewed-migration";

export interface EnqueueSourceRefreshArgs {
  sourceSlug: string;
  envFile: string | undefined;
  environment: "local" | "production";
  confirmEnvironment: string | undefined;
  allowNonLocalMutation: boolean;
}

/** The slug shape the job-queue payload constraint accepts. */
const SOURCE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function parseEnqueueSourceRefreshArgs(
  argv: readonly string[],
): EnqueueSourceRefreshArgs {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const sourceSlug = valueFor("--source");
  if (!sourceSlug || !SOURCE_SLUG_PATTERN.test(sourceSlug)) {
    throw new Error("enqueue_source_slug_invalid");
  }
  const environment = valueFor("--environment") ?? "local";
  if (environment !== "local" && environment !== "production") {
    throw new Error("enqueue_environment_invalid");
  }
  return {
    sourceSlug,
    envFile: valueFor("--env-file"),
    environment,
    confirmEnvironment: valueFor("--confirm-environment"),
    allowNonLocalMutation: argv.includes("--allow-non-local-mutation"),
  };
}

/** Loopback unless the operator said production out loud, twice and by flag. */
export function assertEnqueueEnvironment(
  args: EnqueueSourceRefreshArgs,
  connectionString: string,
): { databaseHostClass: string } {
  const hostClass = classifyDatabaseHost(new URL(connectionString).hostname);
  if (hostClass === "loopback") {
    if (args.environment !== "local") {
      throw new Error("enqueue_local_database_refused");
    }
    return { databaseHostClass: hostClass };
  }
  if (
    args.environment !== "production" ||
    args.confirmEnvironment !== "production" ||
    !args.allowNonLocalMutation
  ) {
    throw new Error("enqueue_non_local_mutation_refused");
  }
  return { databaseHostClass: hostClass };
}

async function main() {
  const args = parseEnqueueSourceRefreshArgs(process.argv.slice(2));
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
    const enqueued = await buildEnqueueCatalogSourceRefreshJobQuery(
      db,
      args.sourceSlug,
    ).executeTakeFirstOrThrow();
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
          class: "catalog_source_refresh_enqueued",
          environment: args.environment,
          databaseHostClass,
          database: state.rows[0]?.database,
          sourceSlug: args.sourceSlug,
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
  process.argv[1]?.endsWith("enqueue-catalog-source-refresh.ts") === true;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "catalog_source_refresh_enqueue_error",
        errorClass:
          error instanceof Error && /^[a-z0-9_]+$/u.test(error.message)
            ? error.message
            : "unknown_error",
      })}\n`,
    );
    process.exitCode = 1;
  });
}

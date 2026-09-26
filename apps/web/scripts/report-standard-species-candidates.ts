/**
 * The candidates for the next version of the standard species base (OVE-530,
 * ADR-0035 D3, "Growth").
 *
 * Two read-only lists, most frequent first:
 *
 *   * the gardeners' own species texts — objects with no catalogue organism
 *     whose label a gardener typed (`variety_state = 'free_text'`), by kind;
 *   * the picker's search misses — queries that ended without a pick, by
 *     language and kind.
 *
 * A text reaches the report only when at least two gardeners typed it (own
 * texts) or it was missed at least twice (queries), so no one person's label
 * is printed. New cultivars and breeds belong on the owner's list (29.21),
 * not here; this report names species the base may be missing. It writes
 * nothing, and it has no interface.
 *
 * From `apps/web`:
 *
 *   pnpm exec tsx scripts/report-standard-species-candidates.ts
 *   pnpm exec tsx scripts/report-standard-species-candidates.ts \
 *     --env-file /abs/path/prod.env --environment production \
 *     --confirm-environment production --limit 50
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

export const MIN_GARDENERS = 2;

export function parseCandidateReportArgs(argv: readonly string[]) {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const environment = valueFor("--environment") ?? "local";
  if (environment !== "local" && environment !== "production") {
    throw new Error("candidates_environment_invalid");
  }
  if ((valueFor("--confirm-environment") ?? environment) !== environment) {
    throw new Error("candidates_environment_not_confirmed");
  }
  const limit = Number(valueFor("--limit") ?? 50);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("candidates_limit_invalid");
  }
  return { envFile: valueFor("--env-file"), environment, limit } as const;
}

async function main() {
  const args = parseCandidateReportArgs(process.argv.slice(2));
  if (args.envFile) loadEnv({ path: args.envFile, override: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("candidates_database_url_missing");
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(
    new URL(connectionString).hostname,
  );
  if (loopback !== (args.environment === "local"))
    throw new Error("candidates_environment_mismatch");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    const report = await db.transaction().execute(async (trx) => {
      await sql`set transaction read only`.execute(trx);
      await sql`set local statement_timeout = '20s'`.execute(trx);
      const ownTexts = await sql<{
        kind: string;
        text: string;
        gardeners: number;
        objects: number;
      }>`
        select object.object_kind as kind,
               min(object.variety_text) as text,
               count(distinct object.owner_user_id)::int as gardeners,
               count(*)::int as objects
        from plant_objects as object
        where object.catalog_item_id is null
          and object.variety_state = 'free_text'
          and object.variety_text is not null
        group by object.object_kind, catalog_normalize_name(object.variety_text)
        having count(distinct object.owner_user_id) >= ${MIN_GARDENERS}
        order by gardeners desc, objects desc, text
        limit ${args.limit}
      `.execute(trx);
      const misses = await sql<{
        locale: string;
        kind: string;
        query: string;
        occurrences: number;
      }>`
        select locale, object_kind as kind, query_normalized as query, occurrences::int as occurrences
        from catalog_search_misses
        where occurrences >= ${MIN_GARDENERS}
        order by occurrences desc, query_normalized
        limit ${args.limit}
      `.execute(trx);
      return { ownTexts: ownTexts.rows, searchMisses: misses.rows };
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          class: "standard_species_candidates",
          environment: args.environment,
          minimumGardeners: MIN_GARDENERS,
          ...report,
        },
        null,
        1,
      )}\n`,
    );
  } finally {
    await db.destroy();
  }
}

if (
  process.argv[1]?.endsWith("report-standard-species-candidates.ts") === true
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        class: "standard_species_candidates_error",
        detail: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}

import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";
const resolution = resolveDatabaseConnection(process.env);
const connectionString = resolvePgConnectionString(process.env, resolution);
if (!connectionString) throw new Error("missing db");
const pool = new Pool({ connectionString, max: 1, ssl: resolveDatabaseSslConfig(process.env, resolution) });
const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
async function main() {
  const rows = await sql<Record<string, unknown>>`
    select (select count(*)::int from catalog_items) as items,
           (select count(*)::int from catalog_item_identifiers where scheme = 'eppo') as eppo_ids,
           (select count(*)::int from catalog_item_identifiers where scheme = 'col') as col_ids,
           (select count(*)::int from catalog_item_names) as names,
           (select count(*)::int from catalog_curation_queue where state = 'open') as open_queue,
           (select status from job_queue where queue_name = 'matching' and payload->>'kind' = 'catalog_source_refresh' order by created_at desc limit 1) as job_status,
           (select attempts from job_queue where queue_name = 'matching' and payload->>'kind' = 'catalog_source_refresh' order by created_at desc limit 1) as job_attempts,
           pg_size_pretty(pg_database_size(current_database())) as size
  `.execute(db);
  console.log(JSON.stringify(rows.rows[0]));
  await db.destroy();
}
void main();

import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
const resolution = resolveDatabaseConnection(process.env);
const connectionString = resolvePgConnectionString(process.env, resolution);
if (!connectionString) throw new Error("missing db");
const pool = new Pool({ connectionString, max: 1, ssl: resolveDatabaseSslConfig(process.env, resolution) });
const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

async function stage(label: string, statement: string) {
  const started = Date.now();
  const result = await sql.raw(statement).execute(db);
  console.log(JSON.stringify({ stage: label, rows: result.numAffectedRows?.toString() ?? "?", ms: Date.now() - started }));
}

async function main() {
  // The nodes first: every child table cascades from catalog_items, so this
  // one statement removes their names, identifiers, relations, facts, slug
  // history, source links and queue items with them.
  await stage("nodes", "delete from catalog_items where source_id like 'eppo-global-database:%'");
  await stage("names", "delete from catalog_item_names as n using catalog_source_assertions as a where n.assertion_id = a.id and a.source_slug = 'eppo-codes'");
  await stage("identifiers", "delete from catalog_item_identifiers as i using catalog_source_assertions as a where i.assertion_id = a.id and a.source_slug = 'eppo-codes'");
  await stage("facts", "delete from catalog_item_facts as f using catalog_source_assertions as a where f.assertion_id = a.id and a.source_slug = 'eppo-codes'");
  await stage("relations", "delete from catalog_item_relations as r using catalog_source_assertions as a where r.assertion_id = a.id and a.source_slug = 'eppo-codes'");
  await stage("links", "delete from catalog_source_links as l using catalog_source_assertions as a where l.assertion_id = a.id and a.source_slug = 'eppo-codes'");
  await stage("queue", "delete from catalog_curation_queue where item_type = 'source_link' and proposal->>'source_slug' = 'eppo-codes'");
  await stage("assertions", "delete from catalog_source_assertions where source_slug = 'eppo-codes'");
  const after = await sql<{ nodes: number; assertions: number; queue: number }>`
    select (select count(*)::int from catalog_items where source_id like 'eppo-global-database:%') as nodes,
           (select count(*)::int from catalog_source_assertions where source_slug = 'eppo-codes') as assertions,
           (select count(*)::int from catalog_curation_queue where proposal->>'source_slug' = 'eppo-codes') as queue
  `.execute(db);
  console.log(JSON.stringify(after.rows[0]));
  await db.destroy();
}
void main();

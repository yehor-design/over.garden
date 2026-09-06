import "./neutralise-server-only";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import {
  claimCatalogCardIntent,
  countUnconvergedCatalogCardIntents,
  drainCatalogCardIntents,
  recordCatalogCardIntent,
} from "../src/server/catalog-card-outbox";
import { applyMigrationsBefore } from "./prove-organism-graph-foundation";

/**
 * Executed proof of migration 0062 and the card revalidation drain
 * (OVE-389, ADR-0026 D9) against the loopback database:
 *
 *   1. 0062 applies, replays as a no-op, rolls back and re-applies;
 *   2. a journal-entry intent still needs its owner, a catalog_item intent
 *      refuses an owner, a non-`catalog_card` reason and a privacy-reducing
 *      flag (the constraints hold);
 *   3. seeded card intents drain: every organism's tags are revalidated once,
 *      the rows converge, a second write before the drain bumps the
 *      generation, a failing revalidation retries and dead-letters after five
 *      attempts, and the worker's journal-entry drain filter never sees them.
 *
 * `pnpm schema:catalog-card:prove-database`.
 */
const MIGRATION = "0062";
const SQL_ROOT = path.join(process.cwd(), "sql");

async function main() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  // A disposable database, as the other schema proofs use: the scratch volume
  // carries drift that refuses some migrations, and CI bootstraps fresh.
  const disposable = `overgarden_ove389_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 2 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  const receipt: Record<string, unknown> = { migration: MIGRATION, database: "disposable" };
  try {
    await applyMigrationsBefore(pool, targetUrl.toString(), MIGRATION);
    const migrationSql = readFileSync(migrationFile(), "utf8");
    const rollbackSql = readFileSync(rollbackFile(), "utf8");
    receipt.ownerNullableBefore = await columnNullable(pool);

    await pool.query(migrationSql);
    receipt.applied = (await columnNullable(pool)) === true;
    await pool.query(migrationSql);
    receipt.replayNoop = true;
    receipt.constraints = await proveConstraints(pool);

    const itemIds = await seedItems(pool, 3);
    receipt.drain = await proveDrain(db, pool, itemIds);

    await pool.query(rollbackSql);
    receipt.rolledBack = (await columnNullable(pool)) === false;
    await pool.query(migrationSql);
    receipt.reapplied = (await columnNullable(pool)) === true;
    await cleanupItems(pool, itemIds);
    console.log(JSON.stringify({ ok: true, ...receipt }));
  } finally {
    await db.destroy();
    await admin.query(`drop database if exists "${disposable}" with (force)`);
    await admin.end();
  }
}

async function proveConstraints(pool: Pool) {
  const catalogItemId = (await seedItems(pool, 1))[0]!;
  const refused: string[] = [];
  const attempts: Array<[string, string, unknown[]]> = [
    [
      "journal_entry_without_owner",
      `insert into public_projection_intents (entity_kind, entity_id, owner_user_id, desired_state, desired_generation, desired_reason)
       values ('journal_entry', $1::uuid, null, 'present', nextval('public_projection_generation_seq'), 'publish')`,
      [randomUUID()],
    ],
    [
      "catalog_item_with_owner",
      `insert into public_projection_intents (entity_kind, entity_id, owner_user_id, desired_state, desired_generation, desired_reason)
       values ('catalog_item', $1::uuid, $2::uuid, 'present', nextval('public_projection_generation_seq'), 'catalog_card')`,
      [catalogItemId, randomUUID()],
    ],
    [
      "catalog_item_wrong_reason",
      `insert into public_projection_intents (entity_kind, entity_id, owner_user_id, desired_state, desired_generation, desired_reason)
       values ('catalog_item', $1::uuid, null, 'present', nextval('public_projection_generation_seq'), 'publish')`,
      [catalogItemId],
    ],
    [
      "catalog_item_absent",
      `insert into public_projection_intents (entity_kind, entity_id, owner_user_id, desired_state, desired_generation, desired_reason)
       values ('catalog_item', $1::uuid, null, 'absent', nextval('public_projection_generation_seq'), 'catalog_card')`,
      [catalogItemId],
    ],
    [
      "unknown_kind",
      `insert into public_projection_intents (entity_kind, entity_id, owner_user_id, desired_state, desired_generation, desired_reason)
       values ('space', $1::uuid, null, 'present', nextval('public_projection_generation_seq'), 'catalog_card')`,
      [randomUUID()],
    ],
  ];
  for (const [label, sql, params] of attempts) {
    try {
      await pool.query(sql, params);
      throw new Error(`Constraint did not refuse ${label}.`);
    } catch (reason) {
      if (reason instanceof Error && reason.message.startsWith("Constraint did not")) throw reason;
      refused.push(label);
    }
  }
  await cleanupItems(pool, [catalogItemId]);
  return { refused };
}

async function proveDrain(db: Kysely<Database>, pool: Pool, itemIds: string[]) {
  const revalidated: string[] = [];
  const failing = new Set<string>();
  const revalidate = async (catalogItemId: string) => {
    if (failing.has(catalogItemId)) throw new Error("cache unavailable");
    revalidated.push(catalogItemId);
  };
  const generations = await Promise.all(itemIds.map((id) => recordCatalogCardIntent(db, id)));
  const bumped = await recordCatalogCardIntent(db, itemIds[0]!);
  if (BigInt(bumped) <= BigInt(generations[0]!)) throw new Error("A second write did not bump the generation.");

  // The worker's drain filter: journal-entry claims never see a card intent.
  const workerVisible = await pool.query(
    `select count(*)::int as n from public_projection_intents
     where entity_kind = 'journal_entry' and entity_id = any($1::uuid[])`,
    [itemIds],
  );
  if (Number(workerVisible.rows[0]?.n) !== 0) throw new Error("A card intent is visible to the journal-entry drain.");

  const first = await drainCatalogCardIntents({ limit: 10, revalidate }, db);
  const pending = await countUnconvergedCatalogCardIntents(db);
  if (first.length !== itemIds.length || first.some((r) => r.outcome !== "revalidated") || pending !== 0) {
    throw new Error(`First drain did not converge: ${JSON.stringify(first)} pending=${pending}`);
  }
  if (new Set(revalidated).size !== itemIds.length) throw new Error("Not every organism was revalidated exactly once.");
  if (await claimCatalogCardIntent(db)) throw new Error("A converged intent was claimable.");

  // A failing revalidation retries, then dead-letters after five attempts.
  const failingId = itemIds[1]!;
  failing.add(failingId);
  await recordCatalogCardIntent(db, failingId);
  const outcomes: string[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await pool.query(
      `update public_projection_intents set available_at = now() - interval '1 second'
       where entity_kind = 'catalog_item' and entity_id = $1::uuid`,
      [failingId],
    );
    const results = await drainCatalogCardIntents({ limit: 1, revalidate }, db);
    outcomes.push(results[0]?.outcome ?? "none");
  }
  if (JSON.stringify(outcomes) !== JSON.stringify(["retry_scheduled", "retry_scheduled", "retry_scheduled", "retry_scheduled", "dead_lettered"])) {
    throw new Error(`Retry ladder differed: ${JSON.stringify(outcomes)}`);
  }
  const dead = await pool.query(
    `select status, attempts from public_projection_intents where entity_kind = 'catalog_item' and entity_id = $1::uuid`,
    [failingId],
  );
  if (dead.rows[0]?.status !== "dead" || Number(dead.rows[0]?.attempts) !== 5) {
    throw new Error(`Dead letter row differed: ${JSON.stringify(dead.rows[0])}`);
  }
  // A fresh write revives a dead-lettered organism.
  failing.delete(failingId);
  await recordCatalogCardIntent(db, failingId);
  const revived = await drainCatalogCardIntents({ limit: 1, revalidate }, db);
  if (revived[0]?.outcome !== "revalidated") throw new Error("A fresh write did not revive the dead-lettered intent.");

  return {
    seeded: itemIds.length,
    firstDrain: first.map((r) => r.outcome),
    retryLadder: outcomes,
    revivedAfterDeadLetter: true,
    remaining: await countUnconvergedCatalogCardIntents(db),
  };
}

async function seedItems(pool: Pool, count: number) {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = randomUUID();
    await pool.query(
      `insert into catalog_items (id, canonical_name, catalog_kind, normalized_name, public_slug, status, source,
         source_id, locale, node_kind, kingdom, identity_state)
       values ($1, $2, 'species', catalog_normalize_name($2), $3, 'seeded', 'species_backbone', $4, 'la', 'taxon', 'Plantae', 'active')`,
      [id, `Ove389 proof ${id.slice(0, 8)}`, `ove389-proof-${id.slice(0, 8)}`, `species_backbone:ove389:${id}`],
    );
    ids.push(id);
  }
  return ids;
}

async function cleanupItems(pool: Pool, ids: string[]) {
  await pool.query(`delete from public_projection_intents where entity_kind = 'catalog_item' and entity_id = any($1::uuid[])`, [ids]);
  await pool.query(`delete from catalog_items where id = any($1::uuid[])`, [ids]);
}

async function columnNullable(pool: Pool) {
  const result = await pool.query<{ is_nullable: string }>(
    `select is_nullable from information_schema.columns
     where table_name = 'public_projection_intents' and column_name = 'owner_user_id'`,
  );
  return result.rows[0]?.is_nullable === "YES";
}

function migrationFile() {
  return path.join(SQL_ROOT, `${MIGRATION}_ove389_catalog_card_intents.sql`);
}

function rollbackFile() {
  return path.join(SQL_ROOT, "rollback", `${MIGRATION}_ove389_catalog_card_intents.down.sql`);
}

main().catch((reason) => {
  console.error(reason instanceof Error ? reason.message : reason);
  process.exit(1);
});

/**
 * Takes the register numbers out of organism addresses (ADR-0029 D6, OVE-429).
 *
 * `/species/solanum-lycopersicum/advance-ua-register-09040016` is what the
 * ingest pipeline built, and `eu-oj-elietta-393160a01d` is what the other one
 * built. Neither is an address: one carries a state register's application
 * number and the other ten characters of a SHA. ADR-0026 D8 said the slug is
 * the name; the pipeline never implemented it.
 *
 * What this writes: `catalog_items.public_slug`, recomputed from the canonical
 * name through the one slugifier. Nothing else. The `0054` trigger writes
 * `catalog_item_slug_history`, which closes the old address and opens the new
 * one, so every address answers 308 from then on (D8) — and the resolver that
 * reads that history is already in production.
 *
 * `--apply` is required; without it nothing is written and the plan is
 * printed. `--limit` bounds a rehearsal.
 *
 * ## Every statement is bounded
 *
 * One unbounded read once held this managed database at 100% for seven hours
 * and paged the owner. The read is a single indexed scan with a timeout, the
 * writes go in batches with their own, and a batch that overruns fails the
 * batch rather than the database.
 */
import "./neutralise-server-only";

import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { isAddressSlug } from "../src/lib/address/address-contract.generated";
import {
  formSlugFromDenomination,
  speciesSlugFromScientificName,
  type SlugLanguage,
} from "../src/lib/catalog/slugs";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

const BATCH_SIZE = 500;

interface CatalogRow {
  readonly id: string;
  readonly nodeKind: string;
  readonly canonicalName: string;
  readonly locale: string | null;
  readonly publicSlug: string;
}

interface Reslug {
  readonly id: string;
  readonly namespace: "species" | "form";
  readonly from: string;
  readonly to: string;
  readonly canonicalName: string;
}

function parseArgs(argv: readonly string[]) {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const limit = Number(valueFor("--limit") ?? "0");
  return {
    apply: argv.includes("--apply"),
    envFile: valueFor("--env-file"),
    limit: Number.isSafeInteger(limit) && limit > 0 ? limit : null,
  };
}

function slugLanguage(locale: string | null): SlugLanguage {
  if (locale === "uk") return "uk";
  if (locale === "bg") return "bg";
  return "latin";
}

/**
 * The base a row's address is made of. A taxon is its accepted scientific
 * name; a cultivar or a breed is its registered denomination, romanized —
 * `ADR-0026 D8`, unchanged. What changes is that nothing is appended to it.
 */
export function catalogSlugBase(row: CatalogRow): {
  namespace: "species" | "form";
  base: string;
} {
  return row.nodeKind === "taxon"
    ? {
        namespace: "species",
        base: speciesSlugFromScientificName(row.canonicalName),
      }
    : {
        namespace: "form",
        base: formSlugFromDenomination(
          row.canonicalName,
          slugLanguage(row.locale),
        ),
      };
}

export async function planCatalogReslug(
  db: Kysely<Database>,
  limit: number | null,
): Promise<{ moves: Reslug[]; scanned: number; collisions: number }> {
  let query = db
    .selectFrom("catalog_items")
    .select([
      "catalog_items.id as id",
      "catalog_items.node_kind as nodeKind",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.locale as locale",
      "catalog_items.public_slug as publicSlug",
    ])
    .where("catalog_items.public_slug", "is not", null)
    .orderBy("catalog_items.created_at", "asc")
    .orderBy("catalog_items.id", "asc");
  if (limit) query = query.limit(limit);
  const rows = (await query.execute()) as CatalogRow[];

  // Every slug the namespace has ever issued, so a retired address is never
  // handed to a second organism (D6). The history holds one row per slug ever
  // assigned, which is exactly this set.
  const history = await db
    .selectFrom("catalog_item_slug_history")
    .select([
      "catalog_item_slug_history.slug as slug",
      "catalog_item_slug_history.catalog_item_id as catalogItemId",
    ])
    .execute();

  const ownerBySlug = new Map<string, string>();
  for (const row of history) ownerBySlug.set(row.slug, row.catalogItemId);

  const moves: Reslug[] = [];
  let collisions = 0;
  const taken = new Set(ownerBySlug.keys());

  for (const row of rows) {
    const { namespace, base } = catalogSlugBase(row);
    if (!isAddressSlug(namespace, base)) {
      throw new Error(`Refused: ${base} is not a ${namespace} slug.`);
    }
    if (base === row.publicSlug) continue;

    // The row's own current slug does not block it, and neither does any slug
    // it already owns in the history. Walked rather than filtered: copying the
    // taken set per row is O(rows × slugs), which on this catalog is a billion
    // and a half string comparisons and two and a half minutes of them.
    const slug = firstFreeSlug(base, row.id, taken, ownerBySlug);
    if (!isAddressSlug(namespace, slug)) {
      throw new Error(`Refused: ${slug} is not a ${namespace} slug.`);
    }
    // A row already at its target — because the counter lands back on the slug
    // it holds — is not a move, and writing it would churn the history table
    // for nothing.
    if (slug === row.publicSlug) continue;
    if (slug !== base) collisions += 1;
    taken.add(slug);
    ownerBySlug.set(slug, row.id);
    moves.push({
      id: row.id,
      namespace,
      from: row.publicSlug,
      to: slug,
      canonicalName: row.canonicalName,
    });
  }

  return { moves, scanned: rows.length, collisions };
}

async function applyReslug(db: Kysely<Database>, moves: readonly Reslug[]) {
  for (let index = 0; index < moves.length; index += BATCH_SIZE) {
    const batch = moves.slice(index, index + BATCH_SIZE);
    // One transaction per batch, not one for the whole catalog. A hundred
    // thousand updates and their trigger writes in a single transaction is a
    // lock held for minutes on the table every public page reads; a batch that
    // fails leaves the rows before it moved and the rows after it where they
    // were, and every one of them still answers — the old address through the
    // history row, the new one directly.
    await db.transaction().execute(async (trx) => {
      await sql`set local lock_timeout = '10s'`.execute(trx);
      await sql`set local statement_timeout = '60s'`.execute(trx);
      for (const move of batch) {
        await trx
          .updateTable("catalog_items")
          .set({ public_slug: move.to })
          .where("id", "=", move.id)
          .execute();
      }
    });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) loadEnv({ path: args.envFile, override: true });
  else loadEnv({ path: ".env.local", quiet: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("catalog_reslug_database_url_missing");
  const hostname = new URL(connectionString).hostname;
  const hostClass = /\.ondigitalocean\.com$/iu.test(hostname)
    ? "digitalocean_managed"
    : hostname === "localhost" || hostname === "127.0.0.1"
      ? "loopback"
      : "other";

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
    connectionTimeoutMillis: 15_000,
    statement_timeout: undefined,
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    await sql`set statement_timeout = '120s'`.execute(db);
    const database = (
      await sql<{ db: string }>`select current_database() as db`.execute(db)
    ).rows[0]?.db;
    const started = Date.now();
    const { moves, scanned, collisions } = await planCatalogReslug(
      db,
      args.limit,
    );
    if (args.apply) await applyReslug(db, moves);

    console.log(
      JSON.stringify(
        {
          schemaVersion: "overgarden.catalogReslug.v1",
          mode: args.apply ? "apply" : "plan",
          hostClass,
          database,
          scanned,
          moves: moves.length,
          collisions,
          byNamespace: {
            species: moves.filter((move) => move.namespace === "species").length,
            form: moves.filter((move) => move.namespace === "form").length,
          },
          elapsedMs: Date.now() - started,
          speciesMoves: moves
            .filter((move) => move.namespace === "species")
            .map((move) => ({ from: move.from, to: move.to, name: move.canonicalName })),
          sample: moves.slice(0, 12).map((move) => ({
            from: move.from,
            to: move.to,
            name: move.canonicalName,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.destroy().catch(() => undefined);
  }
}

if (process.argv[1]?.endsWith("reslug-catalog-addresses.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

/**
 * The base itself when nothing else holds it, else the first free `-N`
 * (ADR-0029 D6).
 *
 * A slug this row already owns — its current one, or one it used to have —
 * does not block it, which is what keeps a re-run from walking every row one
 * suffix further each time.
 */
function firstFreeSlug(
  base: string,
  catalogItemId: string,
  taken: ReadonlySet<string>,
  ownerBySlug: ReadonlyMap<string, string>,
): string {
  const free = (candidate: string) =>
    !taken.has(candidate) || ownerBySlug.get(candidate) === catalogItemId;
  if (free(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (free(candidate)) return candidate;
  }
  throw new Error(`No free slug for ${base}`);
}

/**
 * Moves every published address under its author (ADR-0029 D9, OVE-428).
 *
 * Migration `0070` is the schema half — the two history tables, their triggers
 * and the passport's slug column. This is the data half, and it is a script
 * rather than SQL for one reason: the slugifier is TypeScript. It normalizes
 * with `NFC`, drops apostrophes before the separator pass, lower-cases in the
 * author's own language and measures its budget after percent-encoding. No SQL
 * expression can do that, and the last attempt to approximate one in Postgres
 * — `\p{Cyrillic}` in migration `0067` — matched the literal letters `p`, `{`,
 * `C` without erroring.
 *
 * What it writes:
 *
 *   * every active entry's `public_slug`, recomputed from its title with the
 *     publish-id suffix dropped;
 *   * a `public_slug` for every object that has at least one public entry.
 *
 * What it does not write: anything else. The history rows are the triggers'
 * work, and they close the old address and open the new one in the same
 * statement, so every address an entry has ever had keeps answering 308 (D8).
 *
 * `--apply` is required. Without it the script prints the whole mapping and
 * changes nothing, which is the form to read before running it for real: the
 * mapping is the part a rollback cannot reconstruct.
 */
import "./neutralise-server-only";

import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { addressManifestEntry } from "../src/lib/address/address-manifest";
import { isAddressSlug } from "../src/lib/address/address-contract.generated";
import { reservedAsTaken, resolveAddressCollision, slugify } from "../src/lib/address/slugify";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { PublicLocale } from "../src/lib/public-localization";

const JOURNAL_ENTRY = addressManifestEntry("journalEntry");
const OBJECT = addressManifestEntry("object");

interface Move {
  readonly kind: "entry" | "object";
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly from: string | null;
  readonly to: string;
}

function parseArgs(argv: readonly string[]) {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return { apply: argv.includes("--apply"), envFile: valueFor("--env-file") };
}

export async function planAddressMoves(db: Kysely<Database>): Promise<Move[]> {
  const entries = await db
    .selectFrom("journal_entries")
    .innerJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .select([
      "journal_entries.id as id",
      "journal_entries.title as title",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.source_language as sourceLanguage",
      "user_handle_registry.normalized_handle as handle",
    ])
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.lifecycle_state", "=", "active")
    .orderBy("journal_entries.published_at", "asc")
    .orderBy("journal_entries.id", "asc")
    .execute();

  const objects = await db
    .selectFrom("plant_objects")
    .innerJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "plant_objects.owner_user_id",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.display_name as displayName",
      "plant_objects.public_slug as publicSlug",
      "user_handle_registry.normalized_handle as handle",
    ])
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("journal_entries")
          .select("journal_entries.id")
          .whereRef(
            "journal_entries.plant_object_id",
            "=",
            "plant_objects.id",
          )
          .where("journal_entries.visibility", "=", "public")
          .where("journal_entries.lifecycle_state", "=", "active")
          .where("journal_entries.public_slug", "is not", null),
      ),
    )
    .orderBy("plant_objects.created_at", "asc")
    .orderBy("plant_objects.id", "asc")
    .execute();

  const moves: Move[] = [];

  // The entry namespace is still platform-unique (migration `0070` says why),
  // so the counter walks the whole set; the object namespace is per gardener,
  // so each gardener gets their own.
  const takenEntrySlugs = new Set<string>();
  for (const entry of entries) {
    const base = slugify(entry.title, {
      script: JOURNAL_ENTRY.script,
      language: (entry.sourceLanguage as PublicLocale | null) ?? "uk",
      budget: JOURNAL_ENTRY.budget,
      fallback: "entry",
    });
    const slug = resolveAddressCollision(
      "journalEntry",
      base,
      reservedAsTaken(JOURNAL_ENTRY.reservedWords, takenEntrySlugs),
    );
    takenEntrySlugs.add(slug);
    if (slug !== entry.publicSlug) {
      moves.push({
        kind: "entry",
        id: entry.id,
        handle: entry.handle,
        title: entry.title,
        from: entry.publicSlug,
        to: slug,
      });
    }
  }

  const takenObjectSlugs = new Map<string, Set<string>>();
  for (const object of objects) {
    const base = slugify(object.displayName, {
      script: OBJECT.script,
      language: "uk",
      budget: OBJECT.budget,
      fallback: "object",
    });
    const taken = takenObjectSlugs.get(object.handle) ?? new Set<string>();
    const slug = resolveAddressCollision(
      "object",
      base,
      reservedAsTaken(OBJECT.reservedWords, taken),
    );
    taken.add(slug);
    takenObjectSlugs.set(object.handle, taken);
    if (slug !== object.publicSlug) {
      moves.push({
        kind: "object",
        id: object.id,
        handle: object.handle,
        title: object.displayName,
        from: object.publicSlug,
        to: slug,
      });
    }
  }

  for (const move of moves) {
    const namespace = move.kind === "entry" ? "journalEntry" : "object";
    if (!isAddressSlug(namespace, move.to)) {
      throw new Error(`Refused: ${move.to} is not a ${namespace} slug.`);
    }
  }

  return moves;
}

async function applyMoves(db: Kysely<Database>, moves: readonly Move[]) {
  // One transaction. The triggers write the history rows, and a half-moved set
  // of addresses is not a state this product should ever be observable in.
  await db.transaction().execute(async (trx) => {
    await sql`set local lock_timeout = '30s'`.execute(trx);
    await sql`set local statement_timeout = '120s'`.execute(trx);
    for (const move of moves) {
      if (move.kind === "entry") {
        await trx
          .updateTable("journal_entries")
          .set({ public_slug: move.to })
          .where("id", "=", move.id)
          // Every row a public surface can render is `active`, and the two
          // NOT VALID lifecycle constraints refuse an UPDATE to any other
          // state — see migration `0067`.
          .where("lifecycle_state", "=", "active")
          .execute();
        continue;
      }
      await trx
        .updateTable("plant_objects")
        .set({ public_slug: move.to })
        .where("id", "=", move.id)
        .execute();
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) loadEnv({ path: args.envFile, override: true });
  else loadEnv({ path: ".env.local", quiet: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("address_move_database_url_missing");
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
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    const database = (
      await sql<{ db: string }>`select current_database() as db`.execute(db)
    ).rows[0]?.db;
    const moves = await planAddressMoves(db);
    if (args.apply) await applyMoves(db, moves);

    console.log(
      JSON.stringify(
        {
          schemaVersion: "overgarden.addressMove.v1",
          mode: args.apply ? "apply" : "plan",
          hostClass,
          database,
          entryMoves: moves.filter((move) => move.kind === "entry").length,
          objectMoves: moves.filter((move) => move.kind === "object").length,
          moves: moves.map((move) => ({
            kind: move.kind,
            from: move.from,
            to: `/@${move.handle}${move.kind === "object" ? "/objects" : ""}/${move.to}`,
            title: move.title,
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

if (process.argv[1]?.endsWith("move-addresses-under-authors.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

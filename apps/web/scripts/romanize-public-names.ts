/**
 * Gives every object passport and every topic that still carries a Cyrillic
 * name its Latin one (ADR-0029 D4, amendment of 2026-09-18, OVE-465).
 *
 * Migration `0077` is the schema half — the topic's name history and the Latin
 * `CHECK`s that wait for this. This is the data half, and it is a script rather
 * than SQL for the reason `move-addresses-under-authors.ts` was: romanization
 * is TypeScript, and it depends on the language a name was written in. The two
 * tables spell the same letters differently — `и` is `y` in Ukrainian and `i`
 * in Bulgarian, `щ` is `shch` and `sht` — so a constant would give a Bulgarian
 * gardener's passport an address in nobody's spelling.
 *
 * **What is romanized is the name the thing already has**, not the display
 * name it was once made from. A slug is frozen at publish (D8): the object may
 * have been renamed since, and its address did not follow then and does not
 * follow now. Romanizing `чорний-принц` gives the same result as romanizing
 * "Чорний принц" — the hyphens are word boundaries to the positional rules for
 * Є, Ї, Й, Ю, Я — so nothing is lost by starting from the slug.
 *
 * What it writes: `plant_objects.public_slug` and `journal_topics.slug`, for
 * rows whose name holds a character outside the Latin alphabet, and then the
 * generated Latin `CHECK` on each column once nothing is left for it to
 * refuse. What it does not write: a history row. The triggers of `0070` and
 * `0077` close the old name and open the new one in the same statement, which
 * is what keeps every old address answering 308.
 *
 * `--apply` is required. Without it the script prints the whole mapping and
 * changes nothing, which is the form to read before running it for real.
 *
 * It cannot revalidate Next's cache — a script has none — so a listing cached
 * before the run keeps linking the Cyrillic names for up to its `cacheLife`.
 * Those links work, through the 308; the next mutation or the cache's own age
 * replaces them.
 *
 *   pnpm address:names:romanize --env-file /abs/path/prod.env
 *   pnpm address:names:romanize --env-file /abs/path/prod.env --apply
 */
import "./neutralise-server-only";

import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { addressManifestEntry } from "../src/lib/address/address-manifest";
import {
  ADDRESS_SLUG_CHECK_SQL,
  isAddressSlug,
} from "../src/lib/address/address-contract.generated";
import {
  reservedAsTaken,
  resolveAddressCollision,
  slugify,
} from "../src/lib/address/slugify";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import {
  publicObjectPassportPath,
  publicTopicPath,
} from "../src/lib/garden/public-paths";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "../src/lib/public-localization";

const OBJECT = addressManifestEntry("object");
const TOPIC = addressManifestEntry("topic");

export interface NameMove {
  readonly kind: "object" | "topic";
  readonly id: string;
  /** The gardener's handle for a passport; `null` for a topic, which has none. */
  readonly handle: string | null;
  readonly language: PublicLocale;
  readonly from: string;
  readonly to: string;
}

function parseArgs(argv: readonly string[]) {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return { apply: argv.includes("--apply"), envFile: valueFor("--env-file") };
}

function asLanguage(value: string | null | undefined): PublicLocale {
  return value === "uk" || value === "bg" || value === "ru"
    ? value
    : DEFAULT_PUBLIC_LOCALE;
}

export async function planNameMoves(db: Kysely<Database>): Promise<NameMove[]> {
  // The language of a passport is the language its gardener first wrote about
  // it in; failing that, the language they first wrote anything in.
  const objects = await sql<{
    id: string;
    ownerUserId: string;
    handle: string | null;
    publicSlug: string;
    language: string | null;
  }>`
    select
      objects.id::text as id,
      objects.owner_user_id::text as "ownerUserId",
      public_author_handle(objects.owner_user_id) as handle,
      objects.public_slug as "publicSlug",
      coalesce(
        (select entries.source_language from journal_entries as entries
          where entries.plant_object_id = objects.id
            and entries.source_language is not null
          order by coalesce(entries.published_at, entries.created_at), entries.id
          limit 1),
        (select entries.source_language from journal_entries as entries
          where entries.owner_user_id = objects.owner_user_id
            and entries.source_language is not null
          order by coalesce(entries.published_at, entries.created_at), entries.id
          limit 1)
      ) as language
    from plant_objects as objects
    where objects.public_slug is not null
    order by objects.owner_user_id, objects.created_at, objects.id
  `.execute(db);

  // Every name a gardener's passports hold or ever held, so the counter walks
  // past an address that still answers 308 (D6, D8).
  const objectHistory = await sql<{ ownerUserId: string; slug: string }>`
    select objects.owner_user_id::text as "ownerUserId", history.slug as slug
    from plant_object_slug_history as history
    join plant_objects as objects on objects.id = history.plant_object_id
  `.execute(db);

  const takenByOwner = new Map<string, Set<string>>();
  const takenFor = (ownerUserId: string) => {
    const existing = takenByOwner.get(ownerUserId);
    if (existing) return existing;
    const created = new Set<string>();
    takenByOwner.set(ownerUserId, created);
    return created;
  };
  for (const object of objects.rows) takenFor(object.ownerUserId).add(object.publicSlug);
  for (const row of objectHistory.rows) takenFor(row.ownerUserId).add(row.slug);

  const moves: NameMove[] = [];
  for (const object of objects.rows) {
    if (isAddressSlug("object", object.publicSlug)) continue;
    const language = asLanguage(object.language);
    const base = slugify(object.publicSlug, {
      script: OBJECT.script,
      language,
      budget: OBJECT.budget,
      fallback: "object",
    });
    const taken = takenFor(object.ownerUserId);
    const to = resolveAddressCollision(
      "object",
      base,
      reservedAsTaken(OBJECT.reservedWords, taken),
    );
    taken.add(to);
    moves.push({
      kind: "object",
      id: object.id,
      handle: object.handle,
      language,
      from: object.publicSlug,
      to,
    });
  }

  // A topic's language is the language of the entry that first carried it.
  const topics = await sql<{ id: string; slug: string; language: string | null }>`
    select
      topics.id::text as id,
      topics.slug as slug,
      (select entries.source_language
         from journal_entry_topic_signals as signals
         join journal_entries as entries on entries.id = signals.journal_entry_id
        where signals.topic_id = topics.id
          and entries.source_language is not null
        order by coalesce(entries.published_at, entries.created_at), entries.id
        limit 1) as language
    from journal_topics as topics
    order by topics.created_at, topics.id
  `.execute(db);
  // The plan is read before `0077` exists as well as after — it is how the
  // owner sees what will move — and before it there is no topic history yet.
  const hasTopicHistory = (
    await sql<{ present: boolean }>`
      select to_regclass('journal_topic_slug_history') is not null as present
    `.execute(db)
  ).rows[0]?.present;
  const topicHistory = hasTopicHistory
    ? await sql<{ slug: string }>`
        select slug from journal_topic_slug_history
      `.execute(db)
    : { rows: [] as { slug: string }[] };

  const takenTopics = new Set<string>([
    ...topics.rows.map((topic) => topic.slug),
    ...topicHistory.rows.map((row) => row.slug),
  ]);
  for (const topic of topics.rows) {
    if (isAddressSlug("topic", topic.slug)) continue;
    const language = asLanguage(topic.language);
    const base = slugify(topic.slug, {
      script: TOPIC.script,
      language,
      budget: TOPIC.budget,
      fallback: `tag-${topic.id.replaceAll("-", "").slice(0, 12)}`,
    });
    const to = resolveAddressCollision(
      "topic",
      base,
      reservedAsTaken(TOPIC.reservedWords, takenTopics),
    );
    takenTopics.add(to);
    moves.push({
      kind: "topic",
      id: topic.id,
      handle: null,
      language,
      from: topic.slug,
      to,
    });
  }

  for (const move of moves) {
    if (!isAddressSlug(move.kind, move.to)) {
      throw new Error(`Refused: ${move.to} is not a ${move.kind} slug.`);
    }
  }
  return moves;
}

/**
 * Applies the moves and then narrows the two columns, in one transaction: a
 * half-romanized set of addresses is not a state this product should ever be
 * observable in, and a `CHECK` that arrived before the last row moved would
 * refuse it.
 */
export async function applyNameMoves(
  db: Kysely<Database>,
  moves: readonly NameMove[],
): Promise<{ checksInstalled: readonly string[] }> {
  return db.transaction().execute(async (trx) => {
    await sql`set local lock_timeout = '30s'`.execute(trx);
    await sql`set local statement_timeout = '120s'`.execute(trx);
    for (const move of moves) {
      if (move.kind === "object") {
        await trx
          .updateTable("plant_objects")
          .set({ public_slug: move.to })
          .where("id", "=", move.id)
          .where("public_slug", "=", move.from)
          .execute();
        continue;
      }
      await trx
        .updateTable("journal_topics")
        .set({ slug: move.to, updated_at: new Date() })
        .where("id", "=", move.id)
        .where("slug", "=", move.from)
        .execute();
    }

    // The generated blocks, verbatim — the same text migration `0077` carries
    // behind its guard. Installed here so that the run ends with the schema
    // saying what the data now is, instead of waiting for a replay of `0077`.
    const checksInstalled: string[] = [];
    for (const constraint of [
      "plant_objects_public_slug_check",
      "journal_topics_slug_check",
    ]) {
      const block = ADDRESS_SLUG_CHECK_SQL[constraint];
      if (!block) throw new Error(`No generated CHECK for ${constraint}.`);
      await sql.raw(block).execute(trx);
      checksInstalled.push(constraint);
    }
    return { checksInstalled };
  });
}

async function topicHistoryExists(db: Kysely<Database>): Promise<boolean> {
  const row = (
    await sql<{ present: boolean }>`
      select to_regclass('journal_topic_slug_history') is not null as present
    `.execute(db)
  ).rows[0];
  return Boolean(row?.present);
}

/**
 * Whether the run may write. A passport's history table has existed since
 * `0070`; a topic's arrives with `0077`, and moving a topic before it would
 * leave its old address answering 404 — so a plan that moves any topic needs
 * the table, and a plan that moves none does not.
 */
function hasTopicHistoryTable(
  moves: readonly NameMove[],
  topicHistoryPresent: boolean,
): boolean {
  return topicHistoryPresent || !moves.some((move) => move.kind === "topic");
}

/**
 * The address a name stands for, as a person reads it: built by the one
 * builder each family has, then decoded, because the whole point of the
 * receipt is to show `чорний-принц` beside `chornyi-prynts` and not thirty
 * percent signs.
 */
function displayAddress(move: NameMove, slug: string): string {
  return decodeURI(
    move.kind === "object"
      ? publicObjectPassportPath(move.handle ?? "unknown", slug)
      : publicTopicPath(slug),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) loadEnv({ path: args.envFile, override: true });
  else loadEnv({ path: ".env.local", quiet: true });
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("romanize_names_database_url_missing");
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
    // The plan reads and nothing else, and says so to the database: a bounded,
    // read-only transaction, so that pointing this at production to *look* can
    // neither write nor hold the single-vCPU instance on a slow statement.
    const moves = await db.connection().execute(async (connection) => {
      await sql`begin read only`.execute(connection);
      try {
        await sql`set local statement_timeout = '30s'`.execute(connection);
        return await planNameMoves(connection as unknown as Kysely<Database>);
      } finally {
        await sql`rollback`.execute(connection);
      }
    });
    if (args.apply && !hasTopicHistoryTable(moves, await topicHistoryExists(db))) {
      throw new Error(
        "romanize_names_needs_0077: apply migration 0077 first, or a topic's old address has no history to answer 308 from.",
      );
    }
    const applied = args.apply ? await applyNameMoves(db, moves) : null;

    console.log(
      JSON.stringify(
        {
          schemaVersion: "overgarden.romanizeNames.v1",
          mode: args.apply ? "apply" : "plan",
          hostClass,
          database,
          objectMoves: moves.filter((move) => move.kind === "object").length,
          topicMoves: moves.filter((move) => move.kind === "topic").length,
          checksInstalled: applied?.checksInstalled ?? [],
          moves: moves.map((move) => ({
            kind: move.kind,
            language: move.language,
            from: displayAddress(move, move.from),
            to: displayAddress(move, move.to),
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

if (process.argv[1]?.endsWith("romanize-public-names.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

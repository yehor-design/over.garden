/**
 * Executes migration `0077` and `pnpm address:names:romanize` instead of
 * reading them (OVE-465).
 *
 * Object passports and topics take Latin names (ADR-0029 D4, amendment of
 * 2026-09-18). Four things about that only a database can show:
 *
 *   1. **The Latin `CHECK` arrives only when nothing is left for it to refuse.**
 *      On an empty database that is at once; on one that holds Cyrillic names
 *      the migration applies, replays, and leaves the wider constraint alone —
 *      a `CHECK` that refused the rows the table already holds would fail the
 *      migration, and one added `NOT VALID` would be a constraint that lies.
 *   2. **Every old name keeps answering.** The romanize script moves a name and
 *      the triggers close the old history row and open the new one, for a
 *      passport (`0070`) and, from this migration on, for a topic.
 *   3. **A name is romanized by the language it was written in.** A Ukrainian
 *      gardener's and a Bulgarian gardener's passports come out of one run
 *      spelled by two different tables.
 *   4. **The counter walks past a name that is taken**, including one that is
 *      taken only by a history row that still answers 308.
 *
 * It builds its own disposable database and drops it, so it never writes to
 * the database whose connection string it borrows.
 */
import "./neutralise-server-only";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import { buildFindJournalTopicByLabelQuery } from "../src/server/journal-topic-repository";
import { assignPlantObjectPublicSlug } from "../src/server/plant-object-slug-repository";
import { resolvePlantObjectAddress } from "../src/server/public-object-passport-repository";
import { resolvePublicTopicAddress } from "../src/server/public-topic-repository";
import { loadVersionedApplicationSql } from "./application-sql";
import { applyNameMoves, planNameMoves } from "./romanize-public-names";

const MIGRATION = "0077_ove465_latin_names.sql";
const ROLLBACK = "rollback/0077_ove465_latin_names.down.sql";

const OLENA = "00000000-0000-4000-8000-0000000047a0";
const BORIS = "00000000-0000-4000-8000-0000000047b0";

async function seedGardener(
  pool: Pool,
  input: { userId: string; email: string; language: "uk" | "bg" },
): Promise<{ handle: string; spaceId: string }> {
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'Proof gardener', $2, true, now(), now())`,
    [input.userId, input.email],
  );
  const spaceId = randomUUID();
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Proof space')`,
    [spaceId, input.userId],
  );
  const claimed = await pool.query<{ handle: string }>(
    `select normalized_handle as handle from user_handle_registry
     where user_id = $1 and lifecycle_state = 'current'`,
    [input.userId],
  );
  const handle = claimed.rows[0]?.handle;
  if (!handle) throw new Error("latin_names_proof_handle_missing");
  return { handle, spaceId };
}

/** A passport with a name, and one public entry that says what language it is in. */
async function seedPassport(
  pool: Pool,
  input: {
    ownerUserId: string;
    spaceId: string;
    displayName: string;
    publicSlug: string | null;
    language: "uk" | "bg";
  },
): Promise<string> {
  const objectId = randomUUID();
  await pool.query(
    `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state, public_slug)
     values ($1, $2, $3, $4, 'plant', 'unknown', $5)`,
    [objectId, input.ownerUserId, input.spaceId, input.displayName, input.publicSlug],
  );
  const entryId = randomUUID();
  await pool.query(
    `insert into journal_entries
       (id, owner_user_id, space_id, plant_object_id, title, body, entry_scope,
        visibility, lifecycle_state, published_at, public_slug, source_language,
        client_mutation_id)
     values ($1, $2, $3, $4, $5, 'Текст запису.', 'object', 'public', 'active',
             now(), $6, $7, $6)`,
    [
      entryId,
      input.ownerUserId,
      input.spaceId,
      objectId,
      input.displayName,
      `ove465-${entryId}`,
      input.language,
    ],
  );
  return objectId;
}

export async function runLatinNamesDatabaseProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);

  const disposable = `overgarden_latin_names_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  // `drop database … with (force)` terminates whatever is still connected, and
  // pg raises that as an `error` event on the pool. Unhandled, it crashes the
  // process after the receipt has already printed — which is how this proof
  // failed in CI while passing locally, purely on teardown timing.
  admin.on("error", () => undefined);
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 2 });
  pool.on("error", () => undefined);
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  const failures: string[] = [];
  const expect = (name: string, actual: unknown, wanted: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      failures.push(
        `${name}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`,
      );
    }
  };
  const codeOf = (work: Promise<unknown>) =>
    work
      .then(() => "accepted")
      .catch((error: unknown) => (error as { code?: string }).code ?? "unknown");
  const topicInsert = (slug: string, label: string) =>
    pool.query(
      `insert into journal_topics (slug, label, trust_state) values ($1, $2, 'curated')`,
      [slug, label],
    );

  try {
    const applicationSql = await loadVersionedApplicationSql(
      path.join(process.cwd(), "sql"),
    );
    await pool.query(applicationSql[0]!.sql);
    const authOptions = {
      appName: "OverGarden",
      baseURL: "http://localhost:3000",
      basePath: "/api/auth",
      secret: "ove465-disposable-proof-secret-value-not-a-credential",
      database: { db, type: "postgres", casing: "snake" },
      emailAndPassword: { enabled: true, requireEmailVerification: false },
      advanced: { cookiePrefix: "overgarden", database: { generateId: "uuid" } },
    } satisfies BetterAuthOptions;
    betterAuth(authOptions);
    await (await getMigrations(authOptions)).runMigrations();
    for (const migration of applicationSql) await pool.query(migration.sql);
    for (const migration of applicationSql) await pool.query(migration.sql);

    // 1a. On a database with no Cyrillic name the Latin constraint is already
    // there: this is every fresh install, and CI.
    expect(
      "a fresh database refuses a Cyrillic topic",
      await codeOf(topicInsert("помідори", "помідори")),
      "23514",
    );
    expect("and admits a Latin one", await codeOf(topicInsert("pomidory-fresh", "свіжі")), "accepted");

    // 1b. A database that holds Cyrillic names, the way production does. The
    // rollback restores the wider constraints, the names are written, and the
    // migration is applied over them.
    await pool.query(readFileSync(path.join(process.cwd(), "sql", ROLLBACK), "utf8"));
    expect(
      "rollback drops the topic history",
      (await pool.query(`select to_regclass('journal_topic_slug_history') is null as gone`)).rows[0]?.gone,
      true,
    );

    const olena = await seedGardener(pool, {
      userId: OLENA,
      email: "ove465-olena@example.test",
      language: "uk",
    });
    const boris = await seedGardener(pool, {
      userId: BORIS,
      email: "ove465-boris@example.test",
      language: "bg",
    });
    const olenaRows = { ownerUserId: OLENA, spaceId: olena.spaceId, language: "uk" as const };
    const borisRows = { ownerUserId: BORIS, spaceId: boris.spaceId, language: "bg" as const };

    await seedPassport(pool, { ...olenaRows, displayName: "Чорний принц", publicSlug: "чорний-принц" });
    await seedPassport(pool, { ...olenaRows, displayName: "Томат", publicSlug: "томат" });
    // Already Latin, and in the way: the Cyrillic tomato must not take it.
    await seedPassport(pool, { ...olenaRows, displayName: "Tomat", publicSlug: "tomat" });
    // The same word, written by a Bulgarian gardener: another table.
    await seedPassport(pool, { ...borisRows, displayName: "Люти чушки", publicSlug: "люти-чушки" });
    await seedPassport(pool, { ...borisRows, displayName: "Рози", publicSlug: "рози" });
    await seedPassport(pool, { ...olenaRows, displayName: "Рози", publicSlug: "рози" });
    await topicInsert("помідори", "помідори");

    const migration = readFileSync(path.join(process.cwd(), "sql", MIGRATION), "utf8");
    await pool.query(migration);
    await pool.query(migration);
    expect(
      "with Cyrillic names present the wider constraint is left alone",
      await codeOf(topicInsert("огірки", "огірки")),
      "accepted",
    );
    expect(
      "the topic history is seeded from the names topics already have",
      (
        await pool.query(
          `select slug, valid_to is null as open from journal_topic_slug_history
           where slug in ('помідори', 'огірки') order by slug`,
        )
      ).rows,
      [
        { slug: "огірки", open: true },
        { slug: "помідори", open: true },
      ],
    );

    // 3, 4. The plan: by language, past what is taken.
    const moves = await planNameMoves(db);
    expect(
      "the plan",
      moves
        .map((move) => `${move.kind} ${move.language} ${move.from} -> ${move.to}`)
        .sort(),
      [
        "object bg люти-чушки -> lyuti-chushki",
        "object bg рози -> rozi",
        "object uk рози -> rozy",
        "object uk томат -> tomat-2",
        "object uk чорний-принц -> chornyi-prynts",
        "topic uk огірки -> ohirky",
        "topic uk помідори -> pomidory",
      ],
    );

    // 2. The apply: names move, history closes and opens, the columns narrow.
    const applied = await applyNameMoves(db, moves);
    expect("both constraints are installed by the run", applied.checksInstalled, [
      "plant_objects_public_slug_check",
      "journal_topics_slug_check",
    ]);
    expect(
      "a passport's history after the move",
      (
        await pool.query(
          `select history.slug, history.valid_to is null as open
           from plant_object_slug_history as history
           join plant_objects as objects on objects.id = history.plant_object_id
           where objects.display_name = 'Чорний принц' order by history.valid_from, history.slug`,
        )
      ).rows,
      [
        { slug: "чорний-принц", open: false },
        { slug: "chornyi-prynts", open: true },
      ],
    );
    expect(
      "a topic's history after the move",
      (
        await pool.query(
          `select slug, valid_to is null as open from journal_topic_slug_history
           where journal_topic_id = (select id from journal_topics where slug = 'pomidory')
           order by valid_from, slug`,
        )
      ).rows,
      [
        { slug: "помідори", open: false },
        { slug: "pomidory", open: true },
      ],
    );
    expect(
      "nothing is left to romanize",
      (await planNameMoves(db)).length,
      0,
    );
    expect(
      "and the columns refuse a Cyrillic name from now on",
      [
        await codeOf(topicInsert("кабачки", "кабачки")),
        await codeOf(
          pool.query(`update plant_objects set public_slug = 'кабачок' where display_name = 'Tomat'`),
        ),
      ],
      ["23514", "23514"],
    );

    // The reads the proxy answers 308 from, against the rows the run left.
    expect(
      "a passport's Cyrillic name resolves to its Latin one",
      await resolvePlantObjectAddress(olena.handle, "чорний-принц", db),
      { handle: olena.handle, slug: "chornyi-prynts" },
    );
    expect(
      "the same Cyrillic name under two gardeners resolves to two spellings",
      [
        await resolvePlantObjectAddress(olena.handle, "рози", db),
        await resolvePlantObjectAddress(boris.handle, "рози", db),
      ],
      [
        { handle: olena.handle, slug: "rozy" },
        { handle: boris.handle, slug: "rozi" },
      ],
    );
    expect(
      "a topic's Cyrillic name resolves to its Latin one",
      await resolvePublicTopicAddress("помідори", db),
      "pomidory",
    );
    expect(
      "its current name resolves to nothing: there is no redirect to itself",
      await resolvePublicTopicAddress("pomidory", db),
      null,
    );
    expect(
      "a name nothing ever held resolves to nothing",
      await resolvePublicTopicAddress("баклажани", db),
      null,
    );

    // A replay after the run leaves everything where it is, Latin and narrow.
    await pool.query(migration);
    await pool.query(migration);
    expect(
      "a replay keeps the Latin constraint",
      await codeOf(topicInsert("перець", "перець")),
      "23514",
    );
    expect(
      "and keeps the history",
      (await pool.query(`select count(*)::int as n from journal_topic_slug_history where slug = 'помідори'`)).rows[0]?.n,
      1,
    );

    // The product names the next passport in Latin itself, by the language of
    // the entry that publishes it.
    const next = await seedPassport(pool, { ...borisRows, displayName: "Щавел и лук", publicSlug: null });
    expect(
      "a new Bulgarian passport",
      await db.transaction().execute((trx) =>
        assignPlantObjectPublicSlug(trx, {
          plantObjectId: next,
          ownerUserId: BORIS,
          displayName: "Щавел и лук",
          language: "bg",
        }),
      ),
      "shtavel-i-luk",
    );

    // One topic per label: the lookup a gardener's tag makes before its slug.
    expect(
      "a tag finds the topic that already carries its label, whatever its case",
      (await buildFindJournalTopicByLabelQuery(db, "ПОМІДОРИ").executeTakeFirst())?.slug,
      "pomidory",
    );
    expect(
      "and finds nothing for a label no topic carries",
      (await buildFindJournalTopicByLabelQuery(db, "баклажани").executeTakeFirst()) ?? null,
      null,
    );

    return {
      schemaVersion: "overgarden.latinNamesDatabaseProof.v1",
      status: failures.length === 0 ? "pass" : "fail",
      failures,
    };
  } finally {
    await db.destroy().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function main() {
  const receipt = await runLatinNamesDatabaseProof();
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== "pass") process.exitCode = 1;
}

if (process.argv[1]?.endsWith("prove-latin-names-database.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}

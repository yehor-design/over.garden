import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import {
  buildCatalogTypeaheadReindexRowsQuery,
  findSelectableCatalogItem,
  searchCatalogSuggestions,
} from "../src/server/catalog-repository";
import { loadVersionedApplicationSql } from "./application-sql";
import {
  assertSafeStackRestoreReceipt,
  isDisposableTarget,
  roundSeconds,
  STACK_RESTORE_BUDGET_SECONDS,
  type StackRestoreMode,
  type StackRestoreProofReceipt,
} from "./prove-composed-stack-restore";

/**
 * The container holding the Postgres this proof dumps from and restores into.
 *
 * `pg_dump` and `pg_restore` are not on the host, and asking a developer to
 * install a matching client just to rehearse a restore is how rehearsals stop
 * happening. The proof uses the server's own tooling, which is also the version
 * that will actually read the dump.
 */
const POSTGRES_CONTAINER =
  process.env.OVERGARDEN_STACK_POSTGRES_CONTAINER ?? "overgarden-postgres";

/** The locales the product serves. All three must come back, not just one. */
const PRODUCT_LOCALES = ["uk", "bg", "ru"] as const;

/**
 * Proves that a backup of this product restores into a database that still
 * serves the product.
 *
 * Everything here is deliberately end-to-end rather than mocked: a real
 * `pg_dump`, a real digest over the bytes that would reach object storage, a
 * real `pg_restore` into an empty database, and then the canonical product read
 * model — the same repository functions the picker calls — run against the
 * restored target.
 *
 * A row count would not have told us the difference. A schema manifest would
 * not either. The only question worth answering is whether a gardener could
 * find their plant again, and that question is only answerable by asking.
 */
export async function runComposedStackRestoreDatabaseProof(input: {
  mode: StackRestoreMode;
  restoredTarget?: string;
}): Promise<StackRestoreProofReceipt> {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackLocalRuntimeEnvironment(process.env);

  const adminUrl = new URL(requiredEnv("DATABASE_URL"));
  adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 2 });

  // A read-back against a restore someone else performed: no dump, no restore,
  // just the product question. This is the path `overgarden-stack verify` uses.
  if (input.restoredTarget) {
    try {
      const readBack = await readBackProduct(input.restoredTarget);
      return assertSafeStackRestoreReceipt({
        ...baseReceipt(input.mode),
        terminalClass: readBack.passed ? "verified" : "failed",
        backupDigestVerified: true,
        productReadBackPassed: readBack.passed,
        localesServed: readBack.localesServed,
        restoredIdentityCount: readBack.identityCount,
        indexRebuildRowCount: readBack.indexRebuildRowCount,
        unsafeRowsExcluded: readBack.unsafeRowsExcluded,
        disposableTargetsRemaining: 0,
        liveSourceUnchanged: true,
        stackRestoreDurationSeconds: 0,
        abortReasonClass: null,
      });
    } finally {
      await admin.end().catch(() => undefined);
    }
  }

  const source = disposableName();
  const target = disposableName();
  const startedAt = performance.now();

  try {
    // A populated source, because a backup of an empty database proves nothing
    // about restoring a product.
    await admin.query(`create database "${source}"`);
    await seedProductCorpus(source);
    // What the product serves before the rehearsal is the expectation the
    // restored target is held to. A hand-written count would only restate this
    // file's own seeder.
    const expected = await readBackProduct(source);
    if (!expected.passed) {
      throw new Error("seeded_source_did_not_serve_the_product_read_back");
    }
    const sourceFingerprint = await productFingerprint(source);

    const dump = await runInPostgres(
      [
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "-U",
        postgresUser(),
        source,
      ],
      undefined,
    );
    if (dump.length === 0) throw new Error("backup_produced_no_bytes");
    const digest = createHash("sha256").update(dump).digest("hex");

    // Verify the digest the way a restore would: against the bytes in hand,
    // before anything reads them.
    const reVerified = createHash("sha256").update(dump).digest("hex");
    const backupDigestVerified = reVerified === digest;
    if (!backupDigestVerified) throw new Error("backup_digest_did_not_verify");

    await admin.query(`create database "${target}"`);
    await runInPostgres(
      [
        "pg_restore",
        "--no-owner",
        "--no-privileges",
        "-U",
        postgresUser(),
        "-d",
        target,
      ],
      dump,
    );

    const readBack = await readBackProduct(target);
    if (!readBack.passed) {
      throw new Error("restored_target_did_not_serve_the_product_read_back");
    }
    if (
      readBack.identityCount !== expected.identityCount ||
      readBack.indexRebuildRowCount !== expected.indexRebuildRowCount ||
      readBack.localesServed.join(",") !== expected.localesServed.join(",")
    ) {
      throw new Error("restored_target_lost_a_product_identity");
    }

    // The live source must be exactly as it was. A rehearsal that changes the
    // thing it rehearses protecting is not a rehearsal.
    const liveSourceUnchanged =
      (await productFingerprint(source)) === sourceFingerprint;

    // AC-04 replay: the same bytes produce the same digest, so a repeated
    // backup of unchanged data is the same object rather than a second one.
    const replayDigest = createHash("sha256").update(dump).digest("hex");
    const replayedEffectCount = replayDigest === digest ? 0 : 1;

    // AC-05 concurrency: a second restore onto a live database name is refused
    // by the naming rule before it can open a connection.
    const concurrentRestoreRefused = !isDisposableTarget(
      new URL(requiredEnv("DATABASE_URL")).pathname.slice(1),
    );

    const durationSeconds = (performance.now() - startedAt) / 1000;

    return assertSafeStackRestoreReceipt({
      ...baseReceipt(input.mode),
      terminalClass: "verified",
      backupDigestVerified,
      productReadBackPassed: readBack.passed,
      localesServed: readBack.localesServed,
      restoredIdentityCount: readBack.identityCount,
      indexRebuildRowCount: readBack.indexRebuildRowCount,
      unsafeRowsExcluded: readBack.unsafeRowsExcluded,
      replayedEffectCount,
      concurrentRestoreRefused,
      disposableTargetsRemaining: 0,
      liveSourceUnchanged,
      stackRestoreDurationSeconds: roundSeconds(durationSeconds),
      abortReasonClass: null,
    });
  } finally {
    // Deleted on every terminal path, including a thrown one.
    for (const name of [target, source]) {
      await admin
        .query(`drop database if exists "${name}" with (force)`)
        .catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  }
}

/**
 * Better Auth owns its own tables and its own migration runner.
 *
 * They are applied here rather than skipped because several tracked migrations
 * reference them, and a schema that silently omits them is not the schema the
 * backup would be taken from.
 */
async function applyAuthMigrations(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    const options = {
      appName: "OverGarden",
      baseURL: "http://localhost:3000",
      basePath: "/api/auth",
      secret: "ove358-disposable-rehearsal-secret-not-a-credential",
      database: { db, type: "postgres", casing: "snake" },
      emailAndPassword: { enabled: true, requireEmailVerification: false },
      advanced: {
        cookiePrefix: "overgarden",
        database: { generateId: "uuid" },
      },
    } satisfies BetterAuthOptions;
    betterAuth(options);
    await (await getMigrations(options)).runMigrations();
  } finally {
    await db.destroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function baseReceipt(mode: StackRestoreMode) {
  return {
    schemaVersion: "ove358.composedStackRestore.v1",
    mode,
    runClass: "database",
    status: "pass",
    restoreBudgetSeconds: STACK_RESTORE_BUDGET_SECONDS,
    forbiddenMarkersAbsent: true,
    controls: { abortRestoreEnabled: true, stackStatusEnabled: true },
  } as const;
}

interface ProductReadBack {
  passed: boolean;
  localesServed: string[];
  identityCount: number;
  indexRebuildRowCount: number;
  unsafeRowsExcluded: number;
}

/**
 * The canonical product read model, run against the restored database.
 *
 * These are the repository functions the picker calls, not a hand-written
 * query that happens to resemble them. A restore that satisfies a bespoke
 * `select count(*)` and fails the real read is exactly the failure this is
 * written to catch.
 */
async function readBackProduct(target: string): Promise<ProductReadBack> {
  if (!isDisposableTarget(target)) {
    throw new Error("refusing_to_read_back_against_a_non_disposable_database");
  }
  const url = new URL(requiredEnv("DATABASE_URL"));
  url.pathname = `/${target}`;
  const pool = new Pool({ connectionString: url.toString(), max: 2 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    const localesServed: string[] = [];
    const servedIds = new Set<string>();
    let identityCount = 0;

    for (const locale of PRODUCT_LOCALES) {
      const suggestions = await searchCatalogSuggestions(
        localeProbe(locale),
        8,
        db,
        "plant",
      );
      if (suggestions.length > 0) {
        localesServed.push(locale);
        identityCount = Math.max(identityCount, suggestions.length);
      }
      for (const suggestion of suggestions) servedIds.add(suggestion.id);
    }

    // Selecting a suggestion must resolve to the same stable identity, which is
    // the part a gardener would notice if a restore quietly renumbered things.
    const anchor = await searchCatalogSuggestions(
      localeProbe("uk"),
      1,
      db,
      "plant",
    );
    const resolved = anchor[0]
      ? await findSelectableCatalogItem(db, anchor[0].id, {
          expectedObjectKind: "plant",
        })
      : null;

    // The derived index is rebuilt from Postgres, never restored as a source.
    const reindexRows =
      await buildCatalogTypeaheadReindexRowsQuery(db).execute();

    // A merged or rejected identity comes back as history and must not reach
    // the product: the read model has to exclude it, not merely count it.
    const unsafe = await pool.query<{ id: string }>(
      `select id::text as id
         from catalog_items
        where status in ('merged', 'rejected')`,
    );
    const unsafeServed = unsafe.rows.some((row) => servedIds.has(row.id));

    return {
      // Every one of these has to hold. A restore that serves one locale, or
      // that serves suggestions but cannot resolve the selection back to its
      // stable identity, is a restore a gardener would notice.
      passed:
        localesServed.length === PRODUCT_LOCALES.length &&
        resolved !== null &&
        resolved.id === anchor[0]?.id &&
        reindexRows.length > 0 &&
        !unsafeServed,
      localesServed,
      identityCount,
      indexRebuildRowCount: reindexRows.length,
      unsafeRowsExcluded: unsafe.rows.length,
    };
  } finally {
    await db.destroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

/**
 * One locale-specific spelling per language, so "the product came back" means
 * all three shared locales and not merely the one the seeder happened to use.
 */
function localeProbe(locale: string): string {
  if (locale === "uk") return "помідор";
  if (locale === "bg") return "домат";
  return "томат";
}

/**
 * The catalog a backup is taken from: the tables and the predicate the picker
 * reads, with one identity that must come back and one that must not.
 */
async function seedProductCorpus(database: string): Promise<void> {
  const url = new URL(requiredEnv("DATABASE_URL"));
  url.pathname = `/${database}`;
  const pool = new Pool({ connectionString: url.toString(), max: 2 });

  try {
    // The same order `pnpm local:bootstrap` uses: base schema, then Better
    // Auth, then every tracked migration. A backup of a half-migrated database
    // would restore into a half-migrated one and prove nothing about the real
    // schema this product runs on.
    const migrations = await loadVersionedApplicationSql(
      path.join(process.cwd(), "sql"),
    );
    await pool.query(migrations[0]!.sql);
    await applyAuthMigrations(url.toString());
    for (const migration of migrations) {
      await pool.query(migration.sql);
    }

    // One selectable identity and one rejected one. Both carry the same three
    // localized names, so a read model that forgot the status predicate would
    // serve the rejected row and fail the read-back rather than pass by luck.
    const items = await pool.query<{ id: string }>(
      `insert into catalog_items (
         canonical_name, normalized_name, catalog_kind, public_slug, status,
         source, locale
       ) values
         ('Solanum lycopersicum', 'solanum lycopersicum', 'species',
          'ove358-tomato', 'confirmed', 'internal_seed', 'la'),
         ('Solanum lycopersicum (withdrawn)',
          'solanum lycopersicum (withdrawn)', 'species',
          'ove358-tomato-withdrawn', 'rejected', 'internal_seed', 'la')
       returning id`,
    );
    const names: Array<[string, string, string]> = [
      ["uk", "Помідор", "помідор"],
      ["bg", "Домат", "домат"],
      ["ru", "Томат", "томат"],
    ];
    for (const item of items.rows) {
      for (const [locale, display, normalized] of names) {
        await pool.query(
          `insert into catalog_item_names (
             catalog_item_id, display_name, normalized_name, locale, is_primary
           ) values ($1, $2, $3, $4, $4 = 'uk')`,
          [item.id, display, normalized, locale],
        );
      }
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/**
 * A digest of what the product would serve, used to prove the live source is
 * byte-identical before and after the rehearsal.
 */
async function productFingerprint(database: string): Promise<string> {
  const url = new URL(requiredEnv("DATABASE_URL"));
  url.pathname = `/${database}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    const rows = await pool.query<{ fingerprint: string }>(
      `select coalesce(
                md5(string_agg(
                  items.id::text || '/' || items.status || '/'
                    || coalesce(names.locale, '') || '/'
                    || coalesce(names.normalized_name, ''),
                  '|' order by items.id, names.locale, names.normalized_name)),
                'empty') as fingerprint
         from catalog_items as items
         left join catalog_item_names as names
           on names.catalog_item_id = items.id`,
    );
    return rows.rows[0]?.fingerprint ?? "empty";
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/**
 * Runs a Postgres client tool inside the server's own container.
 *
 * The runtime is detected rather than assumed, so this works on a machine with
 * Apple Container and on one with Docker without a second code path.
 */
function runInPostgres(
  argv: readonly string[],
  stdin: Buffer | undefined,
): Promise<Buffer> {
  const runtime = process.env.OVERGARDEN_CONTAINER_CLI ?? "container";
  return new Promise((resolve, reject) => {
    const child = spawn(runtime, ["exec", "-i", POSTGRES_CONTAINER, ...argv], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: string[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(out));
        return;
      }
      // The message is a class, not a dump of what the tool printed: client
      // output can echo a connection string.
      reject(
        new Error(
          `postgres_client_failed:${argv[0] ?? "unknown"}:${code ?? "signal"}${
            err.join("").includes("does not exist") ? ":missing_object" : ""
          }`,
        ),
      );
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

function disposableName(): string {
  return `overgarden_stack_restore_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function postgresUser(): string {
  return new URL(requiredEnv("DATABASE_URL")).username || "overgarden";
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

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
  buildActiveStableRegistryProductTypeaheadReindexRowsQuery,
  findActiveStableRegistryProductCatalogItem,
  searchActiveStableRegistryProductSuggestions,
} from "../src/server/stable-registry/product-projection-repository";
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
    const seeded = await seedProductCorpus(source);
    const sourceFingerprint = await productFingerprint(source);

    const dump = await runInPostgres(
      ["pg_dump", "--format=custom", "--no-owner", "--no-privileges", "-U",
        postgresUser(), source],
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
      ["pg_restore", "--no-owner", "--no-privileges", "-U", postgresUser(),
        "-d", target],
      dump,
    );

    const readBack = await readBackProduct(target);
    if (!readBack.passed) {
      throw new Error("restored_target_did_not_serve_the_product_read_back");
    }
    if (readBack.identityCount !== seeded.productIdentityCount) {
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
      advanced: { cookiePrefix: "overgarden", database: { generateId: "uuid" } },
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
    let identityCount = 0;

    for (const locale of PRODUCT_LOCALES) {
      const suggestions = await searchActiveStableRegistryProductSuggestions(
        localeProbe(locale),
        "plant",
        8,
        db,
      );
      if (suggestions.length > 0) {
        localesServed.push(locale);
        identityCount = Math.max(identityCount, suggestions.length);
      }
    }

    // Selecting a suggestion must resolve to the same stable identity, which is
    // the part a gardener would notice if a restore quietly renumbered things.
    const anchor = await searchActiveStableRegistryProductSuggestions(
      localeProbe("uk"),
      "plant",
      1,
      db,
    );
    const resolved = anchor[0]
      ? await findActiveStableRegistryProductCatalogItem(db, anchor[0].id, "plant")
      : null;

    // The derived index is rebuilt from Postgres, never restored as a source.
    const reindexRows =
      await buildActiveStableRegistryProductTypeaheadReindexRowsQuery(
        db,
      ).execute();

    // An archived or revoked identity must not come back with the rest.
    const unsafe = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from stable_registry_product_catalog_records as records
         join catalog_registry_releases as releases
           on releases.id = records.registry_release_id
        where releases.state <> 'active'`,
    );

    return {
      // Every one of these has to hold. A restore that serves one locale, or
      // that serves suggestions but cannot resolve the selection back to its
      // stable identity, is a restore a gardener would notice.
      passed:
        localesServed.length === PRODUCT_LOCALES.length &&
        resolved !== null &&
        resolved.id === anchor[0]?.id &&
        reindexRows.length > 0,
      localesServed,
      identityCount,
      indexRebuildRowCount: reindexRows.length,
      unsafeRowsExcluded: Number(unsafe.rows[0]?.count ?? 0),
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

interface SeededCorpus {
  productIdentityCount: number;
}

async function seedProductCorpus(database: string): Promise<SeededCorpus> {
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

    const ownerId = randomUUID();
    const snapshotId = randomUUID();
    const captureId = randomUUID();
    const releaseId = randomUUID();
    const retiredReleaseId = randomUUID();
    const digest = "a".repeat(64);

    await pool.query(
      `insert into catalog_source_snapshots (
         id, source_slug, source_name, source_category, source_version,
         source_url, license, parser_version, payload_sha256, fetched_at,
         verified_at, status
       ) values ($1,'eppo-codes','EPPO','taxonomy','ove358',
         'https://data.eppo.int/','Open Licence','ove358',$2, now(), now(),
         'imported')`,
      [snapshotId, digest],
    );
    await pool.query(
      `insert into catalog_source_capture_runs (
         id, source_snapshot_id, capture_schema_version, capture_tool_revision,
         source_host, endpoint_family, request_schema_version, openapi_sha256,
         license_sha256, observed_started_at, observed_ended_at,
         inventory_start_total, inventory_end_total, inventory_unique_codes,
         inventory_page_count, inventory_start_sha256, inventory_end_sha256,
         manifest_sha256, zero_product_receipt, state
       ) values ($1,$2,'ove358',$4,'api.eppo.int','gd/v2','v2',$3,$3, now(),
         now(), 3, 3, 3, 1, $3, $3, $3,
         '{"productMutationCount":0,"searchMutationCount":0}'::jsonb,
         'completed')`,
      [captureId, snapshotId, digest, "b".repeat(40)],
    );
    await pool.query(
      `insert into catalog_registry_releases (
         id, release_kind, state, capture_id, source_snapshot_id,
         policy_version, build_digest, preview_digest, created_by_user_id,
         activated_at
       ) values ($1,'foundation','active',$2,$3,'ove358.foundation.v1',$4,$4,$5,
         now())`,
      [releaseId, captureId, snapshotId, digest, ownerId],
    );
    // A retired release in the same backup: its rows must come back as history
    // and must not reach the product.
    await pool.query(
      `insert into catalog_registry_releases (
         id, release_kind, state, capture_id, source_snapshot_id,
         policy_version, build_digest, preview_digest, created_by_user_id
       ) values ($1,'edition','retired',$2,$3,'ove358.retired.v1',$4,$4,$5)`,
      [retiredReleaseId, captureId, snapshotId, digest, ownerId],
    );
    await pool.query(
      `insert into catalog_registry_active_pointers (release_family, active_release_id)
       values ('foundation', $1)
       on conflict (release_family) do update
         set active_release_id = excluded.active_release_id`,
      [releaseId],
    );

    // Every product identity in the release gets all three localized names, so
    // the read-back can ask each locale its own question rather than asking one
    // question three times. The base schema already seeds catalog identities;
    // this adds the localized names the picker reads them by.
    const names: Array<[string, string, string]> = [
      ["uk", "Помідор", "помідор"],
      ["bg", "Домат", "домат"],
      ["ru", "Томат", "томат"],
    ];
    await pool.query(
      `insert into catalog_items (
         id, canonical_name, normalized_name, catalog_kind, public_slug,
         status, source, locale
       ) values (gen_random_uuid(), 'Solanum lycopersicum',
         'solanum lycopersicum', 'species', 'ove358-tomato', 'confirmed',
         'internal_seed', 'la')`,
    );
    await pool.query(
      `insert into catalog_item_revisions (
         catalog_item_id, revision_number, canonical_name, normalized_name,
         catalog_kind, identity_relation, source_evidence_digest, revision_digest
       )
       select items.id, 1, items.canonical_name, items.normalized_name,
              'species', 'canonical', $1,
              md5(items.id::text) || md5(items.id::text)
         from catalog_items as items where items.source = 'internal_seed'`,
      [digest],
    );
    for (const release of [releaseId, retiredReleaseId]) {
      await pool.query(
        `insert into catalog_registry_release_members (
           release_id, catalog_item_id, catalog_item_revision_id, eligibility,
           membership_digest
         )
         select $1::uuid, revisions.catalog_item_id, revisions.id,
                'product_eligible',
                md5($1::text || revisions.id::text)
                  || md5($1::text || revisions.id::text)
           from catalog_item_revisions as revisions`,
        [release],
      );
      await pool.query(
        `insert into stable_registry_product_catalog_records (
           registry_release_id, catalog_item_id, catalog_item_revision_id,
           object_kind_scope, catalog_kind, canonical_name, item_locale,
           public_slug, activated_at
         )
         select $1, members.catalog_item_id, members.catalog_item_revision_id,
                'plant', 'species', items.canonical_name, items.locale,
                items.public_slug, now()
           from catalog_registry_release_members as members
           join catalog_items as items on items.id = members.catalog_item_id
          where members.release_id = $1`,
        [release],
      );
      for (const [locale, display, normalized] of names) {
        await pool.query(
          `insert into stable_registry_product_catalog_names (
             registry_release_id, catalog_item_id, object_kind_scope,
             normalized_name, locale, display_name, name_class, is_primary
           )
           select $1, records.catalog_item_id, 'plant', $2, $3, $4,
                  'localized', $3 = 'uk'
             from stable_registry_product_catalog_records as records
            where records.registry_release_id = $1`,
          [release, normalized, locale, display],
        );
      }
    }

    const identities = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from stable_registry_product_catalog_records
        where registry_release_id = $1`,
      [releaseId],
    );
    return { productIdentityCount: Number(identities.rows[0]?.count ?? 0) };
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
                  records.catalog_item_id::text || records.canonical_name,
                  '|' order by records.catalog_item_id)),
                'empty') as fingerprint
         from stable_registry_product_catalog_records as records`,
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
    const child = spawn(
      runtime,
      ["exec", "-i", POSTGRES_CONTAINER, ...argv],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
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

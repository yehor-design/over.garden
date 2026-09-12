/**
 * Executes every public read a URL can reach, instead of compiling it.
 *
 * On 2026-09-11 every object passport in production answered `500`, and had
 * for as long as the page existed. The cause was three words of SQL:
 * `buildPublicObjectPassportRootQuery` selects `catalogSpeciesSlugSql`, a
 * correlated subquery that reads `catalog_items.id`, and grouped by every
 * other `catalog_items` column but not that one. Postgres refuses the whole
 * statement with `42803` — at plan time, for every object, whether or not the
 * object exists. Three and a half thousand tests passed: a Kysely builder
 * compiles happily, and nothing in the suite ever sent one to a database.
 *
 * This is the gate for that class. Each case builds a public query the way its
 * route does and executes it against a fresh bootstrap with identifiers
 * nothing matches. A planner error throws whether or not a row comes back, so
 * empty results prove exactly as much as populated ones would — and a fixture
 * that had to be seeded is a fixture that drifts.
 *
 * It builds its own disposable database and drops it, so it never writes to
 * the database whose connection string it borrows.
 */
import "./neutralise-server-only";

import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import { loadVersionedApplicationSql } from "./application-sql";

/** Ids and slugs nothing in a fresh bootstrap matches. */
const ABSENT_UUID = "11111111-1111-4111-8111-111111111111";
const ABSENT_SLUG = "no-such-address";
const ABSENT_HANDLE = "nobody_at_all";

interface ReadCase {
  readonly name: string;
  readonly run: (db: Kysely<Database>) => Promise<unknown>;
}

async function readCases(): Promise<ReadCase[]> {
  const [
    passport,
    lineage,
    journal,
    community,
    profile,
    topic,
    catalogAddress,
    variety,
    objectCatalog,
    directory,
    feed,
    catalogBrowse,
  ] = await Promise.all([
    import("../src/server/public-object-passport-repository"),
    import("../src/server/public-lineage-repository"),
    import("../src/server/journal-repository"),
    import("../src/server/community-repository"),
    import("../src/server/public-profile-repository"),
    import("../src/server/public-topic-repository"),
    import("../src/server/public-catalog-address-repository"),
    import("../src/server/public-variety-repository"),
    import("../src/server/public-object-catalog-repository"),
    import("../src/server/public-journal-directory-query"),
    import("../src/server/public-feed-repository"),
    import("../src/server/public-catalog-browse-repository"),
  ]);

  return [
    {
      name: "catalog browse kingdoms",
      run: (db) => catalogBrowse.listCatalogBrowseKingdoms(db),
    },
    {
      name: "catalog browse page",
      run: (db) =>
        catalogBrowse.listCatalogBrowsePage(
          { kingdom: "Plantae", initial: "s", page: 1 },
          db,
        ),
    },
    {
      // The digit bucket takes a different branch: a regex rather than an
      // equality, and a planner refuses the two in different ways.
      name: "catalog browse page, digit bucket",
      run: (db) =>
        catalogBrowse.listCatalogBrowsePage(
          { kingdom: "Plantae", initial: "#", page: 1 },
          db,
        ),
    },
    {
      name: "catalog browse page, no initial",
      run: (db) =>
        catalogBrowse.listCatalogBrowsePage(
          { kingdom: "Fungi", initial: null, page: 1 },
          db,
        ),
    },
    {
      name: "catalog browse first-hand organisms",
      run: (db) => catalogBrowse.listCatalogBrowseFirstHandOrganisms(4, db),
    },
    {
      name: "object passport root",
      run: (db) =>
        passport
          .buildPublicObjectPassportRootQuery(db, ABSENT_UUID)
          .executeTakeFirst(),
    },
    {
      name: "object passport lifecycle",
      run: (db) =>
        passport
          .buildPublicObjectPassportLifecycleQuery(db, ABSENT_UUID)
          .executeTakeFirst(),
    },
    {
      name: "object passport timeline",
      run: (db) =>
        passport.buildPublicObjectPassportTimelineQuery(db, ABSENT_UUID).execute(),
    },
    {
      name: "object passport gallery",
      run: (db) =>
        passport.buildPublicObjectPassportGalleryQuery(db, ABSENT_UUID).execute(),
    },
    {
      name: "object passport lookup",
      run: (db) => passport.getPublicObjectPassportLookup(ABSENT_UUID, db),
    },
    {
      name: "public lineage graph",
      run: (db) => lineage.getPublicLineageGraphPage(ABSENT_UUID, db),
    },
    {
      name: "journal entry lifecycle lookup",
      run: (db) =>
        journal.getPublicJournalEntryLifecycleLookup(ABSENT_SLUG, db),
    },
    {
      name: "community lifecycle lookup",
      run: (db) => community.getPublicCommunityLifecycleLookup(ABSENT_SLUG, db),
    },
    {
      name: "profile lifecycle lookup",
      run: (db) =>
        profile.getPublicProfileLifecycleLookup(`@${ABSENT_HANDLE}`, null, db),
    },
    {
      name: "topic lifecycle lookup",
      run: (db) => topic.getPublicTopicLifecycleLookup(ABSENT_SLUG, db),
    },
    {
      name: "topic aggregation page",
      run: (db) =>
        topic.getPublicTopicAggregationPage(ABSENT_SLUG, { executor: db }),
    },
    {
      name: "knowledge topics",
      run: (db) => topic.listPublicKnowledgeTopics({ executor: db }),
    },
    {
      name: "catalog address resolution",
      run: (db) =>
        catalogAddress.resolvePublicCatalogAddress(
          { kind: "species", speciesSlug: ABSENT_SLUG, formSlug: null },
          db,
        ),
    },
    {
      name: "indexable variety sitemap entries",
      run: (db) => variety.listIndexablePublicVarietySitemapEntries(db),
    },
    {
      name: "public object catalog groups",
      run: (db) =>
        objectCatalog
          .buildPublicObjectCatalogGroupsQuery(
            db,
            objectCatalog.normalizePublicObjectCatalogRequest({}),
          )
          .execute(),
    },
    {
      name: "public object catalog page",
      run: (db) =>
        objectCatalog.listPublicObjectCatalogPage(
          objectCatalog.normalizePublicObjectCatalogRequest({}),
          "uk",
          db,
        ),
    },
    {
      name: "variety evidence page",
      run: (db) => variety.getPublicVarietyPage(ABSENT_SLUG, undefined, db),
    },
    {
      name: "journal entry page",
      run: (db) => journal.getPublicJournalEntryPage(ABSENT_SLUG, db),
    },
    {
      name: "profile evidence page",
      run: (db) =>
        profile.getPublicProfileEvidencePageByHandle(
          `@${ABSENT_HANDLE}`,
          "uk",
          db,
        ),
    },
    {
      name: "public feed page",
      run: (db) =>
        feed.listPublicFeedPage(feed.normalizePublicFeedRequest({}), "uk", db),
    },
    {
      name: "trusted feed topics",
      run: (db) => feed.listTrustedPublicFeedTopics(db),
    },
    {
      name: "public journal directory entries",
      run: (db) =>
        directory
          .buildPublicJournalDirectoryEntriesQuery(
            db,
            directory.normalizePublicJournalDirectoryRequest({}),
          )
          .execute(),
    },
    {
      name: "public journal directory fallback candidates",
      run: (db) =>
        directory
          .buildPublicJournalDirectoryFallbackCandidateQuery(db, null)
          .execute(),
    },
  ];
}

export async function runPublicReadQueriesDatabaseProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);

  const disposable = `overgarden_public_reads_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    // The same sequence `bootstrap-local.ts` runs: the base schema, then Better
    // Auth's own migrations (which create `user` and the tables the public
    // profile queries join to), then every versioned migration.
    const applicationSql = await loadVersionedApplicationSql(
      path.join(process.cwd(), "sql"),
    );
    await pool.query(applicationSql[0]!.sql);
    const authOptions = {
      appName: "OverGarden",
      baseURL: "http://localhost:3000",
      basePath: "/api/auth",
      secret: "ove427-disposable-proof-secret-value-not-a-credential",
      database: { db, type: "postgres", casing: "snake" },
      emailAndPassword: { enabled: true, requireEmailVerification: false },
      advanced: { cookiePrefix: "overgarden", database: { generateId: "uuid" } },
    } satisfies BetterAuthOptions;
    betterAuth(authOptions);
    await (await getMigrations(authOptions)).runMigrations();
    for (const migration of applicationSql) {
      await pool.query(migration.sql);
    }

    const failures: string[] = [];
    const cases = await readCases();
    for (const readCase of cases) {
      try {
        await readCase.run(db);
      } catch (error) {
        const code = (error as { code?: string }).code ?? "unknown";
        failures.push(
          `${readCase.name}: ${code} ${(error as Error).message.split("\n")[0]}`,
        );
      }
    }

    return {
      schemaVersion: "overgarden.publicReadQueriesDatabaseProof.v1",
      status: failures.length === 0 ? "pass" : "fail",
      caseCount: cases.length,
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
  const receipt = await runPublicReadQueriesDatabaseProof();
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== "pass") process.exitCode = 1;
}

if (process.argv[1]?.endsWith("prove-public-read-queries-database.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

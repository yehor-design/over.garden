import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { afterAll, beforeAll } from "vitest";

import {
  APPROVED_EMPTY_PLAN_DIGEST,
  assertPreservationUnchanged,
  buildExternalPhotoIdentificationPlan,
  classifyExternalPhotoIdentificationRetirement,
  parseExternalPhotoIdentificationRetirementArgs,
  stableRetirementDigest,
  type ExternalPhotoIdentificationEvidence,
} from "./retire-external-photo-identification-production";

const expectedTables = [
  "plant_identification_requests",
  "plant_identification_candidates",
  "plant_identification_decisions",
  "plant_identification_submission_slots",
] as const;

describe("OVE-351 production retirement operator", () => {
  it("keeps plan mode read-only and requires no destructive confirmation", () => {
    expect(
      parseExternalPhotoIdentificationRetirementArgs([
        "--mode",
        "plan",
        "--env-file",
        "/tmp/ove351-production.env",
      ]),
    ).toEqual({
      mode: "plan",
      envFile: "/tmp/ove351-production.env",
    });
  });

  it("requires the approved digest and explicit production confirmation for apply", () => {
    expect(() =>
      parseExternalPhotoIdentificationRetirementArgs(["--mode", "apply"]),
    ).toThrow(/approved plan digest/i);

    expect(
      parseExternalPhotoIdentificationRetirementArgs([
        "--mode",
        "apply",
        "--env-file",
        "/tmp/ove351-production.env",
        "--approved-plan-digest",
        APPROVED_EMPTY_PLAN_DIGEST,
        "--confirm-production",
        "retire-empty-external-photo-identification",
      ]),
    ).toEqual({
      mode: "apply",
      envFile: "/tmp/ove351-production.env",
      approvedPlanDigest: APPROVED_EMPTY_PLAN_DIGEST,
      confirmProduction: "retire-empty-external-photo-identification",
    });
  });

  it("admits only the exact four-table, zero-row state", () => {
    expect(
      classifyExternalPhotoIdentificationRetirement(emptyEvidence()),
    ).toEqual({ state: "eligible_empty" });
    expect(
      classifyExternalPhotoIdentificationRetirement(
        emptyEvidence({ requestCount: 1 }),
      ),
    ).toMatchObject({ state: "blocked_nonzero" });
    expect(
      classifyExternalPhotoIdentificationRetirement(
        emptyEvidence({ presentTables: expectedTables.slice(0, 3) }),
      ),
    ).toMatchObject({ state: "drift" });
  });

  it("treats complete absence as an idempotent replay state", () => {
    expect(
      classifyExternalPhotoIdentificationRetirement(
        emptyEvidence({ presentTables: [] }),
      ),
    ).toEqual({ state: "already_absent" });
  });

  it("hashes stable redacted evidence without admitting record identifiers", () => {
    const left = stableRetirementDigest({ b: 2, a: { d: 4, c: 3 } });
    const right = stableRetirementDigest({ a: { c: 3, d: 4 }, b: 2 });

    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reproduces the two-read approved production plan digest", () => {
    const plan = buildExternalPhotoIdentificationPlan(emptyEvidence(), {
      apiKeyPresent: true,
      featureFlag: "true",
    });

    expect(stableRetirementDigest(plan)).toBe(APPROVED_EMPTY_PLAN_DIGEST);
  });

  it("rejects a preservation aggregate change before or after DDL", () => {
    const before = emptyEvidence().preserved;
    expect(() => assertPreservationUnchanged(before, before)).not.toThrow();
    expect(() =>
      assertPreservationUnchanged(before, {
        ...before,
        journalEntries: before.journalEntries + 1,
      }),
    ).toThrow(/preservation aggregate drift/i);
  });

  it("limits the contract migration to the exact four retired tables", async () => {
    const migration = await readFile(
      new URL(
        "../sql/0037_ove351_retire_external_photo_identification.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const droppedTables = [
      ...migration.matchAll(/drop table if exists ([a-z_]+);/g),
    ].map((match) => match[1]);

    expect(droppedTables).toEqual([
      "plant_identification_decisions",
      "plant_identification_candidates",
      "plant_identification_submission_slots",
      "plant_identification_requests",
    ]);
    expect(migration).not.toMatch(
      /\b(?:delete\s+from|insert\s+into|truncate|update\s+[a-z_]|drop\s+table[^;]*cascade)\b/i,
    );
    expect(migration).not.toMatch(
      /\b(?:plant_objects|journal_entries|media_assets|catalog_items|lineage_provenance_edges|analytics_events|catalog_source_records)\b/,
    );
    expect(migration).toContain("set local lock_timeout = '5s'");
    expect(migration).toContain("set local statement_timeout = '20s'");
  });
});

const describeDatabaseIntegration =
  process.env.RUN_OVE351_DATABASE_INTEGRATION === "true"
    ? describe.sequential
    : describe.skip;

describeDatabaseIntegration(
  "OVE-351 disposable database retirement integration",
  () => {
    let adminPool: Pool | undefined;
    let disposablePool: Pool | undefined;
    let disposableDatabase = "";
    let migration = "";

    beforeAll(async () => {
      const configuredUrl = requireLocalDatabaseUrl(process.env.DATABASE_URL);
      disposableDatabase = `ove351_${randomUUID().replaceAll("-", "")}`;
      adminPool = new Pool({ connectionString: configuredUrl.toString() });
      await adminPool.query(
        `create database ${quoteDisposableDatabase(disposableDatabase)}`,
      );

      const disposableUrl = new URL(configuredUrl);
      disposableUrl.pathname = `/${disposableDatabase}`;
      disposablePool = new Pool({
        connectionString: disposableUrl.toString(),
        max: 4,
      });
      migration = await readFile(
        new URL(
          "../sql/0037_ove351_retire_external_photo_identification.sql",
          import.meta.url,
        ),
        "utf8",
      );
    });

    afterAll(async () => {
      await disposablePool?.end();
      if (adminPool && disposableDatabase) {
        await adminPool.query(
          `drop database if exists ${quoteDisposableDatabase(disposableDatabase)}`,
        );
      }
      await adminPool?.end();
    });

    it("migration replay drops only the empty provider tables and preserves product sentinels", async () => {
      const pool = requiredDisposablePool(disposablePool);
      await resetDisposableSchema(pool);
      const before = await preservedSentinelReceipt(pool);

      await pool.query(migration);
      await pool.query(migration);

      expect(await providerTableCount(pool)).toBe(0);
      expect(await preservedSentinelReceipt(pool)).toEqual(before);
    });

    it("nonzero rows fail closed without a partial schema mutation", async () => {
      const pool = requiredDisposablePool(disposablePool);
      await resetDisposableSchema(pool);
      await pool.query(
        "insert into plant_identification_requests (id, state) values ($1, 'ready_to_submit')",
        [randomUUID()],
      );

      await expect(pool.query(migration)).rejects.toThrow(
        /ove351_retirement_blocked_nonzero/,
      );
      expect(await providerTableCount(pool)).toBe(4);
      const remaining = await pool.query<{ count: number }>(
        "select count(*)::int as count from plant_identification_requests",
      );
      expect(remaining.rows[0]?.count).toBe(1);
    });

    it("partial schema drift fails closed and leaves the remaining tables intact", async () => {
      const pool = requiredDisposablePool(disposablePool);
      await resetDisposableSchema(pool);
      await pool.query("drop table plant_identification_decisions");

      await expect(pool.query(migration)).rejects.toThrow(
        /ove351_retirement_schema_drift/,
      );
      expect(await providerTableCount(pool)).toBe(3);
    });

    it("concurrent race admits one named-lock holder and blocks the loser", async () => {
      const pool = requiredDisposablePool(disposablePool);
      await resetDisposableSchema(pool);
      const holder = await pool.connect();
      try {
        await holder.query("begin");
        await holder.query(
          "select pg_advisory_xact_lock(hashtextextended($1, 0))",
          ["overgarden:ove351:external-photo-identification-retirement"],
        );

        await expect(pool.query(migration)).rejects.toThrow(
          /ove351_retirement_lock_unavailable/,
        );
        expect(await providerTableCount(pool)).toBe(4);
      } finally {
        await holder.query("rollback");
        holder.release();
      }

      await pool.query(migration);
      expect(await providerTableCount(pool)).toBe(0);
    });

    it("table-lock timeout is bounded and rolls back without wedging replay", async () => {
      const pool = requiredDisposablePool(disposablePool);
      await resetDisposableSchema(pool);
      const holder = await pool.connect();
      const startedAt = performance.now();
      try {
        await holder.query("begin");
        await holder.query(
          "lock table plant_identification_requests in access share mode",
        );
        await expect(pool.query(migration)).rejects.toThrow(/lock timeout/i);
      } finally {
        await holder.query("rollback");
        holder.release();
      }

      expect(performance.now() - startedAt).toBeLessThan(8_000);
      expect(await providerTableCount(pool)).toBe(4);
      await pool.query(migration);
      expect(await providerTableCount(pool)).toBe(0);
    }, 10_000);
  },
);

function emptyEvidence(
  overrides: Partial<ExternalPhotoIdentificationEvidence> = {},
): ExternalPhotoIdentificationEvidence {
  return {
    version: "ove351.externalPhotoIdentificationRetirement.v1",
    environment: "production",
    databaseIdentity: "digitalocean_overgarden_production",
    schemaDigest:
      "01f9a92a4f5843566e1a1d0e54c82bd1dc1b12af6b014280fc7d2a6260092069",
    presentTables: [...expectedTables],
    requestCount: 0,
    candidateCount: 0,
    decisionCount: 0,
    submissionSlotCount: 4,
    occupiedSubmissionSlotCount: 0,
    ownerCount: 0,
    referencedObjectCount: 0,
    selectedCatalogItemCount: 0,
    preserved: {
      plantObjects: 27,
      journalEntries: 213,
      mediaAssets: 51,
      catalogItems: 81,
      lineageEdges: 0,
      analyticsEvents: 0,
      sourceRegistryRows: 0,
    },
    ...overrides,
  };
}

function requireLocalDatabaseUrl(value: string | undefined) {
  if (!value) throw new Error("DATABASE_URL is required for DB integration");
  const databaseUrl = new URL(value);
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(databaseUrl.hostname)) {
    throw new Error("OVE-351 integration refuses a non-local database");
  }
  if (!databaseUrl.pathname.slice(1)) {
    throw new Error("OVE-351 integration requires a local admin database");
  }
  return databaseUrl;
}

function quoteDisposableDatabase(value: string) {
  if (!/^ove351_[a-f0-9]{32}$/.test(value)) {
    throw new Error("invalid OVE-351 disposable database identifier");
  }
  return `"${value}"`;
}

function requiredDisposablePool(pool: Pool | undefined) {
  if (!pool) throw new Error("OVE-351 disposable database is unavailable");
  return pool;
}

async function resetDisposableSchema(pool: Pool) {
  await pool.query(`
    drop table if exists plant_identification_decisions;
    drop table if exists plant_identification_candidates;
    drop table if exists plant_identification_submission_slots;
    drop table if exists plant_identification_requests;
    drop table if exists plant_objects;
    drop table if exists journal_entries;
    drop table if exists media_assets;
    drop table if exists catalog_items;
    drop table if exists lineage_provenance_edges;
    drop table if exists analytics_events;
    drop table if exists catalog_source_records;

    create table plant_identification_requests (
      id uuid primary key,
      state text not null,
      owner_user_id uuid,
      plant_object_id uuid
    );
    create table plant_identification_candidates (
      id uuid primary key,
      request_id uuid
    );
    create table plant_identification_decisions (
      id uuid primary key,
      selected_catalog_item_id uuid
    );
    create table plant_identification_submission_slots (
      slot integer primary key,
      request_id uuid
    );
    insert into plant_identification_submission_slots (slot)
    select generate_series(1, 4);

    create table plant_objects (id uuid primary key);
    create table journal_entries (id uuid primary key);
    create table media_assets (id uuid primary key);
    create table catalog_items (id uuid primary key);
    create table lineage_provenance_edges (id uuid primary key);
    create table analytics_events (id uuid primary key);
    create table catalog_source_records (id uuid primary key);
    insert into plant_objects values ('00000000-0000-4000-8000-000000000001');
    insert into journal_entries values ('00000000-0000-4000-8000-000000000002');
    insert into media_assets values ('00000000-0000-4000-8000-000000000003');
    insert into catalog_items values ('00000000-0000-4000-8000-000000000004');
    insert into lineage_provenance_edges values ('00000000-0000-4000-8000-000000000005');
    insert into analytics_events values ('00000000-0000-4000-8000-000000000006');
    insert into catalog_source_records values ('00000000-0000-4000-8000-000000000007');
  `);
}

async function providerTableCount(pool: Pool) {
  const result = await pool.query<{ count: number }>(`
    select count(*)::int as count
    from unnest(array[
      'plant_identification_requests',
      'plant_identification_candidates',
      'plant_identification_decisions',
      'plant_identification_submission_slots'
    ]::text[]) as retired_table(table_name)
    where to_regclass('public.' || retired_table.table_name) is not null
  `);
  return result.rows[0]?.count;
}

async function preservedSentinelReceipt(pool: Pool) {
  const result = await pool.query<Record<string, number>>(`
    select
      (select count(*)::int from plant_objects) as plant_objects,
      (select count(*)::int from journal_entries) as journal_entries,
      (select count(*)::int from media_assets) as media_assets,
      (select count(*)::int from catalog_items) as catalog_items,
      (select count(*)::int from lineage_provenance_edges) as lineage_edges,
      (select count(*)::int from analytics_events) as analytics_events,
      (select count(*)::int from catalog_source_records) as source_registry_rows
  `);
  return result.rows[0];
}

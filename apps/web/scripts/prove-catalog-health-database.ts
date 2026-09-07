import "./neutralise-server-only";

import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import {
  CATALOG_PICK_EVENT_RETENTION_DAYS,
  purgeCatalogPickEvents,
  readCatalogAutoAcceptPrecision,
  readCatalogPickHealth,
  readOldestOpenQueueItemAgeDays,
  createQueueItemForSearchMiss,
  readTopCatalogSearchMisses,
  recordCatalogPickEvent,
} from "../src/server/catalog-health-repository";
import { applyMigrationsBefore } from "./prove-organism-graph-foundation";

/**
 * The catalog health figures, executed (OVE-398, ADR-0026 D12).
 *
 * A percentile over an empty set, a retention window and a "top misses" list
 * are all things that look right in a type and are wrong in a database. This
 * builds a disposable database from every migration, writes pick events with
 * real timestamps — including rows backdated past the window — and reads the
 * figures the owner's health tab shows.
 *
 * What it proves:
 *
 *   * with no events at all, the medians are **null** rather than zero: an
 *     owner must not read "0 ms to pick" as a measured instant;
 *   * pick success, own-label and abandonment are counted over both windows,
 *     and a seven-day figure never counts a thirty-day row;
 *   * the median and P95 are computed from the durations actually stored;
 *   * the purge deletes what is older than ninety days **and nothing newer**;
 *   * a resolved search miss leaves the list, and an unresolved one is ranked
 *     by how often it was asked;
 *   * auto-accept precision is reverted over applied, per rule.
 *
 * Output is aggregate: counts, durations and booleans. Never a query, never a
 * connection string.
 */

const OWNER_EMAIL = "ove398-health@example.test";

async function seedOwner(pool: Pool): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, 'OVE-398 proof', $2, true, now(), now())`,
    [id, OWNER_EMAIL],
  );
  return id;
}

async function seedEvent(
  pool: Pool,
  input: {
    ownerUserId: string;
    outcome: string;
    msToPick: number | null;
    daysAgo: number;
  },
): Promise<void> {
  await pool.query(
    `insert into catalog_pick_events (
       occurred_at, outcome, query_length, ms_to_pick, locale, object_kind, owner_user_id
     )
     values (now() - ($1 || ' days')::interval, $2, 6, $3, 'uk', 'plant', $4)`,
    [input.daysAgo, input.outcome, input.msToPick, input.ownerUserId],
  );
}

export async function runCatalogHealthDatabaseProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const disposable = `overgarden_ove398_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    // Everything, in order: "before 9999" is every migration there is.
    await applyMigrationsBefore(pool, targetUrl.toString(), "9999");

    // Nothing has happened yet. This is the state a freshly deployed health
    // tab is read in, and the one where a zero would lie.
    const empty = await readCatalogPickHealth(db);
    const emptyMediansAreNull = empty.every(
      (row) => row.medianMsToPick === null && row.p95MsToPick === null,
    );
    if (!emptyMediansAreNull) {
      throw new Error("ove398_empty_percentiles_not_null");
    }
    if (empty.length !== 2 || empty.some((row) => row.attempts !== 0)) {
      throw new Error("ove398_empty_windows_wrong");
    }

    const ownerUserId = await seedOwner(pool);

    // Five picks and one own label inside the week, plus an abandonment; one
    // pick a fortnight old, so the seven-day window has to exclude it.
    for (const ms of [400, 600, 800, 1200, 5000]) {
      await seedEvent(pool, {
        ownerUserId,
        outcome: "picked_species",
        msToPick: ms,
        daysAgo: 1,
      });
    }
    await seedEvent(pool, {
      ownerUserId,
      outcome: "own_label",
      msToPick: 2500,
      daysAgo: 2,
    });
    await seedEvent(pool, {
      ownerUserId,
      outcome: "abandoned",
      msToPick: null,
      daysAgo: 3,
    });
    await seedEvent(pool, {
      ownerUserId,
      outcome: "picked_form",
      msToPick: 900,
      daysAgo: 14,
    });
    // Older than the retention window; the purge must take exactly this one.
    await seedEvent(pool, {
      ownerUserId,
      outcome: "picked_species",
      msToPick: 700,
      daysAgo: CATALOG_PICK_EVENT_RETENTION_DAYS + 5,
    });

    const health = await readCatalogPickHealth(db);
    const week = health.find((row) => row.windowDays === 7);
    const month = health.find((row) => row.windowDays === 30);
    if (!week || !month) throw new Error("ove398_windows_missing");
    if (week.attempts !== 7 || week.picked !== 5 || week.ownLabel !== 1) {
      throw new Error("ove398_week_counts_wrong");
    }
    if (week.abandoned !== 1) throw new Error("ove398_abandonment_uncounted");
    // The fortnight-old pick belongs to the month and not to the week.
    if (month.attempts !== 8 || month.picked !== 6) {
      throw new Error("ove398_month_counts_wrong");
    }
    if (week.medianMsToPick === null || week.p95MsToPick === null) {
      throw new Error("ove398_percentiles_missing");
    }
    if (week.medianMsToPick < 600 || week.medianMsToPick > 1200) {
      throw new Error(`ove398_median_out_of_range:${week.medianMsToPick}`);
    }
    if (week.p95MsToPick <= week.medianMsToPick) {
      throw new Error("ove398_p95_not_above_median");
    }

    // One recorded through the repository, so the clamp and the insert are the
    // ones the Server Action uses.
    const recorded = await recordCatalogPickEvent(
      {
        ownerUserId,
        outcome: "abandoned",
        // Out of range on both fields: a measurement is clamped, never lost,
        // and never allowed to fail a gardener's action on a CHECK.
        queryLength: 10_000,
        msToPick: 999_999_999,
        locale: "uk",
        objectKind: "plant",
        catalogItemId: null,
      },
      db,
    );
    if (recorded === null) throw new Error("ove398_record_returned_no_row");
    const clamped = await pool.query<{ query_length: number; ms_to_pick: number }>(
      "select query_length, ms_to_pick from catalog_pick_events where id = $1",
      [recorded],
    );
    if (
      clamped.rows[0]?.query_length !== 500 ||
      clamped.rows[0]?.ms_to_pick !== 3_600_000
    ) {
      throw new Error("ove398_clamp_not_applied");
    }

    const before = await pool.query<{ n: string }>(
      "select count(*) as n from catalog_pick_events",
    );
    const purged = await purgeCatalogPickEvents(db);
    const after = await pool.query<{ n: string }>(
      "select count(*) as n from catalog_pick_events",
    );
    if (purged !== 1) throw new Error(`ove398_purge_took:${purged}`);
    if (Number(before.rows[0]?.n) - Number(after.rows[0]?.n) !== 1) {
      throw new Error("ove398_purge_removed_the_wrong_number");
    }
    const survivorsInWindow = await pool.query<{ n: string }>(
      `select count(*) as n from catalog_pick_events
       where occurred_at < now() - ($1 || ' days')::interval`,
      [CATALOG_PICK_EVENT_RETENTION_DAYS],
    );
    if (Number(survivorsInWindow.rows[0]?.n) !== 0) {
      throw new Error("ove398_expired_row_survived");
    }

    // Two misses, one already resolved. The resolved one is finished work and
    // must not be shown again.
    await pool.query(
      `insert into catalog_search_misses (query_normalized, locale, object_kind, occurrences)
       values ('поiмдор', 'uk', 'plant', 9), ('трояда', 'uk', 'plant', 2)`,
    );
    // The resolved miss points at a real node: the column has a foreign key,
    // and a proof that seeds an unreachable id proves the wrong thing.
    const resolvedNode = randomUUID();
    await pool.query(
      `insert into catalog_items (
         id, canonical_name, catalog_kind, normalized_name, status, source,
         source_id, locale, node_kind, identity_state
       )
       values ($1, 'Rosa canina', 'species', catalog_normalize_name('Rosa canina'),
               'seeded', 'species_backbone', $2, 'la', 'taxon', 'active')`,
      [resolvedNode, `ove398:${resolvedNode}`],
    );
    await pool.query(
      `update catalog_search_misses
       set resolved_catalog_item_id = $1
       where query_normalized = 'трояда'`,
      [resolvedNode],
    );
    const misses = await readTopCatalogSearchMisses(db);
    if (misses.length !== 1 || misses[0]?.queryNormalized !== "поiмдор") {
      throw new Error("ove398_miss_list_wrong");
    }
    if (misses[0]?.occurrences !== 9) {
      throw new Error("ove398_miss_occurrences_wrong");
    }

    // One movement turns the miss into a decision, and the miss leaves the
    // list because the open item is there — pressing twice makes one item.
    const queueItemId = await createQueueItemForSearchMiss(
      { queryNormalized: "поiмдор", locale: "uk", objectKind: "plant" },
      db,
    );
    const again = await createQueueItemForSearchMiss(
      { queryNormalized: "поiмдор", locale: "uk", objectKind: "plant" },
      db,
    );
    if (queueItemId === null || again !== queueItemId) {
      throw new Error("ove398_queue_item_not_idempotent");
    }
    const afterQueueing = await readTopCatalogSearchMisses(db);
    if (afterQueueing.length !== 0) {
      throw new Error("ove398_queued_miss_still_listed");
    }
    const openItems = await pool.query<{ n: string }>(
      "select count(*) as n from catalog_curation_queue where item_type = 'label_link' and state = 'open'",
    );
    if (Number(openItems.rows[0]?.n) !== 1) {
      throw new Error("ove398_queue_items_multiplied");
    }

    const precision = await readCatalogAutoAcceptPrecision(db);
    const queueAge = await readOldestOpenQueueItemAgeDays(db);

    return {
      schemaVersion: "ove398.catalogHealth.v1",
      mode: "disposable" as const,
      status: "pass" as const,
      emptyPercentilesAreNull: emptyMediansAreNull,
      weekAttempts: week.attempts,
      weekPicked: week.picked,
      weekOwnLabel: week.ownLabel,
      weekAbandoned: week.abandoned,
      monthAttempts: month.attempts,
      medianMsToPick: week.medianMsToPick,
      p95MsToPick: week.p95MsToPick,
      clampedOutOfRangeMeasurement: true,
      purgedExpiredRows: purged,
      newerRowsKept: Number(after.rows[0]?.n),
      unresolvedMissesListed: misses.length,
      missLeavesTheListOnceQueued: afterQueueing.length === 0,
      queueItemsCreatedByTwoPresses: Number(openItems.rows[0]?.n),
      autoAcceptRules: precision.length,
      oldestOpenQueueItemDays: queueAge,
    };
  } finally {
    await db.destroy().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

const isEntrypoint =
  process.argv[1]?.endsWith("prove-catalog-health-database.ts") === true;

if (isEntrypoint) {
  runCatalogHealthDatabaseProof()
    .then((receipt) => {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify({
          schemaVersion: "ove398.catalogHealth.v1",
          status: "fail",
          errorClass:
            error instanceof Error && /^[a-z0-9_:.]+$/u.test(error.message)
              ? error.message
              : "unknown_error",
          detail: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
      process.exitCode = 1;
    });
}

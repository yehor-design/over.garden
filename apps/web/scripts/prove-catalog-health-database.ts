import "./neutralise-server-only";

import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import {
  applyCatalogQueueItem,
  buildEnqueueCatalogSourceRefreshJobQuery,
  listCatalogSources,
  listOpenCurationQueue,
  readCatalogSourceCoverage,
  readCurationActionSummary,
  readCurationQueueItemSummary,
  rejectCatalogQueueItem,
  revertCatalogAction,
  skipCatalogQueueItem,
} from "../src/server/catalog-curation-repository";
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

/**
 * The owner's work queues, executed (`OVE-506`).
 *
 * - Every open item the queue marks appliable is applied by
 *   `catalog_apply_queue_item`, and every item it marks blocked is refused by
 *   it: the page's "can be accepted" is the function's own answer, read before
 *   the press. Before this, Accept was offered on items the function refuses,
 *   and each press ended on the error page.
 * - An automatic decision the owner takes back is counted as reverted. The
 *   revert row is the owner's (`automatic = false`), so counting automatic
 *   revert rows counted nothing and every rule read 0 reverted.
 * - A rejection or a skip says whether it changed anything.
 * - A source is identified from its newest imported snapshot, a newer
 *   rejected one is reported beside it, its refresh job is found by its key,
 *   and its counts are read on their own.
 */
async function proveCatalogWorkQueueReads(
  pool: Pool,
  db: Kysely<Database>,
  ownerUserId: string,
) {
  const node = async (name: string, nodeKind: string, state = "active") => {
    const id = randomUUID();
    await pool.query(
      `insert into catalog_items (
         id, canonical_name, normalized_name, source, source_id, locale,
         node_kind, kingdom, identity_state
       )
       values ($1, $2, catalog_normalize_name($2), 'species_backbone', $3, 'la',
               $4, 'Plantae', $5)`,
      [id, name, `ove506:${id}`, nodeKind, state],
    );
    return id;
  };
  const species = await node("Solanum lycopersicum L.", "taxon");
  const cultivar = await node("Де Барао OVE-506", "cultivar");
  const otherCultivar = await node("Бичаче серце OVE-506", "cultivar");
  const retired = await node("Lycopersicon OVE-506", "taxon", "retired");

  const item = async (input: {
    itemType: string;
    subject: string | null;
    label: string | null;
    proposal: Record<string, string>;
    reason: string;
  }) => {
    const id = randomUUID();
    await pool.query(
      `insert into catalog_curation_queue (
         id, item_type, subject_catalog_item_id, subject_label, proposal,
         confidence, reasons, impact_score, state
       )
       values ($1, $2, $3, $4, $5::jsonb, 0.95, array[$6]::text[], 5, 'open')`,
      [
        id,
        input.itemType,
        input.subject,
        input.label,
        JSON.stringify(input.proposal),
        input.reason,
      ],
    );
    return id;
  };
  const expected: Record<string, string | null> = {};
  const appliable = await item({
    itemType: "label_link",
    subject: species,
    label: "помідор бабусі ove506",
    proposal: { catalog_item_id: species, object_kind: "plant" },
    reason: "label_scientific_name:stored",
  });
  expected[appliable] = null;
  const intoRetired = await item({
    itemType: "label_link",
    subject: null,
    label: "старий помідор ove506",
    proposal: { catalog_item_id: retired, object_kind: "plant" },
    reason: "denomination_equal",
  });
  expected[intoRetired] = "target_inactive";
  const merge = await item({
    itemType: "node_merge",
    subject: cultivar,
    label: null,
    proposal: { survivor_id: species },
    reason: "col_accepted_became_synonym",
  });
  expected[merge] = null;
  const mergeWithoutSurvivor = await item({
    itemType: "node_merge",
    subject: otherCultivar,
    label: null,
    proposal: { catalog_item_id: species },
    reason: "canonical_same_kingdom_rank",
  });
  expected[mergeWithoutSurvivor] = "no_target";
  const split = await item({
    itemType: "split_review",
    subject: species,
    label: null,
    proposal: {},
    reason: "homonym_kingdom_conflict",
  });
  expected[split] = "not_applied_here";
  // The search miss queued above: a name, and no card to attach it to.
  const missItem = await pool.query<{ id: string }>(
    `select id::text from catalog_curation_queue
      where item_type = 'label_link' and subject_label = 'поiмдор'`,
  );
  const miss = missItem.rows[0]?.id;
  if (!miss) throw new Error("ove506_search_miss_item_missing");
  expected[miss] = "no_target";

  const listed = await listOpenCurationQueue({ limit: 50 }, db);
  const blockedBy = new Map(listed.map((entry) => [entry.id, entry.blockedBy]));
  for (const [id, block] of Object.entries(expected)) {
    if (!blockedBy.has(id)) throw new Error(`ove506_item_not_listed:${id}`);
    if (blockedBy.get(id) !== block) {
      throw new Error(
        `ove506_block_wrong:${id}:${String(blockedBy.get(id))}!=${String(block)}`,
      );
    }
  }

  // The function agrees with every mark: blocked ones are refused and change
  // nothing; appliable ones apply.
  let refusedAsMarked = 0;
  for (const [id, block] of Object.entries(expected)) {
    if (block === null) continue;
    const refused = await pool
      .query("select catalog_apply_queue_item($1::uuid, $2::uuid, false)", [
        id,
        ownerUserId,
      ])
      .then(() => false)
      .catch(() => true);
    if (!refused) throw new Error(`ove506_blocked_item_applied:${id}:${block}`);
    const state = await readCurationQueueItemSummary(id, db);
    if (state?.state !== "open") {
      throw new Error(`ove506_refusal_changed_state:${id}`);
    }
    refusedAsMarked += 1;
  }
  const applied = await applyCatalogQueueItem(
    { queueItemId: appliable, actorUserId: ownerUserId, automatic: false },
    db,
  );
  const acceptedSummary = await readCurationQueueItemSummary(appliable, db);
  if (
    acceptedSummary?.state !== "accepted" ||
    acceptedSummary.subjectName !== "Solanum lycopersicum L." ||
    acceptedSummary.subjectLabel !== "помідор бабусі ove506"
  ) {
    throw new Error("ove506_summary_wrong_after_accept");
  }
  if (!applied.actionId) throw new Error("ove506_accept_returned_no_action");

  // A merge the worker applied on its own, which the owner then takes back.
  const automatic = await pool.query<{ action_id: string }>(
    "select catalog_apply_queue_item($1::uuid, null, true)::text as action_id",
    [merge],
  );
  const automaticActionId = automatic.rows[0]?.action_id;
  if (!automaticActionId) throw new Error("ove506_automatic_apply_missing");
  await revertCatalogAction(
    { actionId: automaticActionId, actorUserId: ownerUserId },
    db,
  );
  const precision = await readCatalogAutoAcceptPrecision(db);
  const rule = precision.find(
    (row) => row.ruleCode === "col_accepted_became_synonym",
  );
  if (!rule || rule.applied !== 1 || rule.reverted !== 1) {
    throw new Error(
      `ove506_precision_ignores_revert:${JSON.stringify(rule ?? null)}`,
    );
  }
  const undone = await readCurationActionSummary(automaticActionId, db);
  if (!undone?.reverted || undone.subjectNames.length !== 2) {
    throw new Error("ove506_action_summary_wrong");
  }

  // A rejection says whether it changed anything; the second one did not.
  const first = await rejectCatalogQueueItem(
    { queueItemId: split, actorUserId: ownerUserId },
    db,
  );
  const second = await rejectCatalogQueueItem(
    { queueItemId: split, actorUserId: ownerUserId },
    db,
  );
  const skipped = await skipCatalogQueueItem(
    { queueItemId: split, actorUserId: ownerUserId },
    db,
  );
  if (!first.changed || second.changed || skipped.changed) {
    throw new Error("ove506_decision_changed_flag_wrong");
  }

  // A source: an imported snapshot with three records, one of them linked,
  // and a newer snapshot that was rejected.
  const imported = randomUUID();
  const rejected = randomUUID();
  for (const [id, status, age] of [
    [imported, "imported", "3 days"],
    [rejected, "rejected", "1 day"],
  ] as const) {
    await pool.query(
      `insert into catalog_source_snapshots (id, source_slug, source_name, source_category,
         source_version, source_url, license, parser_version, payload_sha256,
         fetched_at, verified_at, status)
       values ($1, 'ove506-source', 'OVE-506 proof source', 'taxonomy', $2,
               'https://example.test/source', 'CC BY 4.0', 'ove506', $3,
               now() - $4::interval, now() - $4::interval, $5)`,
      [id, `ove506-${status}`, "0".repeat(64), age, status],
    );
  }
  const recordIds: string[] = [];
  for (const key of ["one", "two", "three"]) {
    const record = await pool.query<{ id: string }>(
      `insert into catalog_source_records (source_snapshot_id, source_record_id,
         raw_payload, raw_payload_sha256)
       values ($1, $2, '{}'::jsonb, $3) returning id::text`,
      [imported, `ove506-${key}`, "a".repeat(64)],
    );
    recordIds.push(record.rows[0]!.id);
  }
  // One record linked to two cards — what a merge leaves behind, since it
  // does not move source links. It is still one linked record.
  for (const card of [species, cultivar]) {
    await pool.query(
      `insert into catalog_source_links (catalog_item_id, source_record_id, source_slug,
         source_record_key)
       values ($1, $2, 'ove506-source', 'ove506-one')`,
      [card, recordIds[0]],
    );
  }
  await buildEnqueueCatalogSourceRefreshJobQuery(db, "ove506-source").execute();
  const sources = await listCatalogSources(db);
  const source = sources.find((entry) => entry.sourceSlug === "ove506-source");
  if (!source) throw new Error("ove506_source_not_listed");
  if (source.snapshotId !== imported) {
    throw new Error("ove506_source_counts_the_rejected_snapshot");
  }
  if (source.rejectedAfterAt === null) {
    throw new Error("ove506_newer_rejection_not_reported");
  }
  if (source.refresh?.status !== "pending") {
    throw new Error(`ove506_refresh_state_wrong:${source.refresh?.status}`);
  }
  const coverage = await readCatalogSourceCoverage(source.snapshotId, db);
  if (coverage.recordCount !== 3 || coverage.linkedCount !== 1) {
    throw new Error(`ove506_coverage_wrong:${JSON.stringify(coverage)}`);
  }

  return {
    queueItemsMarked: Object.keys(expected).length,
    blockedItemsRefusedByTheFunction: refusedAsMarked,
    appliableItemApplied: true,
    precisionCountsARevert: true,
    rejectionReportsNoChangeTheSecondTime: true,
    sourceUsesItsImportedSnapshot: true,
    sourceRefreshFoundByItsKey: source.refresh.status,
    sourceCoverage: coverage,
  };
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
  // `drop database … with (force)` terminates whatever is still connected, and
  // pg raises that as an `error` event on the pool. Unhandled, it crashes the
  // process after the receipt has already printed — which is how this proof
  // failed in CI while passing locally, purely on teardown timing.
  admin.on("error", () => undefined);
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });
  pool.on("error", () => undefined);
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
         id, canonical_name, normalized_name, source,
         source_id, locale, node_kind, identity_state
       )
       values ($1, 'Rosa canina', catalog_normalize_name('Rosa canina'),
               'species_backbone', $2, 'la', 'taxon', 'active')`,
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

    // OVE-506: the figures carry their sample, and the work queues read what
    // the functions will actually do.
    if (week.timedPicks !== 6 || month.timedPicks !== 7) {
      // Seven attempts in the week, one of them an abandonment with no time.
      throw new Error(
        `ove506_timed_picks_wrong:${week.timedPicks}/${month.timedPicks}`,
      );
    }
    const workQueues = await proveCatalogWorkQueueReads(pool, db, ownerUserId);

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
      weekTimedPicks: week.timedPicks,
      ...workQueues,
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

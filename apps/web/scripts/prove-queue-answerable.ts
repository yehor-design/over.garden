/**
 * The owner's queue carries questions it can answer — executed, on a real
 * database built from every migration (`0078`).
 *
 * On 2026-09-20 production's queue held 13,456 open items and
 * `catalog_apply_queue_item` refused every one of them. Three producers had
 * reached for the one item type there was, and the apply function implements
 * one meaning of it, so a fortnight of apparent work was a wall. Nothing in
 * the repository could have caught that: every test mocked the queue, and a
 * queue row that cannot be applied looks exactly like one that can until
 * somebody presses Accept.
 *
 * So this proof presses Accept. Four things, in order:
 *
 *   1. **The wall cannot be rebuilt.** An `open` `source_link` without a
 *      subject, a slug or a snapshot is refused by the constraint. Observed
 *      red here — a constraint nobody has seen reject anything is a constraint
 *      that may not work.
 *   2. **A complete one is applied and reverted**, and
 *      `catalog_curation_actions` holds the action and its inverse.
 *   3. **`source_unmatched` is out of the decision stream** — not listed, not
 *      counted as a decision, and not ageing the oldest-decision figure.
 *   4. **It is counted where measurements live**, by source.
 *
 *   pnpm prove:queue-answerable
 *
 * The receipt names checks and counts. No gardener's words are read or
 * printed: the fixtures are this proof's own.
 */
import "./neutralise-server-only";

import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "../src/db/schema";
import { assertLoopbackDatabaseEnvironment } from "../src/lib/local-runtime-safety";
import {
  applyCatalogQueueItem,
  countOpenCurationQueue,
  listOpenCurationQueue,
  revertCatalogAction,
} from "../src/server/catalog-curation-repository";
import {
  readOldestOpenQueueItemAgeDays,
  readUnplacedRecords,
} from "../src/server/catalog-health-repository";
import { applyMigrationsBefore } from "./prove-organism-graph-foundation";

export interface QueueAnswerableCheck {
  check: string;
  passed: boolean;
  detail: string;
}

export interface QueueAnswerableReceipt {
  version: 1;
  issue: "queue-answerable";
  checks: QueueAnswerableCheck[];
  passedCount: number;
  failedCount: number;
  generatedAt: string;
}

/**
 * The three ways a `source_link` was un-appliable on production, each built
 * from the seeded node and snapshot. Every one carries a `subject_label`, so
 * the older `catalog_curation_queue_subject_check` is satisfied and the only
 * thing that can refuse the row is the constraint this proof is about.
 */
function refusals(nodeId: string, snapshotId: string) {
  return [
    {
      check: "an open source_link with no subject is refused",
      subject: null,
      proposal: { source_slug: "eppo", source_snapshot_id: snapshotId },
    },
    {
      check: "an open source_link with no snapshot is refused",
      subject: nodeId,
      proposal: { source_slug: "eppo" },
    },
    {
      check: "an open source_link with no source slug is refused",
      subject: nodeId,
      proposal: { source_snapshot_id: snapshotId },
    },
  ] as const;
}

export async function runQueueAnswerableProof(): Promise<QueueAnswerableReceipt> {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackDatabaseEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const disposable = `overgarden_queue_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  // `drop database … with (force)` terminates whatever is still connected, and
  // pg raises that as an `error` event on the pool. Unhandled it crashes the
  // process after the receipt has printed.
  admin.on("error", () => undefined);
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });
  pool.on("error", () => undefined);
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  const checks: QueueAnswerableCheck[] = [];
  const record = (check: string, passed: boolean, detail: string) => {
    checks.push({ check, passed, detail });
  };

  try {
    await applyMigrationsBefore(pool, targetUrl.toString(), "9999");

    const { nodeId, snapshotId } = await seedGraph(pool);

    // 1. The constraint, observed red.
    for (const refusal of refusals(nodeId, snapshotId)) {
      let refused = false;
      let detail = "the row was accepted";
      try {
        await pool.query(
          `insert into catalog_curation_queue
             (item_type, subject_catalog_item_id, subject_label, proposal,
              reasons, impact_score, state)
           values ('source_link', $1::uuid, 'proof', $2::jsonb,
                   array['proof'], 1, 'open')`,
          [refusal.subject, JSON.stringify(refusal.proposal)],
        );
      } catch (error) {
        refused = true;
        detail = String(error)
          .replace(/^error: /u, "")
          .slice(0, 90);
      }
      record(refusal.check, refused, detail);
    }

    // 2. A complete one is applied and reverted, and both rows survive.
    const queueItemId = randomUUID();
    await pool.query(
      `insert into catalog_curation_queue
         (id, item_type, subject_catalog_item_id, proposal, reasons, impact_score, state)
       values ($1::uuid, 'source_link', $2::uuid, $3::jsonb, array['proof_link'], 7, 'open')`,
      [
        queueItemId,
        nodeId,
        JSON.stringify({
          source_slug: "eppo",
          source_snapshot_id: snapshotId,
          identifiers: [{ scheme: "eppo", value: "PROOFX" }],
        }),
      ],
    );

    const listed = await listOpenCurationQueue({ limit: 20 }, db);
    record(
      "a complete link decision is in the stream",
      listed.some((item) => item.id === queueItemId),
      `${listed.length} listed`,
    );

    const applied = await applyCatalogQueueItem(
      { queueItemId, actorUserId: null, automatic: false },
      db,
    );
    const identifier = await pool.query<{ n: string }>(
      `select count(*)::text as n from catalog_item_identifiers
       where catalog_item_id = $1::uuid and scheme = 'eppo' and value = 'PROOFX'`,
      [nodeId],
    );
    record(
      "accepting it attaches the identifier it named",
      identifier.rows[0]?.n === "1",
      `identifiers ${identifier.rows[0]?.n ?? "0"}`,
    );

    await revertCatalogAction(
      { actionId: applied.actionId, actorUserId: null },
      db,
    );
    const afterRevert = await pool.query<{ n: string }>(
      `select count(*)::text as n from catalog_item_identifiers
       where catalog_item_id = $1::uuid and scheme = 'eppo' and value = 'PROOFX'`,
      [nodeId],
    );
    const actions = await pool.query<{ n: string }>(
      `select count(*)::text as n from catalog_curation_actions
       where id = $1::uuid or (payload->>'reverted_action_id') = $1::text`,
      [applied.actionId],
    );
    record(
      "reverting it puts the graph back, and both rows remain",
      afterRevert.rows[0]?.n === "0" && actions.rows[0]?.n === "2",
      `identifiers ${afterRevert.rows[0]?.n ?? "?"}, action rows ${actions.rows[0]?.n ?? "?"}`,
    );

    // 3 and 4. An unplaced record is coverage, not a decision.
    const unmatchedId = randomUUID();
    await pool.query(
      `insert into catalog_curation_queue
         (id, item_type, subject_catalog_item_id, subject_label, proposal,
          reasons, impact_score, state, created_at)
       values ($1::uuid, 'source_unmatched', null, 'Abies', $2::jsonb,
               array['eppo_unmatched'], 1, 'open', now() - interval '40 days')`,
      [
        unmatchedId,
        JSON.stringify({ source_slug: "eppo", preferred_name: "Abies" }),
      ],
    );

    const stream = await listOpenCurationQueue({ limit: 50 }, db);
    const counted = await countOpenCurationQueue(db);
    record(
      "an unplaced record is not in the decision stream",
      stream.every((item) => item.id !== unmatchedId) &&
        counted.byType.source_unmatched === undefined,
      `stream ${stream.length}, counted ${counted.total}`,
    );

    const age = await readOldestOpenQueueItemAgeDays(db);
    record(
      "and does not age the oldest-decision figure",
      age === null,
      `oldest ${String(age)}`,
    );

    const unplaced = await readUnplacedRecords(db);
    record(
      "it is counted by source, where the measurements are",
      unplaced.length === 1 &&
        unplaced[0]?.sourceSlug === "eppo" &&
        unplaced[0]?.records === 1,
      JSON.stringify(unplaced),
    );
  } finally {
    await db.destroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }

  return {
    version: 1,
    issue: "queue-answerable",
    checks,
    passedCount: checks.filter((entry) => entry.passed).length,
    failedCount: checks.filter((entry) => !entry.passed).length,
    generatedAt: new Date().toISOString(),
  };
}

async function seedGraph(pool: Pool) {
  const nodeId = randomUUID();
  const snapshotId = randomUUID();
  await pool.query(
    `insert into catalog_source_snapshots (id, source_slug, source_name, source_category,
       source_version, source_url, license, parser_version, payload_sha256, fetched_at,
       verified_at, status)
     values ($1, 'eppo', 'EPPO Global Database', 'taxonomy', 'proof',
             'https://gd.eppo.int/', 'EPPO terms of use', 'proof', $2, now(), now(), 'imported')`,
    [snapshotId, "0".repeat(64)],
  );
  await pool.query(
    `insert into catalog_items (id, canonical_name, normalized_name, public_slug,
       source, source_id, locale, node_kind, kingdom, rank, identity_state, search_weight)
     values ($1, 'Proofus answerabilis', catalog_normalize_name('Proofus answerabilis'),
             'proofus-answerabilis', 'species_backbone', $2, 'la', 'taxon',
             'Plantae', 'species', 'active', 5)`,
    [nodeId, `proof:${nodeId}`],
  );
  return { nodeId, snapshotId };
}

export function renderQueueAnswerableReceipt(receipt: QueueAnswerableReceipt) {
  const rows = receipt.checks
    .map(
      (entry) =>
        `| ${entry.check} | ${entry.passed ? "yes" : "**no**"} | ${entry.detail} |`,
    )
    .join("\n");
  return `# The owner's queue carries questions it can answer — ${receipt.generatedAt.slice(0, 10)}

Status: generated receipt. Regenerate with \`pnpm prove:queue-answerable\`.
Migration: \`apps/web/sql/0078_queue_carries_answerable_questions.sql\`.

## What was run

A disposable database built from every migration, then the queue exercised
through the same functions the owner's page calls. Three ways a \`source_link\`
was un-appliable on production are attempted and must be refused; a complete
one is applied and reverted; and an unplaced record is shown to be coverage
rather than a decision.

## Result

Passed ${receipt.passedCount} of ${receipt.checks.length} checks.

| Check | Passed | Detail |
| -- | -- | -- |
${rows}
`;
}

async function main() {
  const receipt = await runQueueAnswerableProof();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.failedCount > 0) process.exitCode = 1;
}

if (process.argv[1]?.includes("prove-queue-answerable")) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}

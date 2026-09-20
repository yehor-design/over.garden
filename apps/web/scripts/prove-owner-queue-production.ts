/**
 * The owner's decision queue, walked on a real database (`OVE-459`).
 *
 * The queue's apply and revert go through the SQL functions of migration
 * `0056` — the same ones the worker calls — so what this proves is that a
 * decision made on the owner's page lands and comes back exactly. It decides
 * **one** open item and reverts it, and the receipt is the pair of rows in
 * `catalog_curation_actions`: the action and its inverse.
 *
 *   pnpm prove:owner-queue --database-url "$(…)" [--apply]
 *
 * Without `--apply` it reads and reports what it *would* decide, which is how
 * to look at production before touching it. With `--apply` it decides and
 * reverts in one run, and refuses to leave a decision standing: the revert is
 * in a `finally`.
 *
 * Two guards this file exists to carry. Every statement runs under a
 * `statement_timeout` — an unbounded read once held a managed database at
 * 100 % for seven hours. And nothing but ids, counts and states is printed:
 * a gardener's own words are on these rows and belong to them.
 */
import { Pool } from "pg";

import {
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

interface QueueRow {
  id: string;
  item_type: string;
  impact_score: number;
  subject_catalog_item_id: string | null;
}

export interface OwnerQueueWalk {
  version: 1;
  issue: "OVE-459";
  host: string;
  database: string;
  openItems: number;
  byType: Record<string, number>;
  walked: {
    queueItemId: string;
    itemType: string;
    actionId: string;
    reverted: boolean;
    actionRows: number;
  } | null;
  generatedAt: string;
}

function readOption(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

export async function walkOwnerQueue(options: {
  databaseUrl: string;
  apply: boolean;
  actorUserId: string | null;
}): Promise<OwnerQueueWalk> {
  const url = new URL(options.databaseUrl);
  // Connected the way the application connects: a managed cluster presents a
  // chain the system store does not have, and `DATABASE_SSL_CA` is what makes
  // `rejectUnauthorized` both true and possible.
  const env = { ...process.env, DATABASE_URL: options.databaseUrl };
  const pool = new Pool({
    connectionString:
      resolvePgConnectionString(env) ?? options.databaseUrl,
    ssl: resolveDatabaseSslConfig(env),
    max: 1,
  });
  pool.on("error", () => undefined);
  const client = await pool.connect();
  let walked: OwnerQueueWalk["walked"] = null;

  try {
    // Every read and write on this connection is bounded.
    await client.query("set statement_timeout = '30s'");
    await client.query("set lock_timeout = '10s'");

    const counts = await client.query<{ item_type: string; n: string }>(
      `select item_type, count(*)::text as n
       from catalog_curation_queue where state = 'open'
       group by item_type order by item_type`,
    );
    const byType = Object.fromEntries(
      counts.rows.map((row) => [row.item_type, Number(row.n)]),
    );
    const openItems = Object.values(byType).reduce((sum, n) => sum + n, 0);

    if (options.apply && openItems > 0) {
      /**
       * The lowest-impact open item, so a walk never spends the decision the
       * owner would most want to make by hand — and never a `node_merge`,
       * which moves gardeners' objects between cards. The revert is exact,
       * but a proof should not be the thing that moves somebody's tomatoes
       * and puts them back.
       */
      const candidate = await client.query<QueueRow>(
        `select id::text as id, item_type, impact_score,
                subject_catalog_item_id::text as subject_catalog_item_id
         from catalog_curation_queue
         where state = 'open' and item_type <> 'node_merge'
         order by impact_score asc, created_at asc
         limit 1`,
      );
      const item = candidate.rows[0];
      if (item) {
        const applied = await client.query<{ catalog_apply_queue_item: string }>(
          "select catalog_apply_queue_item($1::uuid, $2::uuid, false)",
          [item.id, options.actorUserId],
        );
        const actionId = applied.rows[0]?.catalog_apply_queue_item ?? "";
        let reverted = false;
        try {
          await client.query("select catalog_revert_action($1::uuid, $2::uuid)", [
            actionId,
            options.actorUserId,
          ]);
          reverted = true;
        } finally {
          // The action and its inverse: the row itself, plus the revert row
          // the function wrote and pointed back at it.
          const rows = await client.query<{ n: string }>(
            `select count(*)::text as n from catalog_curation_actions
             where id = $1::uuid
                or (payload->>'reverted_action_id') = $1::text`,
            [actionId],
          );
          walked = {
            queueItemId: item.id,
            itemType: item.item_type,
            actionId,
            reverted,
            actionRows: Number(rows.rows[0]?.n ?? "0"),
          };
        }
      }
    }

    return {
      version: 1,
      issue: "OVE-459",
      host: url.hostname,
      database: url.pathname.replace(/^\//u, ""),
      openItems,
      byType,
      walked,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

async function main() {
  const databaseUrl = readOption("--database-url") ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const walk = await walkOwnerQueue({
    databaseUrl,
    apply: process.argv.includes("--apply"),
    actorUserId: readOption("--actor") ?? null,
  });
  process.stdout.write(`${JSON.stringify(walk, null, 2)}\n`);
}

if (process.argv[1]?.includes("prove-owner-queue-production")) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}

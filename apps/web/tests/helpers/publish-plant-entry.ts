import { randomUUID } from "node:crypto";

import { expect, type Browser } from "playwright/test";
import type { Pool } from "pg";

import { buildAtomicTextJournalCreateRequest } from "../../scripts/atomic-journal-text-request";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
} from "../../src/lib/garden/entry-contracts";
import {
  removeSyntheticGardener,
  signInSyntheticGardener,
  type SyntheticGardener,
} from "./synthetic-gardener";

/**
 * A public entry about a plant, published through the real endpoint by a
 * gardener of its own.
 *
 * The public listings and the knowledge pages are static documents: rendered
 * from the database and kept until a mutation expires their cache tags. A row
 * a spec inserts expires nothing, and neither does a spec's cleanup deleting
 * one. A publish expires them all — the feed, the directories, the topics, the
 * knowledge pages, the profiles (`publicEntryChangeTags`) — so the next visit
 * to any of them renders from the database as it is then.
 *
 * The entry is about a plant and its author has an address, so it joins the
 * curated topic `plants` as an entry a listing can show.
 */
export async function publishPlantEntryThroughEndpoint(input: {
  baseURL: string;
  browser: Browser;
  pool: Pool;
  /** A prefix so a run's rows are recognisable and cleanable. */
  prefix: string;
  title: string;
  text: string;
}): Promise<SyntheticGardener> {
  const context = await input.browser.newContext();
  try {
    const gardener = await signInSyntheticGardener({
      baseURL: input.baseURL,
      context,
      pool: input.pool,
      prefix: input.prefix,
    });
    const spaceId = randomUUID();
    await input.pool.query(
      "insert into spaces (id, owner_user_id, display_name) values ($1, $2, 'Балкон')",
      [spaceId, gardener.id],
    );
    const objectId = randomUUID();
    await input.pool.query(
      `insert into plant_objects (id, owner_user_id, space_id, display_name, object_kind, variety_state)
       values ($1, $2, $3, 'Томат у вазоні', 'plant', 'unknown')`,
      [objectId, gardener.id, spaceId],
    );
    const response = await context.request.post(
      `${input.baseURL}/api/garden/entries`,
      {
        headers: {
          origin: input.baseURL,
          [ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER]:
            ATOMIC_JOURNAL_CREATE_PROTOCOL,
        },
        data: buildAtomicTextJournalCreateRequest({
          publishId: randomUUID(),
          context: {
            target: "plant_object_entry",
            plantObjectId: objectId,
            entryDate: new Date().toISOString().slice(0, 10),
          },
          title: input.title,
          text: input.text,
        }),
      },
    );
    expect(response.status(), await response.text()).toBe(200);
    return gardener;
  } finally {
    await context.close();
  }
}

/**
 * The publisher's entries and the publisher, by SQL. That expires nothing, so
 * a page rendered since the publish may go on listing the entry until the
 * next publish.
 */
export async function removePlantEntryPublisher(
  pool: Pool,
  gardener: SyntheticGardener | null,
) {
  if (!gardener) return;
  await pool.query("delete from journal_entries where owner_user_id = $1", [
    gardener.id,
  ]);
  await removeSyntheticGardener(pool, gardener.id);
}

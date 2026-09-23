import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";

import {
  applyCatalogQueueItem,
  buildCatalogSourceCoverageStatement,
  buildCatalogSourcesStatement,
  buildCurationQueueStatement,
  buildEnqueueCatalogCurationApplyJobQuery,
  buildEnqueueCatalogReconcileJobQuery,
  buildEnqueueCatalogSourceRefreshJobQuery,
  buildEnqueueCatalogThresholdRecalibrateJobQuery,
  DECIDABLE_CURATION_ITEM_TYPES,
  listCatalogSources,
  listOpenCurationQueue,
  readCatalogSourceCoverage,
  readCurationActionSummary,
  readQueueItemActionSubjects,
  readCurationQueueItemSummary,
  readOpenCurationQueueItem,
  rejectCatalogQueueItem,
  revertCatalogAction,
  skipCatalogQueueItem,
} from "./catalog-curation-repository";

const ITEM = "11111111-1111-4111-8111-111111111111";
const ACTION = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const SNAPSHOT = "44444444-4444-4444-8444-444444444444";

const compileDb = new Kysely<Database>({
  dialect: {
    createDriver: () => new DummyDriver(),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
  },
});

function scriptedDb(
  rows: unknown[],
  log: CompiledQuery[],
  counts: Omit<QueryResult<unknown>, "rows"> = {},
) {
  class ScriptedConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      log.push(compiled);
      return { ...counts, rows: rows as R[] };
    }
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("streaming is not scripted");
    }
  }
  class ScriptedDriver implements Driver {
    async init() {}
    async acquireConnection() {
      return new ScriptedConnection();
    }
    async beginTransaction() {}
    async commitTransaction() {}
    async rollbackTransaction() {}
    async releaseConnection() {}
    async destroy() {}
  }
  return new Kysely<Database>({
    dialect: {
      createDriver: () => new ScriptedDriver(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });
}

describe("catalog curation repository (ADR-0026 D4)", () => {
  it("applies and reverts through the SQL functions, never a second implementation", async () => {
    const log: CompiledQuery[] = [];
    const db = scriptedDb([{ action_id: ACTION }], log);

    await expect(
      applyCatalogQueueItem(
        { queueItemId: ITEM, actorUserId: ACTOR, automatic: false },
        db,
      ),
    ).resolves.toEqual({ actionId: ACTION, subjectCatalogItemIds: [] });
    expect(log[0]!.sql).toContain("select catalog_apply_queue_item(");
    expect(log[0]!.parameters).toEqual([ITEM, ACTOR, false]);
    /**
     * Two statements, and it matters: a query's snapshot predates the rows the
     * function inserts, so a join on `catalog_curation_actions` in the same
     * statement finds nothing and the decision throws after committing. Only
     * a browser run against Postgres saw that; this pins the shape.
     */
    expect(log).toHaveLength(2);
    expect(log[1]!.sql).toContain("from catalog_curation_actions");
    expect(log[0]!.sql).not.toContain("join catalog_curation_actions");

    const revertLog: CompiledQuery[] = [];
    const revertDb = scriptedDb([{ revert_id: ACTION }], revertLog);
    await expect(
      revertCatalogAction({ actionId: ITEM, actorUserId: null }, revertDb),
    ).resolves.toEqual({ revertActionId: ACTION, subjectCatalogItemIds: [] });
    expect(revertLog[0]!.sql).toContain("select catalog_revert_action(");
    expect(revertLog[0]!.parameters).toEqual([ITEM, null]);
    expect(revertLog).toHaveLength(2);
    expect(revertLog[0]!.sql).not.toContain("join catalog_curation_actions");

    // A function that returns nothing is a broken contract, not an empty result.
    const emptyDb = scriptedDb([], []);
    await expect(
      applyCatalogQueueItem(
        { queueItemId: ITEM, actorUserId: null, automatic: true },
        emptyDb,
      ),
    ).rejects.toThrow(/returned no action/u);
  });

  it("enqueues a reconcile run with the payload keys the contract declares", () => {
    const plain = buildEnqueueCatalogReconcileJobQuery(compileDb, {
      scope: "labels",
    }).compile();
    expect(plain.sql).toContain('insert into "job_queue"');
    expect(plain.sql).toContain("on conflict");
    expect(plain.sql).toContain("rerun_requested");
    expect(plain.parameters[0]).toBe("matching");
    expect(plain.parameters[1]).toEqual({ kind: "catalog_reconcile", scope: "labels" });
    expect(plain.parameters[2]).toBe("matching:catalog_reconcile:labels:all");

    const narrowed = buildEnqueueCatalogReconcileJobQuery(compileDb, {
      scope: "source_records",
      sourceSlug: "ua-state-register",
      since: new Date("2026-09-06T00:00:00.000Z"),
    }).compile();
    expect(narrowed.parameters[1]).toEqual({
      kind: "catalog_reconcile",
      scope: "source_records",
      source_slug: "ua-state-register",
      since: "2026-09-06T00:00:00.000Z",
    });
    expect(narrowed.parameters[2]).toBe(
      "matching:catalog_reconcile:source_records:ua-state-register",
    );
  });

  it("enqueues one apply per queue item and one recalibration in total", () => {
    const apply = buildEnqueueCatalogCurationApplyJobQuery(compileDb, ITEM).compile();
    expect(apply.parameters[1]).toEqual({
      kind: "catalog_curation_apply",
      queue_item_id: ITEM,
    });
    expect(apply.parameters[2]).toBe(`matching:catalog_curation_apply:${ITEM}`);

    const recalibrate =
      buildEnqueueCatalogThresholdRecalibrateJobQuery(compileDb).compile();
    expect(recalibrate.parameters[1]).toEqual({
      kind: "catalog_threshold_recalibrate",
    });
    expect(recalibrate.parameters[2]).toBe("matching:catalog_threshold_recalibrate");
  });
});

describe("the owner's queue reads (ADR-0026 D10, OVE-506)", () => {
  it("says why Accept would be refused, in the apply function's own terms", () => {
    const statement = buildCurationQueueStatement({
      itemType: null,
      limit: 20,
    }).compile(compileDb);

    expect(statement.sql).toContain('as "blockedBy"');
    for (const block of [
      "'no_target'",
      "'target_inactive'",
      "'not_applied_here'",
    ]) {
      expect(statement.sql, block).toContain(block);
    }
    // A label joins the card its proposal names, or failing that its subject.
    expect(statement.sql).toMatch(/when queue\.item_type = 'label_link' then/u);
    expect(statement.sql).toContain(
      "(queue.proposal->>'catalog_item_id')::uuid",
    );
    // A merge needs a survivor that is not its own subject, and both alive.
    expect(statement.sql).toMatch(/when queue\.item_type = 'node_merge' then/u);
    expect(statement.sql).toContain("queue.proposal->>'survivor_id' is null");
    expect(statement.sql).toContain(
      "(queue.proposal->>'survivor_id')::uuid = queue.subject_catalog_item_id",
    );
    expect(statement.sql).toContain("identity_state = 'active'");
    expect(statement.sql).toMatch(/\) < 2 then 'target_inactive'/u);
    // A source link needs its subject and the snapshot it came from.
    expect(statement.sql).toMatch(
      /when queue\.item_type = 'source_link' then/u,
    );
    expect(statement.sql).toContain(
      "queue.proposal->>'source_snapshot_id' is null",
    );
    // Anything else — a split — is reviewed on its card, never applied.
    expect(statement.sql).toMatch(/else 'not_applied_here'\s+end/u);

    expect(statement.sql).toContain("where queue.state = 'open'");
    expect(statement.sql).toContain(
      "order by queue.impact_score desc, queue.created_at asc",
    );
    // Only decisions: coverage never reaches the owner's stream.
    expect(statement.parameters).toEqual([
      [...DECIDABLE_CURATION_ITEM_TYPES],
      20,
    ]);
    expect(DECIDABLE_CURATION_ITEM_TYPES).not.toContain("source_unmatched");
  });

  it("narrows the queue to one type and bounds how much it reads", () => {
    expect(
      buildCurationQueueStatement({ itemType: "label_link" }).compile(compileDb)
        .parameters,
    ).toEqual(["label_link", 20]);
    expect(
      buildCurationQueueStatement({ limit: 1000 })
        .compile(compileDb)
        .parameters.at(-1),
    ).toBe(100);
    expect(
      buildCurationQueueStatement({ limit: 0 })
        .compile(compileDb)
        .parameters.at(-1),
    ).toBe(1);
  });

  it("reads the queue's numbers as numbers and a missing block as none", async () => {
    const createdAt = new Date("2026-09-06T08:00:00.000Z");
    const db = scriptedDb(
      [
        {
          id: ITEM,
          itemType: "node_merge",
          subjectLabel: null,
          confidence: "0.93",
          reasons: null,
          impactScore: "12",
          createdAt,
          subject: null,
          target: null,
          labelObjectCount: "3",
          sourceSlug: null,
        },
        {
          id: ACTION,
          itemType: "label_link",
          subjectLabel: "Де Барао",
          confidence: null,
          reasons: ["search_miss"],
          impactScore: 1,
          createdAt,
          subject: null,
          target: null,
          labelObjectCount: 0,
          sourceSlug: "catalog_search_miss",
          blockedBy: "no_target",
        },
      ],
      [],
    );

    await expect(listOpenCurationQueue({}, db)).resolves.toEqual([
      {
        id: ITEM,
        itemType: "node_merge",
        subjectLabel: null,
        confidence: 0.93,
        reasons: [],
        impactScore: 12,
        createdAt,
        subject: null,
        target: null,
        labelObjectCount: 3,
        sourceSlug: null,
        blockedBy: null,
      },
      {
        id: ACTION,
        itemType: "label_link",
        subjectLabel: "Де Барао",
        confidence: null,
        reasons: ["search_miss"],
        impactScore: 1,
        createdAt,
        subject: null,
        target: null,
        labelObjectCount: 0,
        sourceSlug: "catalog_search_miss",
        blockedBy: "no_target",
      },
    ]);
  });

  it.each([
    ["rejected", rejectCatalogQueueItem],
    ["skipped", skipCatalogQueueItem],
  ] as const)(
    "a %s decision reports whether the item was still open",
    async (state, decide) => {
      const log: CompiledQuery[] = [];
      const input = { queueItemId: ITEM, actorUserId: ACTOR };

      await expect(
        decide(input, scriptedDb([], log, { numAffectedRows: BigInt(1) })),
      ).resolves.toEqual({ changed: true });
      expect(log[0]!.sql).toContain(`set state = '${state}'`);
      // Only an open item changes: a decision made in another tab stands.
      expect(log[0]!.sql).toMatch(/where id = \$2::uuid and state = 'open'/u);
      expect(log[0]!.parameters).toEqual([ACTOR, ITEM]);

      await expect(
        decide(input, scriptedDb([], [], { numAffectedRows: BigInt(0) })),
      ).resolves.toEqual({ changed: false });
      // A driver that counts nothing vouches for no change.
      await expect(decide(input, scriptedDb([], []))).resolves.toEqual({
        changed: false,
      });
    },
  );

  it("reads one item back whatever its state, with the names an outcome needs", async () => {
    const log: CompiledQuery[] = [];
    const summary = {
      id: ITEM,
      itemType: "node_merge",
      state: "accepted",
      subjectLabel: null,
      subjectCatalogItemId: ACTOR,
      subjectName: "Lycopersicon esculentum",
      targetName: "Solanum lycopersicum",
      decidedByUserId: ACTOR,
      decidedAt: new Date("2026-09-23T10:00:00.000Z"),
    };

    await expect(
      readCurationQueueItemSummary(ITEM, scriptedDb([summary], log)),
    ).resolves.toEqual(summary);
    expect(log[0]!.parameters).toEqual([ITEM]);
    expect(log[0]!.sql).toContain("where queue.id = $1::uuid");
    expect(log[0]!.sql).not.toContain("state = 'open'");
    expect(log[0]!.sql).toContain("queue.subject_catalog_item_id::text");
    expect(log[0]!.sql).toContain("(queue.proposal->>'survivor_id')::uuid");
    // Who decided it and when, so a decision can recognise itself.
    expect(log[0]!.sql).toContain(
      'queue.decided_by_user_id::text as "decidedByUserId"',
    );
    expect(log[0]!.sql).toContain('queue.decided_at as "decidedAt"');

    await expect(
      readCurationQueueItemSummary(ITEM, scriptedDb([], [])),
    ).resolves.toBeNull();
  });

  it("reads one action back: whether it was undone, and what it touched", async () => {
    const log: CompiledQuery[] = [];

    await expect(
      readCurationActionSummary(
        ACTION,
        scriptedDb(
          [
            {
              actionId: ACTION,
              reverted: true,
              subjectNames: null,
              subjectCatalogItemIds: ["node-a", "node-b"],
              revertedByUserId: "owner-1",
              revertedAt: new Date("2026-09-23T10:00:00.000Z"),
            },
          ],
          log,
        ),
      ),
    ).resolves.toEqual({
      actionId: ACTION,
      reverted: true,
      subjectNames: [],
      // The cards it touched, so an undo recognised after a lost reply can
      // still expire them (`OVE-506`).
      subjectCatalogItemIds: ["node-a", "node-b"],
      revertedByUserId: "owner-1",
      revertedAt: new Date("2026-09-23T10:00:00.000Z"),
    });
    expect(log[0]!.parameters).toEqual([ACTION]);
    expect(log[0]!.sql).toContain(
      "action.reverted_by_action_id is not null as reverted",
    );
    // Who undid it and when come from the revert's own row, so an undo can
    // recognise itself after a failed read (`OVE-506`).
    expect(log[0]!.sql).toContain(
      "on revert.id = action.reverted_by_action_id",
    );

    expect(log[0]!.sql).toMatch(
      /left join catalog_curation_actions as revert\s+on revert\.id = action\.reverted_by_action_id/u,
    );
    expect(log[0]!.sql).toContain(
      'revert.performed_by_user_id::text as "revertedByUserId"',
    );

    // An action still in force has no revert row: nobody undid it, ever.
    await expect(
      readCurationActionSummary(
        ACTION,
        scriptedDb(
          [{ actionId: ACTION, reverted: false, subjectNames: [] }],
          [],
        ),
      ),
    ).resolves.toEqual({
      actionId: ACTION,
      reverted: false,
      subjectNames: [],
      subjectCatalogItemIds: [],
      revertedByUserId: null,
      revertedAt: null,
    });

    await expect(
      readCurationActionSummary(ACTION, scriptedDb([], [])),
    ).resolves.toBeNull();
  });

  it("reads the cards the latest decision on an item touched", async () => {
    const log: CompiledQuery[] = [];

    await expect(
      readQueueItemActionSubjects(
        ITEM,
        scriptedDb([{ subjects: ["node-a"] }], log),
      ),
    ).resolves.toEqual(["node-a"]);
    expect(log[0]!.parameters).toEqual([ITEM]);
    // The decision, not the undo of it: a revert row carries the same cards
    // but is not what was decided.
    expect(log[0]!.sql).toContain("action.action_type <> 'revert'");
    expect(log[0]!.sql).toMatch(
      /order by action\.performed_at desc, action\.id desc\s+limit 1/u,
    );

    await expect(
      readQueueItemActionSubjects(ITEM, scriptedDb([], [])),
    ).resolves.toEqual([]);
  });

  it("looks one open decision up by id, and still only among decisions", () => {
    const one = buildCurationQueueStatement({
      itemId: ITEM,
      limit: 1,
    }).compile(compileDb);

    expect(one.sql).toMatch(/and queue\.id = \$2::uuid/u);
    expect(one.sql).toContain("where queue.state = 'open'");
    // Coverage never becomes a decision by being asked for by name.
    expect(one.parameters).toEqual([
      [...DECIDABLE_CURATION_ITEM_TYPES],
      ITEM,
      1,
    ]);

    const listed = buildCurationQueueStatement({ limit: 20 }).compile(
      compileDb,
    );
    expect(listed.sql).not.toMatch(/and queue\.id = /u);
    expect(listed.parameters).toEqual([[...DECIDABLE_CURATION_ITEM_TYPES], 20]);
  });

  it("reads one open decision whatever its rank, and none once it is decided", async () => {
    const log: CompiledQuery[] = [];
    const createdAt = new Date("2026-09-06T08:00:00.000Z");
    const row = {
      id: ITEM,
      itemType: "label_link",
      subjectLabel: "Де Барао",
      confidence: null,
      reasons: ["search_miss"],
      impactScore: "1",
      createdAt,
      subject: null,
      target: null,
      labelObjectCount: 2,
      sourceSlug: "catalog_search_miss",
      blockedBy: "no_target",
    };

    await expect(
      readOpenCurationQueueItem(ITEM, scriptedDb([row], log)),
    ).resolves.toEqual({ ...row, impactScore: 1 });
    expect(log).toHaveLength(1);
    expect(log[0]!.parameters).toEqual([
      [...DECIDABLE_CURATION_ITEM_TYPES],
      ITEM,
      1,
    ]);
    expect(log[0]!.sql).toContain("where queue.state = 'open'");

    await expect(
      readOpenCurationQueueItem(ITEM, scriptedDb([], [])),
    ).resolves.toBeNull();
  });
});

describe("the owner's sources reads (ADR-0026 D10, OVE-506)", () => {
  it("prefers the imported snapshot and finds the refresh job by the key its button writes", () => {
    const statement = buildCatalogSourcesStatement().compile(compileDb);

    expect(statement.sql).toContain("distinct on (snapshot.source_slug)");
    expect(statement.sql).toMatch(
      /order by snapshot\.source_slug,\s+\(snapshot\.status = 'imported'\) desc,\s+snapshot\.fetched_at desc/u,
    );
    // A newer rejected snapshot is reported beside the one the catalogue holds.
    expect(statement.sql).toContain("rejected.status = 'rejected'");
    expect(statement.sql).toContain(
      "rejected.fetched_at > current_snapshot.fetched_at",
    );
    expect(statement.parameters).toEqual([]);

    // The unique idempotency key, never a scan of the queue's payloads.
    const prefix =
      /job\.idempotency_key = '([^']+)' \|\| current_snapshot\.source_slug/u.exec(
        statement.sql,
      )?.[1];
    expect(prefix).toBe("matching:catalog_source_refresh:");
    expect(statement.sql).not.toContain("payload->>");
    const enqueued = buildEnqueueCatalogSourceRefreshJobQuery(
      compileDb,
      "eppo",
    ).compile();
    expect(enqueued.parameters[1]).toEqual({
      kind: "catalog_source_refresh",
      source_slug: "eppo",
    });
    expect(enqueued.parameters[2]).toBe(`${prefix}eppo`);
  });

  it("reads a refresh job only in a state the page can name", async () => {
    const queuedAt = new Date("2026-09-06T09:00:00.000Z");
    const updatedAt = new Date("2026-09-06T10:30:00.000Z");
    const source = {
      sourceSlug: "eppo",
      sourceName: "EPPO Global Database",
      sourceVersion: "2026-09",
      sourceUrl: "https://gd.eppo.int/",
      license: "EPPO terms",
      licenseUrl: null,
      attributionText: null,
      snapshotId: SNAPSHOT,
      fetchedAt: queuedAt,
      verifiedAt: queuedAt,
    };
    const db = scriptedDb(
      [
        {
          ...source,
          rejectedAfterAt: updatedAt,
          refreshStatus: "processing",
          refreshQueuedAt: queuedAt,
          refreshUpdatedAt: updatedAt,
        },
        {
          ...source,
          sourceSlug: "world-flora-online",
          refreshStatus: null,
          refreshQueuedAt: null,
          refreshUpdatedAt: null,
        },
        {
          ...source,
          sourceSlug: "gbif-backbone",
          rejectedAfterAt: null,
          refreshStatus: "archived",
          refreshQueuedAt: queuedAt,
          refreshUpdatedAt: updatedAt,
        },
        {
          ...source,
          sourceSlug: "grin-global",
          rejectedAfterAt: null,
          refreshStatus: "pending",
          refreshQueuedAt: queuedAt,
          refreshUpdatedAt: null,
        },
      ],
      [],
    );

    const [eppo, wfo, gbif, grin] = await listCatalogSources(db);

    expect(eppo).toEqual({
      ...source,
      rejectedAfterAt: updatedAt,
      refresh: { status: "processing", queuedAt, updatedAt },
    });
    expect(wfo).toMatchObject({ rejectedAfterAt: null, refresh: null });
    expect(gbif!.refresh).toBeNull();
    expect(grin!.refresh).toEqual({
      status: "pending",
      queuedAt,
      updatedAt: queuedAt,
    });
  });

  it("counts one snapshot at a time, bound to that snapshot alone", async () => {
    const statement =
      buildCatalogSourceCoverageStatement(SNAPSHOT).compile(compileDb);

    expect(statement.parameters).toEqual([
      SNAPSHOT,
      SNAPSHOT,
      SNAPSHOT,
      SNAPSHOT,
    ]);
    for (const table of [
      "catalog_source_records",
      "catalog_source_links",
      "catalog_item_identifiers",
      "catalog_source_assertions",
    ]) {
      expect(statement.sql, table).toContain(table);
    }
    expect(
      statement.sql.match(/source_snapshot_id = \$\d::uuid/gu),
    ).toHaveLength(4);
    // Records that reached a card, not links: a record linked to two cards
    // after a merge is still one record.
    expect(statement.sql).toContain("count(distinct link.source_record_id)");
    expect(statement.sql).not.toMatch(
      /count\(\*\)::int\s+from catalog_source_links/u,
    );

    const log: CompiledQuery[] = [];
    await expect(
      readCatalogSourceCoverage(
        SNAPSHOT,
        scriptedDb(
          [
            {
              recordCount: "800",
              linkedCount: "600",
              identifierCount: "550",
              assertionCount: "700",
            },
          ],
          log,
        ),
      ),
    ).resolves.toEqual({
      recordCount: 800,
      linkedCount: 600,
      identifierCount: 550,
      assertionCount: 700,
    });
    expect(log).toHaveLength(1);
    expect(log[0]!.parameters.every((value) => value === SNAPSHOT)).toBe(true);

    await expect(
      readCatalogSourceCoverage(SNAPSHOT, scriptedDb([], [])),
    ).resolves.toEqual({
      recordCount: 0,
      linkedCount: 0,
      identifierCount: 0,
      assertionCount: 0,
    });
  });
});

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
  buildEnqueueCatalogCurationApplyJobQuery,
  buildEnqueueCatalogReconcileJobQuery,
  buildEnqueueCatalogThresholdRecalibrateJobQuery,
  revertCatalogAction,
} from "./catalog-curation-repository";

const ITEM = "11111111-1111-4111-8111-111111111111";
const ACTION = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

const compileDb = new Kysely<Database>({
  dialect: {
    createDriver: () => new DummyDriver(),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
  },
});

function scriptedDb(rows: unknown[], log: CompiledQuery[]) {
  class ScriptedConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      log.push(compiled);
      return { rows: rows as R[] };
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
    ).resolves.toEqual({ actionId: ACTION });
    expect(log[0]!.sql).toContain("select catalog_apply_queue_item(");
    expect(log[0]!.parameters).toEqual([ITEM, ACTOR, false]);

    const revertLog: CompiledQuery[] = [];
    const revertDb = scriptedDb([{ revert_id: ACTION }], revertLog);
    await expect(
      revertCatalogAction({ actionId: ITEM, actorUserId: null }, revertDb),
    ).resolves.toEqual({ revertActionId: ACTION });
    expect(revertLog[0]!.sql).toContain("select catalog_revert_action(");
    expect(revertLog[0]!.parameters).toEqual([ITEM, null]);

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

import {
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
  listCatalogCardNames,
  listOwnerActionAudit,
  mergeCatalogCardIntoNode,
} from "./owner-action-audit";

const ITEM = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

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

function occurrences(sql: string) {
  return sql.split("= any(action.subject_catalog_item_ids)").length - 1;
}

describe("owner card audit (ADR-0026 D10)", () => {
  it("reads the card's names, the primary one first", async () => {
    const log: CompiledQuery[] = [];
    const db = scriptedDb(
      [
        {
          nameId: "name-1",
          displayName: "Solanum lycopersicum",
          locale: "la",
          nameType: "scientific_accepted",
          isPrimary: true,
        },
      ],
      log,
    );

    await expect(listCatalogCardNames(ITEM, db)).resolves.toEqual([
      {
        nameId: "name-1",
        displayName: "Solanum lycopersicum",
        locale: "la",
        nameType: "scientific_accepted",
        isPrimary: true,
      },
    ]);
    expect(log[0]!.sql).toContain("from catalog_item_names");
    expect(log[0]!.sql).toContain('order by name.is_primary desc');
    expect(log[0]!.parameters).toEqual([ITEM]);
  });

  it("scopes the audit to one node when asked, and to everything when not", async () => {
    const scoped: CompiledQuery[] = [];
    await listOwnerActionAudit(
      { catalogItemId: ITEM, limit: 5 },
      scriptedDb([], scoped),
    );
    // Twice: once to name the subjects, once to filter by this node.
    expect(occurrences(scoped[0]!.sql)).toBe(2);
    expect(scoped[0]!.parameters).toEqual([ITEM, 5]);

    const all: CompiledQuery[] = [];
    await listOwnerActionAudit({}, scriptedDb([], all));
    expect(occurrences(all[0]!.sql)).toBe(1);
    // A caller cannot ask for an unbounded page.
    expect(all[0]!.parameters).toEqual([25]);
  });

  /**
   * A merge from the card is a queue item and nothing else: applying it is
   * `catalog_apply_queue_item`'s job, so the inverse, the revert and the
   * audit stay the queue's.
   */
  it("writes a merge as an open queue item against an active target", async () => {
    const log: CompiledQuery[] = [];
    const db = scriptedDb([{ id: "queue-1" }], log);

    await expect(
      mergeCatalogCardIntoNode(
        {
          loserCatalogItemId: ITEM,
          survivorCatalogItemId: TARGET,
          reason: "same plant",
          actorUserId: ACTOR,
        },
        db,
      ),
    ).resolves.toEqual({ queueItemId: "queue-1" });
    expect(log[0]!.sql).toContain("insert into catalog_curation_queue");
    expect(log[0]!.sql).toContain("identity_state = 'active'");
    expect(log[0]!.parameters).toEqual([ITEM, TARGET, "same plant", TARGET]);
  });

  it("refuses a self-merge before it reaches the database, and an inactive target after", async () => {
    const log: CompiledQuery[] = [];
    await expect(
      mergeCatalogCardIntoNode(
        {
          loserCatalogItemId: ITEM,
          survivorCatalogItemId: ITEM,
          reason: null,
          actorUserId: ACTOR,
        },
        scriptedDb([], log),
      ),
    ).rejects.toThrow(/never merged into itself/u);
    expect(log).toHaveLength(0);

    await expect(
      mergeCatalogCardIntoNode(
        {
          loserCatalogItemId: ITEM,
          survivorCatalogItemId: TARGET,
          reason: null,
          actorUserId: ACTOR,
        },
        scriptedDb([], log),
      ),
    ).rejects.toThrow(/not an active node/u);
  });
});

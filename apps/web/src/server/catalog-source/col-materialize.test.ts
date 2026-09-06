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
  materializeCatalogNodeFromCol,
  toPickerSelection,
} from "./col-materialize";

const NODE = "11111111-1111-4111-8111-111111111111";

function scriptedDb(answers: unknown[][], log: CompiledQuery[]) {
  let call = 0;
  class ScriptedConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      log.push(compiled);
      const rows = (answers[call] ?? []) as R[];
      call += 1;
      return { rows };
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

describe("create-on-pick from the checklist (ADR-0026 D7)", () => {
  it("writes through the one SQL function and says whether the node is new", async () => {
    const log: CompiledQuery[] = [];
    const db = scriptedDb(
      [
        [{ present: false }],
        [{ id: NODE }],
        [
          {
            id: NODE,
            canonical_name: "Hydrochoerus hydrochaeris",
            public_slug: "hydrochoerus-hydrochaeris",
            rank: "species",
            kingdom: "Animalia",
          },
        ],
      ],
      log,
    );

    await expect(materializeCatalogNodeFromCol("6MK7J", db)).resolves.toEqual({
      catalogItemId: NODE,
      canonicalName: "Hydrochoerus hydrochaeris",
      publicSlug: "hydrochoerus-hydrochaeris",
      rank: "species",
      kingdom: "Animalia",
      created: true,
    });
    // The graph write is `catalog_col_materialize` and nothing else: no second
    // implementation of "a node from the checklist". It is read back in a
    // third statement, because a query cannot see what its own statement
    // inserted.
    expect(log[1]!.sql).toContain("catalog_col_materialize(");
    expect(log[1]!.parameters).toEqual(["6MK7J"]);
    expect(log[1]!.sql).not.toContain("catalog_items");
    expect(log[2]!.sql).toContain("from catalog_items");
  });

  it("reports a second pick of the same usage as an existing node", async () => {
    const db = scriptedDb(
      [
        [{ present: true }],
        [{ id: NODE }],
        [
          {
            id: NODE,
            canonical_name: "Hydrochoerus hydrochaeris",
            public_slug: "hydrochoerus-hydrochaeris",
            rank: "species",
            kingdom: "Animalia",
          },
        ],
      ],
      [],
    );

    await expect(
      materializeCatalogNodeFromCol("6MK7J", db),
    ).resolves.toMatchObject({ catalogItemId: NODE, created: false });
  });

  it("refuses an identifier that looks nothing like one, before any query", async () => {
    const log: CompiledQuery[] = [];
    const db = scriptedDb([], log);

    for (const bad of ["", "  ", "'; drop table catalog_items; --", "x".repeat(65)]) {
      await expect(materializeCatalogNodeFromCol(bad, db)).rejects.toThrow(
        /looks nothing like that/u,
      );
    }
    expect(log).toHaveLength(0);
  });

  it("hands the picker an ordinary selection, with a path only when addressed", () => {
    expect(
      toPickerSelection({
        catalogItemId: NODE,
        canonicalName: "Hydrochoerus hydrochaeris",
        publicSlug: "hydrochoerus-hydrochaeris",
        rank: "species",
        kingdom: "Animalia",
        created: true,
      }),
    ).toEqual({
      id: NODE,
      displayName: "Hydrochoerus hydrochaeris",
      kind: "species",
      publicPath: "/species/hydrochoerus-hydrochaeris",
    });

    // A node above species has no address, and the selection says so by
    // leaving the field out rather than inventing a path.
    expect(
      toPickerSelection({
        catalogItemId: NODE,
        canonicalName: "Solanaceae",
        publicSlug: null,
        rank: "family",
        kingdom: "Plantae",
        created: false,
      }),
    ).toEqual({ id: NODE, displayName: "Solanaceae", kind: "species" });
  });
});

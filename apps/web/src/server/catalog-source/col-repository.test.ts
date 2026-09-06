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
  buildColUsageSearchStatement,
  searchColUsages,
} from "./col-repository";

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

const compileDb = new Kysely<Database>({
  dialect: {
    createDriver: () => new DummyDriver(),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
  },
});

describe("the full Catalogue of Life read (ADR-0026 D7)", () => {
  it("searches the newest snapshot by prefix, kingdoms first, accepted first", () => {
    const compiled = buildColUsageSearchStatement({
      normalizedQuery: "hydrochoerus",
      objectKind: "animal",
    }).compile(compileDb);

    expect(compiled.sql).toContain("catalog_col_current_snapshot()");
    expect(compiled.sql).toContain("usage.normalized_name like");
    // The prefix index serves this; a leading wildcard would not use it.
    expect(compiled.parameters[0]).toBe("hydrochoerus%");
    expect(compiled.parameters[1]).toEqual(["Animalia"]);
    expect(compiled.parameters[2]).toBe(8);
    expect(compiled.sql).toContain("when 'accepted' then 0");
  });

  it("offers a plant object the kingdoms a garden plant can be", () => {
    const compiled = buildColUsageSearchStatement({
      normalizedQuery: "solanum",
      objectKind: "plant",
      limit: 40,
    }).compile(compileDb);

    expect(compiled.parameters[1]).toEqual(["Plantae", "Fungi", "Chromista"]);
    // The limit is bounded whatever the caller asks for.
    expect(compiled.parameters[2]).toBe(20);
  });

  it("does not query at all below three characters", async () => {
    const log: CompiledQuery[] = [];
    const db = scriptedDb([], log);

    await expect(
      searchColUsages("so", { objectKind: "plant" }, db),
    ).resolves.toEqual([]);
    expect(log).toHaveLength(0);
  });

  it("maps a row to the shape the picker reads", async () => {
    const db = scriptedDb(
      [
        {
          col_id: "LYCES",
          canonical_name: "Lycopersicon esculentum",
          scientific_name: "Lycopersicon esculentum Mill.",
          authorship: "Mill.",
          rank: "species",
          kingdom: null,
          status: "synonym",
          accepted_name: "Solanum lycopersicum",
        },
      ],
      [],
    );

    await expect(
      searchColUsages("  Lycopersicon  ", { objectKind: "plant" }, db),
    ).resolves.toEqual([
      {
        colId: "LYCES",
        canonicalName: "Lycopersicon esculentum",
        scientificName: "Lycopersicon esculentum Mill.",
        authorship: "Mill.",
        rank: "species",
        kingdom: null,
        status: "synonym",
        acceptedName: "Solanum lycopersicum",
      },
    ]);
  });
});

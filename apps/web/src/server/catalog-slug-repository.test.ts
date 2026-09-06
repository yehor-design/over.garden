import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
  type QueryResult,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";

import {
  assignCatalogSlug,
  buildTakenCatalogSlugsQuery,
  catalogSlugNamespaceForNodeKind,
  chooseCatalogSlug,
} from "./catalog-slug-repository";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

class CompileOnlyDialect implements Dialect {
  createDriver(): Driver {
    return new DummyDriver();
  }
  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }
  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }
  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}

type Handler = (sql: string, parameters: readonly unknown[]) => unknown[];

function scriptedDb(handler: Handler) {
  class ScriptedConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      return { rows: handler(compiled.sql, compiled.parameters) as R[] };
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

describe("catalog slug assignment (ADR-0026 D8)", () => {
  const compileDb = new Kysely<Database>({ dialect: new CompileOnlyDialect() });

  it("looks for collisions across every slug another organism ever held", () => {
    const compiled = buildTakenCatalogSlugsQuery(compileDb, "de-barao", ITEM_ID).compile();
    expect(compiled.sql).toBe(
      'select "catalog_item_slug_history"."slug" as "slug" from "catalog_item_slug_history" where "catalog_item_slug_history"."catalog_item_id" != $1 and ("catalog_item_slug_history"."slug" = $2 or "catalog_item_slug_history"."slug" like $3)',
    );
    expect(compiled.parameters).toEqual([ITEM_ID, "de-barao", "de-barao-%"]);
  });

  it("keeps the base when free and appends -2, -3 past every taken slug", () => {
    expect(chooseCatalogSlug("de-barao", [])).toBe("de-barao");
    expect(chooseCatalogSlug("de-barao", ["de-barao"])).toBe("de-barao-2");
    expect(chooseCatalogSlug("de-barao", ["de-barao", "de-barao-2", "de-barao-4"])).toBe(
      "de-barao-3",
    );
    expect(chooseCatalogSlug("de-barao", ["de-barao-2"])).toBe("de-barao");
    expect(() => chooseCatalogSlug("De Barao", [])).toThrow(/Not a catalog slug/u);
  });

  it("maps taxa to the species namespace and every form to the form namespace", () => {
    expect(catalogSlugNamespaceForNodeKind("taxon")).toBe("species");
    expect(catalogSlugNamespaceForNodeKind("cultivar")).toBe("form");
    expect(catalogSlugNamespaceForNodeKind("breed")).toBe("form");
  });

  it("writes the first free slug to the organism and leaves the history to the trigger", async () => {
    const statements: { sql: string; parameters: readonly unknown[] }[] = [];
    const db = scriptedDb((sql, parameters) => {
      statements.push({ sql, parameters });
      if (sql.startsWith("select")) {
        return [{ slug: "de-barao" }, { slug: "de-barao-2" }];
      }
      return [];
    });

    await expect(
      assignCatalogSlug({ catalogItemId: ITEM_ID, nodeKind: "cultivar", base: "de-barao" }, db),
    ).resolves.toEqual({ slug: "de-barao-3", namespace: "form" });
    expect(statements).toHaveLength(2);
    expect(statements[1]).toEqual({
      sql: 'update "catalog_items" set "public_slug" = $1 where "catalog_items"."id" = $2',
      parameters: ["de-barao-3", ITEM_ID],
    });
    await expect(
      assignCatalogSlug({ catalogItemId: ITEM_ID, nodeKind: "taxon", base: "not a slug" }, db),
    ).rejects.toThrow(/Not a catalog slug/u);
  });
});

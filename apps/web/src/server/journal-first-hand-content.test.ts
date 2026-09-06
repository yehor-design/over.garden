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

import { touchCatalogFirstHandContent } from "./journal-repository";

const ENTRY = "22222222-2222-4222-8222-222222222222";

function scriptedDb(onStatement: (compiled: CompiledQuery) => void) {
  class ScriptedConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      onStatement(compiled);
      return { rows: [] };
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

describe("first-hand content clock (ADR-0026 D9)", () => {
  it("stamps the linked organism and its species when an entry goes public, keeping the newest publication", async () => {
    const statements: CompiledQuery[] = [];
    await touchCatalogFirstHandContent(scriptedDb((compiled) => statements.push(compiled)), ENTRY);
    expect(statements).toHaveLength(1);
    const [statement] = statements;
    expect(statement!.sql).toContain("update catalog_items");
    expect(statement!.sql).toContain(
      "set first_hand_content_at = greatest(coalesce(first_hand_content_at, now()), now())",
    );
    expect(statement!.sql).toContain("plant_objects.variety_state = 'selected'");
    expect(statement!.sql).toContain("relation.relation_type = 'form_of'");
    expect(statement!.sql).toContain("select relation.to_catalog_item_id");
    expect(statement!.parameters).toEqual([ENTRY, ENTRY]);
  });
});

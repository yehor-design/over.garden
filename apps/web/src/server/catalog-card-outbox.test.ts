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
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";

vi.mock("@/server/public-cache-revalidation", () => ({
  revalidatePublicCacheTags: vi.fn(),
}));

import {
  claimCatalogCardIntent,
  countUnconvergedCatalogCardIntents,
  drainCatalogCardIntents,
  recordCatalogCardIntent,
} from "./catalog-card-outbox";
import { revalidatePublicCacheTags } from "./public-cache-revalidation";

const ITEM = "11111111-1111-4111-8111-111111111111";

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

describe("catalog card outbox (ADR-0026 D9, migration 0062)", () => {
  it("records a present, non-privacy-reducing catalog_item intent without an owner and bumps it on conflict", async () => {
    const statements: { sql: string; parameters: readonly unknown[] }[] = [];
    const db = scriptedDb((sql, parameters) => {
      statements.push({ sql, parameters });
      return [{ desired_generation: "42" }];
    });
    await expect(recordCatalogCardIntent(db, ITEM)).resolves.toBe("42");
    const [statement] = statements;
    expect(statement!.sql).toContain("insert into public_projection_intents");
    expect(statement!.sql).toContain("nextval('public_projection_generation_seq')");
    expect(statement!.sql).toContain("on conflict (entity_kind, entity_id) do update set");
    expect(statement!.sql).toContain("desired_generation = excluded.desired_generation");
    expect(statement!.parameters).toEqual(["catalog_item", ITEM, "catalog_card"]);
    await expect(recordCatalogCardIntent(db, "not-a-uuid")).rejects.toThrow(/UUID/u);
  });

  it("claims only catalog_item rows behind their generation and lease", async () => {
    const statements: string[] = [];
    const db = scriptedDb((sql) => {
      statements.push(sql);
      return [];
    });
    await expect(claimCatalogCardIntent(db, "web:test")).resolves.toBeNull();
    expect(statements[0]).toContain("where entity_kind = $1");
    expect(statements[0]).toContain("applied_generation < desired_generation");
    expect(statements[0]).toContain("for update skip locked");
    expect(statements[0]).toContain("(status = 'processing' and lease_expires_at < now())");
  });

  it("drains: revalidates the organism's tags and converges with a compare-and-set on the generation", async () => {
    const claims = [{ entity_id: ITEM, desired_generation: "7", attempts: 1 }];
    const statements: string[] = [];
    const db = scriptedDb((sql) => {
      statements.push(sql);
      if (sql.includes("with claimable as")) return claims.splice(0, 1);
      if (sql.includes("set status = 'applied'")) return [{ entity_id: ITEM }];
      return [];
    });
    const results = await drainCatalogCardIntents({ limit: 5 }, db);
    expect(results).toEqual([{ catalogItemId: ITEM, outcome: "revalidated" }]);
    expect(revalidatePublicCacheTags).toHaveBeenCalledWith(
      [`organism:${ITEM}`, "organism-slugs", "catalog", "sitemap"],
      "expire",
    );
    const converge = statements.find((sql) => sql.includes("set status = 'applied'"))!;
    expect(converge).toContain("applied_generation = desired_generation");
    expect(converge).toContain("and desired_generation = $3::bigint");
    expect(converge).toContain("and lease_owner = $4");
  });

  it("reports a superseded generation, schedules a retry on failure and dead-letters after five attempts", async () => {
    const claims = [
      { entity_id: ITEM, desired_generation: "7", attempts: 1 },
      { entity_id: ITEM, desired_generation: "8", attempts: 2 },
      { entity_id: ITEM, desired_generation: "9", attempts: 5 },
    ];
    const outcomes: string[] = [];
    const statements: string[] = [];
    let call = 0;
    const db = scriptedDb((sql) => {
      statements.push(sql);
      if (sql.includes("with claimable as")) return claims.splice(0, 1);
      if (sql.includes("set status = 'applied'")) return call++ === 0 ? [] : [{ entity_id: ITEM }];
      return [];
    });
    const revalidate = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("cache away"))
      .mockRejectedValueOnce(new Error("cache away"));
    for (const result of await drainCatalogCardIntents({ limit: 10, revalidate }, db)) {
      outcomes.push(result.outcome);
    }
    expect(outcomes).toEqual(["superseded", "retry_scheduled", "dead_lettered"]);
    const release = statements.filter((sql) => sql.includes("set status = 'pending', lease_owner = null"));
    expect(release).toHaveLength(1);
    const retries = statements.filter((sql) => sql.includes("last_error_class = $"));
    expect(retries).toHaveLength(2);
  });

  it("counts what is still unconverged", async () => {
    const db = scriptedDb(() => [{ unconverged: 3 }]);
    await expect(countUnconvergedCatalogCardIntents(db)).resolves.toBe(3);
  });
});

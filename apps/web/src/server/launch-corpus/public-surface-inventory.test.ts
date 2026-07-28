import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import { PUBLIC_LAUNCH_CONTENT_CLASSES } from "@/lib/launch-corpus/content-class";
import {
  assertPublicLaunchJournalCallerInventory,
  PUBLIC_LAUNCH_JOURNAL_CALLERS,
  PUBLIC_LAUNCH_JOURNAL_CALLER_RECEIPT,
} from "@/server/launch-corpus/public-surface-inventory";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";

class TestPostgresDialect implements Dialect {
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

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });

describe("public launch journal caller inventory", () => {
  it("pins one versioned policy application in every inventoried module", () => {
    expect(() => assertPublicLaunchJournalCallerInventory()).not.toThrow();
    expect(PUBLIC_LAUNCH_JOURNAL_CALLER_RECEIPT.policyVersion).toBe(
      "ove221.publicLaunchSurface.v1",
    );

    const serverRoot = path.resolve("src/server");
    for (const [, module, minimumPolicyApplications] of
      PUBLIC_LAUNCH_JOURNAL_CALLERS) {
      const source = readFileSync(path.join(serverRoot, module), "utf8");
      const applications = source.match(/publicLaunchSurfacePredicates\(/g);
      expect(applications?.length ?? 0, module).toBeGreaterThanOrEqual(
        minimumPolicyApplications,
      );
    }
  });

  it("compiles the same fail-closed class set for an explicit alias", () => {
    const compiled = testDb
      .selectFrom("journal_entries as public_entries")
      .select("public_entries.id")
      .where(
        publicLaunchSurfacePredicates(
          sql.ref<string | null>("public_entries.content_class"),
        ),
      )
      .compile();

    expect(compiled.sql).toContain(
      '"public_entries"."content_class" in (\'real_ugc\', \'founder_first_hand\', \'editorial\')',
    );
    expect(compiled.parameters).toEqual([]);
    expect(PUBLIC_LAUNCH_CONTENT_CLASSES).toHaveLength(3);
  });
});

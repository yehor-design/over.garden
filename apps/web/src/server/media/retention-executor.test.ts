import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import {
  RETENTION_POLICY_VERSION,
  buildDueJournalTombstonePurgeQuery,
} from "./retention-executor";

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

describe("retention executor policy", () => {
  it("pins the final-only retention version for dry-run and execute parity", () => {
    expect(RETENTION_POLICY_VERSION).toBe("ove349.retention.v2");
  });
});

describe("OVE-353 journal tombstone purge contract", () => {
  const compiled = buildDueJournalTombstonePurgeQuery(100).compile(testDb);
  const statement = compiled.sql.replace(/\s+/g, " ");

  it("purges only deletion-pending rows at or after their PostgreSQL horizon", () => {
    // INV-04: the boundary is read from the database in the same statement
    // that deletes, so a clock difference in the worker cannot purge early.
    expect(statement).toContain("lifecycle_state = 'deleted_retention'");
    expect(statement).toContain("je.purge_after <= now()");
    expect(statement).toContain("delete from journal_entries");
    expect(compiled.parameters).toEqual([100]);
  });

  it("blocks the purge until every attached derivative has a terminal receipt", () => {
    // media_assets cascades from this delete. Purging before the revoke is
    // terminal would destroy the only record of what still has to be revoked,
    // leaving a reachable public object with nothing pointing at it.
    expect(statement).toContain("from media_assets ma");
    expect(statement).toContain(
      "ma.revoked_at is null or ma.public_unreachable_at is null",
    );
    expect(statement).toMatch(/not exists \( select 1 from media_assets/);
  });

  it("blocks the purge until the public search removal has converged", () => {
    expect(statement).toContain("from public_projection_intents ppi");
    expect(statement).toContain("ppi.status = 'applied'");
    expect(statement).toContain("ppi.applied_state = 'absent'");
    expect(statement).toContain(
      "ppi.applied_generation = ppi.desired_generation",
    );
  });

  it("proves the restrict-mode foreign key is closed before deleting", () => {
    // community_contributions.journal_entry_id is ON DELETE RESTRICT, so an
    // unproven row would abort the whole batch rather than one journal.
    expect(statement).toContain("from community_contributions cc");
  });

  it("stays bounded and safe under an overlapping retention pass", () => {
    expect(statement).toContain("limit $1");
    expect(statement).toContain("for update of je skip locked");
    expect(statement).toContain("order by je.purge_after");
  });

  it("never selects or returns journal content", () => {
    expect(statement).not.toMatch(/\bje\.title\b|\bje\.body\b|content_document/);
    expect(statement).toContain("returning victim.id as id");
  });
});

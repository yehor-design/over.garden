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
  buildPublicCommunityContributionsQuery,
  buildPublicCommunityFallbackCandidateQuery,
} from "@/server/community-repository";

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
const communityId = "00000000-0000-4000-8000-000000000239";
const entryId = "00000000-0000-4000-8000-000000000001";

describe("OVE-239 canonical bounded community journey", () => {
  it("revalidates stale hints through every canonical public boundary", () => {
    const compiled = buildPublicCommunityContributionsQuery(testDb, {
      communityId,
      viewerScope: null,
      restrictToEntryIds: [entryId],
      applyTextSearch: false,
      limit: 13,
    }).compile();
    for (const predicate of [
      '"communities"."lifecycle_state" in',
      '"community_contributions"."contribution_state" =',
      '"community_memberships"."membership_state" !=',
      '"journal_entries"."visibility" =',
      '"journal_entries"."lifecycle_state" =',
      '"journal_entries"."public_gone_at" is null',
      '"journal_entries"."public_slug" is not null',
      '"journal_entries"."published_at" is not null',
      '"user_public_profiles"."profile_visibility" =',
      '"user_public_profiles"."removed_at" is null',
    ]) {
      expect(compiled.sql).toContain(predicate);
    }
    expect(compiled.parameters).toContain(entryId);
  });

  it("selects fallback IDs without journal text and caps them at 256", () => {
    const compiled = buildPublicCommunityFallbackCandidateQuery(testDb, {
      communityId,
      viewerScope: null,
      kind: "all",
    }).compile();
    expect(compiled.sql).not.toContain('"journal_entries"."title"');
    expect(compiled.sql).not.toContain('"journal_entries"."body"');
    expect(compiled.sql).not.toContain("ilike");
    expect(compiled.parameters.at(-1)).toBe(256);
  });
});

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
import { scopedToUser } from "@/server/request-scope";
import {
  buildProfileInteractionTargetQuery,
  buildProfileViewerBlockQuery,
  buildProfileViewerFollowQuery,
  buildRemoveBlockedProfileFollowsQuery,
  buildRemoveProfileBlockQuery,
  buildRemoveProfileFollowQuery,
  buildUpsertProfileBlockQuery,
  buildUpsertProfileFollowQuery,
  buildUpsertProfileReportQuery,
} from "./profile-interaction-repository";

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
const actorUserId = "00000000-0000-4000-8000-000000000001";
const targetUserId = "00000000-0000-4000-8000-000000000002";
const scope = scopedToUser(actorUserId, "session-1");

describe("profile interaction repository", () => {
  it("resolves only active public targets and excludes self", () => {
    const compiled = buildProfileInteractionTargetQuery(
      testDb,
      scope,
      "target_handle",
    ).compile();

    expect(compiled.sql).toContain('from "user_public_profiles"');
    expect(compiled.sql).toContain('"normalized_handle" =');
    expect(compiled.sql).toContain('"profile_visibility" =');
    expect(compiled.sql).toContain('"profile_lifecycle_state" =');
    expect(compiled.sql).toContain('"removed_at" is null');
    expect(compiled.sql).toContain('"user_id" !=');
    expect(compiled.parameters).toContain(actorUserId);
    expect(compiled.sql).not.toMatch(/email|provider|session|token/i);
  });

  it("checks active blocks in both directions", () => {
    const compiled = buildProfileViewerBlockQuery(
      testDb,
      scope,
      targetUserId,
    ).compile();

    expect(compiled.sql).toContain('from "profile_blocks"');
    expect(compiled.sql).toContain('"block_state" =');
    expect(compiled.sql).toContain('"blocker_user_id" =');
    expect(compiled.sql).toContain('"blocked_user_id" =');
    expect(
      compiled.parameters.filter((value) => value === actorUserId),
    ).toHaveLength(2);
    expect(
      compiled.parameters.filter((value) => value === targetUserId),
    ).toHaveLength(2);
  });

  it("checks follow state only for the current actor and exact target", () => {
    const compiled = buildProfileViewerFollowQuery(
      testDb,
      scope,
      targetUserId,
    ).compile();

    expect(compiled.sql).toContain('from "profile_follows"');
    expect(compiled.sql).toContain('"follower_user_id" =');
    expect(compiled.sql).toContain('"target_user_id" =');
    expect(compiled.sql).toContain('"follow_state" =');
    expect(compiled.parameters).toContain(actorUserId);
    expect(compiled.parameters).toContain(targetUserId);
  });

  it("upserts and removes follows idempotently inside actor scope", () => {
    const upsert = buildUpsertProfileFollowQuery(
      testDb,
      scope,
      targetUserId,
    ).compile();
    const remove = buildRemoveProfileFollowQuery(
      testDb,
      scope,
      targetUserId,
    ).compile();

    expect(upsert.sql).toContain('insert into "profile_follows"');
    expect(upsert.sql).toContain(
      'on conflict ("follower_user_id", "target_user_id") do update',
    );
    expect(upsert.sql).toContain('"follow_state" =');
    expect(remove.sql).toContain('update "profile_follows"');
    expect(remove.sql).toContain('"follower_user_id" =');
    expect(remove.sql).toContain('"target_user_id" =');
    expect(remove.parameters).toContain(actorUserId);
  });

  it("blocks idempotently and removes follows in both directions", () => {
    const upsert = buildUpsertProfileBlockQuery(
      testDb,
      scope,
      targetUserId,
    ).compile();
    const removeFollows = buildRemoveBlockedProfileFollowsQuery(
      testDb,
      scope,
      targetUserId,
    ).compile();
    const unblock = buildRemoveProfileBlockQuery(
      testDb,
      scope,
      targetUserId,
    ).compile();

    expect(upsert.sql).toContain('insert into "profile_blocks"');
    expect(upsert.sql).toContain(
      'on conflict ("blocker_user_id", "blocked_user_id") do update',
    );
    expect(removeFollows.sql).toContain('update "profile_follows"');
    expect(
      removeFollows.parameters.filter((value) => value === actorUserId),
    ).toHaveLength(2);
    expect(
      removeFollows.parameters.filter((value) => value === targetUserId),
    ).toHaveLength(2);
    expect(unblock.sql).toContain('update "profile_blocks"');
    expect(unblock.sql).toContain('"blocker_user_id" =');
    expect(unblock.parameters).toContain(actorUserId);
  });

  it("upserts one enum-only report per actor and target", () => {
    const compiled = buildUpsertProfileReportQuery(
      testDb,
      scope,
      targetUserId,
      "privacy",
    ).compile();

    expect(compiled.sql).toContain('insert into "profile_reports"');
    expect(compiled.sql).toContain(
      'on conflict ("reporter_user_id", "target_user_id") do update',
    );
    expect(compiled.parameters).toContain("privacy");
    expect(compiled.parameters).toContain(actorUserId);
    expect(compiled.parameters).toContain(targetUserId);
    expect(compiled.sql).not.toMatch(/body|details|message|email|ip_address/i);
  });
});

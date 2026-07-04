import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  buildCountActiveEngagementLikesQuery,
  buildInsertAnonymousLikeQuery,
  buildInsertEngagementCommentQuery,
  buildListEngagementBookmarksQuery,
  buildListEngagementCommentsQuery,
  buildPublicJournalEntryTargetQuery,
  buildPublicLineageObjectTargetQuery,
  buildPublicVarietyTargetQuery,
  buildUpsertEngagementBookmarkQuery,
  hashAnonymousEngagementToken,
  normalizeEngagementTarget,
} from "./engagement-repository";

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
const scope = scopedToUser("00000000-0000-4000-8000-000000000001");
const journalTarget = {
  kind: "journal_entry" as const,
  ref: "first-public-harvest",
};
const privateLeakPattern =
  /quarantine|media_assets|derivative_key|ip_address|user_agent|email|phone|invite|token|client_mutation_id|coarse_region|location_visibility|latitude|longitude|coordinates/i;
const promotionCouplingPattern =
  /meilisearch|search_index|sitemap|ranking|rank|notification|analytics_events|public_surface/i;

describe("engagement repository contracts", () => {
  it("inserts signed-in comments against a public target handle only", () => {
    const compiled = buildInsertEngagementCommentQuery(testDb, scope, {
      target: journalTarget,
      body: "This survived the July heat.",
      now: new Date("2026-07-04T08:00:00.000Z"),
    }).compile();

    expect(compiled.sql).toContain('insert into "engagement_comments"');
    expect(compiled.sql).toContain('"author_user_id"');
    expect(compiled.sql).not.toMatch(privateLeakPattern);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.parameters).toContain("journal_entry");
    expect(compiled.parameters).toContain("first-public-harvest");
  });

  it("lists public comments through public profile handles without auth identity", () => {
    const compiled = buildListEngagementCommentsQuery(
      testDb,
      journalTarget,
    ).compile();

    expect(compiled.sql).toContain('from "engagement_comments"');
    expect(compiled.sql).toContain('left join "user_public_profiles"');
    expect(compiled.sql).toContain('"user_public_profiles"."handle"');
    expect(compiled.sql).toContain('"user_public_profiles"."display_name"');
    expect(compiled.sql).toContain('"engagement_comments"."comment_state" =');
    expect(compiled.sql).not.toMatch(privateLeakPattern);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
    expect(compiled.parameters).toContain("active");
  });

  it("upserts bookmarks only inside the signed-in owner scope", () => {
    const compiled = buildUpsertEngagementBookmarkQuery(testDb, scope, {
      target: { kind: "variety", ref: "pomidor-cheri-0000000101" },
      bookmarkState: "active",
      now: new Date("2026-07-04T08:00:00.000Z"),
    }).compile();

    expect(compiled.sql).toContain('insert into "engagement_bookmarks"');
    expect(compiled.sql).toContain(
      'on conflict ("owner_user_id", "target_kind", "target_ref") do update',
    );
    expect(compiled.sql).not.toMatch(privateLeakPattern);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.parameters).toContain("active");
  });

  it("lists bookmarks as target handles without joining private journal content", () => {
    const compiled = buildListEngagementBookmarksQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "engagement_bookmarks"');
    expect(compiled.sql).toContain('"owner_user_id" =');
    expect(compiled.sql).toContain('"bookmark_state" =');
    expect(compiled.sql).not.toMatch(
      /journal_entries|plant_objects|body|title/i,
    );
    expect(compiled.sql).not.toMatch(privateLeakPattern);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
  });

  it("hashes anonymous like tokens and never stores the raw device token", () => {
    const token = "anonymous-device-token-0001";
    const hash = hashAnonymousEngagementToken(token);
    const compiled = buildInsertAnonymousLikeQuery(testDb, {
      target: journalTarget,
      anonymousDeviceHash: hash,
      now: new Date("2026-07-04T08:00:00.000Z"),
    }).compile();

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(compiled.sql).toContain('insert into "engagement_likes"');
    expect(compiled.parameters).toContain(hash);
    expect(compiled.parameters).not.toContain(token);
    expect(compiled.sql).not.toMatch(/ip_address|user_agent|owner_user_id/i);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
  });

  it("counts cosmetic likes only from engagement_likes active rows", () => {
    const compiled = buildCountActiveEngagementLikesQuery(
      testDb,
      journalTarget,
    ).compile();

    expect(compiled.sql).toContain('from "engagement_likes"');
    expect(compiled.sql).toContain('"like_state" =');
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
    expect(compiled.parameters).toContain("active");
  });

  it("validates public targets with existing public-safe page predicates", () => {
    const journal = buildPublicJournalEntryTargetQuery(
      testDb,
      journalTarget.ref,
    ).compile();
    const lineage = buildPublicLineageObjectTargetQuery(
      testDb,
      "00000000-0000-4000-8000-000000000101",
    ).compile();
    const variety = buildPublicVarietyTargetQuery(
      testDb,
      "pomidor-cheri-0000000101",
    ).compile();

    expect(journal.sql).toContain('"visibility" =');
    expect(journal.sql).toContain('"lifecycle_state" =');
    expect(journal.sql).toContain('"public_gone_at" is null');
    expect(journal.sql).not.toContain('"body"');

    expect(lineage.sql).toContain(
      'inner join "journal_entries" as "public_entries"',
    );
    expect(lineage.sql).toContain('"public_entries"."visibility" =');
    expect(lineage.sql).toContain(
      '"public_entries"."owner_user_id" = "plant_objects"."owner_user_id"',
    );

    expect(variety.sql).toContain('from "catalog_items"');
    expect(variety.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(variety.sql).toContain('"journal_entries"."visibility" =');
    expect(variety.sql).not.toContain('"journal_entries"."body"');
  });

  it("models engagement tables without promotion, search, notification, or raw request columns", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    const tableBodies = [
      "engagement_comments",
      "engagement_bookmarks",
      "engagement_likes",
    ].map((table) => {
      const match = schemaSql.match(
        new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\);`),
      );
      expect(match?.[1]).toBeTruthy();
      return match?.[1] ?? "";
    });

    for (const tableBody of tableBodies) {
      expect(tableBody).not.toMatch(privateLeakPattern);
      expect(tableBody).not.toMatch(promotionCouplingPattern);
    }
    expect(schemaSql).toContain("engagement_likes_device_target_uidx");
  });

  it("normalizes target types while keeping topic unavailable for current public pages", () => {
    expect(
      normalizeEngagementTarget("journal_entry", "врожай-томату-2026"),
    ).toEqual({
      kind: "journal_entry",
      ref: "врожай-томату-2026",
    });
    expect(() =>
      normalizeEngagementTarget("lineage_object", "not-a-uuid"),
    ).toThrow("Engagement target is not available.");
  });
});

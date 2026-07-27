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
  buildCountRecentLineageFollowsQuery,
  buildCountRecentLineageQuestionsQuery,
  buildFindLineageQuestionByClientMutationQuery,
  buildInsertLineageFollowQuery,
  buildInsertLineageQuestionQuery,
  buildLineageFollowReadbackQuery,
  buildLineageInteractionEligibilityQuery,
  buildLineageInteractionTargetsForEdgesQuery,
  buildLineageQuestionInboxQuery,
  normalizeLineageQuestionText,
} from "./lineage-interactions-repository";
import { PreciseLocationTextError } from "@/lib/privacy/precise-location-text";

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
const targetOwnerUserId = "00000000-0000-4000-8000-000000000002";
const edgeId = "00000000-0000-4000-8000-000000000201";
const subjectPlantObjectId = "00000000-0000-4000-8000-000000000101";
const sourcePlantObjectId = "00000000-0000-4000-8000-000000000102";

describe("lineage interaction repository query contracts", () => {
  it("finds eligible targets only on confirmed public-safe cross-user lineage edges", () => {
    const compiled = buildLineageInteractionEligibilityQuery(testDb, scope, {
      edgeId,
      targetPlantObjectId: sourcePlantObjectId,
    }).compile();

    expect(compiled.sql).toContain('from "lineage_provenance_edges"');
    expect(compiled.sql).toContain(
      'inner join "journal_entries" as "subject_public_entries"',
    );
    expect(compiled.sql).toContain(
      'inner join "journal_entries" as "source_public_entries"',
    );
    expect(compiled.sql).toContain('"subject_public_entries"."visibility" =');
    expect(compiled.sql).toContain('"source_public_entries"."visibility" =');
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."source_kind" =',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."consent_state" =',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."erasure_state" =',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."owner_user_id" != "lineage_provenance_edges"."source_owner_user_id"',
    );
    expect(compiled.parameters).toContain(edgeId);
    expect(compiled.parameters).toContain(sourcePlantObjectId);
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.parameters).not.toContain(targetOwnerUserId);
    expect(compiled.sql).not.toMatch(
      /journal_entries"\."title|journal_entries"\."body|media_assets|quarantine|derivative|email|phone|coordinates|latitude|longitude|source_reference_label|source_pending_identity_id|client_mutation_id|ip_address|user_agent/i,
    );
  });

  it("lists interaction targets only for edges where the viewer is a participant", () => {
    const compiled = buildLineageInteractionTargetsForEdgesQuery(testDb, scope, [
      edgeId,
    ]).compile();

    expect(compiled.sql).toContain('"lineage_provenance_edges"."id" in');
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."owner_user_id" =',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."source_owner_user_id" =',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."owner_user_id" != "lineage_provenance_edges"."source_owner_user_id"',
    );
    expect(compiled.parameters).toContain(edgeId);
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.sql).not.toMatch(
      /email|phone|source_reference_label|journal_entries"\."body|media_assets|ip_address|user_agent/i,
    );
  });

  it("inserts one-way follows without changing target visibility", () => {
    const compiled = buildInsertLineageFollowQuery(testDb, {
      follower_user_id: scope.userId,
      target_owner_user_id: targetOwnerUserId,
      target_plant_object_id: sourcePlantObjectId,
      lineage_edge_id: edgeId,
      follow_state: "active",
    }).compile();

    expect(compiled.sql).toContain('insert into "lineage_node_follows"');
    expect(compiled.sql).toContain(
      'on conflict ("follower_user_id", "target_plant_object_id") do nothing',
    );
    expect(compiled.sql).toContain("returning *");
    expect(compiled.sql).not.toMatch(
      /visibility|journal_entries|media_assets|email|phone|ip_address|user_agent|source_reference_label/i,
    );
    expect(compiled.parameters).toEqual([
      scope.userId,
      targetOwnerUserId,
      sourcePlantObjectId,
      edgeId,
      "active",
    ]);
  });

  it("rate-limits follows and questions by bounded interaction metadata", () => {
    const since = new Date("2026-07-03T08:00:00.000Z");
    const followSql = buildCountRecentLineageFollowsQuery(
      testDb,
      scope,
      since,
    ).compile();
    const questionSql = buildCountRecentLineageQuestionsQuery(testDb, scope, {
      since,
      edgeId,
    }).compile();

    expect(followSql.sql).toContain('"lineage_node_follows"');
    expect(followSql.sql).toContain('"follower_user_id" =');
    expect(followSql.sql).toContain('"created_at" >=');
    expect(followSql.sql).not.toMatch(
      /question_text|email|phone|ip_address|user_agent/i,
    );

    expect(questionSql.sql).toContain('"lineage_questions"');
    expect(questionSql.sql).toContain('"asker_user_id" =');
    expect(questionSql.sql).toContain('"lineage_edge_id" =');
    expect(questionSql.sql).toContain('"created_at" >=');
    expect(questionSql.sql).not.toMatch(
      /question_text|target_owner_user_id|email|phone|ip_address|user_agent/i,
    );
  });

  it("inserts lineage questions idempotently without private transport metadata", () => {
    const compiled = buildInsertLineageQuestionQuery(testDb, {
      asker_user_id: scope.userId,
      recipient_user_id: targetOwnerUserId,
      lineage_edge_id: edgeId,
      subject_plant_object_id: subjectPlantObjectId,
      target_plant_object_id: sourcePlantObjectId,
      question_text: "How did this line handle balcony heat?",
      question_state: "delivered",
      client_mutation_id: "lineage-question-1",
    }).compile();

    expect(compiled.sql).toContain('insert into "lineage_questions"');
    expect(compiled.sql).toContain(
      'on conflict ("asker_user_id", "client_mutation_id") do nothing',
    );
    expect(compiled.sql).toContain("returning *");
    expect(compiled.sql).not.toMatch(
      /email|phone|ip_address|user_agent|media_assets|quarantine|derivative|coarse_region|location_visibility|source_reference_label/i,
    );
  });

  it("keeps question inbox readback bounded to recipient-owned object metadata", () => {
    const compiled = buildLineageQuestionInboxQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "lineage_questions"');
    expect(compiled.sql).toContain(
      '"target_objects"."owner_user_id" = "lineage_questions"."recipient_user_id"',
    );
    expect(compiled.sql).toContain('"lineage_questions"."recipient_user_id" =');
    expect(compiled.sql).toContain('"lineage_questions"."question_state" =');
    expect(compiled.sql).not.toMatch(
      /asker_user_id as|recipient_user_id as|email|phone|ip_address|user_agent|media_assets|quarantine|derivative|coarse_region|location_visibility|source_reference_label|client_mutation_id/i,
    );
  });

  it("shows follows only while the target still has an active public entry", () => {
    const compiled = buildLineageFollowReadbackQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "lineage_node_follows"');
    expect(compiled.sql).toContain(
      'inner join "journal_entries" as "target_public_entries"',
    );
    expect(compiled.sql).toContain('"target_public_entries"."visibility" =');
    expect(compiled.sql).toContain('"target_public_entries"."lifecycle_state" =');
    expect(compiled.sql).toContain(
      '"target_public_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"target_public_entries"."public_slug" is not null',
    );
    expect(compiled.sql).not.toMatch(
      /journal_entries"\."title|journal_entries"\."body|email|phone|ip_address|user_agent|media_assets|quarantine|derivative|coarse_region|location_visibility|source_reference_label/i,
    );
  });

  it("finds idempotent questions only inside the asker's scope", () => {
    const compiled = buildFindLineageQuestionByClientMutationQuery(
      testDb,
      scope,
      "lineage-question-1",
    ).compile();

    expect(compiled.sql).toContain('"asker_user_id" =');
    expect(compiled.sql).toContain('"client_mutation_id" =');
    expect(compiled.parameters).toEqual([scope.userId, "lineage-question-1"]);
  });

  it("rejects question text that carries contact details or precise coordinates", () => {
    expect(normalizeLineageQuestionText("How did this line overwinter?")).toBe(
      "How did this line overwinter?",
    );

    for (const unsafe of [
      "email me at maria@example.com",
      "+380 67 123 45 67",
      "https://example.com",
      "@private-handle",
    ]) {
      expect(() => normalizeLineageQuestionText(unsafe)).toThrow(
        /contact details/i,
      );
    }
  });

  it("rejects precise coordinates in questions with the OVE-234 typed error", () => {
    for (const unsafe of [
      "50.450100, 30.523400",
      "широта 50.4501",
      "geo:50.45010,30.52340",
    ]) {
      expect(() => normalizeLineageQuestionText(unsafe)).toThrow(
        PreciseLocationTextError,
      );
      expect(() => normalizeLineageQuestionText(unsafe)).not.toThrow(/50\.45/);
    }
  });
});

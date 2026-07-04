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
  buildCatalogMentionTopicContextQuery,
  buildDeleteAutomaticTopicSignalsForEntryQuery,
  buildDirectObjectTopicContextQuery,
  buildInsertJournalTopicQuery,
  buildJournalEntryForTopicSignalsQuery,
  buildJournalEntryIdsForPlantObjectTopicRefreshQuery,
  buildMentionedObjectTopicContextQuery,
  buildUpsertJournalEntryTopicSignalQuery,
  buildUpgradeJournalTopicTrustQuery,
} from "./journal-topic-repository";

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

describe("journal topic repository query contracts", () => {
  it("finds the entry for topic capture only inside owner scope", () => {
    const compiled = buildJournalEntryForTopicSignalsQuery(
      testDb,
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      "00000000-0000-4000-8000-0000000000a1",
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('"id" = $1');
    expect(compiled.sql).toContain('"owner_user_id" = $2');
    expect(compiled.sql).not.toContain('"body"');
    expect(compiled.sql).not.toContain('"title"');
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
  });

  it("derives automatic topic context from scoped object and catalog identity without raw journal content", () => {
    const compiled = buildDirectObjectTopicContextQuery(
      testDb,
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      "00000000-0000-4000-8000-0000000000a1",
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"plant_objects"."space_id" = "journal_entries"."space_id"',
    );
    expect(compiled.sql).toContain('left join "catalog_items"');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).toContain('"catalog_items"."status" in ($1, $2)');
    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = $4');
    expect(compiled.sql).toContain('"journal_entries"."entry_scope" = $5');
    expect(compiled.sql).not.toContain('"journal_entries"."body"');
    expect(compiled.sql).not.toContain('"journal_entries"."title"');
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("email");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "00000000-0000-4000-8000-0000000000a1",
      "00000000-0000-4000-8000-000000000001",
      "object",
    ]);
  });

  it("derives topic context from same-owner object mentions and catalog mentions", () => {
    const mentioned = buildMentionedObjectTopicContextQuery(
      testDb,
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      "00000000-0000-4000-8000-0000000000a1",
    ).compile();
    const catalog = buildCatalogMentionTopicContextQuery(
      testDb,
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      "00000000-0000-4000-8000-0000000000a1",
    ).compile();

    expect(mentioned.sql).toContain('from "journal_entry_object_mentions"');
    expect(mentioned.sql).toContain('inner join "plant_objects"');
    expect(mentioned.sql).toContain(
      '"journal_entry_object_mentions"."owner_user_id" = $4',
    );
    expect(mentioned.sql).not.toContain('"journal_entries"."body"');
    expect(mentioned.sql).not.toContain("client_mutation_id");

    expect(catalog.sql).toContain('from "journal_entry_catalog_mentions"');
    expect(catalog.sql).toContain('inner join "catalog_items"');
    expect(catalog.sql).toContain(
      '"journal_entry_catalog_mentions"."owner_user_id" = $4',
    );
    expect(catalog.sql).not.toContain('"journal_entries"');
    expect(catalog.sql).not.toContain('"body"');
    expect(catalog.sql).not.toContain("coordinates");
  });

  it("upserts topics and signals with bounded enum state only", () => {
    const insertTopic = buildInsertJournalTopicQuery(testDb, {
      slug: "plants",
      label: "Plants",
      trustState: "curated",
    }).compile();
    const upgradeTopic = buildUpgradeJournalTopicTrustQuery(testDb, {
      slug: "plants",
      label: "Plants",
      trustState: "curated",
    }).compile();
    const now = new Date("2026-07-04T12:00:00.000Z");
    const signal = buildUpsertJournalEntryTopicSignalQuery(testDb, {
      journalEntryId: "00000000-0000-4000-8000-0000000000a1",
      topicId: "00000000-0000-4000-8000-0000000000b2",
      source: "object_kind",
      reviewState: "accepted",
      publicMembershipState: "eligible",
      now,
    }).compile();

    expect(insertTopic.sql).toContain('insert into "journal_topics"');
    expect(insertTopic.sql).toContain('on conflict ("slug") do nothing');
    expect(insertTopic.parameters).toEqual(["plants", "Plants", "curated"]);
    expect(upgradeTopic.sql).toContain('update "journal_topics"');
    expect(upgradeTopic.sql).toContain('"trust_state" != $5');
    expect(signal.sql).toContain(
      'insert into "journal_entry_topic_signals"',
    );
    expect(signal.sql).toContain(
      'on conflict ("journal_entry_id", "topic_id", "signal_source") do update',
    );
    expect(signal.parameters).toEqual([
      "00000000-0000-4000-8000-0000000000a1",
      "00000000-0000-4000-8000-0000000000b2",
      "object_kind",
      "accepted",
      "eligible",
      now,
      "accepted",
      "eligible",
      now,
    ]);
  });

  it("refreshes automatic topic signals for direct and mentioned object entries", () => {
    const refresh = buildJournalEntryIdsForPlantObjectTopicRefreshQuery(
      testDb,
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      "00000000-0000-4000-8000-0000000000c3",
    ).compile();
    const clearAutomatic = buildDeleteAutomaticTopicSignalsForEntryQuery(
      testDb,
      "00000000-0000-4000-8000-0000000000a1",
    ).compile();

    expect(refresh.sql).toContain('from "journal_entries"');
    expect(refresh.sql).toContain('left join "journal_entry_object_mentions"');
    expect(refresh.sql).toContain('"journal_entries"."owner_user_id" = $3');
    expect(refresh.sql).toContain('"journal_entries"."plant_object_id" = $5');
    expect(refresh.sql).toContain(
      '"journal_entry_object_mentions"."plant_object_id" = $7',
    );
    expect(refresh.sql).not.toContain('"journal_entries"."body"');
    expect(refresh.sql).not.toContain("client_mutation_id");

    expect(clearAutomatic.sql).toContain(
      'delete from "journal_entry_topic_signals"',
    );
    expect(clearAutomatic.sql).toContain('"signal_source" in ($2, $3, $4)');
    expect(clearAutomatic.parameters).toEqual([
      "00000000-0000-4000-8000-0000000000a1",
      "object_kind",
      "catalog_kind",
      "catalog_mention",
    ]);
  });
});

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
import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  buildVisualFixtureResetQueries,
  buildVisualFixtureSeedQueries,
  buildVisualFixtureStatusQueries,
} from "./repository";

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

describe("visual fixture repository query contracts", () => {
  it("builds deterministic dependency-ordered upserts for only fixture-owned tables", () => {
    const queries = buildVisualFixtureSeedQueries(
      testDb,
      VISUAL_FIXTURE_MANIFEST,
    );

    expect(queries.map(({ label }) => label)).toEqual([
      "lineage_audit_cleanup",
      "media_cleanup",
      "actors",
      "profiles",
      "lineage_pending_identities",
      "spaces",
      "catalog_items",
      "catalog_names",
      "objects",
      "lineage_edges",
      "entries",
      "topics",
      "topic_signals",
      "media",
    ]);

    const compiled = queries.map(({ query }) => query.compile());
    const sql = compiled.map((item) => item.sql).join("\n");

    expect(sql).toContain('delete from "media_assets"');
    expect(sql).toContain('delete from "lineage_provenance_edge_audit_events"');
    expect(sql).toContain('insert into "user"');
    expect(sql).toContain('insert into "user_public_profiles"');
    expect(sql).toContain('insert into "spaces"');
    expect(sql).toContain('insert into "catalog_items"');
    expect(sql).toContain('insert into "catalog_item_names"');
    expect(sql).toContain('insert into "plant_objects"');
    expect(sql).toContain('insert into "lineage_pending_source_identities"');
    expect(sql).toContain('insert into "lineage_provenance_edges"');
    expect(sql).toContain('insert into "journal_entries"');
    expect(sql).toContain('insert into "journal_topics"');
    expect(sql).toContain('insert into "journal_entry_topic_signals"');
    expect(sql).toContain('insert into "media_assets"');
    expect(sql).toContain('on conflict ("id") do update');
    expect(sql).toContain('on conflict ("user_id") do update');
    expect(sql).not.toMatch(
      /analytics_events|job_queue|meilisearch|search_documents|notifications/i,
    );

    const parameters = compiled.flatMap((item) => item.parameters);
    expect(parameters).toContain(VISUAL_FIXTURE_MANIFEST.actors[0].id);
    expect(parameters).toContain(VISUAL_FIXTURE_MANIFEST.entries[79].id);
    expect(parameters).toContain(VISUAL_FIXTURE_MANIFEST.topics[2].id);
    expect(parameters).toContain(
      VISUAL_FIXTURE_MANIFEST.topicSignals[14].journalEntryId,
    );
    expect(parameters).toContain(VISUAL_FIXTURE_MANIFEST.media[15].id);
    expect(compiled[0].parameters).toEqual(
      VISUAL_FIXTURE_MANIFEST.lineageEvidence.edges.map(({ id }) => id),
    );
    expect(compiled[1].parameters).toEqual(
      VISUAL_FIXTURE_MANIFEST.media.map(({ id }) => id),
    );
  });

  it("builds an exact-id reset in reverse dependency order", () => {
    const queries = buildVisualFixtureResetQueries(
      testDb,
      VISUAL_FIXTURE_MANIFEST,
    );

    expect(queries.map(({ label }) => label)).toEqual([
      "media",
      "topic_signals",
      "topics",
      "entries",
      "lineage_edges",
      "lineage_pending_identities",
      "objects",
      "catalog_names",
      "catalog_items",
      "spaces",
      "profiles",
      "actors",
    ]);

    const compiled = queries.map(({ query }) => query.compile());
    const sql = compiled.map((item) => item.sql).join("\n");
    expect(sql).not.toMatch(/\blike\b|analytics_events|job_queue/i);

    const expectedIdGroups = [
      VISUAL_FIXTURE_MANIFEST.media.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.topics.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.topics.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.entries.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.lineageEvidence.edges.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.lineageEvidence.pendingIdentities.map(
        ({ id }) => id,
      ),
      VISUAL_FIXTURE_MANIFEST.objects.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.catalogNames.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.catalogItems.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.spaces.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.actors.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.actors.map(({ id }) => id),
    ];

    compiled.forEach((item, index) => {
      expect(item.parameters).toEqual(expectedIdGroups[index]);
    });
  });

  it("limits status queries to aggregate counts over exact manifest ids", () => {
    const queries = buildVisualFixtureStatusQueries(
      testDb,
      VISUAL_FIXTURE_MANIFEST,
    );
    const compiled = queries.map(({ query }) => query.compile());
    const sql = compiled.map((item) => item.sql).join("\n");

    expect(queries.map(({ label }) => label)).toEqual([
      "actors",
      "profiles",
      "spaces",
      "catalogItems",
      "catalogNames",
      "objects",
      "lineagePendingIdentities",
      "lineageEdges",
      "entries",
      "topics",
      "topicSignals",
      "media",
    ]);
    expect(sql.match(/count\(\*\)/g)).toHaveLength(12);
    expect(sql).toContain('from "catalog_items"');
    expect(sql).toContain('from "catalog_item_names"');
    expect(sql).toContain('from "user_public_profiles"');
    expect(sql).toContain('from "journal_topics"');
    expect(sql).toContain('from "journal_entry_topic_signals"');
    expect(sql).toContain('from "lineage_pending_source_identities"');
    expect(sql).toContain('from "lineage_provenance_edges"');
    expect(sql).not.toMatch(
      /email|body|owner_user_id|quarantine_key|derivative_key/i,
    );
  });
});

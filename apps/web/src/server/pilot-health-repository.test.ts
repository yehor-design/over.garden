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
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import {
  buildArchivedOrGonePublicVarietyRowsQuery,
  buildPilotAnalyticsMetricsQuery,
  buildPilotEntryMetricsQuery,
  buildPilotPublicVarietyHealthRowsQuery,
  getPilotHealthReadoutSafely,
  summarizePublicVarietyHealthRows,
} from "./pilot-health-repository";

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
const since = new Date("2026-06-20T00:00:00.000Z");

describe("pilot health privacy-safe aggregate contracts", () => {
  it("counts journal activity without selecting raw title/body or joining auth tables", () => {
    const compiled = buildPilotEntryMetricsQuery(testDb, since).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain('from "journal_entries"');
    expect(sql).toContain("count(distinct");
    expect(sql).toContain("previous_same_object_entry");
    expect(sql).not.toContain('select "journal_entries"."title"');
    expect(sql).not.toContain('select "journal_entries"."body"');
    expect(sql).not.toContain('"user"');
    expect(sql).not.toContain('"session"');
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("ipaddress");
    expect(sql).not.toContain("useragent");
    expect(sql).not.toContain('"media_assets"."quarantine_key"');
    expect(sql).not.toContain('"media_assets"."derivative_key" as');
    expect(sql).not.toContain("latitude");
    expect(sql).not.toContain("longitude");
  });

  it("counts only enum-safe event properties and never selects raw properties", () => {
    const compiled = buildPilotAnalyticsMetricsQuery(testDb, since).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain('from "analytics_events"');
    expect(sql).toContain("properties ->> 'activation_source'");
    expect(sql).toContain("properties ->> 'followed_by_action'");
    expect(sql).not.toContain('select "analytics_events"."properties"');
    expect(sql).not.toContain("title");
    expect(sql).not.toContain("body");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("referrer");
    expect(sql).not.toContain("user_agent");
    expect(sql).not.toContain("query");
    expect(sql).not.toContain("url");
    expect(sql).not.toContain("media_metadata");
  });

  it("summarizes public variety indexability through safe public filters", () => {
    const compiled = buildPilotPublicVarietyHealthRowsQuery(testDb).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain('"journal_entries"."visibility" = $');
    expect(sql).toContain('"journal_entries"."lifecycle_state" = $');
    expect(sql).toContain('"journal_entries"."public_gone_at" is null');
    expect(sql).toContain("char_length");
    expect(sql).not.toContain('"journal_entries"."title" as');
    expect(sql).not.toContain('"journal_entries"."body" as');
    expect(sql).not.toContain("quarantine_key");
    expect(sql).not.toContain("derivative_key");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("useragent");
    expect(sql).not.toContain("referrer");
  });

  it("detects archived or public-gone varieties without exposing entry content", () => {
    const compiled = buildArchivedOrGonePublicVarietyRowsQuery(testDb).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain('"journal_entries"."lifecycle_state" = $');
    expect(sql).toContain('"journal_entries"."public_gone_at" is not null');
    expect(sql).not.toContain('"journal_entries"."title"');
    expect(sql).not.toContain('"journal_entries"."body"');
    expect(sql).not.toContain("quarantine_key");
    expect(sql).not.toContain("derivative_key");
  });

  it("maps current and archived variety rows into promoted, thin, and de-promoted counts", () => {
    expect(
      summarizePublicVarietyHealthRows(
        [
          {
            publicSlug: "tomato-a",
            entryCount: 3,
            aggregateBodyLength: 650,
          },
          {
            publicSlug: "tomato-b",
            entryCount: 1,
            aggregateBodyLength: 120,
          },
        ],
        [
          { publicSlug: "tomato-b", archivedOrGoneEntryCount: 1 },
          { publicSlug: "tomato-c", archivedOrGoneEntryCount: 2 },
        ],
      ),
    ).toMatchObject({
      promotedIndexableCount: 1,
      thinNoindexCount: 1,
      demotedByArchiveOrGoneCount: 2,
      currentPublicVarietyCount: 2,
    });
  });

  it("returns null instead of throwing when the readout query fails", async () => {
    const logger = { error: vi.fn() };

    const result = await getPilotHealthReadoutSafely({
      logger,
      reader: async () => {
        throw new Error("database unavailable");
      },
    });

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("Pilot health readout failed.", {
      error: "database unavailable",
    });
  });
});

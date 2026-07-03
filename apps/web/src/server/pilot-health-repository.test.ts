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
  buildPilotSegmentMetricsQuery,
  buildPilotPublicVarietyHealthRowsQuery,
  getPilotHealthReadout,
  getPilotHealthReadoutSafely,
  summarizePilotSegmentMetricRows,
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
    expect(sql).toContain("entry_closed_pilot_grant");
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
    expect(sql).toContain("offline_queued_closed_pilot_grant");
    expect(sql).toContain("offline_synced_closed_pilot_grant");
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

  it("counts invited-cohort starts and first-entry saves with enum-only filters", () => {
    const compiled = buildPilotAnalyticsMetricsQuery(testDb, since).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain(
      "properties ->> 'activation_source' = 'invited_cohort'",
    );
    expect(sql).toContain("activation_closed_pilot_grant");
    expect(sql).toContain("entry_closed_pilot_grant");
    expect(sql).toContain("from pilot_invite_grants");
    expect(sql).toContain("cohort = $");
    expect(sql).toContain('"activationstartedinvitedcohort"');
    expect(sql).toContain('"entrysavedinvitedcohort"');
    expect(sql).not.toContain("invite_token");
    expect(sql).not.toContain("invite_email");
  });

  it("aggregates follow-up value pulse with enum-only usefulness filters", () => {
    const compiled = buildPilotAnalyticsMetricsQuery(testDb, since).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain("follow_up_value_pulse");
    expect(sql).toContain("value_pulse_closed_pilot_grant");
    expect(sql).toContain("properties ->> 'pulse_outcome'");
    expect(sql).toContain("properties ->> 'usefulness'");
    expect(sql).toContain("properties ? 'usefulness_reason'");
  });

  it("derives invited-cohort same-object follow-ups from membership, not raw entry text", () => {
    const compiled = buildPilotEntryMetricsQuery(testDb, since).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain('"invitedcohortsameobjectfollowupentries"');
    expect(sql).toContain('"invitedcohortreturninggardeners"');
    expect(sql).toContain("cohort_first_save_event");
    expect(sql).toContain("cohort_closed_pilot_grant");
    expect(sql).toContain("cohort_return_closed_pilot_grant");
    expect(sql).toContain("from pilot_invite_grants");
    expect(sql).toContain("cohort = $");
    expect(sql).toContain(
      "properties ->> 'activation_source' = 'invited_cohort'",
    );
    expect(sql).not.toContain('select "journal_entries"."title"');
    expect(sql).not.toContain('select "journal_entries"."body"');
    expect(sql).not.toContain("email");
    expect(sql).not.toContain('"session"');
  });

  it("builds segment-scoped invited cohort aggregates without private fields", () => {
    const compiled = buildPilotSegmentMetricsQuery(testDb, since).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain('from "pilot_invite_grants"');
    expect(sql).toContain('"segment_grants"."cohort" = $');
    expect(sql).toContain('"segment_grants"."segment"');
    expect(sql).toContain(
      "properties ->> 'activation_source' = 'invited_cohort'",
    );
    expect(sql).toContain("segment_previous_same_object_entry");
    expect(sql).not.toContain('select "segment_follow_up_entries"."title"');
    expect(sql).not.toContain('select "segment_follow_up_entries"."body"');
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("invite_token");
    expect(sql).not.toContain("referrer");
    expect(sql).not.toContain("user_agent");
    expect(sql).not.toContain("quarantine");
    expect(sql).not.toContain("derivative_key");
    expect(sql).not.toContain("latitude");
    expect(sql).not.toContain("longitude");
  });

  it("summarizes segment rows with buckets, rates, unknown flags, and low-sample flags", () => {
    expect(
      summarizePilotSegmentMetricRows([
        {
          segment: "casual_practical_beginner",
          writeEligibleGardeners: 2,
          starts: 2,
          firstEntrySaves: 1,
          sameObjectFollowUpEntries: 1,
          returningGardeners: 1,
        },
        {
          segment: "unknown_segment",
          writeEligibleGardeners: 1,
          starts: 0,
          firstEntrySaves: 0,
          sameObjectFollowUpEntries: 0,
          returningGardeners: 0,
        },
      ]),
    ).toMatchObject([
      {
        segment: "casual_practical_beginner",
        coreBucket: "casual_core",
        diagnosticBucket: "land_practical",
        firstEntrySaveRate: 0.5,
        followUpRateAmongFirstSavers: 1,
        isLowSample: true,
      },
      {
        segment: "unknown_segment",
        coreBucket: "unknown",
        diagnosticBucket: "unknown",
        isUnknownSegment: true,
      },
    ]);
  });

  it("summarizes public variety indexability through safe public filters", () => {
    const compiled = buildPilotPublicVarietyHealthRowsQuery(testDb).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain('"journal_entries"."visibility" = $');
    expect(sql).toContain('"journal_entries"."lifecycle_state" = $');
    expect(sql).toContain('"journal_entries"."public_gone_at" is null');
    expect(sql).toContain("public_entry_closed_pilot_grant");
    expect(sql).toContain("char_length");
    expect(sql).toContain('"catalog_items"."status" as "catalogstatus"');
    expect(sql).toContain('"catalog_items"."source" as "catalogsource"');
    expect(sql).toContain('"catalog_items"."status"');
    expect(sql).toContain('"catalog_items"."source"');
    expect(sql).not.toContain('"journal_entries"."title" as');
    expect(sql).not.toContain('"journal_entries"."body" as');
    expect(sql).not.toContain("quarantine_key");
    expect(sql).not.toContain("derivative_key");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("useragent");
    expect(sql).not.toContain("referrer");
  });

  it("detects archived or public-gone varieties without exposing entry content", () => {
    const compiled =
      buildArchivedOrGonePublicVarietyRowsQuery(testDb).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain('"journal_entries"."lifecycle_state" = $');
    expect(sql).toContain('"journal_entries"."public_gone_at" is not null');
    expect(sql).toContain("archived_entry_closed_pilot_grant");
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
            catalogStatus: "seeded",
            catalogSource: "ua_state_register",
            entryCount: 3,
            aggregateBodyLength: 650,
          },
          {
            publicSlug: "tomato-b",
            catalogStatus: "seeded",
            catalogSource: "internal_seed",
            entryCount: 3,
            aggregateBodyLength: 650,
          },
          {
            publicSlug: "tomato-c",
            catalogStatus: "seeded",
            catalogSource: "ua_state_register",
            entryCount: 1,
            aggregateBodyLength: 120,
          },
        ],
        [
          { publicSlug: "tomato-b", archivedOrGoneEntryCount: 1 },
          { publicSlug: "tomato-d", archivedOrGoneEntryCount: 2 },
        ],
      ),
    ).toMatchObject({
      promotedIndexableCount: 1,
      thinNoindexCount: 2,
      demotedByArchiveOrGoneCount: 2,
      currentPublicVarietyCount: 3,
    });
  });

  it("exposes the invited-cohort loop in the assembled readout shape", async () => {
    const readout = await getPilotHealthReadout(testDb, new Date());

    for (const window of readout.windows) {
      expect(window.metrics.activationStarts).toMatchObject({
        invitedCohort: 0,
      });
      expect(window.metrics.entrySavesByActivationSource).toMatchObject({
        invitedCohort: 0,
      });
      expect(window.metrics.invitedCohort).toEqual({
        starts: 0,
        firstEntrySaves: 0,
        sameObjectFollowUpEntries: 0,
        returningGardeners: 0,
        firstEntrySaveRate: 0,
        segments: [],
      });
      expect(window.metrics.followUpValuePulse).toEqual({
        responses: 0,
        submitted: 0,
        skipped: 0,
        useful: 0,
        notSure: 0,
        notUseful: 0,
        withReason: 0,
        usefulRate: 0,
      });
    }

    expect(readout.notes.some((note) => note.includes("Invited-cohort"))).toBe(
      true,
    );
    expect(
      readout.notes.some((note) => note.includes("Follow-up value pulse")),
    ).toBe(true);
    expect(readout.writeAccess).toEqual({
      writeEligibleGardeners: 0,
      founderRehearsalGardeners: 0,
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

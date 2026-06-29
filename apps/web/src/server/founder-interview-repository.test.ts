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
  buildInsertFounderInterviewLearningQuery,
  buildListFounderInterviewLearningsQuery,
  groupFounderInterviewLearningsBySegment,
} from "./founder-interview-repository";

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

describe("founder interview repository privacy contracts", () => {
  it("inserts bounded structured fields without journal or media joins", () => {
    const now = new Date("2026-06-29T08:00:00.000Z");
    const compiled = buildInsertFounderInterviewLearningQuery(
      testDb,
      {
        userId: "00000000-0000-4000-8000-000000000999",
        sessionId: "operator-session",
      },
      {
        normalized: {
          segment: "casual_practical_beginner",
          activationResult: "activated_with_follow_up",
          returnReason: "same_object_follow_up",
          mainObjection: "none_observed",
          observedValue: "history_worth_keeping",
          nextAction: "continue_pilot",
          redactedNote: "Follow-up felt natural.",
          subjectUserId: "00000000-0000-4000-8000-000000000001",
          pilotCohort: "closed_pilot",
        },
        now,
      },
    ).compile();

    expect(compiled.sql).toContain('insert into "pilot_interview_learnings"');
    expect(compiled.sql).toContain('"segment"');
    expect(compiled.sql).toContain('"activation_result"');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.sql).not.toMatch(
      /title|body|email|ip|user_agent|userAgent|referrer|url|quarantine|derivative|coordinate|latitude|longitude/i,
    );
  });

  it("lists operator interview records with optional segment filters", () => {
    const compiled = buildListFounderInterviewLearningsQuery(testDb, 25, {
      segment: "power_collector",
      activationResult: "activated_with_follow_up",
    }).compile();

    expect(compiled.sql).toContain('from "pilot_interview_learnings"');
    expect(compiled.sql).toContain('"segment"');
    expect(compiled.sql).toContain('"activation_result"');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("media_assets");
  });

  it("groups readback by segment for operator interpretation", () => {
    const grouped = groupFounderInterviewLearningsBySegment([
      {
        id: "1",
        recordedByUserId: "operator",
        subjectUserId: null,
        pilotCohort: "closed_pilot",
        segment: "power_collector",
        activationResult: "activated_with_follow_up",
        returnReason: "same_object_follow_up",
        mainObjection: "none_observed",
        observedValue: "history_worth_keeping",
        nextAction: "continue_pilot",
        redactedNote: null,
        recordedAt: "2026-06-29T09:00:00.000Z",
      },
      {
        id: "2",
        recordedByUserId: "operator",
        subjectUserId: null,
        pilotCohort: "closed_pilot",
        segment: "casual_practical_beginner",
        activationResult: "activated_first_entry_only",
        returnReason: "never_returned",
        mainObjection: "no_clear_value",
        observedValue: "no_clear_value_yet",
        nextAction: "schedule_follow_up",
        redactedNote: null,
        recordedAt: "2026-06-29T08:00:00.000Z",
      },
      {
        id: "3",
        recordedByUserId: "operator",
        subjectUserId: null,
        pilotCohort: "closed_pilot",
        segment: "power_collector",
        activationResult: "dropped_after_first",
        returnReason: "composer_friction",
        mainObjection: "too_much_effort",
        observedValue: "no_clear_value_yet",
        nextAction: "iterate_composer",
        redactedNote: null,
        recordedAt: "2026-06-29T07:00:00.000Z",
      },
    ]);

    expect(grouped.map((group) => group.segment)).toEqual([
      "casual_practical_beginner",
      "power_collector",
    ]);
    expect(grouped[1]?.records.map((record) => record.id)).toEqual(["1", "3"]);
  });
});

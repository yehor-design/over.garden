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
  assemblePilotCohortDecisionReadout,
  buildPilotInterviewLearningAggregateQuery,
  getPilotCohortDecisionReadoutSafely,
} from "./pilot-cohort-decision-repository";
import { getPilotHealthReadout } from "./pilot-health-repository";

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

describe("pilot cohort decision repository privacy contracts", () => {
  it("aggregates interview learnings with enum-only groupings", () => {
    const compiled =
      buildPilotInterviewLearningAggregateQuery(testDb).compile();
    const sql = compiled.sql.toLowerCase();

    expect(sql).toContain('from "pilot_interview_learnings"');
    expect(sql).toContain("count(*)");
    expect(sql).toContain('"pilot_cohort" is null');
    expect(sql).toContain('"pilot_cohort" = $1');
    expect(sql).toContain("group by");
    expect(sql).toContain('"activation_result"');
    expect(sql).toContain('"next_action"');
    expect(sql).toContain('"observed_value"');
    expect(sql).toContain('"segment"');
    expect(sql).not.toContain("journal_entries");
    expect(sql).not.toContain("media_assets");
    expect(sql).not.toContain("redacted_note");
    expect(sql).not.toContain("subject_user_id");
    expect(sql).not.toContain("founder_rehearsal");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("title");
    expect(sql).not.toContain("body");
    expect(sql).not.toContain("referrer");
    expect(sql).not.toContain("user_agent");
    expect(sql).not.toContain("url");
  });

  it("assembles a decision readout without forbidden private fields", async () => {
    const healthReadout = await getPilotHealthReadout(
      testDb,
      new Date("2026-06-29T12:00:00.000Z"),
    );
    const readout = assemblePilotCohortDecisionReadout(
      healthReadout,
      [],
      new Date(),
    );

    expect(readout.evaluationWindow.key).toBe("last_30_days");
    expect(readout.decision.recommendation).toBe("insufficient_data");
    expect(readout.decision.dataGaps.length).toBeGreaterThan(0);
    expect(readout.cohort.writeEligibleGardeners).toBe(0);
    expect(readout.cohort.founderRehearsalGardeners).toBe(0);
    expect(readout.cohort.segments).toEqual([]);
    expect(
      readout.caveats.some((note) => note.includes("decision support")),
    ).toBe(true);
    expect(
      readout.caveats.some((note) => note.includes("Founder rehearsal")),
    ).toBe(true);

    expect(Object.keys(readout.interviews)).toEqual([
      "totalRecords",
      "bySegment",
      "byActivationResult",
      "byNextAction",
      "byObservedValue",
      "continueSignals",
      "iterateSignals",
      "stopSignals",
    ]);
    expect(readout.interviews).not.toHaveProperty("redactedNote");
    expect(readout.interviews).not.toHaveProperty("subjectUserId");
    expect(readout.decision).not.toHaveProperty("rawJournalText");
    expect(readout).not.toHaveProperty("records");
  });

  it("returns null instead of throwing when the readout query fails", async () => {
    const logger = { error: vi.fn() };

    const result = await getPilotCohortDecisionReadoutSafely({
      logger,
      reader: async () => {
        throw new Error("database unavailable");
      },
    });

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      "Pilot cohort decision readout failed.",
      { error: "database unavailable" },
    );
  });
});

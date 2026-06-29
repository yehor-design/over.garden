import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import {
  buildInsertAnalyticsEventQuery,
  normalizeAnalyticsEventProperties,
} from "@/server/analytics-events";
import {
  buildFollowUpValuePulseEligibilityQuery,
  normalizeFollowUpValuePulseResponseInput,
  recordFollowUpValuePulseResponse,
} from "@/server/follow-up-value-pulse";
import { buildPilotAnalyticsMetricsQuery } from "@/server/pilot-health-repository";
import { scopedToUser } from "@/server/request-scope";

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

  createIntrospector(db: Kysely<unknown>) {
    return new PostgresIntrospector(db);
  }
}

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });
const scope = scopedToUser("00000000-0000-0000-0000-000000000001", "session-1");

describe("follow-up value pulse contracts", () => {
  it("normalizes bounded usefulness feedback properties only", () => {
    expect(
      normalizeAnalyticsEventProperties({
        pulse_outcome: "submitted",
        usefulness: "useful",
        usefulness_reason: "history_felt_worth_keeping",
      }),
    ).toEqual({
      pulse_outcome: "submitted",
      usefulness: "useful",
      usefulness_reason: "history_felt_worth_keeping",
    });
  });

  it("records skipped responses without usefulness fields", () => {
    expect(
      normalizeFollowUpValuePulseResponseInput({
        plantObjectId: "00000000-0000-0000-0000-000000000010",
        journalEntryId: "00000000-0000-0000-0000-000000000011",
        outcome: "skipped",
      }),
    ).toEqual({
      plantObjectId: "00000000-0000-0000-0000-000000000010",
      journalEntryId: "00000000-0000-0000-0000-000000000011",
      outcome: "skipped",
    });
  });

  it("requires usefulness when feedback is submitted", () => {
    expect(
      normalizeFollowUpValuePulseResponseInput({
        plantObjectId: "00000000-0000-0000-0000-000000000010",
        journalEntryId: "00000000-0000-0000-0000-000000000011",
        outcome: "submitted",
      }),
    ).toEqual({
      error: "Usefulness is required when submitting feedback.",
    });
  });

  it("rejects forbidden analytics property keys for value pulse events", () => {
    expect(() =>
      normalizeAnalyticsEventProperties({
        pulse_outcome: "submitted",
        usefulness: "useful",
        usefulness_reason: "history_felt_worth_keeping",
        // @ts-expect-error privacy regression guard
        journal_body: "secret",
      }),
    ).toThrow(/Forbidden analytics event property/);
  });

  it("stores follow_up_value_pulse without journal text or URL fields", () => {
    const compiled = buildInsertAnalyticsEventQuery(testDb, scope, {
      eventName: "follow_up_value_pulse",
      properties: {
        pulse_outcome: "submitted",
        usefulness: "not_sure",
        usefulness_reason: "not_sure_why",
      },
      plantObjectId: "00000000-0000-0000-0000-000000000010",
      journalEntryId: "00000000-0000-0000-0000-000000000011",
    }).compile();

    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "session-1",
      "follow_up_value_pulse",
      {
        pulse_outcome: "submitted",
        usefulness: "not_sure",
        usefulness_reason: "not_sure_why",
      },
      null,
      "00000000-0000-0000-0000-000000000010",
      "00000000-0000-0000-0000-000000000011",
      null,
    ]);
    expect(JSON.stringify(compiled.parameters)).not.toMatch(
      /title|body|email|referrer|user_agent|url|query/i,
    );
  });

  it("builds eligibility query from prior same-object entry and no prior response", () => {
    const sql = buildFollowUpValuePulseEligibilityQuery(testDb, scope, {
      plantObjectId: "00000000-0000-0000-0000-000000000010",
      journalEntryId: "00000000-0000-0000-0000-000000000011",
    })
      .compile()
      .sql.toLowerCase();

    expect(sql).toContain("prior_entry");
    expect(sql).toContain('"analytics_events"');
    expect(sql).toContain('"event_name" = $');
  });

  it("aggregates value pulse counts in pilot health analytics query", () => {
    const sql = buildPilotAnalyticsMetricsQuery(
      testDb,
      new Date("2026-06-01T00:00:00.000Z"),
    )
      .compile()
      .sql.toLowerCase();

    expect(sql).toContain("follow_up_value_pulse");
    expect(sql).toContain("valuepulsesubmitted");
    expect(sql).toContain("valuepulseuseful");
  });

  it("returns ineligible when the follow-up entry cannot be validated", async () => {
    const executor = {
      selectFrom: vi.fn(() => ({
        select: vi.fn(() => ({
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                executeTakeFirst: vi.fn(async () => undefined),
              })),
            })),
          })),
        })),
      })),
    };

    const result = await recordFollowUpValuePulseResponse(
      scope,
      {
        plantObjectId: "00000000-0000-0000-0000-000000000010",
        journalEntryId: "00000000-0000-0000-0000-000000000011",
        outcome: "skipped",
      },
      executor as never,
    );

    expect(result).toEqual({
      recorded: false,
      error: "This follow-up is not eligible for a value pulse response.",
    });
  });
});

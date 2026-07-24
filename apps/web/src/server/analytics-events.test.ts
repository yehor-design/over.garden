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
import { scopedToUser } from "@/server/request-scope";
import {
  buildFindOpenOwnRecordRevisitEventQuery,
  buildInsertAnalyticsEventQuery,
  buildMarkOwnRecordRevisitFollowedByActionQuery,
  isBackdatedEntryDate,
  normalizeAnalyticsEventProperties,
  recordAnalyticsEventSafely,
} from "./analytics-events";

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
const scope = scopedToUser("00000000-0000-0000-0000-000000000001", "session-1");

describe("analytics event privacy contracts", () => {
  it("normalizes only privacy-safe boolean and enum properties", () => {
    expect(
      normalizeAnalyticsEventProperties({
        activation_source: "homepage",
        entry_scope: "object",
        has_photo: true,
        is_backdated: false,
        location_visibility_level: "hidden",
        object_kind: "animal",
        source_surface_kind: "homepage",
        sync_status: "offline_synced",
        variety_state: "selected",
        followed_by_action: false,
      }),
    ).toEqual({
      activation_source: "homepage",
      entry_scope: "object",
      has_photo: true,
      is_backdated: false,
      location_visibility_level: "hidden",
      object_kind: "animal",
      source_surface_kind: "homepage",
      sync_status: "offline_synced",
      variety_state: "selected",
      followed_by_action: false,
    });
  });

  it("allows space entry scope without raw mentioned object identifiers", () => {
    expect(
      normalizeAnalyticsEventProperties({
        entry_scope: "space",
        has_photo: false,
        sync_status: "online",
      }),
    ).toEqual({
      entry_scope: "space",
      has_photo: false,
      sync_status: "online",
    });
    expect(() =>
      normalizeAnalyticsEventProperties({
        mentionedPlantObjectIds: ["00000000-0000-0000-0000-000000000003"],
      } as never),
    ).toThrow("Unsupported analytics event property: mentionedPlantObjectIds.");
  });

  it("allows all bounded living object kinds in analytics", () => {
    expect(
      normalizeAnalyticsEventProperties({
        object_kind: "plant",
      }),
    ).toEqual({ object_kind: "plant" });
    expect(
      normalizeAnalyticsEventProperties({
        object_kind: "animal",
      }),
    ).toEqual({ object_kind: "animal" });
  });

  it("maps historical third-kind analytics values to animal on read", () => {
    const historical = (["bee", "colony"] as const).join("_");
    expect(
      normalizeAnalyticsEventProperties({
        object_kind: historical,
      } as never),
    ).toEqual({ object_kind: "animal" });
  });

  it("allows only bounded activation and source surface enums", () => {
    expect(
      normalizeAnalyticsEventProperties({
        activation_source: "public_variety",
        source_surface_kind: "variety",
      }),
    ).toEqual({
      activation_source: "public_variety",
      source_surface_kind: "variety",
    });
    expect(
      normalizeAnalyticsEventProperties({
        activation_source: "direct_garden",
        source_surface_kind: "garden",
      }),
    ).toEqual({
      activation_source: "direct_garden",
      source_surface_kind: "garden",
    });
  });

  it("allows the invited-cohort activation source and invite surface enum", () => {
    expect(
      normalizeAnalyticsEventProperties({
        activation_source: "invited_cohort",
        source_surface_kind: "invite",
      }),
    ).toEqual({
      activation_source: "invited_cohort",
      source_surface_kind: "invite",
    });
  });

  it("records activation starts without raw URL, referrer, or query values", () => {
    const compiled = buildInsertAnalyticsEventQuery(testDb, scope, {
      eventName: "activation_started",
      properties: {
        activation_source: "public_variety",
        source_surface_kind: "variety",
      },
    }).compile();

    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "session-1",
      "activation_started",
      {
        activation_source: "public_variety",
        source_surface_kind: "variety",
      },
      null,
      null,
      null,
      null,
    ]);
    expect(JSON.stringify(compiled.parameters)).not.toContain("url");
    expect(JSON.stringify(compiled.parameters)).not.toContain("referrer");
    expect(JSON.stringify(compiled.parameters)).not.toContain("query");
  });

  it("keeps legacy free_text event values readable during catalog migration", () => {
    expect(
      normalizeAnalyticsEventProperties({
        variety_state: "free_text",
      }),
    ).toEqual({
      variety_state: "free_text",
    });
  });

  it("allows user-added variety state without raw catalog names", () => {
    expect(
      normalizeAnalyticsEventProperties({
        variety_state: "user_added",
      }),
    ).toEqual({
      variety_state: "user_added",
    });
  });

  it("rejects raw content, precise location, media metadata, and PII fields", () => {
    expect(() =>
      normalizeAnalyticsEventProperties({ title: "First flowers" } as never),
    ).toThrow("Forbidden analytics event property: title.");
    expect(() =>
      normalizeAnalyticsEventProperties({ body: "private note" } as never),
    ).toThrow("Forbidden analytics event property: body.");
    expect(() =>
      normalizeAnalyticsEventProperties({ latitude: 50.45 } as never),
    ).toThrow("Forbidden analytics event property: latitude.");
    expect(() =>
      normalizeAnalyticsEventProperties({
        email: "gardener@example.com",
      } as never),
    ).toThrow("Forbidden analytics event property: email.");
    expect(() =>
      normalizeAnalyticsEventProperties({ raw_exif: true } as never),
    ).toThrow("Forbidden analytics event property: raw_exif.");
    expect(() =>
      normalizeAnalyticsEventProperties({
        public_url_referrer: "/variety/pomidor-cheri-0000000101",
      } as never),
    ).toThrow("Forbidden analytics event property: public_url_referrer.");
    expect(() =>
      normalizeAnalyticsEventProperties({
        raw_query: "catalog=pomidor-cheri-0000000101",
      } as never),
    ).toThrow("Forbidden analytics event property: raw_query.");
    expect(() =>
      normalizeAnalyticsEventProperties({
        user_agent: "Mozilla/5.0",
      } as never),
    ).toThrow("Forbidden analytics event property: user_agent.");
  });

  it("rejects unsupported or non-enum property values", () => {
    expect(() =>
      normalizeAnalyticsEventProperties({
        sync_status: "queued with body text",
      } as never),
    ).toThrow("Unsafe analytics event value for sync_status.");
    expect(() =>
      normalizeAnalyticsEventProperties({
        has_photo: "yes",
      } as never),
    ).toThrow("Unsafe analytics event value for has_photo.");
    expect(() =>
      normalizeAnalyticsEventProperties({
        activation_source: "https://over.garden/variety/x",
      } as never),
    ).toThrow("Unsafe analytics event value for activation_source.");
    expect(() =>
      normalizeAnalyticsEventProperties({
        source_surface_kind: "https://over.garden/",
      } as never),
    ).toThrow("Unsafe analytics event value for source_surface_kind.");
  });

  it("builds event inserts with pseudonymous scope and no raw title/body fields", () => {
    const compiled = buildInsertAnalyticsEventQuery(testDb, scope, {
      eventName: "entry_logged",
      properties: {
        entry_scope: "object",
        has_photo: false,
        is_backdated: true,
        location_visibility_level: "region",
        activation_source: "public_variety",
        source_surface_kind: "variety",
        sync_status: "online",
        variety_state: "unknown",
      },
      spaceId: "00000000-0000-0000-0000-000000000002",
      plantObjectId: "00000000-0000-0000-0000-000000000003",
      journalEntryId: "00000000-0000-0000-0000-000000000004",
    }).compile();

    expect(compiled.sql).toContain('insert into "analytics_events"');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "session-1",
      "entry_logged",
      {
        entry_scope: "object",
        has_photo: false,
        is_backdated: true,
        location_visibility_level: "region",
        activation_source: "public_variety",
        source_surface_kind: "variety",
        sync_status: "online",
        variety_state: "unknown",
      },
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000004",
      null,
    ]);
    expect(JSON.stringify(compiled.parameters)).not.toContain("title");
    expect(JSON.stringify(compiled.parameters)).not.toContain("body");
    expect(JSON.stringify(compiled.parameters)).not.toContain("referrer");
    expect(JSON.stringify(compiled.parameters)).not.toContain("user_agent");
  });

  it("links a second entry to the latest unclosed revisit in the same session and object", () => {
    const compiled = buildFindOpenOwnRecordRevisitEventQuery(testDb, scope, {
      sessionId: "session-1",
      plantObjectId: "00000000-0000-0000-0000-000000000003",
    }).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"session_id" = $2');
    expect(compiled.sql).toContain('"plant_object_id" = $3');
    expect(compiled.sql).toContain('"event_name" = $4');
    expect(compiled.sql).toContain(
      "properties ->> 'followed_by_action' = 'false'",
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "session-1",
      "00000000-0000-0000-0000-000000000003",
      "own_record_revisited",
      1,
    ]);
  });

  it("marks a revisit as followed by a same-session action without changing product data", () => {
    const compiled = buildMarkOwnRecordRevisitFollowedByActionQuery(
      testDb,
      scope,
      "00000000-0000-0000-0000-000000000010",
    ).compile();

    expect(compiled.sql).toContain('update "analytics_events"');
    expect(compiled.sql).toContain(
      "jsonb_set(properties, '{followed_by_action}', 'true'::jsonb, true)",
    );
    expect(compiled.sql).toContain('"id" = $2');
    expect(compiled.sql).toContain('"owner_user_id" = $3');
    expect(compiled.sql).toContain('"event_name" = $4');
    expect(compiled.parameters).toEqual([
      expect.any(Date),
      "00000000-0000-0000-0000-000000000010",
      "00000000-0000-0000-0000-000000000001",
      "own_record_revisited",
    ]);
  });

  it("logs event write failures without failing the caller", async () => {
    const logger = { error: vi.fn() };

    const result = await recordAnalyticsEventSafely(
      scope,
      {
        eventName: "entry_logged",
        properties: {
          entry_scope: "object",
          has_photo: false,
          is_backdated: false,
          location_visibility_level: "hidden",
          sync_status: "online",
          variety_state: "unknown",
        },
      },
      {
        logger,
        recorder: async () => {
          throw new Error("database unavailable");
        },
      },
    );

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("Analytics event write failed.", {
      eventName: "entry_logged",
      error: "database unavailable",
    });
  });

  it("flags dated entries earlier than today without sending raw dates in props", () => {
    expect(
      isBackdatedEntryDate("2026-06-25", new Date("2026-06-26T12:00:00.000Z")),
    ).toBe(true);
    expect(
      isBackdatedEntryDate("2026-06-26", new Date("2026-06-26T12:00:00.000Z")),
    ).toBe(false);
  });
});

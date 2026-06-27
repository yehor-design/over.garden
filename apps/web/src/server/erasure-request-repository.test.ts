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
import { ERASURE_REQUEST_INTAKE_VERSION } from "@/lib/privacy/disclosures";
import {
  buildInsertErasureRequestQuery,
  buildListOperatorErasureRequestsQuery,
  buildOpenErasureRequestForUserQuery,
} from "./erasure-request-repository";

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

describe("erasure request repository privacy contracts", () => {
  it("inserts a non-destructive bounded intake row", () => {
    const now = new Date("2026-06-27T06:00:00.000Z");
    const compiled = buildInsertErasureRequestQuery(testDb, {
      requester_user_id: "00000000-0000-0000-0000-000000000001",
      request_scope: "account_data_erasure",
      status: "submitted",
      submitted_at: now,
      intake_disclosure_version: ERASURE_REQUEST_INTAKE_VERSION,
      created_at: now,
      updated_at: now,
    }).compile();

    expect(compiled.sql).toContain('insert into "erasure_requests"');
    expect(compiled.sql).toContain('"requester_user_id"');
    expect(compiled.sql).toContain('"request_scope"');
    expect(compiled.sql).toContain('"intake_disclosure_version"');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.sql).not.toContain("analytics_events");
    expect(compiled.sql).not.toMatch(
      /title|body|email|ip|user_agent|userAgent|referrer|url|quarantine|derivative|coordinate|latitude|longitude/i,
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "account_data_erasure",
      "submitted",
      now,
      ERASURE_REQUEST_INTAKE_VERSION,
      now,
      now,
    ]);
  });

  it("finds open requests by requester without selecting private content", () => {
    const compiled = buildOpenErasureRequestForUserQuery(
      testDb,
      "00000000-0000-0000-0000-000000000001",
    ).compile();

    expect(compiled.sql).toContain('from "erasure_requests"');
    expect(compiled.sql).toContain('"requester_user_id" = $1');
    expect(compiled.sql).toContain('"status" in ($2, $3)');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.sql).not.toContain("body");
    expect(compiled.sql).not.toContain("email");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "submitted",
      "reviewing",
      1,
    ]);
  });

  it("lists operator readback rows without joining journal content or auth session data", () => {
    const compiled = buildListOperatorErasureRequestsQuery(testDb, 20).compile();

    expect(compiled.sql).toContain('from "erasure_requests"');
    expect(compiled.sql).toContain('"requester_user_id" as "requesterUserId"');
    expect(compiled.sql).toContain('"submitted_at" as "submittedAt"');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.sql).not.toContain('"user"');
    expect(compiled.sql).not.toContain("session");
    expect(compiled.sql).not.toMatch(
      /title|body|email|ip|user_agent|referrer|url|quarantine|derivative|coordinate|latitude|longitude/i,
    );
    expect(compiled.parameters).toEqual([20]);
  });
});

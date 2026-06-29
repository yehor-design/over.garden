import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  buildCountPilotWriteEligibleGardenersQuery,
  buildGrantPilotWriteAccessQuery,
  buildHasPilotWriteAccessQuery,
} from "./pilot-invite-repository";

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
const PII_PATTERN =
  /title|body|email|phone|ip|user_agent|useragent|referrer|url|query|token|coordinate|latitude|longitude|quarantine|derivative/i;

describe("pilot invite grant repository privacy contracts", () => {
  it("checks write eligibility by user id without reading auth or content tables", () => {
    const compiled = buildHasPilotWriteAccessQuery(
      testDb,
      "00000000-0000-0000-0000-000000000001",
    ).compile();

    expect(compiled.sql).toContain('from "pilot_invite_grants"');
    expect(compiled.sql).toContain('"user_id" = $1');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain('"user"');
    expect(compiled.sql).not.toContain("session");
    expect(compiled.sql).not.toMatch(PII_PATTERN);
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      1,
    ]);
  });

  it("grants write access with only a user id and enum cohort", () => {
    const compiled = buildGrantPilotWriteAccessQuery(testDb, {
      userId: "00000000-0000-0000-0000-000000000001",
      cohort: "closed_pilot",
    }).compile();

    expect(compiled.sql).toContain('insert into "pilot_invite_grants"');
    expect(compiled.sql).toContain('"user_id"');
    expect(compiled.sql).toContain('"cohort"');
    expect(compiled.sql).toContain("on conflict");
    expect(compiled.sql).toContain("do nothing");
    expect(compiled.sql).not.toMatch(PII_PATTERN);
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "closed_pilot",
    ]);
  });

  it("counts eligible gardeners as an aggregate without exposing identities", () => {
    const compiled = buildCountPilotWriteEligibleGardenersQuery(testDb).compile();

    expect(compiled.sql).toContain('from "pilot_invite_grants"');
    expect(compiled.sql).toContain("count(*)");
    expect(compiled.sql).not.toContain('"user_id"');
    expect(compiled.sql).not.toMatch(PII_PATTERN);
    expect(compiled.parameters).toEqual([]);
  });

  it("models the grant table with no PII or invite-link columns in SQL source", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );

    const tableMatch = schemaSql.match(
      /create table if not exists pilot_invite_grants \(([\s\S]*?)\);/,
    );
    expect(tableMatch).not.toBeNull();

    const tableBody = (tableMatch?.[1] ?? "").toLowerCase();
    expect(tableBody).toContain("user_id uuid primary key");
    expect(tableBody).toContain("cohort text not null");
    expect(tableBody).toContain("'closed_pilot'");
    expect(tableBody).not.toMatch(
      /email|phone|\bip\b|ip_address|user_agent|referrer|invite_url|invite_link|invite_token|\btoken\b|query/,
    );
  });
});

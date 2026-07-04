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
import { scopedToUser } from "@/server/request-scope";
import {
  buildInsertUserPublicProfileQuery,
  buildPublicProfileByNormalizedHandleQuery,
  buildPublicProfileEntrySummaryQuery,
  buildPublicProfileLineageSummaryQuery,
  buildPublicProfileLinksQuery,
  buildUpdateUserPublicHandleQuery,
  defaultPublicHandleForUserId,
  normalizePublicHandleInput,
  serializePublicProfilePage,
} from "./public-profile-repository";

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
const userId = "00000000-0000-4000-8000-000000000001";
const scope = scopedToUser(userId, "session-1");
const forbiddenPublicProfilePattern =
  /email|provider|account|session|ip_address|user_agent|referrer|phone|invite|token|journal_entries"\."title|journal_entries"\."body|media_assets|quarantine|derivative|source_reference_label|source_pending_identity_id|pending_identity/i;

describe("public profile handle contracts", () => {
  it("normalizes handles without allowing reserved or blocked names", () => {
    expect(normalizePublicHandleInput(" @Green_Thumb42 ")).toMatchObject({
      ok: true,
      handle: "green_thumb42",
      mention: "@green_thumb42",
    });
    expect(normalizePublicHandleInput("api")).toEqual({
      ok: false,
      error: "reserved",
    });
    expect(normalizePublicHandleInput("nazi_garden")).toEqual({
      ok: false,
      error: "blocked",
    });
    expect(normalizePublicHandleInput("@@broken")).toEqual({
      ok: false,
      error: "format",
    });
  });

  it("creates deterministic non-PII default handles from user ids", () => {
    const handle = defaultPublicHandleForUserId(userId);

    expect(handle).toMatch(/^gardener_[a-f0-9]{10}$/);
    expect(handle).toBe(defaultPublicHandleForUserId(userId));
    expect(handle).not.toContain(userId.replaceAll("-", ""));
  });

  it("inserts one public profile per user and relies on DB uniqueness", () => {
    const compiled = buildInsertUserPublicProfileQuery(testDb, {
      user_id: userId,
      handle: "green_thumb",
      normalized_handle: "green_thumb",
    }).compile();

    expect(compiled.sql).toContain('insert into "user_public_profiles"');
    expect(compiled.sql).toContain(
      'on conflict ("user_id") do nothing returning *',
    );
    expect(compiled.parameters).toEqual([userId, "green_thumb", "green_thumb"]);
  });

  it("updates handles only inside the signed-in user scope", () => {
    const compiled = buildUpdateUserPublicHandleQuery(testDb, scope, {
      handle: "new_handle",
      normalizedHandle: "new_handle",
    }).compile();

    expect(compiled.sql).toContain('update "user_public_profiles"');
    expect(compiled.sql).toContain('"user_id" =');
    expect(compiled.sql).toContain("returning *");
    expect(compiled.parameters).toContain(userId);
    expect(compiled.parameters).toContain("new_handle");
  });

  it("resolves public profiles by normalized handle without auth or private fields", () => {
    const compiled = buildPublicProfileByNormalizedHandleQuery(
      testDb,
      "green_thumb",
    ).compile();

    expect(compiled.sql).toContain('from "user_public_profiles"');
    expect(compiled.sql).toContain('"normalized_handle" =');
    expect(compiled.sql).toContain('"handle"');
    expect(compiled.sql).toContain('"display_name" as "displayName"');
    expect(compiled.sql).toContain('"avatar_url" as "avatarUrl"');
    expect(compiled.sql).not.toMatch(forbiddenPublicProfilePattern);
  });

  it("counts only active public contribution rows for profile summaries", () => {
    const entrySummary = buildPublicProfileEntrySummaryQuery(
      testDb,
      userId,
    ).compile();
    const lineageSummary = buildPublicProfileLineageSummaryQuery(
      testDb,
      userId,
    ).compile();

    expect(entrySummary.sql).toContain('from "journal_entries"');
    expect(entrySummary.sql).toContain('"visibility" =');
    expect(entrySummary.sql).toContain('"lifecycle_state" =');
    expect(entrySummary.sql).toContain('"public_gone_at" is null');
    expect(entrySummary.sql).toContain('"public_slug" is not null');
    expect(entrySummary.sql).not.toMatch(forbiddenPublicProfilePattern);

    expect(lineageSummary.sql).toContain('from "lineage_provenance_edges"');
    expect(lineageSummary.sql).toContain(
      'inner join "journal_entries" as "subject_public_entries"',
    );
    expect(lineageSummary.sql).toContain(
      'inner join "journal_entries" as "source_public_entries"',
    );
    expect(lineageSummary.sql).toContain('"source_kind" =');
    expect(lineageSummary.sql).toContain('"consent_state" =');
    expect(lineageSummary.sql).toContain('"erasure_state" =');
    expect(lineageSummary.parameters).toContain("confirmed");
    expect(lineageSummary.parameters).toContain("active");
    expect(lineageSummary.sql).not.toMatch(forbiddenPublicProfilePattern);
  });

  it("links only active public journal URLs without title or body readback", () => {
    const compiled = buildPublicProfileLinksQuery(testDb, userId).compile();

    expect(compiled.sql).toContain('"public_slug" as "publicSlug"');
    expect(compiled.sql).toContain('"entry_date" as "entryDate"');
    expect(compiled.sql).toContain('"visibility" =');
    expect(compiled.sql).toContain('"public_gone_at" is null');
    expect(compiled.sql).not.toMatch(forbiddenPublicProfilePattern);
  });

  it("serializes public profile readback without raw user ids", () => {
    const page = serializePublicProfilePage({
      profile: {
        userId,
        handle: "green_thumb",
        displayName: "Green Thumb",
        avatarUrl: null,
      },
      entrySummary: {
        publicEntryCount: "2",
        publicObjectCount: "1",
      },
      lineageSummary: {
        confirmedLineageEdgeCount: "3",
      },
      links: [
        {
          publicSlug: "first-public-entry",
          entryDate: "2026-07-04",
        },
      ],
    });

    expect(page).toEqual({
      handle: "green_thumb",
      mention: "@green_thumb",
      displayName: "Green Thumb",
      avatarUrl: null,
      summary: {
        publicEntryCount: 2,
        publicObjectCount: 1,
        confirmedLineageEdgeCount: 3,
      },
      links: [
        {
          kind: "journal_entry",
          href: "/journal/first-public-entry",
          entryDate: "2026-07-04",
        },
      ],
    });
    expect(JSON.stringify(page)).not.toContain(userId);
    expect(JSON.stringify(page)).not.toMatch(
      /email|provider|session|private journal|quarantine|derivative/i,
    );
  });

  it("models the public profile table with unique handle constraints and no PII columns", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    const tableMatch = schemaSql.match(
      /create table if not exists user_public_profiles \(([\s\S]*?)\);/,
    );

    expect(tableMatch).not.toBeNull();
    const tableBody = (tableMatch?.[1] ?? "").toLowerCase();
    expect(tableBody).toContain("user_id uuid primary key");
    expect(tableBody).toContain("handle text not null");
    expect(tableBody).toContain("normalized_handle text not null");
    expect(tableBody).not.toMatch(
      /email|provider|account|session|ip_address|user_agent|referrer|phone|invite|token|journal|media|quarantine|derivative/,
    );
    expect(schemaSql).toContain("user_public_profiles_handle_uidx");
    expect(schemaSql).toContain("user_public_profiles_normalized_handle_uidx");
  });
});

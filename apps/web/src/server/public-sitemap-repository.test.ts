import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type QueryResult,
} from "kysely";
import { beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/db/types";
import {
  PUBLIC_SITEMAP_CHUNK_SIZE,
  countPublicJournalEntriesForSitemap,
  listPublicCommunitySitemapUrls,
  listPublicJournalEntrySitemapUrls,
  listPublicProfileSitemapUrls,
  sitemapChunkCount,
} from "@/server/public-sitemap-repository";

const executed: CompiledQuery[] = [];

class RecordingDriver extends DummyDriver {
  override async acquireConnection(): Promise<DatabaseConnection> {
    return {
      async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
        executed.push(query);
        return { rows: [] };
      },
      async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
        yield* [];
      },
    };
  }
}

const db = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new RecordingDriver(),
    createIntrospector: (instance) => new PostgresIntrospector(instance),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

describe("public sitemap repository query contracts", () => {
  beforeEach(() => {
    executed.length = 0;
  });

  it("chunks by 5 000 and never reports zero chunks", () => {
    expect(PUBLIC_SITEMAP_CHUNK_SIZE).toBe(5_000);
    expect(sitemapChunkCount(0)).toBe(1);
    expect(sitemapChunkCount(5_000)).toBe(1);
    expect(sitemapChunkCount(5_001)).toBe(2);
  });

  it("pages live public entries in stable publication order", async () => {
    await expect(listPublicJournalEntrySitemapUrls(1, db)).resolves.toEqual([]);

    const [query] = executed;
    expect(query?.sql).toContain('"journal_entries"."visibility" = $1');
    expect(query?.sql).toContain('"journal_entries"."lifecycle_state" = $2');
    expect(query?.sql).toContain('"journal_entries"."public_slug" is not null');
    expect(query?.sql).toContain(
      'order by "journal_entries"."published_at" asc, "journal_entries"."id" asc',
    );
    expect(query?.parameters.slice(0, 2)).toEqual(["public", "active"]);
    expect(query?.parameters.slice(-2)).toEqual([5_000, 5_000]);
    expect(query?.sql).not.toContain("public_noindex");
  });

  it("counts entries with the same predicates as the chunk pages", async () => {
    await expect(countPublicJournalEntriesForSitemap(db)).resolves.toBe(0);

    const [query] = executed;
    expect(query?.sql).toContain("count(*)");
    expect(query?.sql).toContain('"journal_entries"."visibility" = $1');
    expect(query?.sql).toContain('"journal_entries"."lifecycle_state" = $2');
  });

  it("lists active profiles backed by a live public entry, without a visibility flag", async () => {
    await expect(listPublicProfileSitemapUrls(0, db)).resolves.toEqual([]);

    const [query] = executed;
    expect(query?.sql).toContain(
      '"user_public_profiles"."profile_lifecycle_state" = $1',
    );
    expect(query?.sql).toContain('"user_public_profiles"."removed_at" is null');
    expect(query?.sql).toContain('exists (select "journal_entries"."id"');
    expect(query?.sql).toContain(
      '"journal_entries"."owner_user_id" = "user_public_profiles"."user_id"',
    );
    expect(query?.sql).not.toContain("profile_visibility");
    expect(query?.parameters.slice(-2)).toEqual([5_000, 0]);
  });

  it("lists communities on curated topics only", async () => {
    await expect(listPublicCommunitySitemapUrls(db)).resolves.toEqual([]);

    const [query] = executed;
    expect(query?.sql).toContain('"communities"."lifecycle_state" in ($1, $2)');
    expect(query?.sql).toContain('"journal_topics"."trust_state" = $3');
    expect(query?.parameters).toEqual(["active", "archived", "curated"]);
  });
});

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
import { buildInsertClaimedEphemeralMediaQuery } from "./media-repository";

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

describe("atomic ready-media insert", () => {
  it("writes only the final claimed WebP shape directly into the public entry", () => {
    const mediaAssetId = "8f5fa87d-b94e-4217-b68d-28303827ad89";
    const compiled = buildInsertClaimedEphemeralMediaQuery(testDb, {
      ownerUserId: "2c732b1d-968c-4721-9a20-9e5495014bbc",
      journalEntryId: "0bcaa85b-34ad-4fda-b1df-8705892e5cb4",
      stagingSessionId: "46045ba1-d1dc-465a-aea9-0240785e3aa0",
      media: {
        mediaAssetId,
        generation: 2,
        sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        sizeBytes: 12_345,
        width: 1200,
        height: 800,
        publicPath: `derivatives/${mediaAssetId}/2.webp`,
      },
      documentPosition: 1,
      usageRole: "inline",
    }).compile();

    expect(compiled.sql).toContain('insert into "media_assets"');
    expect(compiled.sql).toContain('"media_readiness_state"');
    expect(compiled.parameters).toContain("public_ready");
    expect(compiled.parameters).toContain("processed");
    expect(compiled.parameters).toContain("image/webp");
    expect(compiled.parameters).toContain(`derivatives/${mediaAssetId}/2.webp`);
    expect(compiled.sql).not.toContain("on conflict");
  });
});

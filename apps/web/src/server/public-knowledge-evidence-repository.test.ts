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
import type { PublicKnowledgeEvidenceRule } from "@/server/public-seo-content";
import {
  buildPublicKnowledgeEvidenceEntryIdsQuery,
  serializePublicKnowledgeEvidence,
} from "./public-knowledge-evidence-repository";
import type { PublicJournalDirectoryPage } from "./public-journal-directory-repository";

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
const rule: PublicKnowledgeEvidenceRule = {
  topicSlugs: ["stress-and-recovery", "watering-and-moisture"],
  catalogSlugs: ["visual-pomidor-cheri"],
};

describe("public knowledge evidence repository", () => {
  it("matches explicit topic or catalog links through canonical public rows", () => {
    const compiled = buildPublicKnowledgeEvidenceEntryIdsQuery(testDb, rule, [
      "00000000-0000-4000-8000-000000000001",
    ]).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain('inner join "spaces"');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"spaces"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" =');
    expect(compiled.sql).toContain('"journal_entries"."entry_scope" =');
    expect(compiled.sql).toContain(
      '"journal_entries"."published_at" is not null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain('"catalog_items"."public_slug" in');
    expect(compiled.sql).toContain('from "journal_entry_topic_signals"');
    expect(compiled.sql).toContain('"journal_topics"."trust_state" =');
    expect(compiled.sql).toContain(
      '"journal_entry_topic_signals"."review_state" =',
    );
    expect(compiled.sql).toContain(
      '"journal_entry_topic_signals"."public_membership_state" =',
    );
    expect(compiled.parameters).toEqual(
      expect.arrayContaining([
        "public",
        "active",
        "object",
        "visual-pomidor-cheri",
        "stress-and-recovery",
        "watering-and-moisture",
        "curated",
        "accepted",
        "eligible",
        "00000000-0000-4000-8000-000000000001",
      ]),
    );
    expect(compiled.sql).not.toMatch(
      /email|ip_address|user_agent|quarantine_key|latitude|longitude|coordinates/i,
    );
  });

  it("serializes bounded evidence with an explainable topic/catalog match and object link", () => {
    const evidence = serializePublicKnowledgeEvidence(
      page(),
      rule,
      "uk",
      1,
      true,
    );

    expect(evidence.totalCount).toBe(2);
    expect(evidence.hasMore).toBe(true);
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]).toMatchObject({
      matches: [
        {
          kind: "topic",
          slug: "stress-and-recovery",
          label: "Відновлення",
          publicPath:
            "/topics/stress-and-recovery?__visualKnowledge=corpus",
        },
        {
          kind: "catalog",
          slug: "visual-pomidor-cheri",
          label: "Помідор чері",
          publicPath: "/variety/visual-pomidor-cheri",
        },
      ],
      card: {
        publicPath: "/journal/recovery-note",
        object: {
          publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000101",
        },
      },
    });
    expect(evidence.allEvidencePath).toBe(
      "/journals?topic=stress-and-recovery&__visualJournals=corpus",
    );
    expect(JSON.stringify(evidence)).not.toMatch(
      /ownerUserId|spaceId|derivativeKey|quarantine|email|coordinates/i,
    );
  });
});

function page(): PublicJournalDirectoryPage {
  const baseCard = {
    title: "Відновлення після поливу",
    excerpt: "Стан змінився після одного циклу спостереження.",
    entryDate: "2026-07-10",
    publishedAt: "2026-07-10T12:00:00.000Z",
    publicPath: "/journal/recovery-note",
    season: "summer" as const,
    safeRegionCode: null,
    object: {
      displayName: "Черрі біля стінки",
      kind: "plant" as const,
      identityLabel: "Помідор чері",
      catalogKind: "plant_variety" as const,
      catalogSlug: "visual-pomidor-cheri",
      catalogPath: "/variety/visual-pomidor-cheri",
      publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000101",
    },
    author: null,
    media: [],
    topics: [
      {
        slug: "stress-and-recovery",
        label: "Відновлення",
      },
    ],
  };

  return {
    request: {
      query: "",
      kind: "all",
      catalog: null,
      topic: null,
      season: "all",
      region: null,
      sort: "recent",
      page: 1,
    },
    cards: [
      baseCard,
      {
        ...baseCard,
        publicPath: "/journal/second-note",
        object: {
          ...baseCard.object,
          publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000102",
        },
      },
    ],
    totalCount: 2,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
    searchSource: "database",
  };
}

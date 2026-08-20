import { randomUUID } from "node:crypto";

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
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import {
  journalDraftPayloadSha256,
  type JournalEntryDraftPayloadV1,
} from "@/lib/garden/entry-contracts";
import { scopedToUser } from "@/server/request-scope";
import {
  archiveJournalEntry,
  createFirstPlantEntry,
} from "./journal-repository";
import {
  buildJournalDraftAdvisoryLockQuery,
  buildListJournalDraftsQuery,
  buildReadJournalDraftQuery,
  deleteJournalDraft,
  decideJournalDraftSave,
  JournalDraftContextForbiddenError,
  readJournalDraft,
  saveJournalDraft,
} from "./journal-draft-repository";

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

describe("journal draft repository", () => {
  it("scopes every read by both owner and exact draft key", () => {
    const compiled = buildReadJournalDraftQuery(
      testDb,
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      "follow-up-entry:00000000-0000-4000-8000-000000000002",
    ).compile();

    expect(compiled.sql).toContain('from "journal_entry_drafts"');
    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"draft_key" = $2');
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "follow-up-entry:00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("lists only the scoped owner's newest server drafts with a bounded limit", () => {
    const compiled = buildListJournalDraftsQuery(
      testDb,
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      25,
    ).compile();

    expect(compiled.sql).toContain('from "journal_entry_drafts"');
    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('order by "updated_at" desc');
    expect(compiled.sql).toContain("limit $2");
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000001",
      25,
    ]);
  });

  it("serializes absent-row races with a transaction-scoped owner/key lock", () => {
    const compiled = buildJournalDraftAdvisoryLockQuery(
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      "first-entry",
    ).compile(testDb);

    expect(compiled.sql).toContain("pg_advisory_xact_lock");
    expect(compiled.sql).toContain("hashtextextended");
    expect(compiled.parameters).toEqual([
      "ove321:00000000-0000-4000-8000-000000000001:first-entry",
    ]);
  });

  it("replays the same generation/hash and returns the authoritative receipt for an older generation", () => {
    const current = currentDraft({ generation: 5, hash: "a".repeat(64) });

    expect(
      decideJournalDraftSave(current, {
        generation: 5,
        payloadSha256: "a".repeat(64),
        expectedServerRevision: 9,
      }),
    ).toEqual({ action: "replay" });
    expect(
      decideJournalDraftSave(current, {
        generation: 4,
        payloadSha256: "b".repeat(64),
        expectedServerRevision: 9,
      }),
    ).toEqual({ action: "current" });
  });

  it("rejects a same-generation hash fork and stale expected revision", () => {
    const current = currentDraft({ generation: 5, hash: "a".repeat(64) });

    expect(
      decideJournalDraftSave(current, {
        generation: 5,
        payloadSha256: "b".repeat(64),
        expectedServerRevision: 9,
      }),
    ).toEqual({ action: "conflict", reason: "generation_hash_mismatch" });
    expect(
      decideJournalDraftSave(current, {
        generation: 6,
        payloadSha256: "b".repeat(64),
        expectedServerRevision: 8,
      }),
    ).toEqual({ action: "conflict", reason: "stale_server_revision" });
  });

  it("admits a higher generation only against the current server revision", () => {
    expect(
      decideJournalDraftSave(
        currentDraft({ generation: 5, hash: "a".repeat(64) }),
        {
          generation: 6,
          payloadSha256: "b".repeat(64),
          expectedServerRevision: 9,
        },
      ),
    ).toEqual({ action: "update", nextServerRevision: 10 });
  });
});

const runDatabaseIntegration = process.env.OVE321_RUN_DB_INTEGRATION === "true";

describe.skipIf(!runDatabaseIntegration)("journal draft database CAS", () => {
  it("chooses one authoritative generation/hash under a 32-way save race", async () => {
    const pool = new Pool({
      connectionString: requiredLocalDatabaseUrl(),
      max: 36,
    });
    const userId = randomUUID();
    const draftKey = "first-entry";

    try {
      await pool.query(
        `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
         values ($1::uuid, $2::text, true, 'OVE-321 fixture', now(), now())`,
        [userId, `${userId}@ove321.invalid`],
      );
      const contenders = Array.from({ length: 32 }, (_, index) => ({
        payload: firstEntryPayload(`race-${index}`),
        hash: index.toString(16).padStart(64, "0"),
      }));

      const outcomes = await Promise.all(
        contenders.map((contender) =>
          saveJournalDraft(scopedToUser(userId), {
            draftKey,
            draftKind: "first_entry",
            context: {},
            payload: contender.payload,
            generation: 1,
            payloadSha256: contender.hash,
            expectedServerRevision: null,
          }),
        ),
      );
      const saved = outcomes.filter((outcome) => outcome.outcome === "saved");
      const conflicts = outcomes.filter(
        (outcome) => outcome.outcome === "conflict",
      );
      const authoritative = await readJournalDraft(
        scopedToUser(userId),
        draftKey,
      );

      expect(saved).toHaveLength(1);
      expect(conflicts).toHaveLength(31);
      expect(authoritative?.serverRevision).toBe(1);
      expect(authoritative?.generation).toBe(1);
      expect(
        contenders.some(
          (contender) => contender.hash === authoritative?.payloadSha256,
        ),
      ).toBe(true);
    } finally {
      await pool.query('delete from "user" where id = $1::uuid', [userId]);
      await pool.end();
    }
  });

  it("proves all four contexts, cross-owner absence, replay, publication idempotency, and consumption", async () => {
    const pool = new Pool({ connectionString: requiredLocalDatabaseUrl() });
    const ownerId = randomUUID();
    const anotherOwnerId = randomUUID();
    const spaceId = randomUUID();
    const objectId = randomUUID();
    const entryId = randomUUID();
    const scope = scopedToUser(ownerId);

    try {
      await pool.query(
        `insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
         values
           ($1::uuid, $2::text, true, 'OVE-321 owner fixture', now(), now()),
           ($3::uuid, $4::text, true, 'OVE-321 other fixture', now(), now())`,
        [
          ownerId,
          `${ownerId}@ove321.invalid`,
          anotherOwnerId,
          `${anotherOwnerId}@ove321.invalid`,
        ],
      );
      await pool.query(
        `insert into spaces (id, owner_user_id, display_name, location_visibility)
         values ($1::uuid, $2::uuid, 'OVE-321 space', 'hidden')`,
        [spaceId, ownerId],
      );
      await pool.query(
        `insert into plant_objects (
           id, owner_user_id, space_id, display_name, object_kind, variety_state
         ) values ($1::uuid, $2::uuid, $3::uuid, 'OVE-321 plant', 'plant', 'unknown')`,
        [objectId, ownerId, spaceId],
      );
      await pool.query(
        `insert into journal_entries (
           id, owner_user_id, plant_object_id, space_id, title, body, visibility,
           entry_date, client_mutation_id
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'OVE-321 entry', 'Fixture body.',
           'private', current_date, $5::text
         )`,
        [entryId, ownerId, objectId, spaceId, `ove321-existing-${entryId}`],
      );

      const cases = [
        {
          draftKey: "first-entry",
          draftKind: "first_entry" as const,
          context: { spaceId },
          payload: {
            schemaVersion: 1,
            draftKind: "first_entry",
            request: {
              target: "first_plant_entry",
              spaceId,
              plantName: "New plant",
              title: "First draft",
              clientMutationId: `ove321-first-${ownerId}`,
            },
          } satisfies JournalEntryDraftPayloadV1,
        },
        {
          draftKey: `follow-up-entry:${objectId}`,
          draftKind: "follow_up" as const,
          context: { plantObjectId: objectId },
          payload: {
            schemaVersion: 1,
            draftKind: "follow_up",
            request: {
              target: "plant_object_entry",
              plantObjectId: objectId,
              title: "Follow-up draft",
              clientMutationId: `ove321-follow-${ownerId}`,
            },
          } satisfies JournalEntryDraftPayloadV1,
        },
        {
          draftKey: `space-entry:${spaceId}`,
          draftKind: "space_entry" as const,
          context: { spaceId },
          payload: {
            schemaVersion: 1,
            draftKind: "space_entry",
            request: {
              target: "space_entry",
              spaceId,
              title: "Space draft",
              clientMutationId: `ove321-space-${ownerId}`,
            },
          } satisfies JournalEntryDraftPayloadV1,
        },
        {
          draftKey: `edit-entry:${entryId}`,
          draftKind: "edit_entry" as const,
          context: { journalEntryId: entryId },
          payload: {
            schemaVersion: 1,
            draftKind: "edit_entry",
            request: {
              entryId,
              title: "Edit draft",
              clientMutationId: `ove321-edit-${ownerId}`,
              expectedRevision: 1,
            },
          } satisfies JournalEntryDraftPayloadV1,
        },
      ];

      for (const candidate of cases) {
        const payloadSha256 = await journalDraftPayloadSha256(
          candidate.payload,
        );
        const saved = await saveJournalDraft(scope, {
          ...candidate,
          generation: 1,
          payloadSha256,
          expectedServerRevision: null,
        });
        expect(saved).toMatchObject({
          outcome: "saved",
          draft: {
            draftKey: candidate.draftKey,
            generation: 1,
            payloadSha256,
            serverRevision: 1,
          },
        });
        await expect(
          readJournalDraft(scope, candidate.draftKey),
        ).resolves.toMatchObject({
          payload: candidate.payload,
          payloadSha256,
        });
        await expect(
          readJournalDraft(scopedToUser(anotherOwnerId), candidate.draftKey),
        ).resolves.toBeNull();
      }

      const first = cases[0]!;
      const firstHash = await journalDraftPayloadSha256(first.payload);
      await expect(
        saveJournalDraft(scope, {
          ...first,
          generation: 1,
          payloadSha256: firstHash,
          expectedServerRevision: 1,
        }),
      ).resolves.toMatchObject({
        outcome: "replayed",
        draft: { serverRevision: 1 },
      });
      await expect(
        saveJournalDraft(scope, {
          ...first,
          generation: 1,
          payloadSha256: "f".repeat(64),
          expectedServerRevision: 1,
        }),
      ).resolves.toMatchObject({
        outcome: "conflict",
        reason: "generation_hash_mismatch",
      });
      await expect(
        saveJournalDraft(scopedToUser(anotherOwnerId), {
          ...cases[1]!,
          generation: 2,
          payloadSha256: await journalDraftPayloadSha256(cases[1]!.payload),
          expectedServerRevision: 1,
        }),
      ).rejects.toBeInstanceOf(JournalDraftContextForbiddenError);

      await archiveJournalEntry(scope, { entryId });
      await expect(
        readJournalDraft(scope, `edit-entry:${entryId}`),
      ).resolves.toBeNull();

      const publicationMutationId = `ove321-publication-${ownerId}`;
      const publicationInput = {
        spaceId,
        plantName: "Published plant",
        title: "Idempotent publication",
        body: "One canonical entry.",
        clientMutationId: publicationMutationId,
      };
      const publications = await Promise.all([
        createFirstPlantEntry(scope, publicationInput),
        createFirstPlantEntry(scope, publicationInput),
      ]);
      expect(
        new Set(publications.map((result) => result.entry.id)),
      ).toHaveLength(1);
      const publicationRows = await pool.query(
        `select count(*)::int as count
         from journal_entries
         where owner_user_id = $1::uuid and client_mutation_id = $2::text`,
        [ownerId, publicationMutationId],
      );
      expect(publicationRows.rows[0]?.count).toBe(1);

      const firstReceipt = await readJournalDraft(scope, first.draftKey);
      expect(firstReceipt).not.toBeNull();
      await expect(
        deleteJournalDraft(scope, first.draftKey, {
          generation: firstReceipt!.generation,
          payloadSha256: firstReceipt!.payloadSha256,
          expectedServerRevision: firstReceipt!.serverRevision,
        }),
      ).resolves.toMatchObject({ outcome: "deleted" });
      await expect(readJournalDraft(scope, first.draftKey)).resolves.toBeNull();
    } finally {
      await pool.query('delete from "user" where id = any($1::uuid[])', [
        [ownerId, anotherOwnerId],
      ]);
      await pool.end();
    }
  }, 30_000);
});

function currentDraft(input: { generation: number; hash: string }) {
  return {
    generation: input.generation,
    payloadSha256: input.hash,
    serverRevision: 9,
  };
}

function firstEntryPayload(title: string) {
  return {
    schemaVersion: 1 as const,
    draftKind: "first_entry" as const,
    request: {
      target: "first_plant_entry" as const,
      title,
      clientMutationId: "race-mutation",
    },
  };
}

function requiredLocalDatabaseUrl() {
  if (process.env.VERCEL_ENV?.trim().toLowerCase() === "production") {
    throw new Error("OVE-321 database proof is local-only.");
  }
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required for OVE-321 DB proof.");
  const url = new URL(value);
  if (
    !["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
      url.hostname.toLowerCase(),
    ) ||
    url.pathname !== "/overgarden"
  ) {
    throw new Error("OVE-321 database proof requires the local OverGarden DB.");
  }
  return value;
}

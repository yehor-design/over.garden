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
  buildCatalogMentionSuggestionsQuery,
  buildInsertJournalEntryCatalogMentionsQuery,
  buildPublicHandleMentionSuggestionsQuery,
  buildPublicObjectMentionSuggestionsQuery,
  buildResolvePublicHandleMentionTargetsQuery,
  buildResolvePublicObjectMentionTargetsQuery,
  createPublicHandleMentionEdgeInput,
  normalizeMentionQuery,
  resolvePublicHandleMentionSelectionTokens,
  toPublicHandleMentionSuggestion,
} from "./journal-mention-repository";
import { unsealPublicHandleMentionTarget } from "./public-handle-mention-token";

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
const scope = scopedToUser("00000000-0000-0000-0000-000000000001");
const tokenAudienceUserId = "00000000-0000-4000-8000-000000000001";
const tokenSecret =
  "ove-203-journal-mention-repository-test-secret-with-adequate-length";
const privateFieldPattern =
  /journal_entries"\."title|journal_entries"\."body|media_assets|quarantine|derivative|email|phone|session|ip_address|user_agent|latitude|longitude|coordinates/i;

describe("journal mention repository query contracts", () => {
  it("suggests only unblocked cross-user objects with an active public entry", () => {
    const compiled = buildPublicObjectMentionSuggestionsQuery(
      testDb,
      scope,
      normalizeMentionQuery("tomato"),
      3,
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."visibility" = $1');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $2');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" !=');
    expect(compiled.sql).toContain("not exists");
    expect(compiled.sql).toContain("from profile_blocks");
    expect(compiled.sql).toContain(
      'profile_blocks.blocked_user_id = "plant_objects"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      'profile_blocks.blocker_user_id = "plant_objects"."owner_user_id"',
    );
    expect(compiled.sql).not.toMatch(privateFieldPattern);
  });

  it("revalidates public object mention targets at save time", () => {
    const compiled = buildResolvePublicObjectMentionTargetsQuery(
      testDb,
      scope,
      ["00000000-0000-0000-0000-000000000010"],
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."visibility" = $1');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $2');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" !=');
    expect(compiled.sql).toContain("not exists");
    expect(compiled.sql).toContain("from profile_blocks");
    expect(compiled.sql).toContain(
      'profile_blocks.blocked_user_id = "plant_objects"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      'profile_blocks.blocker_user_id = "plant_objects"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"plant_objects"."id" in');
    expect(compiled.sql).not.toMatch(privateFieldPattern);
  });

  it("suggests only active public handles with a stable user id and no mutual block", () => {
    const compiled = buildPublicHandleMentionSuggestionsQuery(
      testDb,
      scope,
      normalizeMentionQuery("green"),
      3,
    ).compile();

    expect(compiled.sql).toContain('from "user_public_profiles"');
    expect(compiled.sql).toContain('inner join "user_handle_registry"');
    expect(compiled.sql).toContain(
      '"user_handle_registry"."user_id" = "user_public_profiles"."user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_handle_registry"."normalized_handle" = "user_public_profiles"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"user_handle_registry"."lifecycle_state" =',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."user_id" as "userId"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."handle" as "handle"',
    );
    expect(compiled.sql).toContain('"user_public_profiles"."user_id" !=');
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_visibility" =',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_lifecycle_state" =',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."removed_at" is null',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."handle_registry_state" =',
    );
    expect(compiled.sql).toContain("not exists");
    expect(compiled.sql).toContain("from profile_blocks");
    expect(compiled.sql).toContain("profile_blocks.blocker_user_id =");
    expect(compiled.sql).toContain(
      'profile_blocks.blocked_user_id = "user_public_profiles"."user_id"',
    );
    expect(compiled.sql).toContain(
      'profile_blocks.blocker_user_id = "user_public_profiles"."user_id"',
    );
    expect(compiled.sql).toContain("profile_blocks.blocked_user_id =");
    expect(compiled.sql).toContain(
      '"user_public_profiles"."normalized_handle" like',
    );
    expect(compiled.sql).not.toContain('from "user"');
    expect(compiled.sql).not.toMatch(privateFieldPattern);
  });

  it("revalidates the stable handle owner id and privacy predicates at save time", () => {
    const targetUserId = "00000000-0000-4000-8000-000000000010";
    const compiled = buildResolvePublicHandleMentionTargetsQuery(
      testDb,
      scope,
      [targetUserId],
    ).compile();

    expect(compiled.sql).toContain('inner join "user_handle_registry"');
    expect(compiled.sql).toContain(
      '"user_handle_registry"."user_id" = "user_public_profiles"."user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_handle_registry"."normalized_handle" = "user_public_profiles"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"user_handle_registry"."lifecycle_state" =',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."user_id" as "userId"',
    );
    expect(compiled.sql).toContain('"user_public_profiles"."user_id" !=');
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_visibility" =',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_lifecycle_state" =',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."removed_at" is null',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."handle_registry_state" =',
    );
    expect(compiled.sql).toContain("not exists");
    expect(compiled.sql).toContain("from profile_blocks");
    expect(compiled.sql).toContain('"user_public_profiles"."user_id" in');
    expect(compiled.parameters).toContain(targetUserId);
    expect(compiled.sql).not.toContain('"normalized_handle" in');
    expect(compiled.sql).not.toContain('from "user"');
    expect(compiled.sql).not.toMatch(privateFieldPattern);
  });

  it("keeps the current handle presentation separate from an opaque audience-bound selection id", () => {
    const targetUserId = "00000000-0000-4000-8000-000000000010";
    const suggestion = toPublicHandleMentionSuggestion(
      {
        userId: targetUserId,
        handle: "green_garden",
        displayName: "Green Garden",
      },
      tokenAudienceUserId,
      { secret: tokenSecret },
    );

    expect(suggestion).toMatchObject({
      kind: "public_handle",
      label: "@green_garden",
      insertText: "@green_garden",
      detail: "Public gardener handle",
      disambiguationLabel: "Green Garden",
      catalogKind: null,
    });
    expect(suggestion.id).not.toBe(targetUserId);
    expect(suggestion.id).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(
      unsealPublicHandleMentionTarget(suggestion.id, {
        audienceUserId: tokenAudienceUserId,
        secret: tokenSecret,
      }),
    ).toBe(targetUserId);
  });

  it("deduplicates independently sealed tokens for one target before save-time revalidation", () => {
    const targetUserId = "00000000-0000-4000-8000-000000000010";
    const tokens = ["old_handle", "new_handle"].map(
      (handle) =>
        toPublicHandleMentionSuggestion(
          { userId: targetUserId, handle, displayName: null },
          tokenAudienceUserId,
          { secret: tokenSecret },
        ).id,
    );

    expect(tokens[0]).not.toBe(tokens[1]);
    expect(
      resolvePublicHandleMentionSelectionTokens(tokens, tokenAudienceUserId, {
        secret: tokenSecret,
      }),
    ).toEqual([targetUserId]);
    expect(
      resolvePublicHandleMentionSelectionTokens(
        tokens,
        "00000000-0000-4000-8000-000000000002",
        { secret: tokenSecret },
      ),
    ).toBeNull();
  });

  it("persists person mentions by stable user id without a mutable handle label", () => {
    const baseInput = {
      subjectPlantObjectId: "00000000-0000-4000-8000-000000000020",
      targetUserId: "00000000-0000-4000-8000-000000000010",
      entryClientMutationId: "entry-mutation",
    };
    const edge = createPublicHandleMentionEdgeInput(baseInput);

    expect(edge).toMatchObject({
      sourceKind: "source_reference",
      sourcePlantObjectId: null,
      sourceOwnerUserId: baseInput.targetUserId,
      sourceReferenceKind: "person",
      sourceReferenceLabel: null,
    });
    expect(edge.clientMutationId).toBe(
      createPublicHandleMentionEdgeInput(baseInput).clientMutationId,
    );
    expect(edge.clientMutationId).not.toBe(
      createPublicHandleMentionEdgeInput({
        ...baseInput,
        targetUserId: "00000000-0000-4000-8000-000000000011",
      }).clientMutationId,
    );
    expect(JSON.stringify(edge)).not.toMatch(/green_garden|@green_garden/);
  });

  it("suggests only selectable first-party catalog targets", () => {
    const compiled = buildCatalogMentionSuggestionsQuery(
      testDb,
      normalizeMentionQuery("cherry"),
      3,
    ).compile();

    expect(compiled.sql).toContain('"catalog_items"."status" in ($1, $2)');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).not.toMatch(privateFieldPattern);
  });

  it("stores catalog mentions idempotently by entry and catalog item", () => {
    const compiled = buildInsertJournalEntryCatalogMentionsQuery(testDb, {
      journalEntryId: "00000000-0000-0000-0000-000000000020",
      ownerUserId: "00000000-0000-0000-0000-000000000001",
      spaceId: "00000000-0000-0000-0000-000000000002",
      catalogItemIds: [
        "00000000-0000-0000-0000-000000000030",
        "00000000-0000-0000-0000-000000000031",
      ],
    }).compile();

    expect(compiled.sql).toContain(
      'insert into "journal_entry_catalog_mentions"',
    );
    expect(compiled.sql).toContain(
      'on conflict ("journal_entry_id", "catalog_item_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000030",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000031",
    ]);
  });
});

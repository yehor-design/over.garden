import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JournalEntryDraft, JsonValue } from "@/db/schema";
import {
  JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
  type JournalEntryDraftContext,
  type JournalEntryDraftKind,
  type JournalEntryDraftPayloadV1,
  type JournalEntryDraftReceiptV1,
} from "@/lib/garden/entry-contracts";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type JournalDraftConflictReason =
  | "generation_hash_mismatch"
  | "stale_server_revision"
  | "missing_server_revision";

export type JournalDraftSaveDecision =
  | { action: "insert"; nextServerRevision: 1 }
  | { action: "replay" }
  | { action: "current" }
  | { action: "update"; nextServerRevision: number }
  | { action: "conflict"; reason: JournalDraftConflictReason };

export type SaveJournalDraftResult =
  | {
      outcome: "saved" | "replayed" | "current";
      draft: JournalEntryDraftReceiptV1;
    }
  | {
      outcome: "conflict";
      reason: JournalDraftConflictReason;
      current: JournalEntryDraftReceiptV1 | null;
    };

export type DeleteJournalDraftResult =
  | { outcome: "deleted"; draft: JournalEntryDraftReceiptV1 }
  | { outcome: "not_found" }
  | {
      outcome: "conflict";
      reason: JournalDraftConflictReason;
      current: JournalEntryDraftReceiptV1;
    };

export class JournalDraftContextForbiddenError extends Error {
  readonly code = "journal_draft_context_forbidden" as const;

  constructor() {
    super("Journal draft context is unavailable.");
    this.name = "JournalDraftContextForbiddenError";
  }
}

export interface SaveJournalDraftInput {
  draftKey: string;
  draftKind: JournalEntryDraftKind;
  context: JournalEntryDraftContext;
  payload: JournalEntryDraftPayloadV1;
  generation: number;
  payloadSha256: string;
  expectedServerRevision: number | null;
}

export interface DeleteJournalDraftInput {
  generation: number;
  payloadSha256: string;
  expectedServerRevision: number;
}

export async function readJournalDraft(
  scope: RequestScope,
  draftKey: string,
  executor: QueryExecutor = db,
): Promise<JournalEntryDraftReceiptV1 | null> {
  requireScope(scope);
  const row = await buildReadJournalDraftQuery(
    executor,
    scope,
    draftKey,
  ).executeTakeFirst();
  return row ? serializeJournalDraft(row) : null;
}

export async function saveJournalDraft(
  scope: RequestScope,
  input: SaveJournalDraftInput,
): Promise<SaveJournalDraftResult> {
  requireScope(scope);
  assertJournalDraftInput(input);

  return db.transaction().execute(async (transaction) => {
    await buildJournalDraftAdvisoryLockQuery(scope, input.draftKey).execute(
      transaction,
    );
    await assertOwnedDraftContext(transaction, scope, input);

    const current = await buildReadJournalDraftQuery(
      transaction,
      scope,
      input.draftKey,
    )
      .forUpdate()
      .executeTakeFirst();
    const decision = decideJournalDraftSave(
      current
        ? {
            generation: integerValue(current.draft_generation),
            payloadSha256: current.payload_sha256,
            serverRevision: integerValue(current.server_revision),
          }
        : null,
      {
        generation: input.generation,
        payloadSha256: input.payloadSha256,
        expectedServerRevision: input.expectedServerRevision,
      },
    );

    if (decision.action === "conflict") {
      return {
        outcome: "conflict",
        reason: decision.reason,
        current: current ? serializeJournalDraft(current) : null,
      };
    }
    if (decision.action === "replay" || decision.action === "current") {
      if (!current) throw new Error("Journal draft decision lost its row.");
      return {
        outcome: decision.action === "replay" ? "replayed" : "current",
        draft: serializeJournalDraft(current),
      };
    }

    const context = normalizedContext(input.context);
    const payload = jsonPayload(input.payload);
    const row =
      decision.action === "insert"
        ? await transaction
            .insertInto("journal_entry_drafts")
            .values({
              owner_user_id: scope.userId,
              draft_key: input.draftKey,
              draft_kind: input.draftKind,
              space_id: context.spaceId,
              plant_object_id: context.plantObjectId,
              journal_entry_id: context.journalEntryId,
              payload,
              document_schema_version: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
              draft_generation: input.generation,
              payload_sha256: input.payloadSha256,
              server_revision: decision.nextServerRevision,
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        : await transaction
            .updateTable("journal_entry_drafts")
            .set({
              draft_kind: input.draftKind,
              space_id: context.spaceId,
              plant_object_id: context.plantObjectId,
              journal_entry_id: context.journalEntryId,
              payload,
              document_schema_version: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
              draft_generation: input.generation,
              payload_sha256: input.payloadSha256,
              server_revision: decision.nextServerRevision,
              updated_at: new Date(),
            })
            .where("owner_user_id", "=", scope.userId)
            .where("draft_key", "=", input.draftKey)
            .where(
              "server_revision",
              "=",
              String(input.expectedServerRevision!),
            )
            .returningAll()
            .executeTakeFirstOrThrow();

    return { outcome: "saved", draft: serializeJournalDraft(row) };
  });
}

export async function deleteJournalDraft(
  scope: RequestScope,
  draftKey: string,
  input: DeleteJournalDraftInput,
): Promise<DeleteJournalDraftResult> {
  requireScope(scope);
  assertDraftKey(draftKey);
  assertPositiveInteger(input.generation, "Draft generation");
  assertPositiveInteger(input.expectedServerRevision, "Server revision");
  assertPayloadHash(input.payloadSha256);

  return db.transaction().execute(async (transaction) => {
    await buildJournalDraftAdvisoryLockQuery(scope, draftKey).execute(
      transaction,
    );
    const current = await buildReadJournalDraftQuery(
      transaction,
      scope,
      draftKey,
    )
      .forUpdate()
      .executeTakeFirst();
    if (!current) return { outcome: "not_found" };

    const currentReceipt = serializeJournalDraft(current);
    if (
      currentReceipt.generation !== input.generation ||
      currentReceipt.payloadSha256 !== input.payloadSha256
    ) {
      return {
        outcome: "conflict",
        reason: "generation_hash_mismatch",
        current: currentReceipt,
      };
    }
    if (currentReceipt.serverRevision !== input.expectedServerRevision) {
      return {
        outcome: "conflict",
        reason: "stale_server_revision",
        current: currentReceipt,
      };
    }

    await transaction
      .deleteFrom("journal_entry_drafts")
      .where("owner_user_id", "=", scope.userId)
      .where("draft_key", "=", draftKey)
      .where("server_revision", "=", String(input.expectedServerRevision))
      .executeTakeFirstOrThrow();
    return { outcome: "deleted", draft: currentReceipt };
  });
}

export async function deleteJournalDraftsForArchivedEntry(
  executor: QueryExecutor,
  scope: RequestScope,
  journalEntryId: string,
): Promise<void> {
  requireScope(scope);
  await executor
    .deleteFrom("journal_entry_drafts")
    .where("owner_user_id", "=", scope.userId)
    .where("draft_kind", "=", "edit_entry")
    .where("journal_entry_id", "=", journalEntryId)
    .execute();
}

export function decideJournalDraftSave(
  current: {
    generation: number;
    payloadSha256: string;
    serverRevision: number;
  } | null,
  input: {
    generation: number;
    payloadSha256: string;
    expectedServerRevision: number | null;
  },
): JournalDraftSaveDecision {
  if (!current) {
    return input.expectedServerRevision == null
      ? { action: "insert", nextServerRevision: 1 }
      : { action: "conflict", reason: "stale_server_revision" };
  }
  if (input.generation < current.generation) return { action: "current" };
  if (input.generation === current.generation) {
    return input.payloadSha256 === current.payloadSha256
      ? { action: "replay" }
      : { action: "conflict", reason: "generation_hash_mismatch" };
  }
  if (input.expectedServerRevision == null) {
    return { action: "conflict", reason: "missing_server_revision" };
  }
  if (input.expectedServerRevision !== current.serverRevision) {
    return { action: "conflict", reason: "stale_server_revision" };
  }
  return { action: "update", nextServerRevision: current.serverRevision + 1 };
}

export function buildReadJournalDraftQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  draftKey: string,
) {
  return executor
    .selectFrom("journal_entry_drafts")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .where("draft_key", "=", draftKey);
}

export function buildJournalDraftAdvisoryLockQuery(
  scope: RequestScope,
  draftKey: string,
) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${`ove321:${scope.userId}:${draftKey}`}, 0))`;
}

export function expectedJournalDraftKey(
  kind: JournalEntryDraftKind,
  context: JournalEntryDraftContext,
): string {
  const normalized = normalizedContext(context);
  switch (kind) {
    case "first_entry":
      return "first-entry";
    case "follow_up":
      return `follow-up-entry:${normalized.plantObjectId ?? ""}`;
    case "space_entry":
      return `space-entry:${normalized.spaceId ?? ""}`;
    case "edit_entry":
      return `edit-entry:${normalized.journalEntryId ?? ""}`;
  }
}

function serializeJournalDraft(
  row: JournalEntryDraft,
): JournalEntryDraftReceiptV1 {
  return {
    draftKey: row.draft_key,
    draftKind: row.draft_kind as JournalEntryDraftKind,
    context: {
      spaceId: row.space_id,
      plantObjectId: row.plant_object_id,
      journalEntryId: row.journal_entry_id,
    },
    payload: row.payload as unknown as JournalEntryDraftPayloadV1,
    generation: integerValue(row.draft_generation),
    payloadSha256: row.payload_sha256,
    serverRevision: integerValue(row.server_revision),
    updatedAt: dateValue(row.updated_at).toISOString(),
  };
}

async function assertOwnedDraftContext(
  executor: QueryExecutor,
  scope: RequestScope,
  input: SaveJournalDraftInput,
) {
  const context = normalizedContext(input.context);
  const expectedKey = expectedJournalDraftKey(input.draftKind, context);
  if (
    input.draftKey !== expectedKey ||
    input.payload.draftKind !== input.draftKind
  ) {
    throw new JournalDraftContextForbiddenError();
  }

  let owned = true;
  switch (input.draftKind) {
    case "first_entry":
      if (context.plantObjectId || context.journalEntryId) owned = false;
      if (context.spaceId) {
        owned = Boolean(
          await executor
            .selectFrom("spaces")
            .select("id")
            .where("id", "=", context.spaceId)
            .where("owner_user_id", "=", scope.userId)
            .executeTakeFirst(),
        );
      }
      break;
    case "follow_up":
      owned = Boolean(
        context.plantObjectId &&
        !context.spaceId &&
        !context.journalEntryId &&
        (await executor
          .selectFrom("plant_objects")
          .select("id")
          .where("id", "=", context.plantObjectId)
          .where("owner_user_id", "=", scope.userId)
          .executeTakeFirst()),
      );
      break;
    case "space_entry":
      owned = Boolean(
        context.spaceId &&
        !context.plantObjectId &&
        !context.journalEntryId &&
        (await executor
          .selectFrom("spaces")
          .select("id")
          .where("id", "=", context.spaceId)
          .where("owner_user_id", "=", scope.userId)
          .executeTakeFirst()),
      );
      break;
    case "edit_entry":
      owned = Boolean(
        context.journalEntryId &&
        !context.spaceId &&
        !context.plantObjectId &&
        (await executor
          .selectFrom("journal_entries")
          .select("id")
          .where("id", "=", context.journalEntryId)
          .where("owner_user_id", "=", scope.userId)
          .where("lifecycle_state", "=", "active")
          .executeTakeFirst()),
      );
      break;
  }
  if (!owned) throw new JournalDraftContextForbiddenError();
}

function assertJournalDraftInput(input: SaveJournalDraftInput) {
  assertDraftKey(input.draftKey);
  assertPositiveInteger(input.generation, "Draft generation");
  if (input.expectedServerRevision != null) {
    assertPositiveInteger(input.expectedServerRevision, "Server revision");
  }
  assertPayloadHash(input.payloadSha256);
  if (input.payload.schemaVersion !== JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION) {
    throw new Error("Unsupported journal draft schema version.");
  }
}

function assertDraftKey(value: string) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240) {
    throw new Error("Journal draft key is invalid.");
  }
}

function assertPayloadHash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("Journal draft payload hash is invalid.");
  }
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function normalizedContext(context: JournalEntryDraftContext) {
  return {
    spaceId: context.spaceId || null,
    plantObjectId: context.plantObjectId || null,
    journalEntryId: context.journalEntryId || null,
  };
}

function jsonPayload(payload: JournalEntryDraftPayloadV1): JsonValue {
  return JSON.parse(JSON.stringify(payload)) as JsonValue;
}

function integerValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("Journal draft revision is invalid.");
  }
  return parsed;
}

function dateValue(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function requireScope(scope: RequestScope) {
  if (!scope.userId) throw new Error("A scoped repository requires a user id.");
}

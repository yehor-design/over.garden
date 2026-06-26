import "server-only";

import type { Insertable, Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  EntryVisibility,
  JournalEntry,
  LocationVisibility,
  PlantObject,
  Space,
  VarietyState,
} from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";

const MAX_BODY_LENGTH = 2000;
const MAX_TITLE_LENGTH = 140;
const MAX_NAME_LENGTH = 120;
const MAX_RECENT_ITEMS = 20;

const DEFAULT_LOCATION_VISIBILITY: LocationVisibility = "hidden";
const DEFAULT_ENTRY_VISIBILITY: EntryVisibility = "private";

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type NewJournalEntryRow = Insertable<Database["journal_entries"]>;

export interface CreateFirstPlantEntryInput {
  spaceName: string;
  plantName: string;
  varietyText?: string | null;
  title: string;
  body: string;
  entryDate?: string | null;
  clientMutationId: string;
}

export interface CreateJournalEntryInput {
  body: string;
  visibility: EntryVisibility;
  clientMutationId: string;
}

export interface PlantObjectSummary {
  id: string;
  displayName: string;
  spaceDisplayName: string;
  varietyText: string | null;
  varietyState: VarietyState;
  createdAt: Date;
}

export interface PlantObjectPage {
  space: Pick<Space, "id" | "display_name" | "location_visibility">;
  plantObject: Pick<
    PlantObject,
    "id" | "display_name" | "variety_text" | "variety_state" | "location_visibility"
  >;
  entries: JournalEntry[];
}

export interface FirstPlantEntryResult {
  space: PlantObjectPage["space"];
  plantObject: PlantObjectPage["plantObject"];
  entry: JournalEntry;
}

export async function createFirstPlantEntry(
  scope: RequestScope,
  input: CreateFirstPlantEntryInput,
): Promise<FirstPlantEntryResult> {
  const normalized = normalizeCreateFirstPlantEntryInput(input);
  const existing = await findJournalEntryByClientMutation(
    scope,
    normalized.clientMutationId,
  );

  if (existing) {
    const page = await getPlantObjectPage(scope, existing.plant_object_id);
    if (!page) throw new Error("Existing journal entry is outside the request scope.");

    return {
      space: page.space,
      plantObject: page.plantObject,
      entry: existing,
    };
  }

  return db.transaction().execute(async (trx) => {
    const space = await trx
      .insertInto("spaces")
      .values({
        owner_user_id: scope.userId,
        display_name: normalized.spaceName,
        location_visibility: DEFAULT_LOCATION_VISIBILITY,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const plantObject = await trx
      .insertInto("plant_objects")
      .values({
        owner_user_id: scope.userId,
        space_id: space.id,
        display_name: normalized.plantName,
        variety_text: normalized.varietyText,
        variety_state: normalized.varietyState,
        location_visibility: DEFAULT_LOCATION_VISIBILITY,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const entry = await insertJournalEntry(trx, {
      owner_user_id: scope.userId,
      space_id: space.id,
      plant_object_id: plantObject.id,
      title: normalized.title,
      body: normalized.body,
      entry_scope: "object",
      entry_date: normalized.entryDate,
      visibility: DEFAULT_ENTRY_VISIBILITY,
      client_mutation_id: normalized.clientMutationId,
    });

    if (entry) {
      return {
        space: {
          id: space.id,
          display_name: space.display_name,
          location_visibility: space.location_visibility,
        },
        plantObject: {
          id: plantObject.id,
          display_name: plantObject.display_name,
          variety_text: plantObject.variety_text,
          variety_state: plantObject.variety_state,
          location_visibility: plantObject.location_visibility,
        },
        entry,
      };
    }

    const existingAfterConflict = await findJournalEntryByClientMutation(
      scope,
      normalized.clientMutationId,
      trx,
    );

    if (!existingAfterConflict) {
      throw new Error("Journal entry idempotency conflict could not be resolved.");
    }

    const page = await getPlantObjectPage(
      scope,
      existingAfterConflict.plant_object_id,
      trx,
    );

    if (!page) {
      throw new Error("Existing journal entry is outside the request scope.");
    }

    return {
      space: page.space,
      plantObject: page.plantObject,
      entry: existingAfterConflict,
    };
  });
}

export async function listMyPlantObjects(
  scope: RequestScope,
  limit = 10,
): Promise<PlantObjectSummary[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RECENT_ITEMS);
  const rows = await db
    .selectFrom("plant_objects")
    .innerJoin("spaces", "spaces.id", "plant_objects.space_id")
    .select([
      "plant_objects.id as id",
      "plant_objects.display_name as displayName",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.created_at as createdAt",
      "spaces.display_name as spaceDisplayName",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("spaces.owner_user_id", "=", scope.userId)
    .orderBy("plant_objects.created_at", "desc")
    .limit(boundedLimit)
    .execute();

  return rows.map((row) => ({
    ...row,
    varietyState: row.varietyState as VarietyState,
  }));
}

export async function getPlantObjectPage(
  scope: RequestScope,
  objectId: string,
  executor: QueryExecutor = db,
): Promise<PlantObjectPage | null> {
  const objectRow = await buildPlantObjectPageObjectQuery(
    executor,
    scope,
    objectId,
  ).executeTakeFirst();

  if (!objectRow) return null;

  const entries = await executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("owner_user_id", "=", scope.userId)
    .where("plant_object_id", "=", objectId)
    .orderBy("entry_date", "desc")
    .orderBy("created_at", "desc")
    .execute();

  return {
    space: {
      id: objectRow.spaceId,
      display_name: objectRow.spaceDisplayName,
      location_visibility: objectRow.spaceLocationVisibility,
    },
    plantObject: {
      id: objectRow.objectId,
      display_name: objectRow.objectDisplayName,
      variety_text: objectRow.varietyText,
      variety_state: objectRow.varietyState,
      location_visibility: objectRow.objectLocationVisibility,
    },
    entries,
  };
}

export async function createJournalEntry(
  scope: RequestScope,
  input: CreateJournalEntryInput,
): Promise<JournalEntry> {
  const result = await createFirstPlantEntry(scope, {
    spaceName: "Local skeleton space",
    plantName: "Skeleton plant",
    title: "Skeleton journal entry",
    body: input.body,
    clientMutationId: input.clientMutationId,
  });

  if (input.visibility === "private") return result.entry;

  return db
    .updateTable("journal_entries")
    .set({ visibility: input.visibility, updated_at: new Date() })
    .where("id", "=", result.entry.id)
    .where("owner_user_id", "=", scope.userId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listMyRecentJournalEntries(
  scope: RequestScope,
  limit = 10,
): Promise<JournalEntry[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RECENT_ITEMS);

  return db
    .selectFrom("journal_entries")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .orderBy("created_at", "desc")
    .limit(boundedLimit)
    .execute();
}

export function buildFindExistingEntryByClientMutationQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  clientMutationId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("owner_user_id", "=", scope.userId)
    .where("client_mutation_id", "=", clientMutationId);
}

export function buildInsertJournalEntryQuery(
  executor: QueryExecutor,
  row: NewJournalEntryRow,
) {
  return executor
    .insertInto("journal_entries")
    .values(row)
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "client_mutation_id"]).doNothing(),
    )
    .returningAll();
}

export function buildPlantObjectPageObjectQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  objectId: string,
) {
  return executor
    .selectFrom("plant_objects")
    .innerJoin("spaces", "spaces.id", "plant_objects.space_id")
    .select([
      "plant_objects.id as objectId",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.location_visibility as objectLocationVisibility",
      "spaces.id as spaceId",
      "spaces.display_name as spaceDisplayName",
      "spaces.location_visibility as spaceLocationVisibility",
    ])
    .where("plant_objects.id", "=", objectId)
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("spaces.owner_user_id", "=", scope.userId);
}

async function insertJournalEntry(
  executor: QueryExecutor,
  row: NewJournalEntryRow,
): Promise<JournalEntry | undefined> {
  return buildInsertJournalEntryQuery(executor, row).executeTakeFirst();
}

async function findJournalEntryByClientMutation(
  scope: RequestScope,
  clientMutationId: string,
  executor: QueryExecutor = db,
): Promise<JournalEntry | undefined> {
  return buildFindExistingEntryByClientMutationQuery(
    executor,
    scope,
    clientMutationId,
  ).executeTakeFirst();
}

function normalizeCreateFirstPlantEntryInput(input: CreateFirstPlantEntryInput) {
  const varietyText = normalizeOptionalText(input.varietyText, "Variety", MAX_NAME_LENGTH);

  return {
    spaceName: normalizeRequiredText(input.spaceName, "Space name", MAX_NAME_LENGTH),
    plantName: normalizeRequiredText(input.plantName, "Plant name", MAX_NAME_LENGTH),
    varietyText,
    varietyState: (varietyText ? "free_text" : "unknown") satisfies VarietyState,
    title: normalizeRequiredText(input.title, "Entry title", MAX_TITLE_LENGTH),
    body: normalizeRequiredText(input.body, "Entry body", MAX_BODY_LENGTH),
    entryDate: normalizeEntryDate(input.entryDate),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      200,
    ),
  };
}

function normalizeRequiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  }
  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  }
  return normalized;
}

function normalizeEntryDate(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Entry date must use YYYY-MM-DD format.");
  }
  return normalized;
}

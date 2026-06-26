import "server-only";

import type { Insertable, Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  EntryLifecycleState,
  EntryVisibility,
  JournalEntry,
  LocationVisibility,
  PlantObject,
  Space,
  VarietyState,
} from "@/db/schema";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { attachProcessedMediaAssetToEntry } from "@/server/media/media-repository";
import type { RequestScope } from "@/server/request-scope";

const MAX_BODY_LENGTH = 2000;
const MAX_TITLE_LENGTH = 140;
const MAX_NAME_LENGTH = 120;
const MAX_RECENT_ITEMS = 20;
const MAX_PUBLIC_SLUG_LENGTH = 96;
const PUBLICATION_DISCLOSURE_VERSION = "first-publication-v1";

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
  mediaAssetId?: string | null;
}

export interface CreateJournalEntryInput {
  body: string;
  visibility: EntryVisibility;
  clientMutationId: string;
}

export interface PublishJournalEntryInput {
  entryId: string;
  disclosureAccepted: boolean;
}

export interface PublishJournalEntryResult {
  entry: JournalEntry;
  publicUrl: string;
  disclosureLogged: boolean;
}

export interface ArchiveJournalEntryInput {
  entryId: string;
}

export interface ArchiveJournalEntryResult {
  entry: JournalEntry;
  publicUrl: string | null;
  publicGone: boolean;
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
    | "id"
    | "display_name"
    | "variety_text"
    | "variety_state"
    | "location_visibility"
  >;
  entries: JournalEntryReadback[];
}

export interface EntryMediaReadback {
  id: string;
  derivativeKey: string;
  publicUrl: string;
}

export type JournalEntryReadback = JournalEntry & {
  media: EntryMediaReadback | null;
};

export interface PublicJournalEntryPage {
  entry: {
    id: string;
    title: string;
    body: string;
    entryDate: Date | string;
    publicSlug: string;
    publicNoindex: boolean;
    publishedAt: Date | string | null;
  };
  space: {
    displayName: string;
    locationVisibility: LocationVisibility;
  };
  plantObject: {
    displayName: string;
    varietyText: string | null;
    varietyState: VarietyState;
    locationVisibility: LocationVisibility;
  };
  media: EntryMediaReadback | null;
}

export interface GonePublicJournalEntryPage {
  publicSlug: string;
  publicGoneAt: Date | string;
  publicNoindex: boolean;
}

export type PublicJournalEntryLookup =
  | {
      status: "active";
      page: PublicJournalEntryPage;
    }
  | {
      status: "gone";
      entry: GonePublicJournalEntryPage;
    }
  | {
      status: "not_found";
    };

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
    await attachMediaAssetToEntryIfPresent(
      db,
      scope,
      normalized.mediaAssetId,
      existing.id,
    );

    const page = await getPlantObjectPage(scope, existing.plant_object_id);
    if (!page)
      throw new Error("Existing journal entry is outside the request scope.");

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
      await attachMediaAssetToEntryIfPresent(
        trx,
        scope,
        normalized.mediaAssetId,
        entry.id,
      );

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
      throw new Error(
        "Journal entry idempotency conflict could not be resolved.",
      );
    }

    await attachMediaAssetToEntryIfPresent(
      trx,
      scope,
      normalized.mediaAssetId,
      existingAfterConflict.id,
    );

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

  const entryRows = await executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("owner_user_id", "=", scope.userId)
    .where("plant_object_id", "=", objectId)
    .orderBy("entry_date", "desc")
    .orderBy("created_at", "desc")
    .execute();
  const mediaByEntryId = await getProcessedMediaByEntryId(
    executor,
    scope,
    entryRows.map((entry) => entry.id),
  );

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
    entries: entryRows.map((entry) => ({
      ...entry,
      media: mediaByEntryId.get(entry.id) ?? null,
    })),
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

export async function publishJournalEntry(
  scope: RequestScope,
  input: PublishJournalEntryInput,
): Promise<PublishJournalEntryResult> {
  const entryId = normalizeRequiredText(input.entryId, "Entry id", 200);
  const existing = await findJournalEntryById(scope, entryId);

  if (!existing) {
    throw new Error("Journal entry was not found in this garden.");
  }

  if (existing.lifecycle_state !== "active") {
    throw new Error("Archived journal entries cannot be published.");
  }

  if (existing.visibility === "public" && existing.public_slug) {
    return {
      entry: existing,
      publicUrl: publicJournalEntryPath(existing.public_slug),
      disclosureLogged: false,
    };
  }

  const priorDisclosure = await buildPriorPublicationDisclosureQuery(
    db,
    scope,
  ).executeTakeFirst();
  const needsDisclosure = !priorDisclosure;

  if (needsDisclosure && !input.disclosureAccepted) {
    throw new Error("First-publication disclosure must be accepted.");
  }

  const now = new Date();
  const publicSlug =
    existing.public_slug ??
    createPublicSlug(existing.title, MAX_PUBLIC_SLUG_LENGTH);
  const publishedAt = existing.published_at ?? now;

  const published = await buildPublishJournalEntryQuery(db, scope, {
    entryId,
    publicSlug,
    publishedAt,
    now,
    disclosureLogged: needsDisclosure,
  }).executeTakeFirstOrThrow();

  return {
    entry: published,
    publicUrl: publicJournalEntryPath(publicSlug),
    disclosureLogged: needsDisclosure,
  };
}

export async function getPublicJournalEntryPage(
  publicSlug: string,
  executor: QueryExecutor = db,
): Promise<PublicJournalEntryPage | null> {
  const lookup = await getPublicJournalEntryLookup(publicSlug, executor);
  return lookup.status === "active" ? lookup.page : null;
}

export async function getPublicJournalEntryLookup(
  publicSlug: string,
  executor: QueryExecutor = db,
): Promise<PublicJournalEntryLookup> {
  const slug = normalizePublicSlug(publicSlug);
  if (!slug) return { status: "not_found" };

  const row = await buildPublicJournalEntryLookupQuery(
    executor,
    slug,
  ).executeTakeFirst();
  if (!row?.publicSlug) return { status: "not_found" };

  if (isGonePublicEntry(row)) {
    return {
      status: "gone",
      entry: {
        publicSlug: row.publicSlug,
        publicGoneAt: row.publicGoneAt,
        publicNoindex: row.publicNoindex,
      },
    };
  }

  if (
    row.visibility !== "public" ||
    row.lifecycleState !== "active" ||
    row.publicGoneAt !== null
  ) {
    return { status: "not_found" };
  }

  const media = await buildPublicProcessedMediaForEntryQuery(
    executor,
    row.entryId,
  ).executeTakeFirst();

  return {
    status: "active",
    page: {
      entry: {
        id: row.entryId,
        title: row.title,
        body: row.body,
        entryDate: row.entryDate,
        publicSlug: row.publicSlug,
        publicNoindex: row.publicNoindex,
        publishedAt: row.publishedAt,
      },
      space: {
        displayName: row.spaceDisplayName,
        locationVisibility: row.spaceLocationVisibility as LocationVisibility,
      },
      plantObject: {
        displayName: row.objectDisplayName,
        varietyText: row.varietyText,
        varietyState: row.varietyState as VarietyState,
        locationVisibility: row.objectLocationVisibility as LocationVisibility,
      },
      media: media?.derivativeKey
        ? {
            id: media.id,
            derivativeKey: media.derivativeKey,
            publicUrl: getPublicDerivativeUrl(media.derivativeKey),
          }
        : null,
    },
  };
}

export async function archiveJournalEntry(
  scope: RequestScope,
  input: ArchiveJournalEntryInput,
): Promise<ArchiveJournalEntryResult> {
  const entryId = normalizeRequiredText(input.entryId, "Entry id", 200);
  const existing = await findJournalEntryById(scope, entryId);

  if (!existing) {
    throw new Error("Journal entry was not found in this garden.");
  }

  if (existing.lifecycle_state === "archived") {
    return {
      entry: existing,
      publicUrl: existing.public_slug
        ? publicJournalEntryPath(existing.public_slug)
        : null,
      publicGone: existing.public_gone_at !== null,
    };
  }

  const now = new Date();
  const hadPublicUrl =
    existing.visibility === "public" && existing.public_slug !== null;
  const archived = await buildArchiveJournalEntryQuery(db, scope, {
    entryId,
    now,
    publicGoneAt: hadPublicUrl ? now : null,
  }).executeTakeFirstOrThrow();

  return {
    entry: archived,
    publicUrl: archived.public_slug
      ? publicJournalEntryPath(archived.public_slug)
      : null,
    publicGone: archived.public_gone_at !== null,
  };
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

export function buildFindJournalEntryByIdQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("id", "=", entryId)
    .where("owner_user_id", "=", scope.userId);
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

export function buildPriorPublicationDisclosureQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("journal_entries")
    .select("id")
    .where("owner_user_id", "=", scope.userId)
    .where("first_publication_disclosed_at", "is not", null)
    .limit(1);
}

export function buildPublishJournalEntryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    entryId: string;
    publicSlug: string;
    publishedAt: Date;
    now: Date;
    disclosureLogged: boolean;
  },
) {
  return executor
    .updateTable("journal_entries")
    .set({
      lifecycle_state: "active",
      visibility: "public",
      public_slug: input.publicSlug,
      public_noindex: true,
      published_at: input.publishedAt,
      archived_at: null,
      public_gone_at: null,
      first_publication_disclosure_version: input.disclosureLogged
        ? PUBLICATION_DISCLOSURE_VERSION
        : undefined,
      first_publication_disclosed_at: input.disclosureLogged
        ? input.now
        : undefined,
      updated_at: input.now,
    })
    .where("id", "=", input.entryId)
    .where("owner_user_id", "=", scope.userId)
    .where("visibility", "=", "private")
    .where("lifecycle_state", "=", "active")
    .returningAll();
}

export function buildArchiveJournalEntryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    entryId: string;
    now: Date;
    publicGoneAt: Date | null;
  },
) {
  return executor
    .updateTable("journal_entries")
    .set({
      lifecycle_state: "archived",
      visibility: "private",
      public_noindex: true,
      archived_at: input.now,
      public_gone_at: input.publicGoneAt ?? undefined,
      updated_at: input.now,
    })
    .where("id", "=", input.entryId)
    .where("owner_user_id", "=", scope.userId)
    .where("lifecycle_state", "=", "active")
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

export function buildPublicJournalEntryPageQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return buildPublicJournalEntryLookupQuery(executor, publicSlug)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null);
}

export function buildPublicJournalEntryLookupQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return executor
    .selectFrom("journal_entries")
    .innerJoin(
      "plant_objects",
      "plant_objects.id",
      "journal_entries.plant_object_id",
    )
    .innerJoin("spaces", "spaces.id", "journal_entries.space_id")
    .select([
      "journal_entries.id as entryId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.visibility as visibility",
      "journal_entries.lifecycle_state as lifecycleState",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.public_noindex as publicNoindex",
      "journal_entries.published_at as publishedAt",
      "journal_entries.public_gone_at as publicGoneAt",
      "spaces.display_name as spaceDisplayName",
      "spaces.location_visibility as spaceLocationVisibility",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.location_visibility as objectLocationVisibility",
    ])
    .where("journal_entries.public_slug", "=", publicSlug);
}

export function buildProcessedMediaForEntriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: readonly string[],
) {
  return executor
    .selectFrom("media_assets")
    .select([
      "id",
      "journal_entry_id as journalEntryId",
      "derivative_key as derivativeKey",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "in", entryIds)
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null);
}

export function buildPublicProcessedMediaForEntryQuery(
  executor: QueryExecutor,
  entryId: string,
) {
  return executor
    .selectFrom("media_assets")
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "media_assets.journal_entry_id",
    )
    .select([
      "media_assets.id as id",
      "media_assets.derivative_key as derivativeKey",
    ])
    .where("journal_entries.id", "=", entryId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("media_assets.status", "=", "processed")
    .where("media_assets.derivative_key", "is not", null);
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

async function findJournalEntryById(
  scope: RequestScope,
  entryId: string,
  executor: QueryExecutor = db,
): Promise<JournalEntry | undefined> {
  return buildFindJournalEntryByIdQuery(
    executor,
    scope,
    entryId,
  ).executeTakeFirst();
}

function normalizeCreateFirstPlantEntryInput(
  input: CreateFirstPlantEntryInput,
) {
  const varietyText = normalizeOptionalText(
    input.varietyText,
    "Variety",
    MAX_NAME_LENGTH,
  );
  const mediaAssetId = normalizeOptionalText(
    input.mediaAssetId,
    "Media asset id",
    200,
  );

  return {
    spaceName: normalizeRequiredText(
      input.spaceName,
      "Space name",
      MAX_NAME_LENGTH,
    ),
    plantName: normalizeRequiredText(
      input.plantName,
      "Plant name",
      MAX_NAME_LENGTH,
    ),
    varietyText,
    varietyState: (varietyText
      ? "free_text"
      : "unknown") satisfies VarietyState,
    title: normalizeRequiredText(input.title, "Entry title", MAX_TITLE_LENGTH),
    body: normalizeRequiredText(input.body, "Entry body", MAX_BODY_LENGTH),
    entryDate: normalizeEntryDate(input.entryDate),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      200,
    ),
    mediaAssetId,
  };
}

function normalizeRequiredText(
  value: string,
  label: string,
  maxLength: number,
) {
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

function normalizePublicSlug(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_PUBLIC_SLUG_LENGTH) return null;
  if (!/^[\p{Letter}\p{Number}-]+$/u.test(normalized)) return null;
  return normalized;
}

function createPublicSlug(title: string, maxLength: number) {
  const randomSuffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const base = title
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, Math.max(1, maxLength - randomSuffix.length - 1));

  return `${base || "entry"}-${randomSuffix}`;
}

function isGonePublicEntry(row: {
  publicSlug: string | null;
  publicGoneAt: Date | string | null;
  lifecycleState: EntryLifecycleState | string;
  publicNoindex: boolean;
}): row is {
  publicSlug: string;
  publicGoneAt: Date | string;
  lifecycleState: "archived";
  publicNoindex: boolean;
} {
  return (
    row.publicSlug !== null &&
    row.publicGoneAt !== null &&
    row.lifecycleState === "archived"
  );
}

async function attachMediaAssetToEntryIfPresent(
  executor: QueryExecutor,
  scope: RequestScope,
  mediaAssetId: string | null,
  journalEntryId: string,
) {
  if (!mediaAssetId) return;

  const mediaAsset = await attachProcessedMediaAssetToEntry(executor, scope, {
    mediaAssetId,
    journalEntryId,
  });

  if (!mediaAsset) {
    throw new Error("Processed media asset is unavailable for this entry.");
  }
}

async function getProcessedMediaByEntryId(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: string[],
) {
  const mediaByEntryId = new Map<string, EntryMediaReadback>();
  if (entryIds.length === 0) return mediaByEntryId;

  const mediaRows = await buildProcessedMediaForEntriesQuery(
    executor,
    scope,
    entryIds,
  ).execute();

  for (const media of mediaRows) {
    if (!media.journalEntryId || !media.derivativeKey) continue;
    mediaByEntryId.set(media.journalEntryId, {
      id: media.id,
      derivativeKey: media.derivativeKey,
      publicUrl: getPublicDerivativeUrl(media.derivativeKey),
    });
  }

  return mediaByEntryId;
}

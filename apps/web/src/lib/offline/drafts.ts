"use client";

import type { PlantObjectKind } from "@/db/schema";
import type {
  ActivationSource,
  FirstEntryCatalogSelection,
} from "@/lib/garden/entry-contracts";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";
import {
  assertOwnerOfflineActivityAllowed,
  offlineDb,
  offlineDraftSummary,
  OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE,
  readLocalOwnerActivitySessionGeneration,
  type OfflineOwnerActivity,
  type OfflineDraftKind,
  type OfflineComposerDurabilityRecord,
  type OfflineDraftRecord,
  type OfflineDraftSummary,
  type OfflineJournalCoverPayload,
  type OfflineSummaryPage,
  type OfflinePhotoIntent,
} from "./queue";
import {
  deletedOwnerComposerFingerprint,
  fingerprintOwnerComposerPayload,
  OWNER_COMPOSER_DURABILITY_PROTOCOL,
  OFFLINE_VAULT_GENERATION,
  OwnerComposerDurabilityUnconfirmedError,
  requireOwnerComposerDurabilityExpectation,
  type OwnerComposerDurabilityExpectation,
  type OwnerComposerDurabilityReceipt,
  type OwnerComposerPayloadFingerprint,
} from "./owner-composer-durability";
import type {
  OwnerComposerDurabilityWriteContext,
  OwnerComposerOfflineActivityScope,
  OwnerComposerPersistenceWriteContext,
} from "./owner-composer-participants";

export const FIRST_ENTRY_DRAFT_ID = "first-entry";
export const OFFLINE_DRAFTS_CHANGED_EVENT = "overgarden-offline-drafts-changed";

export type DraftLocationVisibility = "hidden" | "region";

export interface FirstEntryDraftFields {
  spaceId?: string | null;
  spaceName: string;
  plantName: string;
  objectKind: PlantObjectKind;
  title: string;
  body: string;
  contentDocument?: JournalDocumentV1 | null;
  entryDate: string;
  locationVisibility: DraftLocationVisibility;
  coarseRegionCode: string;
}

export interface FirstEntryDraftPayload {
  clientMutationId: string;
  draft: FirstEntryDraftFields;
  catalogQuery: string;
  selectedCatalogItem: FirstEntryCatalogSelection | null;
  userAddedCatalogName: string | null;
  activationSource: ActivationSource | null;
  mentionSelections?: JournalMentionSelection[];
  topicTagInput?: string;
  photoIntent: OfflinePhotoIntent | null;
  photoIntentsByBlockId?: Record<string, OfflinePhotoIntent>;
  cover?: OfflineJournalCoverPayload | null;
}

export interface FollowUpEntryDraftFields {
  title: string;
  body: string;
  contentDocument?: JournalDocumentV1 | null;
  entryDate: string;
}

export interface FollowUpEntryDraftPayload {
  clientMutationId: string;
  plantObjectId: string;
  draft: FollowUpEntryDraftFields;
  mentionSelections?: JournalMentionSelection[];
  topicTagInput?: string;
  photoIntent: OfflinePhotoIntent | null;
  photoIntentsByBlockId?: Record<string, OfflinePhotoIntent>;
  cover?: OfflineJournalCoverPayload | null;
}

export interface SpaceEntryDraftFields {
  title: string;
  body: string;
  contentDocument?: JournalDocumentV1 | null;
  entryDate: string;
}

export interface SpaceEntryDraftPayload {
  clientMutationId: string;
  spaceId: string;
  mentionedPlantObjectIds: string[];
  draft: SpaceEntryDraftFields;
  topicTagInput?: string;
  photoIntent: OfflinePhotoIntent | null;
  photoIntentsByBlockId?: Record<string, OfflinePhotoIntent>;
  cover?: OfflineJournalCoverPayload | null;
}

export type JournalDraftPayload =
  | FirstEntryDraftPayload
  | FollowUpEntryDraftPayload
  | SpaceEntryDraftPayload;

export type JournalDraftRecord = OfflineDraftRecord<JournalDraftPayload>;

type OwnerComposerDraftWriteOptions = OwnerComposerPersistenceWriteContext;

export function followUpEntryDraftId(objectId: string) {
  return `follow-up-entry:${objectId}`;
}

export function upsertOfflineDraft<TPayload extends JournalDraftPayload>(
  input: Pick<
    OfflineDraftRecord<TPayload>,
    "ownerUserId" | "id" | "kind" | "payload"
  >,
  options: OwnerComposerDurabilityWriteContext,
): Promise<OwnerComposerDurabilityReceipt>;
export function upsertOfflineDraft<TPayload extends JournalDraftPayload>(
  input: Pick<
    OfflineDraftRecord<TPayload>,
    "ownerUserId" | "id" | "kind" | "payload"
  >,
  options?: OwnerComposerDraftWriteOptions,
): Promise<OfflineDraftRecord<TPayload> | undefined>;
export async function upsertOfflineDraft<TPayload extends JournalDraftPayload>(
  input: Pick<
    OfflineDraftRecord<TPayload>,
    "ownerUserId" | "id" | "kind" | "payload"
  >,
  options: OwnerComposerDraftWriteOptions = {},
): Promise<
  OfflineDraftRecord<TPayload> | OwnerComposerDurabilityReceipt | undefined
> {
  const database = offlineDb;
  const durability = options.durability
    ? requireOwnerComposerDurabilityExpectation(options.durability)
    : undefined;
  if (!database) {
    if (durability) {
      throw new OwnerComposerDurabilityUnconfirmedError("storage_unavailable");
    }
    return undefined;
  }

  const now = Date.now();
  const ownerUserId = requireOwnerUserId(input.ownerUserId);
  if (
    durability &&
    (durability.ownerUserId !== ownerUserId || durability.draftId !== input.id)
  ) {
    throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
  }
  const fingerprint = durability
    ? await fingerprintOwnerComposerPayload(input.payload)
    : undefined;
  const record = await database.transaction(
    "rw",
    database.drafts,
    database.draftSummaries,
    database.composerDurability,
    database.ownerActivity,
    async () => {
      await assertOfflineDraftWriteAllowed(
        ownerUserId,
        options.offlineActivityScope,
      );
      const existing = await database.drafts.get([ownerUserId, input.id]);
      const next: OfflineDraftRecord<TPayload> = {
        id: input.id,
        ownerUserId,
        kind: input.kind,
        payload: input.payload,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await database.drafts.put(next);
      await database.draftSummaries.put(offlineDraftSummary(next));
      if (durability && fingerprint) {
        await database.composerDurability.put(
          composerDurabilityRecord({
            ownerUserId,
            draftId: input.id,
            expectation: durability,
            disposition: "stored",
            fingerprint,
            updatedAt: now,
          }),
        );
      } else {
        // A write without exact generation evidence invalidates any older
        // receipt in the same transaction.
        await database.composerDurability.delete([ownerUserId, input.id]);
      }
      return next;
    },
  );
  publishOfflineDraftsChanged();
  if (durability && fingerprint) {
    return verifyStoredComposerDurability(
      database,
      ownerUserId,
      input.id,
      durability,
      fingerprint,
    );
  }
  return record;
}

export async function getOfflineDraft<TPayload extends JournalDraftPayload>(
  ownerUserId: string,
  id: string,
): Promise<OfflineDraftRecord<TPayload> | undefined> {
  if (!offlineDb) return undefined;
  return offlineDb.drafts.get([requireOwnerUserId(ownerUserId), id]) as Promise<
    OfflineDraftRecord<TPayload> | undefined
  >;
}

export async function listOfflineDrafts(
  ownerUserId: string,
  kinds?: OfflineDraftKind[],
): Promise<JournalDraftRecord[]> {
  if (!offlineDb) return [];
  const owner = requireOwnerUserId(ownerUserId);
  const records = await offlineDb.drafts
    .where("ownerUserId")
    .equals(owner)
    .filter(
      (record) => !kinds || kinds.length === 0 || kinds.includes(record.kind),
    )
    .toArray();

  return (records as JournalDraftRecord[]).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
}

export async function listOfflineDraftSummaries(
  ownerUserId: string,
  options: { page?: number } = {},
): Promise<OfflineSummaryPage<OfflineDraftSummary>> {
  const owner = normalizedOwnerUserId(ownerUserId);
  const page = normalizeWorkspaceSummaryPage(options.page);
  const database = offlineDb;
  if (!database || !owner) {
    return {
      items: [],
      hasMore: false,
      page,
      pageSize: OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE,
    };
  }

  const records = await database.draftSummaries
    .where("[ownerUserId+updatedAt]")
    .between(
      [owner, Number.MIN_SAFE_INTEGER],
      [owner, Number.MAX_SAFE_INTEGER],
      true,
      true,
    )
    .reverse()
    .offset((page - 1) * OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE)
    .limit(OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE + 1)
    .toArray();

  return {
    items: records.slice(0, OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE),
    hasMore: records.length > OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE,
    page,
    pageSize: OFFLINE_WORKSPACE_SUMMARY_PAGE_SIZE,
  };
}

export function deleteOfflineDraft(
  ownerUserId: string,
  id: string,
  options: OwnerComposerDurabilityWriteContext,
): Promise<OwnerComposerDurabilityReceipt>;
export function deleteOfflineDraft(
  ownerUserId: string,
  id: string,
  options?: OwnerComposerDraftWriteOptions,
): Promise<void>;
export async function deleteOfflineDraft(
  ownerUserId: string,
  id: string,
  options: OwnerComposerDraftWriteOptions = {},
): Promise<void | OwnerComposerDurabilityReceipt> {
  const database = offlineDb;
  const durability = options.durability
    ? requireOwnerComposerDurabilityExpectation(options.durability)
    : undefined;
  if (!database) {
    if (durability) {
      throw new OwnerComposerDurabilityUnconfirmedError("storage_unavailable");
    }
    return;
  }
  const owner = requireOwnerUserId(ownerUserId);
  if (
    durability &&
    (durability.ownerUserId !== owner || durability.draftId !== id)
  ) {
    throw new OwnerComposerDurabilityUnconfirmedError("corrupt_record");
  }
  const fingerprint = durability
    ? await deletedOwnerComposerFingerprint()
    : undefined;
  const now = Date.now();
  await database.transaction(
    "rw",
    database.drafts,
    database.draftSummaries,
    database.composerDurability,
    database.ownerActivity,
    async () => {
      await assertOfflineDraftWriteAllowed(owner, options.offlineActivityScope);
      await database.drafts.delete([owner, id]);
      await database.draftSummaries.delete([owner, id]);
      if (durability && fingerprint) {
        await database.composerDurability.put(
          composerDurabilityRecord({
            ownerUserId: owner,
            draftId: id,
            expectation: durability,
            disposition: "deleted",
            fingerprint,
            updatedAt: now,
          }),
        );
      } else {
        await database.composerDurability.delete([owner, id]);
      }
    },
  );
  publishOfflineDraftsChanged();
  if (durability && fingerprint) {
    return verifyDeletedComposerDurability(
      database,
      owner,
      id,
      durability,
      fingerprint,
    );
  }
}

function composerDurabilityRecord(input: {
  ownerUserId: string;
  draftId: string;
  expectation: OwnerComposerDurabilityExpectation;
  disposition: OfflineComposerDurabilityRecord["disposition"];
  fingerprint: OwnerComposerPayloadFingerprint;
  updatedAt: number;
}): OfflineComposerDurabilityRecord {
  return {
    ownerUserId: input.ownerUserId,
    draftId: input.draftId,
    protocol: OWNER_COMPOSER_DURABILITY_PROTOCOL,
    participantNonce: input.expectation.participantNonce,
    generation: input.expectation.generation,
    disposition: input.disposition,
    storedByteLength: input.fingerprint.storedByteLength,
    storedDigest: input.fingerprint.storedDigest,
    vaultGeneration: OFFLINE_VAULT_GENERATION,
    updatedAt: input.updatedAt,
  };
}

async function verifyStoredComposerDurability(
  database: NonNullable<typeof offlineDb>,
  ownerUserId: string,
  draftId: string,
  expectation: OwnerComposerDurabilityExpectation,
  expectedFingerprint: OwnerComposerPayloadFingerprint,
): Promise<OwnerComposerDurabilityReceipt> {
  const [storedDraft, storedDurability] = await database.transaction(
    "r",
    database.drafts,
    database.composerDurability,
    () =>
      Promise.all([
        database.drafts.get([ownerUserId, draftId]),
        database.composerDurability.get([ownerUserId, draftId]),
      ]),
  );
  if (
    !storedDraft ||
    storedDraft.ownerUserId !== ownerUserId ||
    storedDraft.id !== draftId ||
    !matchesComposerDurabilityRecord(
      storedDurability,
      ownerUserId,
      draftId,
      expectation,
      "stored",
      expectedFingerprint,
    )
  ) {
    throw new OwnerComposerDurabilityUnconfirmedError();
  }
  const readbackFingerprint = await fingerprintOwnerComposerPayload(
    storedDraft.payload,
  );
  if (!fingerprintsMatch(readbackFingerprint, expectedFingerprint)) {
    throw new OwnerComposerDurabilityUnconfirmedError();
  }
  return receiptFromDurabilityRecord(storedDurability);
}

async function verifyDeletedComposerDurability(
  database: NonNullable<typeof offlineDb>,
  ownerUserId: string,
  draftId: string,
  expectation: OwnerComposerDurabilityExpectation,
  expectedFingerprint: OwnerComposerPayloadFingerprint,
): Promise<OwnerComposerDurabilityReceipt> {
  const [storedDraft, storedDurability] = await database.transaction(
    "r",
    database.drafts,
    database.composerDurability,
    () =>
      Promise.all([
        database.drafts.get([ownerUserId, draftId]),
        database.composerDurability.get([ownerUserId, draftId]),
      ]),
  );
  if (
    storedDraft !== undefined ||
    !matchesComposerDurabilityRecord(
      storedDurability,
      ownerUserId,
      draftId,
      expectation,
      "deleted",
      expectedFingerprint,
    )
  ) {
    throw new OwnerComposerDurabilityUnconfirmedError();
  }
  return receiptFromDurabilityRecord(storedDurability);
}

function matchesComposerDurabilityRecord(
  record: OfflineComposerDurabilityRecord | undefined,
  ownerUserId: string,
  draftId: string,
  expectation: OwnerComposerDurabilityExpectation,
  disposition: OfflineComposerDurabilityRecord["disposition"],
  fingerprint: OwnerComposerPayloadFingerprint,
): record is OfflineComposerDurabilityRecord {
  return (
    record?.ownerUserId === ownerUserId &&
    record.draftId === draftId &&
    record.protocol === OWNER_COMPOSER_DURABILITY_PROTOCOL &&
    record.participantNonce === expectation.participantNonce &&
    record.generation === expectation.generation &&
    record.disposition === disposition &&
    record.storedByteLength === fingerprint.storedByteLength &&
    record.storedDigest === fingerprint.storedDigest &&
    record.vaultGeneration === OFFLINE_VAULT_GENERATION
  );
}

function receiptFromDurabilityRecord(
  record: OfflineComposerDurabilityRecord,
): OwnerComposerDurabilityReceipt {
  return {
    status: "confirmed",
    protocol: record.protocol,
    participantNonce: record.participantNonce,
    generation: record.generation,
    disposition: record.disposition,
    storedByteLength: record.storedByteLength,
    storedDigest: record.storedDigest,
    vaultGeneration: record.vaultGeneration,
  };
}

function fingerprintsMatch(
  left: OwnerComposerPayloadFingerprint,
  right: OwnerComposerPayloadFingerprint,
) {
  return (
    left.storedByteLength === right.storedByteLength &&
    left.storedDigest === right.storedDigest
  );
}

export function hasPersistableFirstEntryDraft(
  payload: FirstEntryDraftPayload,
  defaultEntryDate: string,
) {
  return (
    hasText(
      payload.draft.plantName,
      payload.draft.title,
      payload.draft.body,
      payload.catalogQuery,
      payload.userAddedCatalogName,
    ) ||
    hasStructuredDocument(payload.draft.contentDocument) ||
    (!payload.draft.spaceId && hasText(payload.draft.spaceName)) ||
    payload.selectedCatalogItem !== null ||
    (payload.mentionSelections?.length ?? 0) > 0 ||
    hasText(payload.topicTagInput) ||
    payload.photoIntent !== null ||
    hasPhotoIntents(payload.photoIntentsByBlockId) ||
    payload.draft.entryDate !== defaultEntryDate ||
    payload.draft.locationVisibility === "region" ||
    payload.draft.objectKind !== "plant"
  );
}

export function hasPersistableFollowUpDraft(
  payload: FollowUpEntryDraftPayload,
  defaultEntryDate: string,
) {
  return (
    hasText(payload.draft.title, payload.draft.body) ||
    hasStructuredDocument(payload.draft.contentDocument) ||
    (payload.mentionSelections?.length ?? 0) > 0 ||
    hasText(payload.topicTagInput) ||
    payload.photoIntent !== null ||
    hasPhotoIntents(payload.photoIntentsByBlockId) ||
    payload.draft.entryDate !== defaultEntryDate
  );
}

export function spaceEntryDraftId(spaceId: string) {
  return `space-entry:${spaceId}`;
}

export function hasPersistableSpaceEntryDraft(
  payload: SpaceEntryDraftPayload,
  defaultEntryDate: string,
) {
  return (
    hasText(payload.draft.title, payload.draft.body) ||
    hasStructuredDocument(payload.draft.contentDocument) ||
    payload.mentionedPlantObjectIds.length > 0 ||
    hasText(payload.topicTagInput) ||
    payload.photoIntent !== null ||
    hasPhotoIntents(payload.photoIntentsByBlockId) ||
    payload.draft.entryDate !== defaultEntryDate
  );
}

function hasText(...values: Array<string | null | undefined>) {
  return values.some((value) => (value ?? "").trim().length > 0);
}

function hasStructuredDocument(document: JournalDocumentV1 | null | undefined) {
  return (document?.blocks.length ?? 0) > 0;
}

function hasPhotoIntents(
  intents: Record<string, OfflinePhotoIntent> | null | undefined,
) {
  return intents != null && Object.keys(intents).length > 0;
}

/**
 * A composer that was frozen and flushed before sign-out may receive a newer
 * complete generation while the coordinator still owns its exact `preparing`
 * fence (for example, a late photo copy or a composer mounted mid-round).
 * Permit only that exact operation to refresh the draft. A promoted commit,
 * expired operation, different session, or signed-out fence falls back to the
 * ordinary fail-closed write guard and therefore cannot recreate owner data.
 */
async function assertOfflineDraftWriteAllowed(
  ownerUserId: string,
  scope?: OwnerComposerOfflineActivityScope,
) {
  if (scope && offlineDb) {
    const localGeneration =
      readLocalOwnerActivitySessionGeneration(ownerUserId);
    const activity = (await offlineDb.ownerActivity.get(ownerUserId)) as
      | OfflineOwnerActivity
      | undefined;
    const ownsActivePreparation =
      localGeneration === scope.sessionGeneration &&
      activity?.ownerUserId === ownerUserId &&
      activity.sessionGeneration === scope.sessionGeneration &&
      activity.lifecycle === "active" &&
      activity.operations.some(
        (operation) =>
          operation.operationId === scope.operationId &&
          operation.phase === "preparing" &&
          operation.expiresAt > Date.now(),
      );
    if (ownsActivePreparation) return;
  }

  await assertOwnerOfflineActivityAllowed(ownerUserId);
}

export function publishOfflineDraftsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_DRAFTS_CHANGED_EVENT));
}

function requireOwnerUserId(ownerUserId: string) {
  const normalized = ownerUserId.trim();
  if (!normalized) throw new Error("Offline data requires an owner user id.");
  return normalized;
}

function normalizedOwnerUserId(ownerUserId: string) {
  const normalized = ownerUserId.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeWorkspaceSummaryPage(value: number | undefined) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value ?? 1));
}

"use client";

import type { PlantObjectKind } from "@/db/schema";
import type {
  ActivationSource,
  FirstEntryCatalogSelection,
} from "@/lib/garden/entry-contracts";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";
import {
  assertOwnerOfflineActivityAllowed,
  offlineDb,
  readLocalOwnerActivitySessionGeneration,
  type OfflineOwnerActivity,
  type OfflineDraftKind,
  type OfflineDraftRecord,
  type OfflinePhotoIntent,
} from "./queue";
import type {
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
}

export interface FollowUpEntryDraftFields {
  title: string;
  body: string;
  entryDate: string;
}

export interface FollowUpEntryDraftPayload {
  clientMutationId: string;
  plantObjectId: string;
  draft: FollowUpEntryDraftFields;
  mentionSelections?: JournalMentionSelection[];
  topicTagInput?: string;
  photoIntent: OfflinePhotoIntent | null;
}

export type JournalDraftPayload =
  | FirstEntryDraftPayload
  | FollowUpEntryDraftPayload;

export type JournalDraftRecord = OfflineDraftRecord<JournalDraftPayload>;

type OwnerComposerDraftWriteOptions = OwnerComposerPersistenceWriteContext;

export function followUpEntryDraftId(objectId: string) {
  return `follow-up-entry:${objectId}`;
}

export async function upsertOfflineDraft<TPayload extends JournalDraftPayload>(
  input: Pick<
    OfflineDraftRecord<TPayload>,
    "ownerUserId" | "id" | "kind" | "payload"
  >,
  options: OwnerComposerDraftWriteOptions = {},
): Promise<OfflineDraftRecord<TPayload> | undefined> {
  const database = offlineDb;
  if (!database) return undefined;

  const now = Date.now();
  const ownerUserId = requireOwnerUserId(input.ownerUserId);
  const record = await database.transaction(
    "rw",
    database.drafts,
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
      return next;
    },
  );
  publishOfflineDraftsChanged();
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

export async function deleteOfflineDraft(
  ownerUserId: string,
  id: string,
  options: OwnerComposerDraftWriteOptions = {},
): Promise<void> {
  const database = offlineDb;
  if (!database) return;
  const owner = requireOwnerUserId(ownerUserId);
  await database.transaction(
    "rw",
    database.drafts,
    database.ownerActivity,
    async () => {
      await assertOfflineDraftWriteAllowed(owner, options.offlineActivityScope);
      await database.drafts.delete([owner, id]);
    },
  );
  publishOfflineDraftsChanged();
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
    (!payload.draft.spaceId && hasText(payload.draft.spaceName)) ||
    payload.selectedCatalogItem !== null ||
    (payload.mentionSelections?.length ?? 0) > 0 ||
    hasText(payload.topicTagInput) ||
    payload.photoIntent !== null ||
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
    (payload.mentionSelections?.length ?? 0) > 0 ||
    hasText(payload.topicTagInput) ||
    payload.photoIntent !== null ||
    payload.draft.entryDate !== defaultEntryDate
  );
}

function hasText(...values: Array<string | null | undefined>) {
  return values.some((value) => (value ?? "").trim().length > 0);
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

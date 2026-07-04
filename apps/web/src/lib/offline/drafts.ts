"use client";

import type { PlantObjectKind } from "@/db/schema";
import type {
  ActivationSource,
  FirstEntryCatalogSelection,
} from "@/lib/garden/entry-contracts";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";
import {
  offlineDb,
  type OfflineDraftKind,
  type OfflineDraftRecord,
  type OfflinePhotoIntent,
} from "./queue";

export const FIRST_ENTRY_DRAFT_ID = "first-entry";
export const OFFLINE_DRAFTS_CHANGED_EVENT = "overgarden-offline-drafts-changed";

export type DraftLocationVisibility = "hidden" | "region";

export interface FirstEntryDraftFields {
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

export function followUpEntryDraftId(objectId: string) {
  return `follow-up-entry:${objectId}`;
}

export async function upsertOfflineDraft<TPayload extends JournalDraftPayload>(
  input: Pick<OfflineDraftRecord<TPayload>, "id" | "kind" | "payload">,
): Promise<OfflineDraftRecord<TPayload> | undefined> {
  if (!offlineDb) return undefined;

  const now = Date.now();
  const existing = await offlineDb.drafts.get(input.id);
  const record: OfflineDraftRecord<TPayload> = {
    id: input.id,
    kind: input.kind,
    payload: input.payload,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await offlineDb.drafts.put(record);
  notifyDraftsChanged();
  return record;
}

export async function getOfflineDraft<TPayload extends JournalDraftPayload>(
  id: string,
): Promise<OfflineDraftRecord<TPayload> | undefined> {
  if (!offlineDb) return undefined;
  return offlineDb.drafts.get(id) as Promise<
    OfflineDraftRecord<TPayload> | undefined
  >;
}

export async function listOfflineDrafts(
  kinds?: OfflineDraftKind[],
): Promise<JournalDraftRecord[]> {
  if (!offlineDb) return [];

  const records =
    kinds && kinds.length > 0
      ? await offlineDb.drafts.where("kind").anyOf(kinds).toArray()
      : await offlineDb.drafts.toArray();

  return (records as JournalDraftRecord[]).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
}

export async function deleteOfflineDraft(id: string): Promise<void> {
  if (!offlineDb) return;
  await offlineDb.drafts.delete(id);
  notifyDraftsChanged();
}

export function hasPersistableFirstEntryDraft(
  payload: FirstEntryDraftPayload,
  defaultEntryDate: string,
) {
  return (
    hasText(
      payload.draft.spaceName,
      payload.draft.plantName,
      payload.draft.title,
      payload.draft.body,
      payload.catalogQuery,
      payload.userAddedCatalogName,
    ) ||
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

function notifyDraftsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_DRAFTS_CHANGED_EVENT));
}

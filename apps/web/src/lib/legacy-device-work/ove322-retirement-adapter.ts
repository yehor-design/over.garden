"use client";

import Dexie, { type Table } from "dexie";

import { AUTH_INTENT_RETURN_HEADER } from "@/lib/auth/auth-intent-http-contract";
import { DOCUMENT_MUTATION_GENERATION_HEADER } from "@/lib/auth/document-mutation-generation-transport";
import type {
  FirstEntryDraftPayload,
  FollowUpEntryDraftPayload,
  JournalDraftPayload,
  JournalDraftRecord,
  SpaceEntryDraftPayload,
} from "./ove322-retirement-bridge";
import {
  fingerprintOwnerVaultPayload,
  OwnerComposerDurabilityUnconfirmedError,
} from "./ove322-retirement-bridge";
import type {
  OfflineComposerDurabilityRecord,
  OfflineDraftSummary,
  OfflineJournalEntryPayload,
  OfflineDraftRecord,
  OfflineMutation,
  OfflineMutationSummary,
  OfflineOwnerActivity,
  OfflinePhotoIntent,
} from "./ove322-retirement-bridge";
import {
  abandonOwnerVaultExclusiveFence,
  acquireOwnerVaultExclusiveFence,
  fetchAuthenticatedOwnerVaultBinding,
  finalizeOwnerVaultExclusiveFence,
  hasOwnerVaultBinding,
  OwnerVaultControlDb,
  OwnerVaultDb,
  waitForOwnerVaultWritersToSettle,
  type OwnerVaultRowCounts,
} from "./ove322-retirement-bridge";
import {
  buildJournalEntryRequestBodyForSync,
  journalEntryAuthReturnTo,
} from "./ove322-retirement-bridge";
import {
  JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
  journalDraftPayloadSha256,
  ONLINE_JOURNAL_PROTOCOL,
  ONLINE_JOURNAL_PROTOCOL_HEADER,
  type FirstPlantEntryRequest,
  type JournalEntryDraftContext,
  type JournalEntryDraftKind,
  type JournalEntryDraftPayloadV1,
} from "@/lib/garden/entry-contracts";
import { remapJournalDocumentMediaAssetIds } from "@/lib/garden/journal-document";
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import { createOnlineJournalDraftOwner } from "@/lib/garden/online-journal-draft";
import { uploadOnlineComposerPhoto } from "@/lib/garden/online-journal-submit";
import type { OnlineComposerPhotoIntent } from "@/lib/garden/composer-photo-selection";
import {
  KnownClientStorageError,
  assertKnownClientStorageAbsentTwice,
  browserKnownClientStorageEnvironment,
  deleteKnownIndexedDatabase,
  inventoryKnownClientStorage,
  legacyOwnerDatabaseName,
  LEGACY_CONTROL_DATABASE_NAME,
  LEGACY_SHARED_DATABASE_NAME,
  unregisterLegacyOverGardenServiceWorkers,
  type KnownClientStorageEnvironment,
} from "@/lib/retirement/known-client-storage";
import {
  LegacyRetirementPortError,
  type LegacyDeviceRetirementPort,
  type LegacyRetirementIdentity,
  type LegacyRetirementInventory,
  type LegacyRetirementItem,
  type LegacyRetirementTransferResult,
} from "@/lib/retirement/legacy-device-retirement";

const MAX_RETIREMENT_ITEMS = 10_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DatabaseKind = "shared" | "owner";

interface RetirementDatabase {
  connection: Dexie;
  mutations: Table<OfflineMutation, string>;
  drafts: Table<OfflineDraftRecord, [string, string]>;
  mutationSummaries?: Table<OfflineMutationSummary, [string, string]>;
  draftSummaries?: Table<OfflineDraftSummary, [string, string]>;
  composerDurability?: Table<OfflineComposerDurabilityRecord, [string, string]>;
  ownerActivity?: Table<OfflineOwnerActivity, string>;
}

type SharedRetirementDatabase =
  | { status: "claimable"; database: RetirementDatabase }
  | { status: "unattributable"; connection: Dexie };

interface RetainedDraft {
  type: "draft";
  database: DatabaseKind;
  row: JournalDraftRecord;
  digest: string;
  generation: number;
}

interface RetainedMutation {
  type: "mutation";
  database: DatabaseKind;
  row: OfflineMutation;
  digest: string;
}

type RetainedItem = RetainedDraft | RetainedMutation;

interface DraftMediaResolution {
  primaryMediaAssetId?: string | null;
  inlineMediaIds?: Map<string, string>;
  coverMediaAssetId?: string | null;
}

export interface LegacyDraftServerProjection {
  draftKey: string;
  draftKind: JournalEntryDraftKind;
  context: JournalEntryDraftContext;
  payload: JournalEntryDraftPayloadV1;
}

export function legacyDraftToServerPayload(
  record: JournalDraftRecord,
  media: DraftMediaResolution = {},
): LegacyDraftServerProjection {
  if (!record || !record.payload || typeof record.payload !== "object") {
    throw corruptLegacyItem();
  }
  switch (record.kind) {
    case "first_entry":
      return firstDraftProjection(
        record as OfflineDraftRecord<FirstEntryDraftPayload>,
        media,
      );
    case "follow_up_entry":
      return followUpDraftProjection(
        record as OfflineDraftRecord<FollowUpEntryDraftPayload>,
        media,
      );
    case "space_entry":
      return spaceDraftProjection(
        record as OfflineDraftRecord<SpaceEntryDraftPayload>,
        media,
      );
    default:
      throw corruptLegacyItem();
  }
}

export function legacyMutationToOnlineRequest(
  mutation: OfflineMutation,
  mediaAssetId?: string | null,
): FirstPlantEntryRequest {
  if (
    mutation.kind !== "journal_entry" ||
    !mutation.payload ||
    typeof mutation.payload !== "object"
  ) {
    throw corruptLegacyItem();
  }
  const request = buildJournalEntryRequestBodyForSync(
    mutation.payload as OfflineJournalEntryPayload,
    requireStableIdentity(mutation.idempotencyKey),
    mediaAssetId,
  );
  return { ...request, syncStatus: "online" };
}

export async function stableRetirementUploadGenerationId(
  itemToken: string,
  slot: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `ove322.retirement-media.v1\u0000${itemToken}\u0000${slot}`,
    ),
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createOve322LegacyDeviceRetirementPort(
  options: {
    fetchImpl?: typeof fetch;
    databaseNames?: () => Promise<string[] | null>;
    storageEnvironment?: KnownClientStorageEnvironment;
  } = {},
): LegacyDeviceRetirementPort {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const records = new Map<string, RetainedItem>();
  let lastInventory: LegacyRetirementInventory | null = null;

  async function inspect(
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ): Promise<LegacyRetirementInventory> {
    assertIdentity(identity);
    throwIfAborted(signal);
    const databaseNames = await readDatabaseNames(options.databaseNames);
    throwIfAborted(signal);
    const exactOwnerDatabaseName = legacyOwnerDatabaseName(
      identity.ownerVaultBinding,
    );
    const [sharedPresent, ownerPresent, controlPresent] = databaseNames
      ? [
          databaseNames.includes(LEGACY_SHARED_DATABASE_NAME),
          databaseNames.includes(exactOwnerDatabaseName),
          databaseNames.includes(LEGACY_CONTROL_DATABASE_NAME),
        ]
      : await Promise.all([
          Dexie.exists(LEGACY_SHARED_DATABASE_NAME),
          Dexie.exists(exactOwnerDatabaseName),
          Dexie.exists(LEGACY_CONTROL_DATABASE_NAME),
        ]);
    const foreignBindingCount = databaseNames
      ? databaseNames.filter(
          (name) =>
            name.startsWith("overgarden-offline-owner-v1-") &&
            name !== exactOwnerDatabaseName,
        ).length
      : controlPresent
        ? await countForeignControlBindings(identity.ownerVaultBinding)
        : 0;
    const capability: LegacyRetirementInventory["capability"] = databaseNames
      ? "enumeration_available"
      : controlPresent
        ? "registry_fallback"
        : "enumeration_unavailable";

    if (!sharedPresent && !ownerPresent && !controlPresent) {
      records.clear();
      const inventory: LegacyRetirementInventory = {
        items: [],
        bounded: false,
        foreignBindingCount,
        foreignOwnerResidueCount: 0,
        capability,
      };
      lastInventory = inventory;
      return inventory;
    }

    const fence = await acquireRetirementFence(
      identity.ownerVaultBinding,
      signal,
    );
    const nextRecords = new Map<string, RetainedItem>();
    let ownerDatabase: OwnerVaultDb | null = null;
    let sharedDatabase: SharedRetirementDatabase | null = null;
    try {
      const sources: Array<{
        kind: DatabaseKind;
        database: RetirementDatabase;
      }> = [];
      let unattributableSharedResidue = false;
      if (sharedPresent) {
        sharedDatabase = await openSharedRetirementDatabase();
        if (sharedDatabase.status === "claimable") {
          sources.push({
            kind: "shared",
            database: sharedDatabase.database,
          });
        } else {
          unattributableSharedResidue = true;
        }
      }
      if (ownerPresent) {
        ownerDatabase = new OwnerVaultDb(identity.ownerVaultBinding);
        await ownerDatabase.open();
        sources.push({
          kind: "owner",
          database: retirementDatabaseFromOwnerVault(ownerDatabase),
        });
      }

      let foreignOwnerResidueCount = unattributableSharedResidue ? 1 : 0;
      for (const source of sources) {
        const read = await readCurrentOwnerSource(
          source.database,
          source.kind,
          identity.ownerUserId,
          signal,
        );
        foreignOwnerResidueCount += read.foreignRows;
        for (const retained of read.items) {
          const token = await opaqueItemToken(
            retained,
            identity.ownerVaultBinding,
          );
          if (nextRecords.has(token)) {
            throw new LegacyRetirementPortError(
              "conflict_blocked",
              "duplicate_source_token",
            );
          }
          nextRecords.set(token, retained);
        }
      }
      const bounded = nextRecords.size > MAX_RETIREMENT_ITEMS;
      const selected = [...nextRecords.entries()].slice(
        0,
        MAX_RETIREMENT_ITEMS,
      );
      records.clear();
      for (const [token, retained] of selected) records.set(token, retained);
      const items = selected.map(([token, retained]) =>
        retirementItem(token, retained),
      );
      const counts = rowCounts(selected.map(([, item]) => item));
      const digest = (
        await fingerprintOwnerVaultPayload(
          selected.map(([token, retained]) => ({
            token,
            type: retained.type,
            digest: retained.digest,
          })),
        )
      ).storedDigest;
      await finalizeOwnerVaultExclusiveFence(fence, {
        state: bounded ? "conflict_blocked" : "active",
        counts,
        digest,
        sourceCleanupConfirmed: false,
      });
      const inventory: LegacyRetirementInventory = {
        items,
        bounded,
        foreignBindingCount,
        foreignOwnerResidueCount,
        capability,
      };
      lastInventory = inventory;
      return inventory;
    } catch (error) {
      await abandonOwnerVaultExclusiveFence(fence).catch(() => undefined);
      throw normalizeAdapterError(error);
    } finally {
      closeSharedRetirementDatabase(sharedDatabase);
      ownerDatabase?.close();
    }
  }

  async function assertSession(
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ) {
    throwIfAborted(signal);
    const binding = await fetchAuthenticatedOwnerVaultBinding(
      identity.sessionGeneration,
      fetchImpl,
    );
    throwIfAborted(signal);
    return binding === identity.ownerVaultBinding;
  }

  async function transferAndVerify(
    item: LegacyRetirementItem,
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
    divergenceChoice?: "device" | "server",
  ): Promise<LegacyRetirementTransferResult> {
    assertIdentity(identity);
    const retained = requireRetainedItem(records, item);
    if (!(await assertSession(identity, signal))) {
      throw new LegacyRetirementPortError("session_changed", "session_changed");
    }
    if (retained.type === "draft") {
      return transferDraft(
        item,
        retained,
        identity,
        fetchImpl,
        signal,
        divergenceChoice,
      );
    }
    return transferMutation(item, retained, identity, fetchImpl, signal);
  }

  async function deleteVerifiedBatch(
    items: LegacyRetirementItem[],
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ) {
    assertIdentity(identity);
    if (!(await assertSession(identity, signal))) {
      throw new LegacyRetirementPortError("session_changed", "session_changed");
    }
    const retained = items.map((item) => requireRetainedItem(records, item));
    await deleteExactRetainedItems(retained, identity, signal);
    for (const item of items) records.delete(item.token);
  }

  async function discardCurrentOwner(
    items: LegacyRetirementItem[],
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ) {
    assertIdentity(identity);
    if (!(await assertSession(identity, signal))) {
      throw new LegacyRetirementPortError("session_changed", "session_changed");
    }
    const retained = items.map((item) => requireRetainedItem(records, item));
    await deleteExactRetainedItems(retained, identity, signal);
    for (const item of items) records.delete(item.token);
  }

  async function finalize(
    identity: LegacyRetirementIdentity,
    signal: AbortSignal,
  ) {
    assertIdentity(identity);
    if (!(await assertSession(identity, signal))) {
      throw new LegacyRetirementPortError("session_changed", "session_changed");
    }
    if (records.size > 0) {
      throw new LegacyRetirementPortError(
        "conflict_blocked",
        "unresolved_source_items",
      );
    }
    const environment =
      options.storageEnvironment ?? browserKnownClientStorageEnvironment();
    try {
      const result = await finalizeKnownClientStorage(
        identity,
        environment,
        signal,
      );
      return {
        status: "completed" as const,
        absenceReads: 2 as const,
        foreignOwnerResidue: result.foreignOwnerResidue,
        foreignOrOrphanRetained:
          result.foreignOrOrphanRetained ||
          Boolean(lastInventory?.foreignBindingCount),
      };
    } catch (error) {
      if (error instanceof KnownClientStorageError) {
        throw new LegacyRetirementPortError("deletion_blocked", error.code);
      }
      throw normalizeAdapterError(error);
    }
  }

  return {
    inspect,
    assertSession,
    transferAndVerify,
    deleteVerifiedBatch,
    discardCurrentOwner,
    finalize,
  };
}

async function transferDraft(
  item: LegacyRetirementItem,
  retained: RetainedDraft,
  identity: LegacyRetirementIdentity,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  divergenceChoice?: "device" | "server",
): Promise<LegacyRetirementTransferResult> {
  const media = await resolveDraftMedia(
    item.token,
    retained.row.payload,
    identity,
    fetchImpl,
    signal,
  );
  const projection = legacyDraftToServerPayload(retained.row, media);
  const owner = createOnlineJournalDraftOwner({
    draftKey: projection.draftKey,
    draftKind: projection.draftKind,
    context: projection.context,
    documentMutationGeneration: identity.documentMutationGeneration,
    fetchImpl,
    deadlineMs: 30_000,
  });
  const current = await owner.hydrate();
  throwIfAborted(signal);
  const payloadSha256 = await journalDraftPayloadSha256(projection.payload);
  if (current && current.payloadSha256 !== payloadSha256) {
    if (!divergenceChoice) {
      return {
        status: "divergent_copy",
        deviceUpdatedAt: retained.row.updatedAt,
        serverUpdatedAt: Date.parse(current.updatedAt) || 0,
      };
    }
    if (divergenceChoice === "server") return { status: "verified" };
  }
  const expectedServerRevision = current?.serverRevision ?? null;
  const generation = current
    ? current.payloadSha256 === payloadSha256
      ? current.generation
      : Math.max(retained.generation, current.generation + 1)
    : retained.generation;
  const saved =
    current?.payloadSha256 === payloadSha256
      ? current
      : await owner.save(projection.payload, {
          generation,
          expectedServerRevision,
        });
  const readback = await owner.hydrate();
  if (
    !readback ||
    readback.payloadSha256 !== payloadSha256 ||
    readback.serverRevision !== saved.serverRevision
  ) {
    throw new LegacyRetirementPortError(
      "failed_retryable",
      "draft_readback_unconfirmed",
    );
  }
  return { status: "verified" };
}

async function transferMutation(
  item: LegacyRetirementItem,
  retained: RetainedMutation,
  identity: LegacyRetirementIdentity,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<LegacyRetirementTransferResult> {
  const mutationId = requireStableIdentity(retained.row.idempotencyKey);
  const payload = retained.row.payload as Partial<OfflineJournalEntryPayload>;
  const contentBearing =
    retained.row.kind === "journal_entry" &&
    typeof payload.title === "string" &&
    typeof payload.body === "string";
  if (retained.row.kind === "photo_upload") {
    throw new LegacyRetirementPortError(
      "failed_retryable",
      "legacy_photo_upload_shape_unsupported",
    );
  }
  if (contentBearing) {
    const resolved = await resolveMutationMedia(
      item.token,
      retained.row,
      identity,
      fetchImpl,
      signal,
    );
    const request = legacyMutationToOnlineRequest(
      { ...retained.row, payload: resolved.payload },
      resolved.primaryMediaAssetId,
    );
    const response = await fetchImpl("/api/garden/entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [AUTH_INTENT_RETURN_HEADER]: journalEntryAuthReturnTo(
          resolved.payload as OfflineJournalEntryPayload,
        ),
        [DOCUMENT_MUTATION_GENERATION_HEADER]:
          identity.documentMutationGeneration,
        [ONLINE_JOURNAL_PROTOCOL_HEADER]: ONLINE_JOURNAL_PROTOCOL,
      },
      body: JSON.stringify(request),
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    const body = await responseRecord(response);
    if (
      !response.ok ||
      !isRecord(body.entry) ||
      body.entry.clientMutationId !== mutationId
    ) {
      throw new LegacyRetirementPortError(
        response.status === 409 ? "conflict_blocked" : "failed_retryable",
        response.status === 409
          ? "journal_mutation_conflict"
          : "journal_mutation_unavailable",
      );
    }
  }
  await verifyJournalMutationReceipt(mutationId, identity, fetchImpl, signal);
  return { status: "verified" };
}

async function verifyJournalMutationReceipt(
  clientMutationId: string,
  identity: LegacyRetirementIdentity,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
) {
  const response = await fetchImpl(
    `/api/garden/entries?clientMutationId=${encodeURIComponent(clientMutationId)}`,
    {
      method: "GET",
      headers: {
        [DOCUMENT_MUTATION_GENERATION_HEADER]:
          identity.documentMutationGeneration,
      },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    },
  );
  const body = await responseRecord(response);
  if (
    !response.ok ||
    !isRecord(body.entry) ||
    body.entry.clientMutationId !== clientMutationId ||
    typeof body.entry.id !== "string"
  ) {
    throw new LegacyRetirementPortError(
      "failed_retryable",
      "journal_receipt_unconfirmed",
    );
  }
}

async function resolveDraftMedia(
  itemToken: string,
  payload: JournalDraftPayload,
  identity: LegacyRetirementIdentity,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<DraftMediaResolution> {
  const inlineMediaIds = new Map<string, string>();
  for (const [provisionalId, intent] of Object.entries(
    payload.photoIntentsByBlockId ?? {},
  ).sort(([left], [right]) => left.localeCompare(right))) {
    const uploaded = await uploadLegacyPhotoIntent(
      itemToken,
      `inline:${provisionalId}`,
      intent,
      identity,
      fetchImpl,
      signal,
    );
    inlineMediaIds.set(provisionalId, uploaded);
  }
  const primaryMediaAssetId = payload.photoIntent
    ? await uploadLegacyPhotoIntent(
        itemToken,
        "primary",
        payload.photoIntent,
        identity,
        fetchImpl,
        signal,
      )
    : (inlineMediaIds.values().next().value ?? null);
  const coverMediaAssetId =
    payload.cover?.mode === "separate" && payload.cover.photoIntent
      ? await uploadLegacyPhotoIntent(
          itemToken,
          "cover",
          payload.cover.photoIntent,
          identity,
          fetchImpl,
          signal,
        )
      : null;
  return { primaryMediaAssetId, inlineMediaIds, coverMediaAssetId };
}

async function resolveMutationMedia(
  itemToken: string,
  mutation: OfflineMutation,
  identity: LegacyRetirementIdentity,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
) {
  const payload = mutation.payload as OfflineJournalEntryPayload;
  const inlineMediaIds = new Map<string, string>();
  for (const [provisionalId, intent] of Object.entries(
    payload.photoIntentsByBlockId ?? {},
  ).sort(([left], [right]) => left.localeCompare(right))) {
    inlineMediaIds.set(
      provisionalId,
      await uploadLegacyPhotoIntent(
        itemToken,
        `inline:${provisionalId}`,
        intent,
        identity,
        fetchImpl,
        signal,
      ),
    );
  }
  let primaryMediaAssetId = payload.processedMediaAssetId ?? null;
  if (!primaryMediaAssetId && payload.photoIntent) {
    primaryMediaAssetId = await uploadLegacyPhotoIntent(
      itemToken,
      "primary",
      payload.photoIntent,
      identity,
      fetchImpl,
      signal,
    );
  }
  if (!primaryMediaAssetId) {
    primaryMediaAssetId = inlineMediaIds.values().next().value ?? null;
  }
  let cover = payload.cover;
  if (cover?.mode === "separate" && !cover.mediaAssetId && cover.photoIntent) {
    cover = {
      mode: "separate",
      mediaAssetId: await uploadLegacyPhotoIntent(
        itemToken,
        "cover",
        cover.photoIntent,
        identity,
        fetchImpl,
        signal,
      ),
      photoIntent: null,
    };
  } else if (
    cover?.mode === "explicit_inline" &&
    inlineMediaIds.has(cover.mediaAssetId)
  ) {
    cover = {
      mode: "explicit_inline",
      mediaAssetId: inlineMediaIds.get(cover.mediaAssetId)!,
    };
  }
  const contentDocument =
    payload.contentDocument && inlineMediaIds.size > 0
      ? remapJournalDocumentMediaAssetIds(
          payload.contentDocument as never,
          inlineMediaIds,
        )
      : payload.contentDocument;
  return {
    primaryMediaAssetId,
    payload: {
      ...payload,
      contentDocument,
      cover,
      photoIntent: null,
      photoIntentsByBlockId: undefined,
      processedMediaAssetId: primaryMediaAssetId,
    } as OfflineJournalEntryPayload,
  };
}

async function uploadLegacyPhotoIntent(
  itemToken: string,
  slot: string,
  intent: OfflinePhotoIntent,
  identity: LegacyRetirementIdentity,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
) {
  const result = await uploadOnlineComposerPhoto({
    intent: intent as OnlineComposerPhotoIntent,
    stableUploadGenerationId: await stableRetirementUploadGenerationId(
      itemToken,
      slot,
    ),
    authReturnTo: "/garden",
    documentMutationGeneration: identity.documentMutationGeneration,
    fetchImpl,
    signal,
    deadlineMs: 30_000,
  });
  return result.mediaAssetId;
}

async function readCurrentOwnerSource(
  database: RetirementDatabase,
  kind: DatabaseKind,
  ownerUserId: string,
  signal: AbortSignal,
) {
  throwIfAborted(signal);
  const [drafts, mutations, totalCounts, currentCounts, durability] =
    await Promise.all([
      database.drafts.where("ownerUserId").equals(ownerUserId).toArray(),
      database.mutations.where("ownerUserId").equals(ownerUserId).toArray(),
      countAllRows(database),
      countOwnerRows(database, ownerUserId),
      database.composerDurability
        ? database.composerDurability
            .where("ownerUserId")
            .equals(ownerUserId)
            .toArray()
        : Promise.resolve([]),
    ]);
  throwIfAborted(signal);
  const generations = new Map(
    durability.map((record) => [record.draftId, record.generation]),
  );
  const items: RetainedItem[] = [];
  for (const row of drafts as JournalDraftRecord[]) {
    items.push({
      type: "draft",
      database: kind,
      row,
      generation: Math.max(1, generations.get(row.id) ?? 1),
      digest: (await fingerprintOwnerVaultPayload(row)).storedDigest,
    });
  }
  for (const row of mutations) {
    items.push({
      type: "mutation",
      database: kind,
      row,
      digest: (await fingerprintOwnerVaultPayload(row)).storedDigest,
    });
  }
  return {
    items,
    foreignRows: Object.keys(totalCounts).reduce(
      (total, table) =>
        total +
        Math.max(
          0,
          totalCounts[table as keyof OwnerVaultRowCounts] -
            currentCounts[table as keyof OwnerVaultRowCounts],
        ),
      0,
    ),
  };
}

async function deleteExactRetainedItems(
  retained: RetainedItem[],
  identity: LegacyRetirementIdentity,
  signal: AbortSignal,
) {
  const fence = await acquireRetirementFence(
    identity.ownerVaultBinding,
    signal,
  );
  let ownerDatabase: OwnerVaultDb | null = null;
  let sharedDatabase: SharedRetirementDatabase | null = null;
  try {
    const byDatabase = new Map<DatabaseKind, RetainedItem[]>([
      ["shared", retained.filter(({ database }) => database === "shared")],
      ["owner", retained.filter(({ database }) => database === "owner")],
    ]);
    for (const [kind, items] of byDatabase) {
      if (items.length === 0) continue;
      let database: RetirementDatabase;
      if (kind === "shared") {
        sharedDatabase = await openSharedRetirementDatabase();
        if (sharedDatabase.status !== "claimable") throw storageUnavailable();
        database = sharedDatabase.database;
      } else {
        ownerDatabase ??= new OwnerVaultDb(identity.ownerVaultBinding);
        await ownerDatabase.open();
        database = retirementDatabaseFromOwnerVault(ownerDatabase);
      }
      await deleteItemsFromDatabase(
        database,
        items,
        identity.ownerUserId,
        signal,
      );
    }
    await finalizeOwnerVaultExclusiveFence(fence, {
      state: "active",
      counts: emptyCounts(),
      digest: "0".repeat(64),
      sourceCleanupConfirmed: false,
    });
  } catch (error) {
    await abandonOwnerVaultExclusiveFence(fence).catch(() => undefined);
    throw normalizeAdapterError(error);
  } finally {
    closeSharedRetirementDatabase(sharedDatabase);
    ownerDatabase?.close();
  }
}

async function deleteItemsFromDatabase(
  database: RetirementDatabase,
  items: RetainedItem[],
  ownerUserId: string,
  signal: AbortSignal,
) {
  const transactionTables = [
    database.drafts,
    database.mutations,
    database.draftSummaries,
    database.mutationSummaries,
    database.composerDurability,
  ].filter((table): table is Table => Boolean(table));
  await database.connection.transaction("rw", transactionTables, async () => {
    for (const item of items) {
      throwIfAborted(signal);
      if (item.type === "draft") {
        const current = await database.drafts.get([ownerUserId, item.row.id]);
        if (current) {
          const digest = await Dexie.waitFor(
            fingerprintOwnerVaultPayload(current),
          );
          if (digest.storedDigest !== item.digest) throw sourceChanged();
          await database.drafts.delete([ownerUserId, item.row.id]);
        }
        await Promise.all([
          database.draftSummaries?.delete([ownerUserId, item.row.id]),
          database.composerDurability?.delete([ownerUserId, item.row.id]),
        ]);
      } else {
        const current = await database.mutations.get(item.row.id);
        if (current) {
          if (current.ownerUserId !== ownerUserId) throw anotherAccount();
          const digest = await Dexie.waitFor(
            fingerprintOwnerVaultPayload(current),
          );
          if (digest.storedDigest !== item.digest) throw sourceChanged();
          await database.mutations.delete(item.row.id);
        }
        await database.mutationSummaries?.delete([ownerUserId, item.row.id]);
      }
    }
  });
}

async function finalizeKnownClientStorage(
  identity: LegacyRetirementIdentity,
  environment: KnownClientStorageEnvironment,
  signal: AbortSignal,
) {
  const exactOwnerName = legacyOwnerDatabaseName(identity.ownerVaultBinding);
  let foreignOwnerResidue = false;
  const inventory = await inventoryKnownClientStorage(environment);
  if (inventory.databaseEnumeration !== "available") {
    throw new KnownClientStorageError("indexeddb_enumeration_unavailable");
  }
  const foreignOwnerDatabaseRetained = inventory.databaseNames.some(
    (name) =>
      name.startsWith("overgarden-offline-owner-v1-") &&
      name !== exactOwnerName,
  );
  const currentStoragePresent = inventory.databaseNames.some((name) =>
    [
      exactOwnerName,
      LEGACY_SHARED_DATABASE_NAME,
      LEGACY_CONTROL_DATABASE_NAME,
    ].includes(name),
  );
  if (!currentStoragePresent) {
    await unregisterLegacyOverGardenServiceWorkers(environment);
    await assertKnownClientStorageAbsentTwice(
      [
        exactOwnerName,
        LEGACY_SHARED_DATABASE_NAME,
        LEGACY_CONTROL_DATABASE_NAME,
      ],
      environment,
    );
    return {
      foreignOwnerResidue: false,
      foreignOrOrphanRetained: foreignOwnerDatabaseRetained,
    };
  }
  const fence = await acquireRetirementFence(
    identity.ownerVaultBinding,
    signal,
  );
  let ownerDatabase: OwnerVaultDb | null = null;
  let sharedDatabase: SharedRetirementDatabase | null = null;
  try {
    const sources: Array<{
      name: string;
      database: RetirementDatabase;
      close: () => void;
    }> = [];
    if (inventory.databaseNames.includes(exactOwnerName)) {
      ownerDatabase = new OwnerVaultDb(identity.ownerVaultBinding);
      await ownerDatabase.open();
      sources.push({
        name: exactOwnerName,
        database: retirementDatabaseFromOwnerVault(ownerDatabase),
        close: () => ownerDatabase?.close(),
      });
    }
    if (inventory.databaseNames.includes(LEGACY_SHARED_DATABASE_NAME)) {
      sharedDatabase = await openSharedRetirementDatabase();
      if (sharedDatabase.status === "claimable") {
        sources.push({
          name: LEGACY_SHARED_DATABASE_NAME,
          database: sharedDatabase.database,
          close: () => closeSharedRetirementDatabase(sharedDatabase),
        });
      } else {
        foreignOwnerResidue = true;
        closeSharedRetirementDatabase(sharedDatabase);
        sharedDatabase = null;
      }
    }
    const deletable: string[] = [];
    for (const source of sources) {
      const current = await countOwnerRows(
        source.database,
        identity.ownerUserId,
      );
      if (current.mutations > 0 || current.drafts > 0) {
        throw new LegacyRetirementPortError(
          "conflict_blocked",
          "unverified_source_items",
        );
      }
      await deleteOwnerMetadata(source.database, identity.ownerUserId);
      const total = await countAllRows(source.database);
      if (sumCounts(total) === 0) deletable.push(source.name);
      else if (source.name === LEGACY_SHARED_DATABASE_NAME) {
        foreignOwnerResidue = true;
      }
    }
    await finalizeOwnerVaultExclusiveFence(fence, {
      state: "retirement_resolved",
      counts: emptyCounts(),
      digest: "0".repeat(64),
      sourceCleanupConfirmed: true,
    });
    for (const source of sources) source.close();
    for (const name of deletable) {
      await deleteKnownIndexedDatabase(name, environment, { signal });
    }
  } catch (error) {
    closeSharedRetirementDatabase(sharedDatabase);
    ownerDatabase?.close();
    await abandonOwnerVaultExclusiveFence(fence).catch(() => undefined);
    throw error;
  }

  await unregisterLegacyOverGardenServiceWorkers(environment);
  const control = new OwnerVaultControlDb();
  await control.open();
  const records = await control.vaults.toArray();
  const foreign = records.filter(
    ({ binding }) => binding !== identity.ownerVaultBinding,
  );
  await control.transaction("rw", control.vaults, async () => {
    await control.vaults.delete(identity.ownerVaultBinding);
    for (const record of foreign) {
      await control.vaults.put({
        ...record,
        state: "foreign_or_orphan_retained",
        operationId: undefined,
        leaseExpiresAt: undefined,
        updatedAt: Date.now(),
      });
    }
  });
  const foreignOrOrphanRetained =
    foreign.length > 0 || foreignOwnerDatabaseRetained;
  control.close();
  const expectedAbsent = [exactOwnerName];
  if (!foreignOwnerResidue) expectedAbsent.push(LEGACY_SHARED_DATABASE_NAME);
  if (!foreignOrOrphanRetained) {
    await deleteKnownIndexedDatabase(
      LEGACY_CONTROL_DATABASE_NAME,
      environment,
      {
        signal,
      },
    );
    expectedAbsent.push(LEGACY_CONTROL_DATABASE_NAME);
  }
  await assertKnownClientStorageAbsentTwice(expectedAbsent, environment);
  return { foreignOwnerResidue, foreignOrOrphanRetained };
}

async function deleteOwnerMetadata(
  database: RetirementDatabase,
  ownerUserId: string,
) {
  const tables = [
    database.mutationSummaries,
    database.draftSummaries,
    database.composerDurability,
    database.ownerActivity,
  ].filter((table): table is Table => Boolean(table));
  if (tables.length === 0) return;
  await database.connection.transaction("rw", tables, async () => {
    await Promise.all([
      database.mutationSummaries
        ?.where("ownerUserId")
        .equals(ownerUserId)
        .delete(),
      database.draftSummaries
        ?.where("ownerUserId")
        .equals(ownerUserId)
        .delete(),
      database.composerDurability
        ?.where("ownerUserId")
        .equals(ownerUserId)
        .delete(),
      database.ownerActivity?.delete(ownerUserId),
    ]);
  });
}

function firstDraftProjection(
  record: OfflineDraftRecord<FirstEntryDraftPayload>,
  media: DraftMediaResolution,
): LegacyDraftServerProjection {
  const source = record.payload;
  const draft = source.draft;
  requireDraftText(
    source.clientMutationId,
    draft.title,
    draft.body,
    draft.entryDate,
  );
  const contentDocument = remappedDocument(
    draft.contentDocument,
    media.inlineMediaIds,
  );
  return {
    draftKey: "first-entry",
    draftKind: "first_entry",
    context: { spaceId: draft.spaceId ?? null },
    payload: {
      schemaVersion: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
      draftKind: "first_entry",
      request: {
        target: "first_plant_entry",
        spaceId: draft.spaceId ?? null,
        spaceName: draft.spaceName,
        plantName: draft.plantName,
        objectKind: draft.objectKind,
        catalogItemId: source.selectedCatalogItem?.id ?? null,
        userAddedCatalogName: source.userAddedCatalogName,
        varietyText:
          source.selectedCatalogItem?.displayName ??
          source.userAddedCatalogName ??
          null,
        title: draft.title,
        body: draft.body,
        contentDocument,
        entryDate: draft.entryDate,
        locationVisibility: draft.locationVisibility,
        coarseRegionCode:
          draft.locationVisibility === "region" ? draft.coarseRegionCode : null,
        clientMutationId: source.clientMutationId,
        activationSource: source.activationSource,
        syncStatus: "online",
        mentionSelections: source.mentionSelections ?? [],
        topicTags: normalizeJournalTopicTagLabels(source.topicTagInput),
        mediaAssetId: media.primaryMediaAssetId ?? null,
        cover: resolvedDraftCover(source, media),
      },
      composerState: {
        catalogQuery: source.catalogQuery,
        selectedCatalogItem: source.selectedCatalogItem,
        userAddedCatalogName: source.userAddedCatalogName,
        topicTagInput: source.topicTagInput,
      },
    },
  };
}

function followUpDraftProjection(
  record: OfflineDraftRecord<FollowUpEntryDraftPayload>,
  media: DraftMediaResolution,
): LegacyDraftServerProjection {
  const source = record.payload;
  const draft = source.draft;
  requireDraftText(
    source.clientMutationId,
    draft.title,
    draft.body,
    draft.entryDate,
  );
  if (!UUID.test(source.plantObjectId)) throw corruptLegacyItem();
  return {
    draftKey: `follow-up-entry:${source.plantObjectId}`,
    draftKind: "follow_up",
    context: { plantObjectId: source.plantObjectId },
    payload: {
      schemaVersion: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
      draftKind: "follow_up",
      request: {
        target: "plant_object_entry",
        plantObjectId: source.plantObjectId,
        title: draft.title,
        body: draft.body,
        contentDocument: remappedDocument(
          draft.contentDocument,
          media.inlineMediaIds,
        ),
        entryDate: draft.entryDate,
        clientMutationId: source.clientMutationId,
        syncStatus: "online",
        mentionSelections: source.mentionSelections ?? [],
        topicTags: normalizeJournalTopicTagLabels(source.topicTagInput),
        mediaAssetId: media.primaryMediaAssetId ?? null,
        cover: resolvedDraftCover(source, media),
      },
      composerState: { topicTagInput: source.topicTagInput },
    },
  };
}

function spaceDraftProjection(
  record: OfflineDraftRecord<SpaceEntryDraftPayload>,
  media: DraftMediaResolution,
): LegacyDraftServerProjection {
  const source = record.payload;
  const draft = source.draft;
  requireDraftText(
    source.clientMutationId,
    draft.title,
    draft.body,
    draft.entryDate,
  );
  if (!UUID.test(source.spaceId)) throw corruptLegacyItem();
  return {
    draftKey: `space-entry:${source.spaceId}`,
    draftKind: "space_entry",
    context: { spaceId: source.spaceId },
    payload: {
      schemaVersion: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
      draftKind: "space_entry",
      request: {
        target: "space_entry",
        spaceId: source.spaceId,
        mentionedPlantObjectIds: source.mentionedPlantObjectIds,
        title: draft.title,
        body: draft.body,
        contentDocument: remappedDocument(
          draft.contentDocument,
          media.inlineMediaIds,
        ),
        entryDate: draft.entryDate,
        clientMutationId: source.clientMutationId,
        syncStatus: "online",
        topicTags: normalizeJournalTopicTagLabels(source.topicTagInput),
        mediaAssetId: media.primaryMediaAssetId ?? null,
        cover: resolvedDraftCover(source, media),
      },
    },
  };
}

function resolvedDraftCover(
  payload: JournalDraftPayload,
  media: DraftMediaResolution,
): FirstPlantEntryRequest["cover"] {
  const cover = payload.cover;
  if (!cover || cover.mode === "automatic") return { mode: "automatic" };
  if (cover.mode === "none") return { mode: "none" };
  if (cover.mode === "separate") {
    const mediaAssetId = cover.mediaAssetId ?? media.coverMediaAssetId;
    return mediaAssetId
      ? { mode: "separate", mediaAssetId }
      : { mode: "automatic" };
  }
  const remapped = media.inlineMediaIds?.get(cover.mediaAssetId);
  return {
    mode: cover.mode,
    mediaAssetId: remapped ?? cover.mediaAssetId,
  };
}

function remappedDocument(
  document: unknown,
  mediaIds: Map<string, string> | undefined,
) {
  return document && mediaIds?.size
    ? remapJournalDocumentMediaAssetIds(document as never, mediaIds)
    : (document as never);
}

async function acquireRetirementFence(binding: string, signal: AbortSignal) {
  const fence = await acquireOwnerVaultExclusiveFence(binding, "copying");
  if (!fence) {
    throw new LegacyRetirementPortError(
      "conflict_blocked",
      "retirement_fence_busy",
    );
  }
  const settled = await waitForOwnerVaultWritersToSettle(fence, { signal });
  if (!settled) {
    await abandonOwnerVaultExclusiveFence(fence);
    throw new LegacyRetirementPortError(
      "conflict_blocked",
      "writer_drain_timeout",
    );
  }
  return fence;
}

function retirementDatabaseFromOwnerVault(
  database: OwnerVaultDb,
): RetirementDatabase {
  return {
    connection: database,
    mutations: database.mutations,
    drafts: database.drafts,
    mutationSummaries: database.mutationSummaries,
    draftSummaries: database.draftSummaries,
    composerDurability: database.composerDurability,
    ownerActivity: database.ownerActivity,
  };
}

async function openSharedRetirementDatabase(): Promise<SharedRetirementDatabase> {
  const connection = new Dexie(LEGACY_SHARED_DATABASE_NAME);
  try {
    // Dynamic mode opens the installed schema at its existing version. It does
    // not run the former v3/v5 upgrade writers while the retirement bridge is
    // inspecting a returning device.
    await connection.open();
    if (connection.verno < 3) {
      return { status: "unattributable", connection };
    }
    const tableNames = new Set(connection.tables.map(({ name }) => name));
    if (!tableNames.has("mutations") || !tableNames.has("drafts")) {
      throw storageUnavailable();
    }
    return {
      status: "claimable",
      database: {
        connection,
        mutations: connection.table<OfflineMutation, string>("mutations"),
        drafts: connection.table<OfflineDraftRecord, [string, string]>(
          "drafts",
        ),
        mutationSummaries: tableNames.has("mutationSummaries")
          ? connection.table<OfflineMutationSummary, [string, string]>(
              "mutationSummaries",
            )
          : undefined,
        draftSummaries: tableNames.has("draftSummaries")
          ? connection.table<OfflineDraftSummary, [string, string]>(
              "draftSummaries",
            )
          : undefined,
        composerDurability: tableNames.has("composerDurability")
          ? connection.table<OfflineComposerDurabilityRecord, [string, string]>(
              "composerDurability",
            )
          : undefined,
        ownerActivity: tableNames.has("ownerActivity")
          ? connection.table<OfflineOwnerActivity, string>("ownerActivity")
          : undefined,
      },
    };
  } catch (error) {
    connection.close();
    throw error;
  }
}

function closeSharedRetirementDatabase(
  database: SharedRetirementDatabase | null,
) {
  if (!database) return;
  if (database.status === "claimable") database.database.connection.close();
  else database.connection.close();
}

async function readDatabaseNames(
  injected?: () => Promise<string[] | null>,
): Promise<string[] | null> {
  if (injected) return injected();
  const factory = indexedDB as IDBFactory & {
    databases?: () => Promise<IDBDatabaseInfo[]>;
  };
  if (typeof factory.databases !== "function") return null;
  return (await factory.databases())
    .map(({ name }) => name)
    .filter((name): name is string => typeof name === "string");
}

async function countForeignControlBindings(currentBinding: string) {
  const control = new OwnerVaultControlDb();
  try {
    await control.open();
    return await control.vaults
      .filter(({ binding }) => binding !== currentBinding)
      .count();
  } finally {
    control.close();
  }
}

async function countAllRows(database: RetirementDatabase) {
  const values = await Promise.all([
    database.mutations.count(),
    database.drafts.count(),
    database.mutationSummaries?.count() ?? 0,
    database.draftSummaries?.count() ?? 0,
    database.composerDurability?.count() ?? 0,
    database.ownerActivity?.count() ?? 0,
  ]);
  return countsFromValues(values);
}

async function countOwnerRows(
  database: RetirementDatabase,
  ownerUserId: string,
) {
  const values = await Promise.all([
    database.mutations.where("ownerUserId").equals(ownerUserId).count(),
    database.drafts.where("ownerUserId").equals(ownerUserId).count(),
    database.mutationSummaries
      ?.where("ownerUserId")
      .equals(ownerUserId)
      .count() ?? 0,
    database.draftSummaries?.where("ownerUserId").equals(ownerUserId).count() ??
      0,
    database.composerDurability
      ?.where("ownerUserId")
      .equals(ownerUserId)
      .count() ?? 0,
    database.ownerActivity?.where("ownerUserId").equals(ownerUserId).count() ??
      0,
  ]);
  return countsFromValues(values);
}

function countsFromValues(values: number[]): OwnerVaultRowCounts {
  return {
    mutations: values[0] ?? 0,
    drafts: values[1] ?? 0,
    mutationSummaries: values[2] ?? 0,
    draftSummaries: values[3] ?? 0,
    composerDurability: values[4] ?? 0,
    ownerActivity: values[5] ?? 0,
  };
}

function rowCounts(items: RetainedItem[]): OwnerVaultRowCounts {
  return {
    ...emptyCounts(),
    mutations: items.filter(({ type }) => type === "mutation").length,
    drafts: items.filter(({ type }) => type === "draft").length,
  };
}

function emptyCounts(): OwnerVaultRowCounts {
  return {
    mutations: 0,
    drafts: 0,
    mutationSummaries: 0,
    draftSummaries: 0,
    composerDurability: 0,
    ownerActivity: 0,
  };
}

function sumCounts(counts: OwnerVaultRowCounts) {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

async function opaqueItemToken(item: RetainedItem, ownerVaultBinding: string) {
  const digest = (
    await fingerprintOwnerVaultPayload({
      ownerVaultBinding,
      database: item.database,
      type: item.type,
      sourceId: item.row.id,
      digest: item.digest,
    })
  ).storedDigest;
  return `r-${digest.slice(0, 48)}`;
}

function retirementItem(
  token: string,
  retained: RetainedItem,
): LegacyRetirementItem {
  return {
    token,
    kind:
      retained.type === "draft"
        ? "draft"
        : retained.row.kind === "photo_upload"
          ? "photo_upload"
          : retained.row.status === "synced" &&
              !isContentBearingMutation(retained.row)
            ? "synced_receipt"
            : "mutation",
    mediaIntentCount: countMediaIntents(retained.row.payload),
    updatedAt: retained.row.updatedAt,
  };
}

function countMediaIntents(payload: unknown) {
  if (!isRecord(payload)) return 0;
  const inline = isRecord(payload.photoIntentsByBlockId)
    ? Object.keys(payload.photoIntentsByBlockId).length
    : 0;
  const cover =
    isRecord(payload.cover) && isRecord(payload.cover.photoIntent) ? 1 : 0;
  return inline + (isRecord(payload.photoIntent) ? 1 : 0) + cover;
}

function isContentBearingMutation(mutation: OfflineMutation) {
  return (
    isRecord(mutation.payload) &&
    typeof mutation.payload.title === "string" &&
    typeof mutation.payload.body === "string"
  );
}

function requireRetainedItem(
  records: Map<string, RetainedItem>,
  item: LegacyRetirementItem,
) {
  const retained = records.get(item.token);
  if (!retained || retirementItem(item.token, retained).kind !== item.kind) {
    throw new LegacyRetirementPortError(
      "conflict_blocked",
      "retirement_item_stale",
    );
  }
  return retained;
}

function assertIdentity(identity: LegacyRetirementIdentity) {
  if (
    !identity.ownerUserId.trim() ||
    !hasOwnerVaultBinding(identity.ownerVaultBinding) ||
    !hasOwnerVaultBinding(identity.sessionGeneration) ||
    !identity.documentMutationGeneration.trim()
  ) {
    throw new LegacyRetirementPortError("session_changed", "identity_invalid");
  }
}

function requireStableIdentity(value: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 200) throw corruptLegacyItem();
  return normalized;
}

function requireDraftText(
  mutationId: string,
  title: string,
  body: string,
  entryDate: string,
) {
  requireStableIdentity(mutationId);
  if (
    typeof title !== "string" ||
    typeof body !== "string" ||
    typeof entryDate !== "string"
  ) {
    throw corruptLegacyItem();
  }
}

async function responseRecord(response: Response) {
  const body = await response.json().catch(() => null);
  return isRecord(body) ? body : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException("Legacy retirement cancelled.", "AbortError");
  }
}

function corruptLegacyItem() {
  return new LegacyRetirementPortError(
    "failed_retryable",
    "legacy_item_corrupt",
  );
}

function sourceChanged() {
  return new LegacyRetirementPortError(
    "conflict_blocked",
    "source_changed_before_delete",
  );
}

function anotherAccount() {
  return new LegacyRetirementPortError("another_account", "another_account");
}

function storageUnavailable() {
  return new LegacyRetirementPortError(
    "deletion_blocked",
    "indexeddb_unavailable",
  );
}

function normalizeAdapterError(error: unknown) {
  if (
    error instanceof LegacyRetirementPortError ||
    (error instanceof DOMException && error.name === "AbortError")
  ) {
    return error;
  }
  if (error instanceof OwnerComposerDurabilityUnconfirmedError) {
    return new LegacyRetirementPortError(
      error.reason === "inventory_bounded"
        ? "bounded_inventory"
        : "failed_retryable",
      error.reason,
    );
  }
  return new LegacyRetirementPortError(
    "failed_retryable",
    "legacy_storage_unavailable",
  );
}

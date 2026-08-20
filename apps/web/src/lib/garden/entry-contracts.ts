import type { EntrySyncStatus } from "@/db/schema";
import type { CatalogKind, PlantObjectKind } from "@/db/schema";
import type { CatalogTrustState } from "@/lib/garden/catalog-trust";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";

/** One bounded JSON budget shared by draft saves and final publication. */
export const JOURNAL_ENTRY_PAYLOAD_MAX_BYTES = 128 * 1024;
export const JOURNAL_DRAFT_TRANSPORT_OVERHEAD_MAX_BYTES = 16 * 1024;
export const JOURNAL_DRAFT_REQUEST_MAX_BYTES =
  JOURNAL_ENTRY_PAYLOAD_MAX_BYTES + JOURNAL_DRAFT_TRANSPORT_OVERHEAD_MAX_BYTES;
export const JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION = 1 as const;

export type ActivationSource = "homepage" | "public_variety" | "direct_garden";
export type ActivationSurfaceKind = "homepage" | "variety" | "garden";

export type JournalEntryTarget =
  | "first_plant_entry"
  | "plant_object_entry"
  | "space_entry";

export interface FirstEntryCatalogSelection {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  locale: string;
  status: "seeded" | "confirmed";
  source: string;
  trustState?: CatalogTrustState;
  trustLabel?: string;
  sourceLabel?: string;
  sourceCaveat?: string;
  disambiguationLabel?: string;
}

export interface FirstPlantEntryRequest {
  target?: JournalEntryTarget;
  plantObjectId?: string | null;
  spaceId?: string | null;
  spaceName?: string;
  plantName?: string;
  objectKind?: PlantObjectKind | null;
  catalogItemId?: string | null;
  userAddedCatalogName?: string | null;
  varietyText?: string | null;
  title: string;
  body?: string;
  contentDocument?: unknown;
  expectedRevision?: number;
  entryDate?: string | null;
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
  clientMutationId: string;
  mediaAssetId?: string | null;
  cover?:
    | { mode: "automatic" }
    | { mode: "none" }
    | { mode: "explicit_inline"; mediaAssetId: string }
    | { mode: "separate"; mediaAssetId: string }
    | { mode: "keep_as_cover"; mediaAssetId: string }
    | null;
  syncStatus?: EntrySyncStatus;
  activationSource?: ActivationSource | null;
  mentionSelections?: JournalMentionSelection[];
  topicTags?: string[];
  mentionedPlantObjectIds?: string[];
}

export interface FirstPlantEntryResponse {
  space: {
    id: string;
    displayName: string;
    locationVisibility: string;
    coarseRegionCode: string | null;
  };
  plantObject: {
    id: string;
    displayName: string;
    objectKind: PlantObjectKind;
    catalogItemId: string | null;
    varietyText: string | null;
    varietyState: string;
    locationVisibility: string;
    coarseRegionCode: string | null;
  };
  entry: {
    id: string;
    title: string;
    body: string;
    entryDate: string;
    clientMutationId: string;
    journalRevision?: number;
  };
  readbackUrl: string;
  followUpValuePulse?: {
    journalEntryId: string;
  } | null;
}

export type JournalEntryDraftKind =
  | "first_entry"
  | "follow_up"
  | "space_entry"
  | "edit_entry";

export interface JournalEntryDraftContext {
  spaceId?: string | null;
  plantObjectId?: string | null;
  journalEntryId?: string | null;
}

export type JournalDraftCreateEntryRequest = Omit<
  FirstPlantEntryRequest,
  "contentDocument"
> & {
  contentDocument?: JournalDocumentV1 | null;
};

export interface JournalDraftEditEntryRequest {
  entryId: string;
  title?: string;
  body?: string;
  contentDocument?: JournalDocumentV1 | null;
  entryDate?: string | null;
  clientMutationId: string;
  expectedRevision?: number;
  cover?: FirstPlantEntryRequest["cover"];
  mentionSelections?: JournalMentionSelection[];
  topicTags?: string[];
}

export interface JournalDraftComposerStateV1 {
  catalogQuery?: string;
  selectedCatalogItem?: FirstEntryCatalogSelection | null;
  userAddedCatalogName?: string | null;
  topicTagInput?: string;
}

export type JournalEntryDraftPayloadV1 =
  | {
      schemaVersion: typeof JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION;
      draftKind: "first_entry";
      request: JournalDraftCreateEntryRequest & {
        target: "first_plant_entry";
      };
      composerState?: JournalDraftComposerStateV1;
    }
  | {
      schemaVersion: typeof JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION;
      draftKind: "follow_up";
      request: JournalDraftCreateEntryRequest & {
        target: "plant_object_entry";
        plantObjectId: string;
      };
      composerState?: JournalDraftComposerStateV1;
    }
  | {
      schemaVersion: typeof JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION;
      draftKind: "space_entry";
      request: JournalDraftCreateEntryRequest & {
        target: "space_entry";
        spaceId: string;
      };
      composerState?: JournalDraftComposerStateV1;
    }
  | {
      schemaVersion: typeof JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION;
      draftKind: "edit_entry";
      request: JournalDraftEditEntryRequest;
      composerState?: JournalDraftComposerStateV1;
    };

export interface JournalEntryDraftReceiptV1 {
  draftKey: string;
  draftKind: JournalEntryDraftKind;
  context: JournalEntryDraftContext;
  payload: JournalEntryDraftPayloadV1;
  generation: number;
  payloadSha256: string;
  serverRevision: number;
  updatedAt: string;
}

export interface SaveJournalEntryDraftRequestV1 {
  draftKind: JournalEntryDraftKind;
  context: JournalEntryDraftContext;
  payload: JournalEntryDraftPayloadV1;
  generation: number;
  payloadSha256: string;
  expectedServerRevision: number | null;
}

export interface DeleteJournalEntryDraftRequestV1 {
  generation: number;
  payloadSha256: string;
  expectedServerRevision: number;
}

export function journalEntryPayloadByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function journalDraftPublicationBody(
  payload: JournalEntryDraftPayloadV1,
): Record<string, unknown> {
  if (payload.draftKind === "edit_entry") {
    const body: Record<string, unknown> = { ...payload.request };
    delete body.entryId;
    return body;
  }
  return { ...payload.request, syncStatus: "online" };
}

export function stableSerializeJournalDraftPayload(
  payload: JournalEntryDraftPayloadV1,
): string {
  return JSON.stringify(sortJsonValue(payload));
}

/**
 * Stable projection of fields that reflect an author action. Server-selected
 * context, idempotency ids, and revisions are intentionally excluded so a
 * route refresh cannot turn a fresh blank composer into a durable draft.
 */
export function stableSerializeJournalDraftUserIntent(
  payload: JournalEntryDraftPayloadV1,
): string {
  const request = payload.request;
  const shared = {
    title: request.title,
    body: request.body,
    contentDocument: request.contentDocument,
    entryDate: request.entryDate,
    cover: request.cover,
    mentionSelections: request.mentionSelections,
    topicTags: request.topicTags,
  };

  if (payload.draftKind === "edit_entry") {
    return JSON.stringify(
      sortJsonValue({ draftKind: payload.draftKind, ...shared }),
    );
  }
  if (payload.draftKind === "follow_up") {
    const followUpRequest = payload.request;
    return JSON.stringify(
      sortJsonValue({
        draftKind: payload.draftKind,
        ...shared,
        mediaAssetId: followUpRequest.mediaAssetId,
        composerState: payload.composerState,
      }),
    );
  }
  if (payload.draftKind === "space_entry") {
    const spaceRequest = payload.request;
    return JSON.stringify(
      sortJsonValue({
        draftKind: payload.draftKind,
        ...shared,
        mentionedPlantObjectIds: spaceRequest.mentionedPlantObjectIds,
      }),
    );
  }

  const firstEntryRequest = payload.request;
  return JSON.stringify(
    sortJsonValue({
      draftKind: payload.draftKind,
      ...shared,
      plantName: firstEntryRequest.plantName,
      objectKind: firstEntryRequest.objectKind,
      catalogItemId: firstEntryRequest.catalogItemId,
      userAddedCatalogName: firstEntryRequest.userAddedCatalogName,
      varietyText: firstEntryRequest.varietyText,
      locationVisibility: firstEntryRequest.locationVisibility,
      coarseRegionCode: firstEntryRequest.coarseRegionCode,
      mediaAssetId: firstEntryRequest.mediaAssetId,
      newSpaceName: firstEntryRequest.spaceId
        ? undefined
        : firstEntryRequest.spaceName,
      composerState: payload.composerState,
    }),
  );
}

export async function journalDraftPayloadSha256(
  payload: JournalEntryDraftPayloadV1,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    stableSerializeJournalDraftPayload(payload),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, sortJsonValue(child)]),
    );
  }
  return value;
}

import type { CatalogKind, PlantObjectKind } from "@/db/schema";
import type { CatalogTrustState } from "@/lib/garden/catalog-trust";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";
import type { Ove330ServeClass } from "@/lib/media/presentation-contract";

/** One bounded JSON budget shared by atomic create and edit publication. */
export const JOURNAL_ENTRY_PAYLOAD_MAX_BYTES = 128 * 1024;
export const ATOMIC_JOURNAL_PROTOCOL_REQUIRED_CODE =
  "atomic_journal_protocol_required" as const;
export const ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER =
  "x-overgarden-atomic-journal-create" as const;
export const ATOMIC_JOURNAL_CREATE_PROTOCOL =
  "ove347.atomic-journal-create.v1" as const;
export const ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER =
  "x-overgarden-atomic-journal-edit" as const;
export const ATOMIC_JOURNAL_EDIT_PROTOCOL =
  "ove348.atomic-journal-edit.v1" as const;

export function atomicJournalProtocolRequiredResponse(): Response {
  return Response.json(
    { code: ATOMIC_JOURNAL_PROTOCOL_REQUIRED_CODE },
    {
      status: 409,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export type ActivationSource = "homepage" | "public_variety" | "direct_garden";
export type ActivationSurfaceKind = "homepage" | "variety" | "garden";

export type JournalEntryTarget =
  | "first_plant_entry"
  | "plant_object_entry"
  | "space_entry";

export type AtomicJournalCreateContext =
  | {
      target: "first_plant_entry";
      spaceId?: string | null;
      spaceName?: string | null;
      plantName: string;
      objectKind?: PlantObjectKind | null;
      catalogItemId?: string | null;
      userAddedCatalogName?: string | null;
      locationVisibility?: string | null;
      coarseRegionCode?: string | null;
      entryDate?: string | null;
      activationSource?: ActivationSource | null;
      mentionSelections?: JournalMentionSelection[];
      topicTags?: string[];
    }
  | {
      target: "plant_object_entry";
      plantObjectId: string;
      entryDate?: string | null;
      mentionSelections?: JournalMentionSelection[];
      topicTags?: string[];
    }
  | {
      target: "space_entry";
      spaceId: string;
      mentionedPlantObjectIds: string[];
      entryDate?: string | null;
      topicTags?: string[];
    };

export interface AtomicJournalCreateRequest {
  publishId: string;
  clientMutationId: string;
  context: AtomicJournalCreateContext;
  title: string;
  document: JournalDocumentV1;
  coverMediaAssetId: string | null;
  mediaClaimReceipts: string[];
  returnTo: string;
  disclosureAccepted: boolean;
}

export interface AtomicJournalCreateResponse {
  entryId: string;
  slug: string;
  revision: number;
  card: {
    entryId: string;
    title: string;
    bodyPreview: string;
    entryDate: string;
    coverUrl: string | null;
    publicPath: string;
  };
  returnTo: string;
}

export interface AtomicJournalEditFocalPoint {
  mediaAssetId: string;
  x: number;
  y: number;
}

export interface AtomicJournalEditRequest {
  publishId: string;
  clientMutationId: string;
  expectedRevision: number;
  title: string;
  entryDate: string;
  document: JournalDocumentV1;
  coverMediaAssetId: string | null;
  newMediaClaimReceipts: string[];
  retainedMediaAssetIds: string[];
  removedMediaAssetIds: string[];
  focalPoints: AtomicJournalEditFocalPoint[];
  returnTo: string;
}

export interface AtomicJournalEditResponse {
  entryId: string;
  slug: string;
  revision: number;
  card: AtomicJournalCreateResponse["card"];
  returnTo: string;
}

export interface FirstEntryCatalogSelection {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  locale: string;
  status: "seeded" | "confirmed";
  source: string;
  serveClass: Ove330ServeClass;
  trustState?: CatalogTrustState;
  trustLabel?: string;
  sourceLabel?: string;
  sourceCaveat?: string;
  disambiguationLabel?: string;
}

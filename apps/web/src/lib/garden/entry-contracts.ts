import type { EntrySyncStatus } from "@/db/schema";
import type { CatalogKind, PlantObjectKind } from "@/db/schema";
import type { CatalogTrustState } from "@/lib/garden/catalog-trust";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";

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

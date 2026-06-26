import type { EntrySyncStatus } from "@/db/schema";

export type ActivationSource = "homepage" | "public_variety" | "direct_garden";
export type ActivationSurfaceKind = "homepage" | "variety" | "garden";
export type JournalEntryTarget = "first_plant_entry" | "plant_object_entry";

export interface FirstEntryCatalogSelection {
  id: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: "seeded" | "confirmed";
  source: string;
}

export interface FirstPlantEntryRequest {
  target?: JournalEntryTarget;
  plantObjectId?: string | null;
  spaceName?: string;
  plantName?: string;
  catalogItemId?: string | null;
  userAddedCatalogName?: string | null;
  varietyText?: string | null;
  title: string;
  body: string;
  entryDate?: string | null;
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
  clientMutationId: string;
  mediaAssetId?: string | null;
  syncStatus?: EntrySyncStatus;
  activationSource?: ActivationSource | null;
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
  };
  readbackUrl: string;
}

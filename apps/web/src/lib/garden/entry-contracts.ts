import type { EntrySyncStatus } from "@/db/schema";

export interface FirstPlantEntryRequest {
  spaceName: string;
  plantName: string;
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

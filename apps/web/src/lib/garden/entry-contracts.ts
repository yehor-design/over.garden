import type { EntrySyncStatus } from "@/db/schema";

export interface FirstPlantEntryRequest {
  spaceName: string;
  plantName: string;
  varietyText?: string | null;
  title: string;
  body: string;
  entryDate?: string | null;
  clientMutationId: string;
  mediaAssetId?: string | null;
  syncStatus?: EntrySyncStatus;
}

export interface FirstPlantEntryResponse {
  space: {
    id: string;
    displayName: string;
    locationVisibility: string;
  };
  plantObject: {
    id: string;
    displayName: string;
    varietyText: string | null;
    varietyState: string;
    locationVisibility: string;
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

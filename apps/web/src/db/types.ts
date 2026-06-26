import type { Insertable, Selectable } from "kysely";

import type {
  DB,
  Health as HealthTable,
  JobQueue as JobQueueTable,
  JournalEntries as JournalEntriesTable,
  JsonValue,
  MediaAssets as MediaAssetsTable,
  PlantObjects as PlantObjectsTable,
  Spaces as SpacesTable,
} from "./generated";

export type Database = DB;
export type { JsonValue };

export type EntryVisibility = "private" | "public";
export type EntryScope = "object";
export type LocationVisibility = "region" | "hidden";
export type VarietyState = "unknown" | "free_text";
export type MediaAssetStatus = "quarantined" | "processed" | "failed";
export type JobStatus = "pending" | "processing" | "done" | "failed";

export type Health = Selectable<HealthTable>;
export type NewHealth = Insertable<HealthTable>;
export type Space = Selectable<SpacesTable>;
export type NewSpace = Insertable<SpacesTable>;
export type PlantObject = Selectable<PlantObjectsTable>;
export type NewPlantObject = Insertable<PlantObjectsTable>;
export type JournalEntry = Selectable<JournalEntriesTable>;
export type NewJournalEntry = Insertable<JournalEntriesTable>;
export type MediaAsset = Selectable<MediaAssetsTable>;
export type NewMediaAsset = Insertable<MediaAssetsTable>;
export type JobQueueJob = Selectable<JobQueueTable>;
export type NewJobQueueJob = Insertable<JobQueueTable>;

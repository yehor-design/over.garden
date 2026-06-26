import type { Insertable, Selectable } from "kysely";

import type {
  DB,
  Health as HealthTable,
  JobQueue as JobQueueTable,
  JournalEntries as JournalEntriesTable,
  JsonValue,
  MediaAssets as MediaAssetsTable,
} from "./generated";

export type Database = DB;
export type { JsonValue };

export type EntryVisibility = "private" | "public";
export type MediaAssetStatus = "quarantined" | "processed" | "failed";
export type JobStatus = "pending" | "processing" | "done" | "failed";

export type Health = Selectable<HealthTable>;
export type NewHealth = Insertable<HealthTable>;
export type JournalEntry = Selectable<JournalEntriesTable>;
export type NewJournalEntry = Insertable<JournalEntriesTable>;
export type MediaAsset = Selectable<MediaAssetsTable>;
export type NewMediaAsset = Insertable<MediaAssetsTable>;
export type JobQueueJob = Selectable<JobQueueTable>;
export type NewJobQueueJob = Insertable<JobQueueTable>;

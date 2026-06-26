import type { ColumnType, Generated, Insertable, Selectable } from "kysely";

export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface HealthTable {
  id: Generated<string>;
  message: string;
  created_at: Timestamp;
}

export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface JobQueueTable {
  id: Generated<string>;
  queue_name: string;
  payload: JsonValue;
  status: Generated<JobStatus>;
  idempotency_key: string | null;
  available_at: Timestamp;
  locked_at: Timestamp | null;
  locked_by: string | null;
  attempts: Generated<number>;
  last_error: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Database {
  health: HealthTable;
  job_queue: JobQueueTable;
}

export type Health = Selectable<HealthTable>;
export type NewHealth = Insertable<HealthTable>;
export type JobQueueJob = Selectable<JobQueueTable>;
export type NewJobQueueJob = Insertable<JobQueueTable>;

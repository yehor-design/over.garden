// Kysely is the TypeScript app's thin typed SQL builder. The schema source of
// truth is SQL migrations plus generated DB types (`pnpm db:types` once a live
// database exists). This file preserves the old import path for early scaffold
// code while Drizzle is removed.
export type {
  Database,
  Health,
  JobQueueJob,
  JobStatus,
  NewHealth,
  NewJobQueueJob,
} from "./types";

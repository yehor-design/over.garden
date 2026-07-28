import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  MEDIA_DERIVATIVE_REVOKE_KIND,
  MEDIA_LIFECYCLE_QUEUE,
  MEDIA_QUARANTINE_EXPIRE_KIND,
  maxAttemptsForKind,
} from "@/server/job-queue-manifest";
import {
  revokeMediaObjectBytes,
  type MediaObjectReference,
  type MediaUnreachabilityOutcome,
} from "@/server/media/lifecycle-revoke";

const CLAIM_BATCH = 8;
export const MEDIA_LIFECYCLE_LEASE_SECONDS = 180;
export const MEDIA_LIFECYCLE_INVOCATION_BUDGET_MS = 45_000;

interface ClaimedMediaLifecycleJob {
  id: string;
  payload: unknown;
  attempts: number;
  claimToken: string;
  reclaimed: boolean;
}

export interface MediaLifecycleDrainResult {
  claimed: number;
  completed: number;
  failed: number;
  dead: number;
  reclaimed: number;
  superseded: number;
  remaining: number;
  deadlineReached: boolean;
  durationMs: number;
}

export async function drainMediaLifecycleQueue(
  limit = CLAIM_BATCH,
  options: { budgetMs?: number; now?: () => number } = {},
): Promise<MediaLifecycleDrainResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const budgetMs = options.budgetMs ?? MEDIA_LIFECYCLE_INVOCATION_BUDGET_MS;
  const workerId = `web-media-lifecycle:${randomUUID()}`;
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let dead = 0;
  let reclaimed = 0;
  let superseded = 0;

  for (let i = 0; i < limit && now() - startedAt < budgetMs; i += 1) {
    const job = await claimNextMediaLifecycleJob(workerId);
    if (!job) break;
    claimed += 1;
    if (job.reclaimed) reclaimed += 1;

    try {
      const payload = await processMediaLifecycleJob(job);
      const settled = await markJobDone(job, payload);
      if (settled) completed += 1;
      else superseded += 1;
    } catch (error) {
      const outcome = await markJobFailedOrDead(job, error);
      if (outcome === "superseded") superseded += 1;
      else if (outcome === "dead") dead += 1;
      else failed += 1;
    }
  }

  const durationMs = now() - startedAt;
  const remaining = await countUnfinishedMediaLifecycleJobs();
  return {
    claimed,
    completed,
    failed,
    dead,
    reclaimed,
    superseded,
    remaining,
    deadlineReached: durationMs >= budgetMs && remaining > 0,
    durationMs,
  };
}

export async function claimNextMediaLifecycleJob(
  workerId: string,
): Promise<ClaimedMediaLifecycleJob | null> {
  const claimToken = `${workerId}:${randomUUID()}`;
  const rows = await sql<{
    id: string;
    payload: unknown;
    attempts: number;
    previous_status: string;
  }>`
    with next_job as (
      select id, status as previous_status
      from job_queue
      where queue_name = ${MEDIA_LIFECYCLE_QUEUE}
        and (
          (status in ('pending', 'failed') and available_at <= now())
          or (
            status = 'processing'
            and locked_at < now() - (${MEDIA_LIFECYCLE_LEASE_SECONDS} || ' seconds')::interval
          )
        )
      order by available_at asc, created_at asc
      for update skip locked
      limit 1
    )
    update job_queue as q
    set status = 'processing',
        locked_at = now(),
        locked_by = ${claimToken},
        attempts = q.attempts + 1,
        updated_at = now()
    from next_job
    where q.id = next_job.id
    returning q.id, q.payload, q.attempts, next_job.previous_status
  `.execute(db);

  const row = rows.rows[0];
  return row
    ? {
        id: row.id,
        payload: row.payload,
        attempts: row.attempts,
        claimToken,
        reclaimed: row.previous_status === "processing",
      }
    : null;
}

async function processMediaLifecycleJob(job: ClaimedMediaLifecycleJob) {
  const payload = parsePayload(job.payload);
  if (
    payload.kind !== MEDIA_DERIVATIVE_REVOKE_KIND &&
    payload.kind !== MEDIA_QUARANTINE_EXPIRE_KIND
  ) {
    throw new Error("Unsupported media lifecycle job kind.");
  }

  const proof = await revokeMediaObjectBytes({
    bucket: payload.bucket,
    objectKey: payload.objectKey,
  });
  if (proof.outcome !== "confirmed_gone") {
    throw new MediaLifecycleProofError(proof.outcome);
  }
  return payload;
}

function parsePayload(raw: unknown): {
  kind: string;
  bucket: MediaObjectReference["bucket"];
  objectKey: string;
  mediaAssetId?: string;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Media lifecycle job payload is malformed.");
  }
  const payload = raw as Record<string, unknown>;
  const kind = typeof payload.kind === "string" ? payload.kind : "";
  const bucket = payload.bucket;
  const objectKey =
    typeof payload.objectKey === "string" ? payload.objectKey : "";
  const mediaAssetId =
    typeof payload.mediaAssetId === "string" ? payload.mediaAssetId : undefined;

  if (
    (bucket !== "quarantine" && bucket !== "public_derivative") ||
    objectKey.length === 0 ||
    kind.length === 0
  ) {
    throw new Error("Media lifecycle job payload is malformed.");
  }
  return { kind, bucket, objectKey, mediaAssetId };
}

async function markJobDone(
  job: ClaimedMediaLifecycleJob,
  payload: ReturnType<typeof parsePayload>,
): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const settled = await settleClaimedJob(trx, job, "done", null);
    if (!settled) return false;
    if (!payload.mediaAssetId) return true;

    const now = new Date();
    if (payload.kind === MEDIA_DERIVATIVE_REVOKE_KIND) {
      await trx
        .updateTable("media_assets")
        .set({ revoked_at: now, public_unreachable_at: now, updated_at: now })
        .where("id", "=", payload.mediaAssetId)
        .where("revoked_at", "is", null)
        .execute();
    } else {
      await trx
        .updateTable("media_assets")
        .set({ original_deleted_at: now, updated_at: now })
        .where("id", "=", payload.mediaAssetId)
        .where("original_deleted_at", "is", null)
        .execute();
    }
    return true;
  });
}

async function settleClaimedJob(
  trx: Transaction<Database>,
  job: ClaimedMediaLifecycleJob,
  status: "done" | "failed" | "dead",
  fields: {
    lastError: string;
    terminalErrorCode?: "unsupported_kind" | "invalid_payload" | "max_attempts_exceeded";
    terminalizedAt?: Date;
    availableAt?: Date;
  } | null,
) {
  const updated = await trx
    .updateTable("job_queue")
    .set({
      status,
      locked_at: null,
      locked_by: null,
      last_error: fields?.lastError ?? null,
      terminal_error_code: fields?.terminalErrorCode ?? null,
      terminalized_at: fields?.terminalizedAt ?? null,
      ...(fields?.availableAt ? { available_at: fields.availableAt } : {}),
      updated_at: new Date(),
    })
    .where("id", "=", job.id)
    .where("status", "=", "processing")
    .where("locked_by", "=", job.claimToken)
    .returning("id")
    .executeTakeFirst();
  return Boolean(updated);
}

async function markJobFailedOrDead(
  job: ClaimedMediaLifecycleJob,
  error: unknown,
): Promise<"failed" | "dead" | "superseded"> {
  const payload = parsePayloadSafe(job.payload);
  const maxAttempts = maxAttemptsForKind(
    MEDIA_LIFECYCLE_QUEUE,
    payload?.kind ?? MEDIA_DERIVATIVE_REVOKE_KIND,
  );
  const code =
    error instanceof Error && error.message.includes("Unsupported")
      ? "unsupported_kind"
      : error instanceof Error && error.message.includes("malformed")
        ? "invalid_payload"
        : "transient";
  const terminal =
    code === "unsupported_kind" ||
    code === "invalid_payload" ||
    job.attempts >= maxAttempts;

  const settled = await db.transaction().execute((trx) =>
    settleClaimedJob(
      trx,
      job,
      terminal ? "dead" : "failed",
      terminal
        ? {
            lastError:
              code === "transient" ? "max_attempts_exceeded" : code,
            terminalErrorCode:
              code === "transient" ? "max_attempts_exceeded" : code,
            terminalizedAt: new Date(),
          }
        : {
            lastError: safeProofErrorClass(error),
            availableAt: new Date(
              Date.now() + Math.min(300, 2 ** Math.min(job.attempts, 6)) * 1000,
            ),
          },
    ),
  );
  if (!settled) return "superseded";
  return terminal ? "dead" : "failed";
}

function safeProofErrorClass(error: unknown) {
  return error instanceof MediaLifecycleProofError
    ? `proof_${error.outcome}`
    : "transient_failure";
}

class MediaLifecycleProofError extends Error {
  constructor(readonly outcome: Exclude<MediaUnreachabilityOutcome, "confirmed_gone">) {
    super(`Media lifecycle proof was ${outcome}.`);
  }
}

async function countUnfinishedMediaLifecycleJobs() {
  const row = await db
    .selectFrom("job_queue")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("queue_name", "=", MEDIA_LIFECYCLE_QUEUE)
    .where("status", "in", ["pending", "processing", "failed", "dead"])
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

function parsePayloadSafe(raw: unknown): { kind?: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as { kind?: string };
}

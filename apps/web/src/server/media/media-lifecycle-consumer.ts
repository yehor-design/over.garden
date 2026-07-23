import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { db } from "@/db";
import {
  MEDIA_DERIVATIVE_REVOKE_KIND,
  MEDIA_LIFECYCLE_QUEUE,
  MEDIA_QUARANTINE_EXPIRE_KIND,
  maxAttemptsForKind,
} from "@/server/job-queue-manifest";
import {
  revokeMediaObjectBytes,
  type MediaObjectReference,
} from "@/server/media/lifecycle-revoke";
import { deleteQuarantineObject } from "@/lib/storage";

const CLAIM_BATCH = 8;

export interface MediaLifecycleDrainResult {
  claimed: number;
  completed: number;
  failed: number;
  dead: number;
}

export async function drainMediaLifecycleQueue(
  limit = CLAIM_BATCH,
): Promise<MediaLifecycleDrainResult> {
  const workerId = `web-media-lifecycle:${randomUUID()}`;
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let dead = 0;

  for (let i = 0; i < limit; i += 1) {
    const job = await claimNextMediaLifecycleJob(workerId);
    if (!job) break;
    claimed += 1;

    try {
      await processMediaLifecycleJob(job);
      await markJobDone(job.id);
      completed += 1;
    } catch (error) {
      const outcome = await markJobFailedOrDead(job, error);
      if (outcome === "dead") dead += 1;
      else failed += 1;
    }
  }

  return { claimed, completed, failed, dead };
}

async function claimNextMediaLifecycleJob(workerId: string) {
  const rows = await sql<{
    id: string;
    payload: unknown;
    attempts: number;
  }>`
    with next_job as (
      select id
      from job_queue
      where queue_name = ${MEDIA_LIFECYCLE_QUEUE}
        and status in ('pending', 'failed')
        and available_at <= now()
      order by available_at asc, created_at asc
      for update skip locked
      limit 1
    )
    update job_queue as q
    set status = 'processing',
        locked_at = now(),
        locked_by = ${workerId},
        attempts = q.attempts + 1,
        updated_at = now()
    from next_job
    where q.id = next_job.id
    returning q.id, q.payload, q.attempts
  `.execute(db);

  return rows.rows[0] ?? null;
}

async function processMediaLifecycleJob(job: {
  id: string;
  payload: unknown;
  attempts: number;
}) {
  const payload = parsePayload(job.payload);

  if (payload.kind === MEDIA_DERIVATIVE_REVOKE_KIND) {
    await revokeMediaObjectBytes({
      bucket: payload.bucket,
      objectKey: payload.objectKey,
    });

    if (payload.mediaAssetId) {
      await db
        .updateTable("media_assets")
        .set({
          revoked_at: new Date(),
          public_unreachable_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", payload.mediaAssetId)
        .where("revoked_at", "is", null)
        .execute();
    }
    return;
  }

  if (payload.kind === MEDIA_QUARANTINE_EXPIRE_KIND) {
    await deleteQuarantineObject(payload.objectKey);
    if (payload.mediaAssetId) {
      await db
        .updateTable("media_assets")
        .set({
          original_deleted_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", payload.mediaAssetId)
        .where("original_deleted_at", "is", null)
        .execute();
    }
    return;
  }

  throw new Error("Unsupported media lifecycle job kind.");
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

async function markJobDone(jobId: string) {
  await db
    .updateTable("job_queue")
    .set({
      status: "done",
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: new Date(),
    })
    .where("id", "=", jobId)
    .execute();
}

async function markJobFailedOrDead(
  job: { id: string; payload: unknown; attempts: number },
  error: unknown,
): Promise<"failed" | "dead"> {
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

  if (
    code === "unsupported_kind" ||
    code === "invalid_payload" ||
    job.attempts >= maxAttempts
  ) {
    await db
      .updateTable("job_queue")
      .set({
        status: "dead",
        locked_at: null,
        locked_by: null,
        last_error: code === "transient" ? "max_attempts_exceeded" : code,
        terminal_error_code:
          code === "transient" ? "max_attempts_exceeded" : code,
        terminalized_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", job.id)
      .execute();
    return "dead";
  }

  const delaySeconds = Math.min(300, 2 ** Math.min(job.attempts, 6));
  await db
    .updateTable("job_queue")
    .set({
      status: "failed",
      locked_at: null,
      locked_by: null,
      last_error: "transient_failure",
      available_at: new Date(Date.now() + delaySeconds * 1000),
      updated_at: new Date(),
    })
    .where("id", "=", job.id)
    .execute();
  return "failed";
}

function parsePayloadSafe(raw: unknown): { kind?: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as { kind?: string };
}

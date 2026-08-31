import { sql } from "kysely";

import { db } from "@/db";
import type { MatchingRuntimeHeartbeatReadback } from "@/lib/matching-runtime-proof";
import { loadMatchingQueueRecoveryReport } from "@/server/job-queue-recovery";

/**
 * Reads the matching runtime's state from the place the worker actually writes
 * it, rather than from a service that reported on itself.
 *
 * `matching_worker_heartbeats` already carries the release, the image digest,
 * the schema class, the handler set, and the last-seen time. The retired
 * endpoints reported exactly those, one process removed — and a healthy HTTP
 * response proved the API was up, never that the worker was claiming jobs.
 */
export const WORKER_HEARTBEAT_MAX_AGE_SECONDS = 30;

/**
 * The one field the heartbeat row genuinely cannot supply.
 *
 * `/capabilities` reported a build timestamp read from the image's own
 * environment. No column holds it, so the proof no longer claims it. Inventing
 * a value here would be fabricating evidence about a build nobody observed; the
 * image digest already identifies the build exactly.
 */
export const HEARTBEAT_HAS_NO_BUILD_TIMESTAMP = true;

interface HeartbeatRow {
  release_commit_sha: string;
  image_digest: string;
  schema_compatibility_class: string;
  supported_handlers: string[];
  last_drain_error_class: string | null;
  is_fresh: boolean;
}

interface QueueRow {
  queue_depth: string | number;
  oldest_due_seconds: string | number | null;
}

export async function readMatchingRuntimeHeartbeat(
  meilisearchStatus: "available" | "unavailable",
): Promise<MatchingRuntimeHeartbeatReadback> {
  const heartbeat = await sql<HeartbeatRow>`
    select
      release_commit_sha,
      image_digest,
      schema_compatibility_class,
      supported_handlers,
      last_drain_error_class,
      seen_at >= now() - (${WORKER_HEARTBEAT_MAX_AGE_SECONDS} || ' seconds')::interval
        as is_fresh
    from matching_worker_heartbeats
    where queue_name = 'matching'
  `.execute(db);

  const queue = await sql<QueueRow>`
    select
      count(*) filter (where status in ('pending', 'processing', 'failed'))
        as queue_depth,
      extract(
        epoch from now() - min(available_at) filter (
          where status in ('pending', 'failed') and available_at <= now()
        )
      ) as oldest_due_seconds
    from job_queue
    where queue_name = 'matching'
  `.execute(db);

  const recovery = await loadMatchingQueueRecoveryReport(db);
  const row = heartbeat.rows[0];
  const queueRow = queue.rows[0];

  return {
    heartbeat: row
      ? {
          releaseCommitSha: row.release_commit_sha,
          imageDigest: row.image_digest,
          schemaCompatibilityClass: row.schema_compatibility_class,
          supportedHandlers: row.supported_handlers,
          isFresh: row.is_fresh,
          drainClass: row.last_drain_error_class ? "failing" : "converging",
        }
      : null,
    jobQueue: {
      status: "available",
      depthClass: depthClass(Number(queueRow?.queue_depth ?? 0)),
      lagClass: lagClass(
        queueRow?.oldest_due_seconds == null
          ? null
          : Number(queueRow.oldest_due_seconds),
      ),
    },
    meilisearchStatus,
    queueRecovery: {
      claimCompatible: recovery.claimCompatible,
      // The handler set is compared against the heartbeat row, so a worker
      // running an older image is caught here rather than assumed compatible.
      handlerCompatible: row ? "available" : "unavailable",
      unsupportedRetryingClass: recovery.unsupportedRetryingClass,
      terminalCountClass: recovery.terminalCountClass,
      oldestDueAgeClass: recovery.oldestDueAgeClass,
    },
  };
}

function depthClass(depth: number): "empty" | "low" | "medium" | "high" {
  if (depth <= 0) return "empty";
  if (depth <= 10) return "low";
  if (depth <= 100) return "medium";
  return "high";
}

function lagClass(
  seconds: number | null,
): "none" | "fresh" | "delayed" | "stale" {
  if (seconds === null) return "none";
  if (seconds <= 60) return "fresh";
  if (seconds <= 900) return "delayed";
  return "stale";
}

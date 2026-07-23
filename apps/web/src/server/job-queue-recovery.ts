import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Kysely } from "kysely";

import type { Database } from "@/db/schema";
import { db } from "@/db";
import {
  JOB_QUEUE_MANIFEST_VERSION,
  matchingSupportedKinds,
} from "@/server/job-queue-manifest";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import type { RequestScope } from "@/server/request-scope";

const MATCHING_QUEUE = "matching";

export interface QueueRecoveryReport {
  schemaVersion: typeof JOB_QUEUE_MANIFEST_VERSION;
  queueName: typeof MATCHING_QUEUE;
  claimCompatible: "available" | "schema_mismatch";
  unsupportedRetryingClass: "none" | "present";
  terminalCountClass: "empty" | "low" | "elevated" | "high";
  failedRetryingClass: "empty" | "low" | "elevated" | "high";
  oldestDueAgeClass: "none" | "fresh" | "delayed" | "stale";
}

export function expectedQueueReplayApprovalText(jobId: string): string {
  const suffix = jobId.replaceAll("-", "").slice(0, 8);
  return `APPROVE job-${suffix} QUEUE REPLAY`;
}

export async function loadMatchingQueueRecoveryReport(
  database: Kysely<Database> = db,
): Promise<QueueRecoveryReport> {
  const supported = matchingSupportedKinds();
  const row = await sql<{
    unsupported_retrying: string | number;
    terminal_count: string | number;
    failed_retrying: string | number;
    oldest_due_seconds: string | number | null;
  }>`
    select
      count(*) filter (
        where status in ('pending', 'processing', 'failed')
          and (
            jsonb_typeof(payload) <> 'object'
            or coalesce(payload->>'kind', '') = ''
            or not (payload->>'kind' = any(${supported}::text[]))
          )
      ) as unsupported_retrying,
      count(*) filter (where status = 'dead') as terminal_count,
      count(*) filter (where status = 'failed') as failed_retrying,
      extract(
        epoch from now() - min(available_at) filter (
          where status in ('pending', 'failed')
            and available_at <= now()
        )
      ) as oldest_due_seconds
    from job_queue
    where queue_name = ${MATCHING_QUEUE}
  `.execute(database);

  const report = row.rows[0];
  if (!report) {
    throw new Error("Matching queue recovery report query returned no rows.");
  }

  return {
    schemaVersion: JOB_QUEUE_MANIFEST_VERSION,
    queueName: MATCHING_QUEUE,
    claimCompatible: "available",
    unsupportedRetryingClass:
      Number(report.unsupported_retrying) === 0 ? "none" : "present",
    terminalCountClass: countClass(Number(report.terminal_count)),
    failedRetryingClass: countClass(Number(report.failed_retrying)),
    oldestDueAgeClass: lagClass(
      report.oldest_due_seconds == null
        ? null
        : Number(report.oldest_due_seconds),
    ),
  };
}

export async function replayDeadMatchingJob(
  scope: RequestScope,
  input: {
    jobId: string;
    approvalPhrase: string;
  },
  database: Kysely<Database> = db,
): Promise<{ replayed: true }> {
  await assertAdminCapabilityForScope(scope, "operator:mutate", database);

  if (
    input.approvalPhrase.trim() !==
    expectedQueueReplayApprovalText(input.jobId)
  ) {
    throw new Error("Queue replay requires the request-specific approval phrase.");
  }

  const existing = await database
    .selectFrom("job_queue")
    .select(["id", "status", "queue_name", "idempotency_key", "payload"])
    .where("id", "=", input.jobId)
    .executeTakeFirst();

  if (!existing || existing.queue_name !== MATCHING_QUEUE) {
    throw new Error("Dead matching job was not found for replay.");
  }
  if (existing.status !== "dead") {
    throw new Error("Only terminal dead matching jobs can be replayed.");
  }

  const payload =
    existing.payload && typeof existing.payload === "object"
      ? (existing.payload as { kind?: unknown })
      : null;
  const kind = typeof payload?.kind === "string" ? payload.kind : null;
  if (!kind || !matchingSupportedKinds().includes(kind)) {
    throw new Error(
      "Replay requires a currently supported matching handler capability.",
    );
  }

  const replayKey = existing.idempotency_key
    ? `${existing.idempotency_key}:replay:${randomUUID()}`
    : `matching-replay:${input.jobId}:${randomUUID()}`;

  const updated = await sql<{ id: string }>`
    update job_queue
    set status = 'pending',
        available_at = now(),
        locked_at = null,
        locked_by = null,
        rerun_requested = false,
        attempts = 0,
        last_error = null,
        terminal_error_code = null,
        terminalized_at = null,
        idempotency_key = ${replayKey},
        updated_at = now()
    where id = ${input.jobId}::uuid
      and status = 'dead'
      and queue_name = ${MATCHING_QUEUE}
    returning id
  `.execute(database);

  if (!updated.rows[0]) {
    throw new Error("Dead matching job was not replayed.");
  }

  return { replayed: true };
}

function countClass(count: number): "empty" | "low" | "elevated" | "high" {
  if (count <= 0) return "empty";
  if (count <= 10) return "low";
  if (count <= 100) return "elevated";
  return "high";
}

function lagClass(
  oldestDueSeconds: number | null,
): "none" | "fresh" | "delayed" | "stale" {
  if (oldestDueSeconds == null) return "none";
  if (oldestDueSeconds <= 60) return "fresh";
  if (oldestDueSeconds <= 300) return "delayed";
  return "stale";
}

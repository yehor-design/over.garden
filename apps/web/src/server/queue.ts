import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/db";
import type { JsonValue } from "@/db/types";
import {
  JobQueuePayloadContractError,
  validateJobQueuePayload,
} from "@/server/job-queue-manifest";

export interface EnqueueJobOptions {
  idempotencyKey?: string;
  delaySeconds?: number;
}

export async function enqueueJob(
  queueName: string,
  payload: JsonValue,
  options: EnqueueJobOptions = {},
): Promise<string> {
  // OVE-225: refuse before the row exists, so a non-conforming payload is never
  // persisted — not even long enough for the database constraint to reject it.
  const violation = validateJobQueuePayload(queueName, payload);
  if (violation) {
    throw new JobQueuePayloadContractError(violation);
  }

  const availableAt = new Date(Date.now() + (options.delaySeconds ?? 0) * 1000);
  const id = randomUUID();

  try {
    const inserted = await db
      .insertInto("job_queue")
      .values({
        id,
        queue_name: queueName,
        payload,
        idempotency_key: options.idempotencyKey ?? null,
        available_at: availableAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return inserted.id;
  } catch (error) {
    if (!options.idempotencyKey || !isUniqueViolation(error)) {
      throw error;
    }

    const existing = await db
      .selectFrom("job_queue")
      .select("id")
      .where("idempotency_key", "=", options.idempotencyKey)
      .executeTakeFirstOrThrow();

    return existing.id;
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

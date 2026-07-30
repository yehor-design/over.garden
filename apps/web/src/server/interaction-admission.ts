import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import type { Database } from "@/db/schema";

export type InteractionAdmissionExecutor =
  | Kysely<Database>
  | Transaction<Database>;

export type InteractionAdmissionFailure = "quota" | "capacity" | "unavailable";

export class InteractionAdmissionError extends Error {
  constructor(public readonly failure: InteractionAdmissionFailure) {
    super("Interaction is temporarily unavailable.");
    this.name = "InteractionAdmissionError";
  }
}

export function isInteractionAdmissionError(
  error: unknown,
): error is InteractionAdmissionError {
  return error instanceof InteractionAdmissionError;
}

/**
 * Keeps a contention burst bounded. The caller already owns a transaction;
 * SET LOCAL therefore cannot leak a timeout setting into a pooled connection.
 */
export async function configureInteractionAdmissionTransaction(
  executor: InteractionAdmissionExecutor,
) {
  await sql`set local statement_timeout = '2s'`.execute(executor);
  await sql`set local lock_timeout = '500ms'`.execute(executor);
}

/** Serializes idempotent mutations and target budgets without user fingerprinting. */
export async function acquireInteractionAdmissionLock(
  executor: InteractionAdmissionExecutor,
  key: string,
) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(
    executor,
  );
}

export async function removeExpiredInteractionQuotaWindows(
  executor: InteractionAdmissionExecutor,
  actorUserId: string,
  now: Date,
) {
  await executor
    .deleteFrom("interaction_quota_windows")
    .where("actor_user_id", "=", actorUserId)
    .where("expires_at", "<=", now)
    .execute();
}

/**
 * The conditional UPSERT is the quota's linearization point. A competing
 * request receives no returned row once the limit has been consumed.
 */
export async function consumeInteractionQuota(
  executor: InteractionAdmissionExecutor,
  input: {
    actorUserId: string;
    policy:
      | "comment_root_global"
      | "comment_root_target"
      | "comment_reply_global"
      | "comment_reply_target"
      | "lineage_question_global"
      | "lineage_question_edge"
      | "lineage_question_recipient";
    scope: string;
    limit: number;
    windowStartedAt: Date;
    expiresAt: Date;
  },
) {
  const result = await sql<{ used_count: number }>`
    insert into interaction_quota_windows (
      actor_user_id,
      quota_policy,
      quota_scope,
      window_started_at,
      expires_at,
      used_count,
      updated_at
    ) values (
      ${input.actorUserId},
      ${input.policy},
      ${input.scope},
      ${input.windowStartedAt},
      ${input.expiresAt},
      1,
      now()
    )
    on conflict (
      actor_user_id,
      quota_policy,
      quota_scope,
      window_started_at
    ) do update set
      used_count = interaction_quota_windows.used_count + 1,
      updated_at = now()
    where interaction_quota_windows.used_count < ${input.limit}
    returning used_count
  `.execute(executor);

  if (result.rows.length !== 1) {
    throw new InteractionAdmissionError("quota");
  }
}

export function utcDayWindow(now: Date) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return {
    startedAt: start,
    expiresAt: new Date(start.getTime() + 48 * 60 * 60 * 1000),
  };
}

/** Database timeout/lock failures deliberately collapse to one safe UI state. */
export function rethrowAsInteractionUnavailable(error: unknown): never {
  if (isInteractionAdmissionError(error)) throw error;
  if (isDatabaseAdmissionFailure(error)) {
    throw new InteractionAdmissionError("unavailable");
  }
  throw error;
}

function isDatabaseAdmissionFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  return code === "55P03" || code === "57014" || code === "40001";
}

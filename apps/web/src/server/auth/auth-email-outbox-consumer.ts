import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { db } from "@/db";
import { sendAuthPasswordResetEmail } from "@/lib/auth/resend-auth-email-delivery";
import { resetUrlForVerification } from "@/server/auth/auth-email-outbox";

const LEASE_SECONDS = 180;
const MAX_ATTEMPTS = 8;
const PROVIDER_TIMEOUT_MS = 20_000;
export const AUTH_EMAIL_OUTBOX_INVOCATION_BUDGET_MS = 45_000;

interface ClaimedOutboxRow {
  id: string;
  attempts: number;
  leaseToken: string;
}

interface DeliverableOutboxRow {
  id: string;
  identifier: string;
  email: string;
  expiresAt: Date;
}

export interface AuthEmailOutboxDrainResult {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  cancelled: number;
  reclaimed: number;
  remaining: number;
  deadlineReached: boolean;
  durationMs: number;
}

export async function drainAuthEmailOutbox(
  limit = 16,
  options: {
    budgetMs?: number;
    now?: () => number;
    outboxIds?: readonly string[];
  } = {},
): Promise<AuthEmailOutboxDrainResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const budgetMs = options.budgetMs ?? AUTH_EMAIL_OUTBOX_INVOCATION_BUDGET_MS;
  let claimed = 0;
  let sent = 0;
  let failed = 0;
  let dead = 0;
  let cancelled = 0;
  let reclaimed = 0;

  for (
    let index = 0;
    index < limit && now() - startedAt < budgetMs;
    index += 1
  ) {
    const claim = await claimNextAuthEmailOutboxRow(options.outboxIds);
    if (!claim) break;
    claimed += 1;
    if (claim.reclaimed) reclaimed += 1;

    try {
      const deliverable = await loadDeliverable(claim.id);
      const resetUrl = deliverable
        ? resetUrlForVerification(deliverable.identifier)
        : null;
      if (!deliverable || !resetUrl || deliverable.expiresAt <= new Date()) {
        await settleClaim(claim, "cancelled", null);
        cancelled += 1;
        continue;
      }

      await sendAuthPasswordResetEmail({
        email: deliverable.email,
        signal: AbortSignal.timeout(
          Math.max(
            1,
            Math.min(PROVIDER_TIMEOUT_MS, budgetMs - (now() - startedAt)),
          ),
        ),
        url: resetUrl,
        userId: deliverable.id,
      });
      await settleClaim(claim, "sent", null);
      sent += 1;
    } catch {
      const terminal = claim.attempts >= MAX_ATTEMPTS;
      await settleClaim(
        claim,
        terminal ? "dead" : "failed",
        terminal ? null : new Date(Date.now() + retryDelayMs(claim.attempts)),
      );
      if (terminal) dead += 1;
      else failed += 1;
    }
  }

  const remaining = await countUnfinishedRows(options.outboxIds);
  const durationMs = now() - startedAt;
  return {
    claimed,
    sent,
    failed,
    dead,
    cancelled,
    reclaimed,
    remaining,
    deadlineReached: durationMs >= budgetMs && remaining > 0,
    durationMs,
  };
}

async function claimNextAuthEmailOutboxRow(
  outboxIds?: readonly string[],
): Promise<(ClaimedOutboxRow & { reclaimed: boolean }) | null> {
  const leaseToken = `auth-email-outbox:${randomUUID()}`;
  const candidateFilter = outboxIds
    ? outboxIds.length > 0
      ? sql`and id in (${sql.join(outboxIds)})`
      : sql`and false`
    : sql``;
  const result = await sql<{
    id: string;
    attempts: number;
    previous_state: string;
  }>`
    with next_row as (
      select id, state as previous_state
      from auth_email_outbox
      where (
        (state in ('pending', 'failed') and available_at <= now())
        or (state = 'processing' and locked_at < now() - (${LEASE_SECONDS} || ' seconds')::interval)
      )
      ${candidateFilter}
      order by available_at asc, created_at asc
      for update skip locked
      limit 1
    )
    update auth_email_outbox as outbox
    set state = 'processing',
        locked_at = now(),
        locked_by = ${leaseToken},
        attempts = outbox.attempts + 1,
        updated_at = now()
    from next_row
    where outbox.id = next_row.id
    returning outbox.id, outbox.attempts, next_row.previous_state
  `.execute(db);

  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        attempts: row.attempts,
        leaseToken,
        reclaimed: row.previous_state === "processing",
      }
    : null;
}

async function loadDeliverable(
  id: string,
): Promise<DeliverableOutboxRow | null> {
  const result = await sql<DeliverableOutboxRow>`
    select outbox.id, verification.identifier, "user".email, verification."expiresAt" as "expiresAt"
    from auth_email_outbox as outbox
    join verification on verification.id = outbox.verification_id
    join "user" on "user".id::text = verification.value
    join account on account."userId" = "user".id and account."providerId" = 'credential'
    where outbox.id = ${id}
      and verification.identifier like 'reset-password:%'
    limit 1
  `.execute(db);
  return result.rows[0] ?? null;
}

async function settleClaim(
  claim: ClaimedOutboxRow,
  state: "sent" | "failed" | "dead" | "cancelled",
  availableAt: Date | null,
): Promise<void> {
  const terminal =
    state === "sent" || state === "dead" || state === "cancelled";
  await sql`
    update auth_email_outbox
    set state = ${state},
        locked_at = null,
        locked_by = null,
        available_at = coalesce(${availableAt}, available_at),
        sent_at = case when ${state} = 'sent' then now() else sent_at end,
        terminalized_at = case when ${terminal} then now() else null end,
        last_error_class = case when ${state} = 'failed' then 'provider_transient' when ${state} = 'dead' then 'max_attempts_exceeded' else null end,
        updated_at = now()
    where id = ${claim.id}
      and state = 'processing'
      and locked_by = ${claim.leaseToken}
  `.execute(db);
}

async function countUnfinishedRows(
  outboxIds?: readonly string[],
): Promise<number> {
  const candidateFilter = outboxIds
    ? outboxIds.length > 0
      ? sql`and id in (${sql.join(outboxIds)})`
      : sql`and false`
    : sql``;
  const result = await sql<{ count: string }>`
    select count(*)::text as count
    from auth_email_outbox
    where state in ('pending', 'processing', 'failed')
      ${candidateFilter}
  `.execute(db);
  return Number(result.rows[0]?.count ?? "0");
}

function retryDelayMs(attempts: number): number {
  return Math.min(300, 2 ** Math.min(attempts, 6)) * 1000;
}

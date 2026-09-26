import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { DB } from "@/db/generated";
import { sendModerationEmail } from "@/lib/auth/resend-auth-email-delivery";
import type { PublicLocale } from "@/lib/public-localization";

/**
 * The outbox of the complaint procedure's emails (ADR-0038 D5, `OVE-526`):
 * the receipt and the decision to a reporter, the statement of reasons to an
 * author. A message is written in the transaction that causes it and sent
 * afterwards — right after the request (`after()`), and again by the daily
 * cron for anything that did not go — so a decision is never recorded without
 * the letter it owes, and a mail provider that is down never loses one.
 */

type Executor = Kysely<DB> | Transaction<DB>;

export type ModerationMessageKind =
  | "report_receipt"
  | "report_decision"
  | "statement_of_reasons";

export interface ModerationMessageInput {
  contentReportId?: string | null;
  commentReportId?: string | null;
  kind: ModerationMessageKind;
  recipientEmail: string;
  recipientUserId?: string | null;
  locale: PublicLocale;
  subject: string;
  body: string;
}

/** Idempotent per report and kind: the same letter is owed once. */
export async function enqueueModerationMessage(
  executor: Executor,
  input: ModerationMessageInput,
): Promise<void> {
  const query = executor.insertInto("moderation_messages").values({
    content_report_id: input.contentReportId ?? null,
    comment_report_id: input.commentReportId ?? null,
    kind: input.kind,
    recipient_email: input.recipientEmail,
    recipient_user_id: input.recipientUserId ?? null,
    locale: input.locale,
    subject: input.subject.slice(0, 200),
    body_text: input.body.slice(0, 8000),
  });
  await (
    input.contentReportId
      ? query.onConflict((conflict) =>
          conflict
            .columns(["content_report_id", "kind"])
            .where("content_report_id", "is not", null)
            .doNothing(),
        )
      : query.onConflict((conflict) =>
          conflict
            .columns(["comment_report_id", "kind"])
            .where("comment_report_id", "is not", null)
            .doNothing(),
        )
  ).execute();
}

export interface ModerationDrainResult {
  sent: number;
  failed: number;
  /** No mail provider configured here: the messages wait for one. */
  unconfigured: boolean;
}

const MAX_ATTEMPTS = 6;

/**
 * Sends what is owed, oldest first. A message that fails is retried by the
 * next drain, up to six attempts; the row keeps an error class, never the
 * provider's words. Without a configured provider nothing is attempted and
 * nothing is marked: a local run or a proof reads the letters from the
 * outbox instead.
 */
export async function drainModerationMessages(
  options: {
    limit?: number;
    env?: Record<string, string | undefined>;
    fetcher?: (input: string, init: RequestInit) => Promise<Response>;
  } = {},
): Promise<ModerationDrainResult> {
  const env = options.env ?? process.env;
  if (!env.RESEND_API_KEY?.trim() || !env.RESEND_AUTH_FROM?.trim()) {
    return { sent: 0, failed: 0, unconfigured: true };
  }
  const due = await db
    .selectFrom("moderation_messages")
    .select(["id", "recipient_email", "subject", "body_text", "attempts"])
    .where("state", "in", ["pending", "failed"])
    .where("attempts", "<", MAX_ATTEMPTS)
    .orderBy("created_at", "asc")
    .limit(options.limit ?? 25)
    .execute();

  let sent = 0;
  let failed = 0;
  for (const message of due) {
    // Claim it: two drains running at once never both send one letter.
    const claimed = await db
      .updateTable("moderation_messages")
      .set({ attempts: sql`attempts + 1`, updated_at: new Date() })
      .where("id", "=", message.id)
      .where("attempts", "=", message.attempts)
      .where("state", "in", ["pending", "failed"])
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) === 0) continue;
    try {
      await sendModerationEmail({
        email: message.recipient_email,
        subject: message.subject,
        text: message.body_text,
        messageId: message.id,
        env,
        fetcher: options.fetcher,
      });
      await db
        .updateTable("moderation_messages")
        .set({
          state: "sent",
          sent_at: new Date(),
          last_error_class: null,
          updated_at: new Date(),
        })
        .where("id", "=", message.id)
        .execute();
      sent += 1;
    } catch (error) {
      await db
        .updateTable("moderation_messages")
        .set({
          state: "failed",
          last_error_class:
            error instanceof Error && /status \d{3}/u.test(error.message)
              ? (/status (\d{3})/u.exec(error.message)?.[0] ?? "delivery")
              : "delivery",
          updated_at: new Date(),
        })
        .where("id", "=", message.id)
        .execute();
      failed += 1;
    }
  }
  return { sent, failed, unconfigured: false };
}

/**
 * One year after the decision, the privacy policy's figure: the report, its
 * letters, and the letters of a removed comment. A report nobody has decided
 * yet is kept until it is decided.
 */
export async function purgeExpiredModerationRecords(
  executor: Executor = db,
): Promise<{ reports: number; commentMessages: number }> {
  const reports = await executor
    .deleteFrom("content_reports")
    .where("decided_at", "<", sql<Date>`now() - interval '1 year'`)
    .executeTakeFirst();
  const commentMessages = await executor
    .deleteFrom("moderation_messages")
    .where("comment_report_id", "is not", null)
    .where("created_at", "<", sql<Date>`now() - interval '1 year'`)
    .executeTakeFirst();
  return {
    reports: Number(reports.numDeletedRows),
    commentMessages: Number(commentMessages.numDeletedRows),
  };
}

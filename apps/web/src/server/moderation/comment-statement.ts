import "server-only";

import type { Transaction } from "kysely";

import type { DB } from "@/db/generated";
import { getReportCopy } from "@/lib/moderation/report-copy";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import { isPublicLocale } from "@/lib/public-localization";
import { DEFAULT_PUBLIC_SITE_URL } from "@/lib/runtime-url";
import { enqueueModerationMessage } from "@/server/moderation/moderation-mail";

/**
 * The statement of reasons for a comment the owner removed through comment
 * moderation (ADR-0038 D5: the same rules and the same letter as any other
 * content). Comment moderation records a reason and no written facts, so the
 * facts are the report's reason in words, and the ground is the terms'
 * «Що можна публікувати». Written in the removal's own transaction.
 */
const COMMENT_REASON_FACTS: Record<
  string,
  Record<"uk" | "bg" | "ru", string>
> = {
  spam: {
    uk: "коментар є спамом або рекламою",
    bg: "коментарът е спам или реклама",
    ru: "комментарий является спамом или рекламой",
  },
  harassment: {
    uk: "коментар містить образи, погрози чи цькування",
    bg: "коментарът съдържа обиди, заплахи или тормоз",
    ru: "комментарий содержит оскорбления, угрозы или травлю",
  },
  privacy: {
    uk: "коментар розкриває чужі особисті дані",
    bg: "коментарът разкрива чужди лични данни",
    ru: "комментарий раскрывает чужие личные данные",
  },
  misinformation: {
    uk: "коментар поширює неправдиву інформацію",
    bg: "коментарът разпространява невярна информация",
    ru: "комментарий распространяет недостоверную информацию",
  },
  other: {
    uk: "коментар порушує правила публікації",
    bg: "коментарът нарушава правилата за публикуване",
    ru: "комментарий нарушает правила публикации",
  },
};

export async function enqueueCommentRemovalStatement(
  trx: Transaction<DB>,
  input: {
    commentId: string;
    reportId: string;
    reason: string;
    /** The page the comment was on, as comment moderation links it. */
    address: string | null;
  },
): Promise<void> {
  const comment = await trx
    .selectFrom("engagement_comments")
    .innerJoin("user", "user.id", "engagement_comments.author_user_id")
    .select([
      "engagement_comments.author_user_id as authorUserId",
      "engagement_comments.target_kind as targetKind",
      "engagement_comments.target_ref as targetRef",
      "user.email as email",
    ])
    .where("engagement_comments.id", "=", input.commentId)
    .executeTakeFirst();
  if (!comment?.email) return;

  const address = input.address ?? "/";
  let locale: "uk" | "bg" | "ru" = "uk";
  if (comment.targetKind === "journal_entry") {
    const entry = await trx
      .selectFrom("journal_entries")
      .select("source_language as sourceLanguage")
      .where("id", "=", comment.targetRef)
      .executeTakeFirst();
    if (entry?.sourceLanguage && isPublicLocale(entry.sourceLanguage)) {
      locale = entry.sourceLanguage;
    }
  }

  const copy = getReportCopy(locale);
  const absolute = new URL(
    address,
    process.env.PUBLIC_SITE_URL?.trim() || DEFAULT_PUBLIC_SITE_URL,
  ).toString();
  const facts = (COMMENT_REASON_FACTS[input.reason] ??
    COMMENT_REASON_FACTS.other)![locale];
  await enqueueModerationMessage(trx, {
    commentReportId: input.reportId,
    kind: "statement_of_reasons",
    recipientEmail: comment.email,
    recipientUserId: comment.authorUserId,
    locale,
    subject: copy.mail.statementSubject,
    body: `${copy.mail.statementBody({
      restricted: copy.mail.restricted.comment(absolute),
      facts: `${facts.charAt(0).toUpperCase()}${facts.slice(1)}.`,
      ground: copy.mail.groundLine["terms-content"],
      supportEmail: SUPPORT_EMAIL,
    })}\n\n${copy.mail.signature}`,
  });
}

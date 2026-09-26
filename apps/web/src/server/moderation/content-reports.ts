import "server-only";

import { createHmac } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { DB } from "@/db/generated";
import { resolveBetterAuthSecret } from "@/lib/auth-secret";
import {
  PUBLIC_CACHE_TAGS,
  publicCacheTag,
  publicEntryChangeTags,
  publicProfileChangeTags,
} from "@/lib/public-cache-tags";
import {
  REPORT_RATE_LIMIT,
  reportAddressPath,
  type ReportAddress,
  type ReportDecision,
  type ReportDecisionGround,
  type ReportFormInput,
  type ReportTargetKind,
} from "@/lib/moderation/report-contract";
import { getReportCopy } from "@/lib/moderation/report-copy";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import { isPublicLocale, type PublicLocale } from "@/lib/public-localization";
import { DEFAULT_PUBLIC_SITE_URL } from "@/lib/runtime-url";
import { deleteJournalEntry } from "@/server/journal-repository";
import { enqueueModerationMessage } from "@/server/moderation/moderation-mail";
import { takeBackOwnedPhotos } from "@/server/owned-photo-repository";
import { scopedToUser, type RequestScope } from "@/server/request-scope";

/**
 * The complaint procedure (ADR-0038 D5, `OVE-526`; DSA Art. 16 and 17):
 * anyone reports a public page, the owner decides, and every decision is
 * recorded and written to whoever it concerns.
 */

type Executor = Kysely<DB> | Transaction<DB>;

export interface ReportTarget {
  kind: ReportTargetKind;
  id: string;
  /** Whose content it is; a tag page belongs to nobody. */
  ownerUserId: string | null;
  /** The canonical path, without a language prefix. */
  address: string;
  /** What the owner's list names it by. */
  label: string;
}

/** The page behind an address, when it is public right now. */
export async function resolveReportTarget(
  address: ReportAddress,
  executor: Executor = db,
): Promise<ReportTarget | null> {
  const path = reportAddressPath(address);
  switch (address.kind) {
    case "entry": {
      const row = await executor
        .selectFrom("journal_entries")
        .innerJoin("user_handle_registry", (join) =>
          join
            .onRef(
              "user_handle_registry.user_id",
              "=",
              "journal_entries.owner_user_id",
            )
            .on("user_handle_registry.lifecycle_state", "=", "current"),
        )
        .select([
          "journal_entries.id",
          "journal_entries.owner_user_id as ownerUserId",
          "journal_entries.title",
        ])
        .where("user_handle_registry.normalized_handle", "=", address.handle)
        .where("journal_entries.author_entry_number", "=", address.entryNumber)
        .where("journal_entries.visibility", "=", "public")
        .where("journal_entries.lifecycle_state", "=", "active")
        .where("journal_entries.public_gone_at", "is", null)
        .where("journal_entries.published_at", "is not", null)
        .executeTakeFirst();
      return row
        ? {
            kind: "entry",
            id: row.id,
            ownerUserId: row.ownerUserId,
            address: path,
            label: row.title,
          }
        : null;
    }
    case "object": {
      const row = await executor
        .selectFrom("plant_objects")
        .innerJoin("user_handle_registry", (join) =>
          join
            .onRef(
              "user_handle_registry.user_id",
              "=",
              "plant_objects.owner_user_id",
            )
            .on("user_handle_registry.lifecycle_state", "=", "current"),
        )
        .select([
          "plant_objects.id",
          "plant_objects.owner_user_id as ownerUserId",
          "plant_objects.display_name as label",
        ])
        .where("user_handle_registry.normalized_handle", "=", address.handle)
        .where("plant_objects.public_slug", "=", address.slug)
        .executeTakeFirst();
      return row
        ? {
            kind: "object",
            id: row.id,
            ownerUserId: row.ownerUserId,
            address: path,
            label: row.label,
          }
        : null;
    }
    case "profile": {
      const row = await executor
        .selectFrom("user_handle_registry")
        .innerJoin(
          "user_public_profiles",
          "user_public_profiles.user_id",
          "user_handle_registry.user_id",
        )
        .select([
          "user_handle_registry.user_id as id",
          "user_public_profiles.display_name as displayName",
        ])
        .where("user_handle_registry.normalized_handle", "=", address.handle)
        .where("user_handle_registry.lifecycle_state", "=", "current")
        .where("user_public_profiles.profile_lifecycle_state", "=", "active")
        .executeTakeFirst();
      return row
        ? {
            kind: "profile",
            id: row.id,
            ownerUserId: row.id,
            address: path,
            label: row.displayName
              ? `${row.displayName} (@${address.handle})`
              : `@${address.handle}`,
          }
        : null;
    }
    case "topic": {
      const row = await executor
        .selectFrom("journal_topics")
        .select(["id", "label"])
        .where("slug", "=", address.slug)
        .where("trust_state", "!=", "rejected")
        .executeTakeFirst();
      return row
        ? {
            kind: "topic",
            id: row.id,
            ownerUserId: null,
            address: path,
            label: row.label,
          }
        : null;
    }
  }
}

/**
 * The rate limit's key: an HMAC of the network address, 43 characters. The
 * address itself is never stored, and the key means nothing without the
 * deployment's secret.
 */
export function reportFingerprint(networkAddress: string): string {
  return createHmac("sha256", resolveBetterAuthSecret())
    .update("overgarden:content-report\0")
    .update(networkAddress.trim().toLowerCase() || "unknown")
    .digest("base64url");
}

export type SubmitContentReportResult =
  | { status: "received"; reportId: string }
  | { status: "rate_limited" };

/**
 * One report, with its receipt letter, in one transaction. Reports from one
 * network address are counted under an advisory lock on its key, so two
 * submitted at once cannot both slip under the limit.
 */
export async function submitContentReport(input: {
  form: ReportFormInput;
  target: ReportTarget;
  fingerprint: string;
  reporterUserId: string | null;
  locale: PublicLocale;
}): Promise<SubmitContentReportResult> {
  return db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtext(${`content-report:${input.fingerprint}`}))`.execute(
      trx,
    );
    const counts = await trx
      .selectFrom("content_reports")
      .select([
        sql<number>`count(*) filter (where created_at > now() - interval '1 hour')::int`.as(
          "hour",
        ),
        sql<number>`count(*)::int`.as("day"),
      ])
      .where("reporter_fingerprint", "=", input.fingerprint)
      .where("created_at", ">", sql<Date>`now() - interval '1 day'`)
      .executeTakeFirstOrThrow();
    if (
      counts.hour >= REPORT_RATE_LIMIT.perHour ||
      counts.day >= REPORT_RATE_LIMIT.perDay
    ) {
      return { status: "rate_limited" } as const;
    }

    const report = await trx
      .insertInto("content_reports")
      .values({
        target_kind: input.target.kind,
        target_id: input.target.id,
        target_address: input.target.address,
        target_owner_user_id: input.target.ownerUserId,
        reason: input.form.reason,
        explanation: input.form.explanation,
        reporter_name: input.form.name,
        reporter_email: input.form.email,
        reporter_user_id: input.reporterUserId,
        reporter_fingerprint: input.fingerprint,
        locale: input.locale,
        good_faith_confirmed_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const copy = getReportCopy(input.locale);
    await enqueueModerationMessage(trx, {
      contentReportId: report.id,
      kind: "report_receipt",
      recipientEmail: input.form.email,
      recipientUserId: input.reporterUserId,
      locale: input.locale,
      subject: copy.mail.receiptSubject,
      body: withSignature(
        copy.mail.receiptBody({
          address: absoluteAddress(input.target.address),
          reason: copy.form.reasons[input.form.reason],
        }),
        copy.mail.signature,
      ),
    });
    return { status: "received", reportId: report.id } as const;
  });
}

export interface OwnerReportRow {
  id: string;
  kind: ReportTargetKind;
  address: string;
  reason: string;
  explanation: string;
  reporterName: string;
  reporterEmail: string;
  createdAt: Date;
  state: "received" | ReportDecision;
  decisionGround: string | null;
  decisionFacts: string | null;
  decidedAt: Date | null;
}

/** The owner's list: every open report, then the last fifty decided. */
export async function listContentReportsForOwner(
  executor: Executor = db,
): Promise<{ received: OwnerReportRow[]; decided: OwnerReportRow[] }> {
  const select = (state: "open" | "decided") => {
    const query = executor
      .selectFrom("content_reports")
      .select([
        "id",
        "target_kind as kind",
        "target_address as address",
        "reason",
        "explanation",
        "reporter_name as reporterName",
        "reporter_email as reporterEmail",
        "created_at as createdAt",
        "state",
        "decision_ground as decisionGround",
        "decision_facts as decisionFacts",
        "decided_at as decidedAt",
      ]);
    return state === "open"
      ? query
          .where("state", "=", "received")
          .orderBy("created_at", "asc")
          .limit(200)
      : query
          .where("state", "!=", "received")
          .orderBy("decided_at", "desc")
          .limit(50);
  };
  const [received, decided] = await Promise.all([
    select("open").execute(),
    select("decided").execute(),
  ]);
  const cast = (rows: typeof received) =>
    rows.map((row) => ({
      ...row,
      kind: row.kind as ReportTargetKind,
      state: row.state as OwnerReportRow["state"],
      createdAt: new Date(row.createdAt),
      decidedAt: row.decidedAt ? new Date(row.decidedAt) : null,
    }));
  return { received: cast(received), decided: cast(decided) };
}

export interface DecideContentReportInput {
  reportId: string;
  decision: ReportDecision;
  ground: ReportDecisionGround | null;
  facts: string;
}

export type DecideContentReportResult =
  | { status: "done"; cacheTags: string[]; paths: string[] }
  | { status: "stale" };

/**
 * The owner's decision. A removal takes the content down first — for an
 * entry through the author's own delete, which scrubs it and queues its
 * search and media removal — and then records the decision and its letters
 * in one transaction: the decision to the reporter, and to the author a
 * statement of reasons (DSA Art. 17). A takedown that ran before a failed
 * record runs again harmlessly on the retry.
 */
export async function decideContentReport(
  owner: RequestScope,
  input: DecideContentReportInput,
): Promise<DecideContentReportResult> {
  const report = await db
    .selectFrom("content_reports")
    .selectAll()
    .where("id", "=", input.reportId)
    .executeTakeFirst();
  if (!report || report.state !== "received") return { status: "stale" };
  const kind = report.target_kind as ReportTargetKind;

  const takedown =
    input.decision === "removed"
      ? await takeDown(kind, report.target_id, report.target_owner_user_id)
      : { cacheTags: [], paths: [], authorLocale: null };

  const recorded = await db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("content_reports")
      .set({
        state: input.decision,
        decision_ground: input.decision === "removed" ? input.ground : null,
        decision_facts: input.facts,
        decided_at: new Date(),
        decided_by_user_id: owner.userId,
      })
      .where("id", "=", report.id)
      .where("state", "=", "received")
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) === 0) return false;

    const reporterLocale = asLocale(report.locale);
    const reporterCopy = getReportCopy(reporterLocale);
    const address = absoluteAddress(report.target_address);
    await enqueueModerationMessage(trx, {
      contentReportId: report.id,
      kind: "report_decision",
      recipientEmail: report.reporter_email,
      recipientUserId: report.reporter_user_id,
      locale: reporterLocale,
      subject: reporterCopy.mail.decisionSubject,
      body: withSignature(
        reporterCopy.mail.decisionBody({
          address,
          decision: input.decision,
          facts: input.facts,
        }),
        reporterCopy.mail.signature,
      ),
    });

    if (
      input.decision === "removed" &&
      input.ground &&
      report.target_owner_user_id
    ) {
      const author = await trx
        .selectFrom("user")
        .select(["email"])
        .where("id", "=", report.target_owner_user_id)
        .executeTakeFirst();
      if (author?.email) {
        const authorLocale = takedown.authorLocale ?? "uk";
        const authorCopy = getReportCopy(authorLocale);
        await enqueueModerationMessage(trx, {
          contentReportId: report.id,
          kind: "statement_of_reasons",
          recipientEmail: author.email,
          recipientUserId: report.target_owner_user_id,
          locale: authorLocale,
          subject: authorCopy.mail.statementSubject,
          body: withSignature(
            authorCopy.mail.statementBody({
              restricted: authorCopy.mail.restricted[kind](address),
              facts: input.facts,
              ground: authorCopy.mail.groundLine[input.ground],
              supportEmail: SUPPORT_EMAIL,
            }),
            authorCopy.mail.signature,
          ),
        });
      }
    }
    return true;
  });
  if (!recorded) return { status: "stale" };
  return {
    status: "done",
    cacheTags: takedown.cacheTags,
    paths: takedown.paths,
  };
}

interface TakedownResult {
  cacheTags: string[];
  paths: string[];
  /** The language the author's letter is written in. */
  authorLocale: PublicLocale | null;
}

async function takeDown(
  kind: ReportTargetKind,
  targetId: string,
  ownerUserId: string | null,
): Promise<TakedownResult> {
  switch (kind) {
    case "entry": {
      const entry = await db
        .selectFrom("journal_entries")
        .select([
          "owner_user_id",
          "public_slug",
          "plant_object_id",
          "source_language",
        ])
        .where("id", "=", targetId)
        .executeTakeFirst();
      if (!entry) return { cacheTags: [], paths: [], authorLocale: null };
      // The author's own delete: the same scrub, search removal and media
      // revocation an author's «Видалити» runs, and the same seven-day
      // technical tombstone. An entry already deleted is answered as such.
      await deleteJournalEntry(scopedToUser(entry.owner_user_id), {
        entryId: targetId,
      });
      return {
        cacheTags: publicEntryChangeTags({
          entryId: targetId,
          publicSlug: entry.public_slug,
          ownerUserId: entry.owner_user_id,
          plantObjectId: entry.plant_object_id,
        }),
        paths: ["/garden"],
        authorLocale: asLocale(entry.source_language),
      };
    }
    case "profile": {
      const profile = await db
        .updateTable("user_public_profiles")
        .set({
          display_name: null,
          bio: null,
          avatar_url: null,
          avatar_media_asset_id: null,
          updated_at: new Date(),
        })
        .where("user_id", "=", targetId)
        .returning(["handle", "languages"])
        .executeTakeFirst();
      return {
        cacheTags: publicProfileChangeTags({
          ownerUserId: targetId,
          handle: profile?.handle ?? null,
        }),
        paths: [],
        authorLocale: asLocale(profile?.languages?.[0]),
      };
    }
    case "object": {
      if (!ownerUserId) return { cacheTags: [], paths: [], authorLocale: null };
      await db.transaction().execute(async (trx) => {
        await takeBackOwnedPhotos(trx, {
          ownerUserId,
          owner: { kind: "object", id: targetId },
        });
        await trx
          .updateTable("plant_objects")
          .set({
            display_name: sql<string>`case when object_kind = 'animal' then 'Тварина' else 'Рослина' end`,
            updated_at: new Date(),
          })
          .where("id", "=", targetId)
          .execute();
      });
      return {
        cacheTags: [
          publicCacheTag.object(targetId),
          publicCacheTag.profileOwner(ownerUserId),
          PUBLIC_CACHE_TAGS.catalog,
          PUBLIC_CACHE_TAGS.feed,
          PUBLIC_CACHE_TAGS.journals,
        ],
        paths: ["/garden", `/garden/objects/${targetId}`],
        authorLocale: null,
      };
    }
    case "topic": {
      const topic = await db
        .updateTable("journal_topics")
        .set({ trust_state: "rejected", updated_at: new Date() })
        .where("id", "=", targetId)
        .returning("slug")
        .executeTakeFirst();
      return {
        cacheTags: [
          ...(topic ? [publicCacheTag.topic(topic.slug)] : []),
          PUBLIC_CACHE_TAGS.topics,
          PUBLIC_CACHE_TAGS.feed,
          PUBLIC_CACHE_TAGS.sitemap,
        ],
        paths: [],
        authorLocale: null,
      };
    }
  }
}

function asLocale(value: unknown): PublicLocale {
  return typeof value === "string" && isPublicLocale(value) ? value : "uk";
}

function absoluteAddress(path: string): string {
  const origin = process.env.PUBLIC_SITE_URL?.trim() || DEFAULT_PUBLIC_SITE_URL;
  return new URL(path, origin).toString();
}

function withSignature(body: string, signature: string): string {
  return `${body}\n\n${signature}`;
}

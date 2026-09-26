import "server-only";

import { sql, type Kysely } from "kysely";

import { db } from "@/db";
import type { DB } from "@/db/generated";
import {
  LEGAL_BUNDLE_VERSION,
  LEGAL_EFFECTIVE_DATE,
} from "@/lib/legal/legal-documents";

/**
 * The one acceptance of the terms, the privacy policy and the cookie rules
 * (ADR-0038 D2, `OVE-526`), as the rest of the server reads and writes it.
 *
 * The email sign-up writes its receipt inside Better Auth
 * (`lib/auth/legal-acceptance.ts`); everything else goes through here: the
 * proxy asking whether a workspace page may be drawn, `resolveMutationScope`
 * asking whether a write may run, and the acceptance screen's two answers.
 */

export type LegalAcceptanceSource = "sign_up" | "acceptance_screen";

export type LegalAcceptanceState =
  /** A receipt for the current versions exists. */
  | "current"
  /** Only a receipt for an earlier version exists: the documents changed. */
  | "outdated"
  /** Never accepted anything. */
  | "none";

export async function readLegalAcceptanceState(
  ownerUserId: string,
  executor: Kysely<DB> = db,
): Promise<LegalAcceptanceState> {
  const row = await executor
    .selectFrom("legal_acceptances")
    .select([
      sql<boolean>`bool_or(bundle_version = ${LEGAL_BUNDLE_VERSION})`.as(
        "current",
      ),
      sql<number>`count(*)::int`.as("count"),
    ])
    .where("owner_user_id", "=", ownerUserId)
    .executeTakeFirst();
  if (!row || row.count === 0) return "none";
  return row.current ? "current" : "outdated";
}

export async function hasCurrentLegalAcceptance(
  ownerUserId: string,
  executor: Kysely<DB> = db,
): Promise<boolean> {
  const row = await executor
    .selectFrom("legal_acceptances")
    .select("owner_user_id")
    .where("owner_user_id", "=", ownerUserId)
    .where("bundle_version", "=", LEGAL_BUNDLE_VERSION)
    .executeTakeFirst();
  return Boolean(row);
}

/** Idempotent: accepting twice keeps the first time. */
export async function recordLegalAcceptance(
  ownerUserId: string,
  source: LegalAcceptanceSource,
  executor: Kysely<DB> = db,
): Promise<void> {
  await executor
    .insertInto("legal_acceptances")
    .values({
      owner_user_id: ownerUserId,
      bundle_version: LEGAL_BUNDLE_VERSION,
      source,
    })
    .onConflict((conflict) =>
      conflict.columns(["owner_user_id", "bundle_version"]).doNothing(),
    )
    .execute();
}

/**
 * Whether declining deletes the account rather than only signing it out.
 *
 * Only an account that the documents existed for and that has never accepted
 * them: it was created on or after the day they took effect (so by a Google
 * sign-in, since the email sign-up cannot finish without accepting), it has
 * no receipt of any version and no first-publication receipt, and it owns no
 * space, plant or animal, or entry — which it could not have written, every
 * write being refused without a receipt. Its data is the sign-in identity
 * itself, and keeping it for somebody who declined would keep an account
 * they refused to open. An older account that declines a new version is
 * signed out and keeps everything.
 */
export async function isDeclinableNewAccount(
  ownerUserId: string,
  executor: Kysely<DB> = db,
): Promise<boolean> {
  const row = await executor
    .selectFrom("user")
    .select([
      sql<boolean>`"user"."createdAt" >= ${LEGAL_EFFECTIVE_DATE}::date`.as(
        "created_since_terms",
      ),
      sql<boolean>`exists (select 1 from legal_acceptances where owner_user_id = "user".id)`.as(
        "accepted_before",
      ),
      sql<boolean>`exists (select 1 from publication_disclosure_acceptances where owner_user_id = "user".id)`.as(
        "published_before",
      ),
      sql<boolean>`(
        exists (select 1 from spaces where owner_user_id = "user".id)
        or exists (select 1 from plant_objects where owner_user_id = "user".id)
        or exists (select 1 from journal_entries where owner_user_id = "user".id)
      )`.as("owns_content"),
    ])
    .where("id", "=", ownerUserId)
    .executeTakeFirst();
  return Boolean(
    row &&
    row.created_since_terms &&
    !row.accepted_before &&
    !row.published_before &&
    !row.owns_content,
  );
}

/**
 * Deletes a just-created account that declined. Guarded twice: the caller
 * asked `isDeclinableNewAccount`, and the statement asks again, so a receipt
 * written between the two keeps the account.
 */
export async function deleteDeclinedNewAccount(
  ownerUserId: string,
  executor: Kysely<DB> = db,
): Promise<boolean> {
  const result = await executor
    .deleteFrom("user")
    .where("id", "=", ownerUserId)
    .where(
      sql<boolean>`"createdAt" >= ${LEGAL_EFFECTIVE_DATE}::date
        and not exists (select 1 from legal_acceptances where owner_user_id = ${ownerUserId}::uuid)
        and not exists (select 1 from publication_disclosure_acceptances where owner_user_id = ${ownerUserId}::uuid)
        and not exists (select 1 from spaces where owner_user_id = ${ownerUserId}::uuid)
        and not exists (select 1 from plant_objects where owner_user_id = ${ownerUserId}::uuid)
        and not exists (select 1 from journal_entries where owner_user_id = ${ownerUserId}::uuid)`,
    )
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

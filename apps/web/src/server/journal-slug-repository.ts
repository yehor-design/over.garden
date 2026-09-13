import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { addressManifestEntry } from "@/lib/address/address-manifest";
import { isAddressSlug } from "@/lib/address/address-contract.generated";
import {
  reservedAsTaken,
  resolveAddressCollision,
  slugify,
} from "@/lib/address/slugify";
import type { PublicLocale } from "@/lib/public-localization";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const JOURNAL_ENTRY = addressManifestEntry("journalEntry");

/**
 * The entry's address, from the author's own title (ADR-0029 D4, D6).
 *
 * What this replaces appended twelve hexadecimal characters of the publish id
 * to a title it had already mangled, so `Полив без календарної пастки` came
 * out as `полив-без-календарноі-пастки-5364380c26`. The tail was never a
 * disambiguator anybody chose — it was there because nothing counted, and it
 * cost the slug the only thing a slug is for.
 *
 * Now the base is the title and the disambiguator is a counter: `-2`, `-3`, …
 * against the slugs already issued.
 *
 * **The advisory lock is what makes the counter safe.** Two transactions
 * publishing the same title at the same moment would otherwise both read a
 * free base and both insert it, and the partial unique index would fail the
 * second one at publish time. Locking the base first serializes them, and
 * because each statement in a read-committed transaction takes a fresh
 * snapshot, the second transaction's read happens after the first has
 * committed and sees the row it wrote. The lock is taken after the per-owner
 * lock `prepareAtomicCreateTransaction` already holds, always in that order,
 * so no pair of transactions can wait on each other.
 *
 * **The scope is the gardener** (migration `0073`, ADR-0029 D6): the lock, the
 * taken set and the unique index are all per owner, so two gardeners both get
 * `мій-перший-помідор` under their own handles. The taken set reads the slug
 * history under the gardener's current handle as well as the live column: an
 * address that was moved still answers 308 from its old slug (D8), and a
 * counter that read only the live column would hand that old slug to a second
 * entry, so the old link would silently start opening a different one.
 */
export async function assignJournalEntrySlug(
  executor: QueryExecutor,
  input: { title: string; sourceLanguage: PublicLocale; ownerUserId: string },
): Promise<string> {
  const base = slugify(input.title, {
    script: JOURNAL_ENTRY.script,
    language: input.sourceLanguage,
    budget: JOURNAL_ENTRY.budget,
    fallback: "entry",
  });
  if (!isAddressSlug("journalEntry", base)) {
    throw new Error(`Not a journal entry slug: ${base}`);
  }

  await sql`select pg_advisory_xact_lock(hashtextextended(${`journal-entry-slug:${input.ownerUserId}:${base}`}, 0))`.execute(
    executor,
  );

  const taken = await buildTakenJournalEntrySlugsQuery(
    executor,
    input.ownerUserId,
    base,
  ).execute();
  return resolveAddressCollision(
    "journalEntry",
    base,
    reservedAsTaken(
      JOURNAL_ENTRY.reservedWords,
      taken.map((row) => row.slug),
    ),
  );
}

/**
 * Every slug of this gardener's that could collide with the base or one of
 * its `-N` suffixes — the live column *and* the slug history under the
 * gardener's current handle.
 *
 * `like` with the base as a prefix is the same shape
 * `buildTakenCatalogSlugsQuery` uses, and it is deliberately wider than the
 * `-N` set: a slug the counter would never produce still occupies the name.
 */
export function buildTakenJournalEntrySlugsQuery(
  executor: QueryExecutor,
  ownerUserId: string,
  base: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(["journal_entries.public_slug as slug"])
    .where("journal_entries.owner_user_id", "=", ownerUserId)
    .where("journal_entries.public_slug", "is not", null)
    .where((eb) =>
      eb.or([
        eb("journal_entries.public_slug", "=", base),
        eb("journal_entries.public_slug", "like", `${base}-%`),
      ]),
    )
    .$narrowType<{ slug: string }>()
    .union(
      executor
        .selectFrom("journal_entry_slug_history as history")
        .innerJoin("user_handle_registry", (join) =>
          join
            .onRef(
              "user_handle_registry.normalized_handle",
              "=",
              "history.author_handle",
            )
            .on("user_handle_registry.lifecycle_state", "=", "current"),
        )
        .select(["history.slug as slug"])
        .where("user_handle_registry.user_id", "=", ownerUserId)
        .where((eb) =>
          eb.or([
            eb("history.slug", "=", base),
            eb("history.slug", "like", `${base}-%`),
          ]),
        ),
    );
}

export interface JournalEntryAddress {
  readonly handle: string;
  readonly slug: string;
}

/**
 * The address an entry has now, found from any address it has ever had
 * (ADR-0029 D8).
 *
 * With the handle — an author-scoped request — the live column answers first
 * for `(handle, slug)`, then the history for the same pair, including rows
 * whose `valid_to` is set: that is exactly what a closed row is for. Without
 * the handle — a legacy `/journal/{slug}` request, which carries none — the
 * slug is ambiguous since `0073` made names per author, so the live column
 * answers only when exactly one entry has the slug, and otherwise the oldest
 * history row does: the legacy namespace was global, so the address a reader
 * shared before the move belongs to the entry that held the slug first.
 *
 * The handle comes from the registry rather than from the history row, so a
 * gardener who has since renamed their handle still gets one working
 * destination instead of a redirect to an address nobody answers at.
 */
export async function resolveJournalEntryAddress(
  slug: string,
  executor: QueryExecutor = db,
  authorHandle: string | null = null,
): Promise<JournalEntryAddress | null> {
  let liveQuery = executor
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
      "user_handle_registry.normalized_handle as handle",
      "journal_entries.public_slug as slug",
    ])
    .where("journal_entries.public_slug", "=", slug)
    .where("journal_entries.lifecycle_state", "=", "active")
    .limit(2);
  if (authorHandle !== null) {
    liveQuery = liveQuery.where(
      "user_handle_registry.normalized_handle",
      "=",
      authorHandle,
    );
  }
  const live = await liveQuery.execute();
  if (live.length === 1 && live[0]!.slug) {
    return { handle: live[0]!.handle, slug: live[0]!.slug };
  }

  let historyQuery = executor
    .selectFrom("journal_entry_slug_history")
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "journal_entry_slug_history.journal_entry_id",
    )
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
      "user_handle_registry.normalized_handle as handle",
      "journal_entries.public_slug as slug",
    ])
    .where("journal_entry_slug_history.slug", "=", slug)
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_slug", "is not", null)
    .orderBy("journal_entry_slug_history.valid_from", "asc")
    .orderBy("journal_entry_slug_history.id", "asc");
  if (authorHandle !== null) {
    historyQuery = historyQuery.where(
      "journal_entry_slug_history.author_handle",
      "=",
      authorHandle,
    );
  }
  const historical = await historyQuery.executeTakeFirst();
  return historical?.slug
    ? { handle: historical.handle, slug: historical.slug }
    : null;
}

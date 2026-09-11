import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

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
 * The uniqueness scope is global here and per-author in the manifest, because
 * `OVE-428` moves entries to `/@{handle}/{slug}` and gives the namespace its
 * own history table. Until then the live column is the whole history: nothing
 * re-slugs an entry yet, so no retired slug exists to be handed out twice.
 */
export async function assignJournalEntrySlug(
  executor: QueryExecutor,
  input: { title: string; sourceLanguage: PublicLocale },
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

  await sql`select pg_advisory_xact_lock(hashtextextended(${`journal-entry-slug:${base}`}, 0))`.execute(
    executor,
  );

  const taken = await buildTakenJournalEntrySlugsQuery(executor, base).execute();
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
 * Every slug that could collide with the base or one of its `-N` suffixes.
 *
 * `like` with the base as a prefix is the same shape
 * `buildTakenCatalogSlugsQuery` uses, and it is deliberately wider than the
 * `-N` set: a slug the counter would never produce still occupies the name.
 */
export function buildTakenJournalEntrySlugsQuery(
  executor: QueryExecutor,
  base: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(["journal_entries.public_slug as slug"])
    .where("journal_entries.public_slug", "is not", null)
    .where((eb) =>
      eb.or([
        eb("journal_entries.public_slug", "=", base),
        eb("journal_entries.public_slug", "like", `${base}-%`),
      ]),
    )
    .$narrowType<{ slug: string }>();
}

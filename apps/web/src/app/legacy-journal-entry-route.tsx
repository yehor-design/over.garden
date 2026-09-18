import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";

import { isAddressSlug } from "@/lib/address/address-contract.generated";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import { logAddressRefusal } from "@/server/address-refusal-log";

/**
 * Every address an entry had before its number (ADR-0029 D9, amendment of
 * 2026-09-18): `/journal/{slug}`, its locale-prefixed spellings, and the
 * `/@{handle}/{slug}` of 2026-09-12.
 *
 * A document request never reaches this. `src/proxy.ts` resolves the name and
 * answers one 308 before any shell streams, which is the only place a real
 * status can be chosen under Cache Components (ADR-0023). What reaches a route
 * is the request the proxy does not treat as a document navigation — a
 * client-side transition from a page that was rendered, and cached, while the
 * old address was still the canonical one. `use cache` holds a listing for
 * hours, so for hours after the deploy a reader can press a link that names an
 * entry by its slug; without this the router would be handed a not-found page
 * for an entry that exists.
 *
 * `permanentRedirect` is right *here* for the reason it is wrong on a hard
 * load: the client router follows it, and there is no status line to get
 * wrong.
 */
export async function redirectLegacyJournalEntry(input: {
  slug: string;
  /** The handle the address carried, or `null` for the flat `/journal/{slug}`. */
  authorHandle: string | null;
}): Promise<never> {
  // Before the read: a build must not reach the database (the preview
  // environment has none), and `connection()` is what says so.
  await connection();

  if (!isAddressSlug("journalEntry", input.slug)) {
    logAddressRefusal({
      route: "legacy_journal_entry",
      reason: "address_unparsed",
      detail: { slug: input.slug, handle: input.authorHandle },
    });
    notFound();
  }

  const { resolveJournalEntryAddress } = await import(
    "@/server/journal-slug-repository"
  );
  const address = await resolveJournalEntryAddress(
    input.slug,
    undefined,
    input.authorHandle,
  );
  if (!address) {
    logAddressRefusal({
      route: "legacy_journal_entry",
      reason: "name_resolves_to_nothing",
      detail: { slug: input.slug, handle: input.authorHandle },
    });
    notFound();
  }

  permanentRedirect(publicJournalEntryPath(address.handle, address.entryNumber));
}

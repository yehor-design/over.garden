import { notFound } from "next/navigation";

import PublicJournalEntryRoute, {
  generateMetadata as generateEntryMetadata,
} from "@/app/[locale]/journal/[slug]/page";
import { matchAuthorScopedEntryPath } from "@/lib/address/match-address-path";
import {
  publicJournalEntryPath,
  publicProfileBasePath,
} from "@/lib/garden/public-paths";

/**
 * An entry at its own address: `/@{handle}/{slug}` (ADR-0029 D9).
 *
 * The implementation stays under `journal/[slug]`, which is where the proxy's
 * bounded lookup, the cache tags and the metadata builder already live; this
 * route is the address. The handle is checked rather than trusted — nothing
 * stops a reader typing `/@someone-else/{slug}`, and answering 200 there would
 * hand one gardener's entry a second address under another's name.
 */
interface AuthorScopedEntryRouteProps {
  params: Promise<{
    locale: string;
    profileHandle: string;
    entrySlug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

async function resolveAddress(
  params: AuthorScopedEntryRouteProps["params"],
): Promise<{ locale: string; slug: string } | null> {
  const { locale, profileHandle, entrySlug } = await params;
  const matched = matchAuthorScopedEntryPath(
    `${publicProfileBasePath(profileHandle)}/${entrySlug}`,
  );
  return matched ? { locale, slug: matched.slug } : null;
}

export async function generateMetadata({
  params,
}: AuthorScopedEntryRouteProps) {
  const address = await resolveAddress(params);
  if (!address) return {};
  return generateEntryMetadata({
    params: Promise.resolve({ locale: address.locale, slug: address.slug }),
  });
}

export default async function AuthorScopedEntryRoute({
  params,
  searchParams,
}: AuthorScopedEntryRouteProps) {
  const { profileHandle, entrySlug } = await params;
  const address = await resolveAddress(params);
  if (!address) notFound();

  const { getPublicJournalEntryLifecycleLookup } = await import(
    "@/server/journal-repository"
  );
  const lookup = await getPublicJournalEntryLifecycleLookup(address.slug);
  const handle = profileHandle.replace(/^@/u, "").toLowerCase();
  if (
    lookup.status !== "active" ||
    lookup.addressHandle === null ||
    publicJournalEntryPath(lookup.addressHandle, lookup.publicSlug) !==
      publicJournalEntryPath(handle, decodeURIComponent(entrySlug))
  ) {
    notFound();
  }

  return PublicJournalEntryRoute({
    params: Promise.resolve({ locale: address.locale, slug: address.slug }),
    searchParams,
  });
}

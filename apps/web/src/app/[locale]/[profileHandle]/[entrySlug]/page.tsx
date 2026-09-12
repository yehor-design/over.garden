import { notFound } from "next/navigation";

import PublicJournalEntryRoute, {
  generateMetadata as generateEntryMetadata,
} from "@/app/[locale]/journal/[slug]/page";
import { matchAuthorScopedEntryPath } from "@/lib/address/match-address-path";
import {
  publicJournalEntryPath,
  publicProfileBasePath,
} from "@/lib/garden/public-paths";
import { logAddressRefusal } from "@/server/address-refusal-log";

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

/**
 * A route segment as the address law spells it, whatever the router handed us.
 *
 * Next decodes a dynamic segment before it reaches `params`, so `%40yehor` in
 * the URL arrives as `@yehor`. Decoding again is a no-op on the decoded form
 * and correct on the encoded one, which is what the profile route beside this
 * one has always done; assuming one spelling is how a route ends up refusing
 * its own address.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function routeHandle(profileHandle: string): string {
  return decodeSegment(profileHandle).replace(/^@/u, "").toLowerCase();
}

async function resolveAddress(
  params: AuthorScopedEntryRouteProps["params"],
): Promise<{ locale: string; slug: string } | null> {
  const { locale, profileHandle, entrySlug } = await params;
  const matched = matchAuthorScopedEntryPath(
    `${publicProfileBasePath(routeHandle(profileHandle))}/${encodeURIComponent(
      decodeSegment(entrySlug),
    )}`,
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
  if (!address) {
    logAddressRefusal({
      route: "author_scoped_entry",
      reason: "address_unparsed",
      detail: { profileHandle, entrySlug },
    });
    notFound();
  }

  const { getPublicJournalEntryLifecycleLookup } = await import(
    "@/server/journal-repository"
  );
  const lookup = await getPublicJournalEntryLifecycleLookup(address.slug);
  const requested = publicJournalEntryPath(
    routeHandle(profileHandle),
    decodeSegment(entrySlug),
  );
  const canonical =
    lookup.status === "active" && lookup.addressHandle !== null
      ? publicJournalEntryPath(lookup.addressHandle, lookup.publicSlug)
      : null;
  if (canonical === null || canonical !== requested) {
    logAddressRefusal({
      route: "author_scoped_entry",
      reason:
        lookup.status !== "active"
          ? `lookup_${lookup.status}`
          : lookup.addressHandle === null
            ? "author_without_handle"
            : "handle_not_the_author",
      detail: { slug: address.slug, canonical, requested },
    });
    notFound();
  }

  return PublicJournalEntryRoute({
    params: Promise.resolve({ locale: address.locale, slug: address.slug }),
    searchParams,
  });
}

import {
  ADDRESS_LOWER_CASE_PATH_PREFIXES,
  isAddressSlug,
} from "@/lib/address/address-contract.generated";
import { addressManifestEntry } from "@/lib/address/address-manifest";
import type { AddressNamespace } from "@/lib/address/address-manifest";
import {
  matchCatalogSpeciesHubPath,
  matchPublicCatalogAddressPath,
} from "@/lib/catalog/addresses";
import { PUBLIC_OBJECT_PASSPORT_SEGMENT } from "@/lib/garden/public-paths";
import { stripLocalePrefix } from "@/lib/public-localization";

/**
 * The slug a public address carries, or `null` when the path is not that
 * address at all (ADR-0029 D3, D12).
 *
 * One matcher, because there were four and they disagreed. `/communities/` was
 * matched with `[a-z0-9][a-z0-9-]{1,63}`, which is the pattern the column had
 * before `OVE-426` widened it — a Cyrillic community would have stopped
 * matching its own route the day one existed. `/journal/` and
 * `/lineage/objects/` matched `[^/]+` with the `i` flag, so an upper-case or
 * malformed segment matched and was handed to a lookup that could only answer
 * "not found", when the honest answers are a 308 and a 404 respectively.
 *
 * Validation happens here rather than after, so the proxy's bounded lookups
 * are only ever asked about slugs that could exist. What this returns is
 * decoded: every caller compares it with a stored value, never with a URL.
 */
export function matchAddressPath(
  namespace: AddressNamespace,
  pathname: string,
): string | null {
  const entry = addressManifestEntry(namespace);
  const path = pathWithoutTrailingSlash(stripLocalePrefix(pathname).path);
  // Three namespaces share `/@`, and each is a different shape under it, so
  // that prefix is left to `matchAuthorScopedPath`. What remains here is the
  // one-segment shape: a namespace's own prefix where it has one of its own,
  // and the older prefixes it still answers under behind a 308.
  const prefixes = [entry.pathPrefix, ...entry.legacyPathPrefixes].filter(
    (prefix) => prefix !== "/@",
  );

  for (const prefix of prefixes) {
    if (!path.startsWith(prefix)) continue;
    const remainder = path.slice(prefix.length);
    if (remainder.length === 0 || remainder.includes("/")) continue;
    const decoded = decodeSegment(remainder);
    if (decoded === null) continue;
    if (isAddressSlug(namespace, decoded)) return decoded;
  }
  return null;
}

export interface AuthorScopedAddress {
  readonly handle: string;
  readonly slug: string;
}

/**
 * The three shapes that live under one author (ADR-0029 D9).
 *
 * `/@{handle}` is the profile, `/@{handle}/{slug}` an entry, and
 * `/@{handle}/objects/{slug}` an object passport. They share a prefix because
 * they share an owner, and `objects` is a reserved entry slug for exactly this
 * reason: an entry called *objects* would take its own author's passports with
 * it.
 */
export function matchAuthorScopedPath(
  pathname: string,
): { kind: "profile" | "journalEntry" | "object"; handle: string; slug: string | null } | null {
  const path = pathWithoutTrailingSlash(stripLocalePrefix(pathname).path);
  // `%40` is `@`, and a browser address bar produces it. The old profile
  // matcher decoded the whole path to see it; decoding only the handle keeps
  // an encoded slash in a later segment encoded, which is what stops a slug
  // escaping its own route segment.
  const segments = path.slice(1).split("/");
  const first = segments[0] ?? "";
  const handleSegment = first.startsWith("@")
    ? first.slice(1)
    : first.toLowerCase().startsWith("%40")
      ? first.slice(3)
      : null;
  if (handleSegment === null) return null;
  const handle = decodeSegment(handleSegment)?.toLowerCase() ?? null;
  if (handle === null || !isAddressSlug("profileHandle", handle)) return null;

  if (segments.length === 1) {
    return { kind: "profile", handle, slug: null };
  }

  if (segments.length === 2) {
    const slug = decodeSegment(segments[1]!);
    if (slug === null || slug === PUBLIC_OBJECT_PASSPORT_SEGMENT) return null;
    return isAddressSlug("journalEntry", slug)
      ? { kind: "journalEntry", handle, slug }
      : null;
  }

  if (segments.length === 3 && segments[1] === PUBLIC_OBJECT_PASSPORT_SEGMENT) {
    const slug = decodeSegment(segments[2]!);
    if (slug === null) return null;
    return isAddressSlug("object", slug)
      ? { kind: "object", handle, slug }
      : null;
  }

  return null;
}

/** `/@{handle}/{slug}`, or `null`. */
export function matchAuthorScopedEntryPath(
  pathname: string,
): AuthorScopedAddress | null {
  const matched = matchAuthorScopedPath(pathname);
  return matched?.kind === "journalEntry"
    ? { handle: matched.handle, slug: matched.slug! }
    : null;
}

/** `/@{handle}/objects/{slug}`, or `null`. */
export function matchAuthorScopedObjectPath(
  pathname: string,
): AuthorScopedAddress | null {
  const matched = matchAuthorScopedPath(pathname);
  return matched?.kind === "object"
    ? { handle: matched.handle, slug: matched.slug! }
    : null;
}

/**
 * The namespace a path claims to be in when nothing under it could serve the
 * path, or `null` when the path is servable or is not an address at all.
 *
 * This is what turns `/topics/Не слаг`, `/journal/a/b`, `/communities/x/y`,
 * `/@yehor/objects/a/b` and `/species/a/b/c` into real 404s. Every one of them
 * reaches a `[...missing]` catch-all today, and `src/app/missing-route.tsx`
 * says in its own comment why that is not enough: the root loading boundary
 * streams the shell before the page runs, so `notFound()` answers 200 with a
 * `noindex` body. A crawler reads 200. The proxy is the only place a real
 * status can still be chosen.
 *
 * A bare section root — `/topics`, `/species` — is **not** answered here.
 * Those are decided from the route table in `root-route-segments.ts`, because
 * whether a section has a front door is a fact about the filesystem rather
 * than about the address.
 */
export function unservableAddressNamespace(
  pathname: string,
): AddressNamespace | null {
  const path = pathWithoutTrailingSlash(stripLocalePrefix(pathname).path);
  const prefix = ADDRESS_LOWER_CASE_PATH_PREFIXES.find((candidate) =>
    candidate.prefix === "/@"
      ? path.startsWith("/@") || path.toLowerCase().startsWith("/%40")
      : path.startsWith(candidate.prefix),
  );
  if (!prefix) return null;

  const remainder = path.slice(prefix.prefix.length);
  if (remainder.length === 0) return null;

  // Three namespaces share `/@`, and their own matcher knows all three shapes.
  if (prefix.prefix === "/@") {
    return matchAuthorScopedPath(path) === null ? "profileHandle" : null;
  }

  // The catalog owns two shapes under one prefix — `/species/{species}` and
  // `/species/{species}/{form}` — plus the two legacy flat ones, so its own
  // matcher decides, and a 308 to the canonical address is resolved after
  // this by the bounded lookup. A register hub is a third shape and a real
  // page, so it is servable before that matcher is asked (OVE-433).
  if (prefix.namespaces.includes("species") || prefix.namespaces.includes("form")) {
    if (matchCatalogSpeciesHubPath(path)) return null;
    return matchPublicCatalogAddressPath(path) === null
      ? prefix.namespaces[0]!
      : null;
  }

  if (servesDeeperPath(prefix.prefix, remainder)) return null;

  return matchAddressPath(prefix.namespaces[0]!, path) === null
    ? prefix.namespaces[0]!
    : null;
}

/**
 * Routes that live *under* an address rather than beside it.
 *
 * A community hosts a discussion at `/communities/{slug}/discussions/{id}`,
 * which is a real page and not a malformed community address. Listing them is
 * how this file stays a decision about addresses rather than a second router:
 * every other deeper path under a manifest prefix is unservable, and saying
 * which ones are not is a short, checkable sentence.
 */
function servesDeeperPath(prefix: string, remainder: string): boolean {
  if (prefix !== "/communities/") return false;
  const segments = remainder.split("/");
  return segments.length === 3 && segments[1] === "discussions";
}

function pathWithoutTrailingSlash(path: string) {
  return path.length > 1 ? path.replace(/\/+$/u, "") : path;
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

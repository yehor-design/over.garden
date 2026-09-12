import {
  ADDRESS_LOWER_CASE_PATH_PREFIXES,
  isAddressSlug,
} from "@/lib/address/address-contract.generated";
import { addressManifestEntry } from "@/lib/address/address-manifest";
import type { AddressNamespace } from "@/lib/address/address-manifest";
import { matchPublicCatalogAddressPath } from "@/lib/catalog/addresses";
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
  if (!path.startsWith(entry.pathPrefix)) return null;

  const remainder = path.slice(entry.pathPrefix.length);
  if (remainder.length === 0 || remainder.includes("/")) return null;

  const decoded = decodeSegment(remainder);
  if (decoded === null) return null;
  return isAddressSlug(namespace, decoded) ? decoded : null;
}

/**
 * The namespace a path claims to be in when nothing under it could serve the
 * path, or `null` when the path is servable or is not an address at all.
 *
 * This is what turns `/topics/Не слаг`, `/journal/a/b`, `/communities/x/y` and
 * `/species/a/b/c` into real 404s. Every one of them reaches a `[...missing]`
 * catch-all today, and `src/app/missing-route.tsx` says in its own comment why
 * that is not enough: the root loading boundary streams the shell before the
 * page runs, so `notFound()` answers 200 with a `noindex` body. A crawler
 * reads 200. The proxy is the only place a real status can still be chosen.
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
    path.startsWith(candidate.prefix),
  );
  if (!prefix) return null;

  const remainder = path.slice(prefix.prefix.length);
  if (remainder.length === 0) return null;

  // The catalog owns two shapes under one prefix — `/species/{species}` and
  // `/species/{species}/{form}` — plus the two legacy flat ones, so its own
  // matcher decides, and a 308 to the canonical address is resolved after
  // this by the bounded lookup.
  if (prefix.namespace === "species" || prefix.namespace === "form") {
    return matchPublicCatalogAddressPath(path) === null ? prefix.namespace : null;
  }

  if (servesDeeperPath(prefix.prefix, remainder)) return null;

  return matchAddressPath(prefix.namespace, path) === null
    ? prefix.namespace
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
 *
 * `OVE-428` adds `/@{handle}/{slug}` and `/@{handle}/objects/{slug}` here when
 * entries and passports move under the author.
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

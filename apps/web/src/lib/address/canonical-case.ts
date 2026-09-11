import { ADDRESS_LOWER_CASE_PATH_PREFIXES } from "@/lib/address/address-contract.generated";
import { stripLocalePrefix } from "@/lib/public-localization";

/**
 * The lower-case address a request should have asked for, or `null` when it
 * already did (ADR-0029 D3).
 *
 * Every alphabet in the address manifest is lower case, so `/bg/topics/PLANTS`
 * is not a different page — it is the same page at a second address, and today
 * both answer `200, index, follow`. `matchPublicCatalogAddressPath` said so out
 * loud: it left an upper-case slug "to the route families' catch-alls", and a
 * catch-all under Cache Components answers 200 with a `noindex` body rather
 * than a 404. A crawler reads that as a page.
 *
 * ## Why this decodes before it lower-cases
 *
 * `nextUrl.pathname` is percent-encoded, and a Cyrillic address arrives as
 * `%D0%9F%D0%BE%D0%BC...`. Lower-casing that string would rewrite `%D0` to
 * `%d0` — a different spelling of the same byte, so a redirect that changes
 * nothing a reader can see and that the next request would not need. Worse, it
 * would leave the actual upper-case `П` untouched, because the letter is not
 * in the string at all.
 *
 * So each segment is decoded, lower-cased in its own language, and re-encoded;
 * a redirect is issued only when the decoded forms differ. A segment that
 * cannot be decoded is left alone — the bounded lookups below answer that
 * with a 404, which is the right status for it.
 *
 * ## What is deliberately not covered
 *
 * Only the prefixes the manifest owns. `/sources/eppo/{code}` carries an EPPO
 * code, which is upper case by the register's own convention; `/api/**` is not
 * an address a reader types. Lower-casing either would break a working URL to
 * fix a duplicate that does not exist.
 */
export function canonicalLowerCasePath(pathname: string): string | null {
  const stripped = stripLocalePrefix(pathname);
  const prefix = ADDRESS_LOWER_CASE_PATH_PREFIXES.find((candidate) =>
    stripped.path.startsWith(candidate.prefix),
  );
  if (!prefix) return null;

  const remainder = stripped.path.slice(prefix.prefix.length);
  if (remainder.length === 0) return null;

  const segments = remainder.split("/");
  const lowered: string[] = [];
  let changed = false;
  for (const segment of segments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    const lower = decoded.toLocaleLowerCase("uk");
    if (lower !== decoded) changed = true;
    lowered.push(encodeURIComponent(lower));
  }
  if (!changed) return null;

  const localePrefix = stripped.locale ? `/${stripped.locale}` : "";
  return `${localePrefix}${prefix.prefix}${lowered.join("/")}`;
}
